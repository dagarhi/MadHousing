"""Pruebas de seguridad del backend.

Cubre los riesgos del OWASP Top 10 que aplican al alcance del proyecto:
  - A01 Broken Access Control: aislamiento entre usuarios, role escalation
  - A02 Cryptographic Failures: passwords hasheadas, no en texto plano
  - A03 Injection: queries parametrizadas resisten payloads SQL
  - A07 Identification & Auth Failures: tokens manipulados, expirados, sin user
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from jose import jwt

from main import SECRET_KEY, ALGORITHM


# ── A01 Broken Access Control ───────────────────────────────────────────────

class TestAccessControl:
    def test_role_escalation_self_denied(self, client, regular_user, user_headers):
        """Un USER no puede modificar su propio role para auto-promocionarse."""
        resp = client.patch(
            f"/admin/users/{regular_user.id}",
            json={"role": "ADMIN"},
            headers=user_headers,
        )
        # Aunque sea su propio id, el endpoint requiere ADMIN para entrar
        assert resp.status_code == 403

    def test_role_escalation_via_other_admin_denied(self, client, regular_user, admin_user, user_headers):
        resp = client.patch(
            f"/admin/users/{admin_user.id}",
            json={"role": "USER"},
            headers=user_headers,
        )
        assert resp.status_code == 403

    def test_user_cannot_list_users(self, client, regular_user, user_headers):
        resp = client.get("/admin/users", headers=user_headers)
        assert resp.status_code == 403


# ── A02 Cryptographic Failures ──────────────────────────────────────────────

class TestPasswordStorage:
    def test_password_never_returned_in_register(self, client):
        resp = client.post("/auth/register", json={
            "username": "verytempuser",
            "password": "secret_password_xyz_123",
        })
        body = resp.json()
        # Ni el password en plano ni el hash deberían filtrarse en la respuesta
        assert "password" not in body
        assert "password_hash" not in body
        # El secret nunca aparece en ningún campo
        for value in body.values():
            assert "secret_password_xyz_123" not in str(value)

    def test_password_hashed_in_db(self, client, db):
        client.post("/auth/register", json={
            "username": "hashtest",
            "password": "mi_password_123",
        })
        from models import User
        u = db.query(User).filter(User.username == "hashtest").first()
        # El hash NO contiene el password en plano y empieza por el prefijo de pbkdf2
        assert "mi_password_123" not in u.password_hash
        assert u.password_hash.startswith("$pbkdf2-sha256$")


# ── A03 Injection ───────────────────────────────────────────────────────────

class TestSqlInjection:
    def test_municipio_with_sql_injection_payload(self, client, propiedad_factory):
        """Payload SQL en `municipio` se trata como string literal, no se ejecuta."""
        propiedad_factory({"code": "p1", "city": "Madrid"})
        # Si la query no estuviera parametrizada, esto borraría la tabla
        evil = "madrid'; DROP TABLE propiedades; --"
        resp = client.get("/buscar", params={"municipio": evil})
        assert resp.status_code == 200
        # La tabla sigue existiendo (sino la siguiente query daría 500)
        resp2 = client.get("/buscar", params={"municipio": "madrid"})
        assert resp2.status_code == 200
        assert resp2.json()["total"] == 1

    def test_username_login_with_injection(self, client, regular_user):
        evil = "usertest' OR '1'='1"
        resp = client.post("/auth/login", json={"username": evil, "password": "x"})
        # Ni encuentra al user (porque el username es literal), ni filtra info
        assert resp.status_code == 401


# ── A07 Identification & Auth Failures ─────────────────────────────────────

class TestJwtValidation:
    def test_token_with_wrong_signature_rejected(self, client, regular_user):
        """Token firmado con otro secret debe ser rechazado."""
        bad_token = jwt.encode(
            {"sub": regular_user.username, "user_id": regular_user.id, "role": "ADMIN",
             "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
            "wrong-secret-not-the-real-one",
            algorithm=ALGORITHM,
        )
        resp = client.get("/auth/me", headers={"Authorization": f"Bearer {bad_token}"})
        assert resp.status_code == 401

    def test_expired_token_rejected(self, client, regular_user):
        expired = jwt.encode(
            {"sub": regular_user.username, "user_id": regular_user.id, "role": "USER",
             "exp": datetime.now(timezone.utc) - timedelta(seconds=10)},
            SECRET_KEY,
            algorithm=ALGORITHM,
        )
        resp = client.get("/auth/me", headers={"Authorization": f"Bearer {expired}"})
        assert resp.status_code == 401

    def test_token_without_user_id_rejected(self, client):
        invalid = jwt.encode(
            {"sub": "alguien", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
            SECRET_KEY,
            algorithm=ALGORITHM,
        )
        resp = client.get("/auth/me", headers={"Authorization": f"Bearer {invalid}"})
        assert resp.status_code == 401

    def test_token_for_deleted_user_rejected(self, client, regular_user, user_token, db):
        # Borrar al user después de emitir su token
        db.delete(regular_user); db.commit()
        resp = client.get("/auth/me", headers={"Authorization": f"Bearer {user_token}"})
        assert resp.status_code == 401
        assert "no encontrado" in resp.json()["detail"].lower()

    def test_role_in_token_does_not_grant_admin_access_alone(self, client, regular_user):
        """Si un atacante forja un token con role=ADMIN pero firmado con
        otra clave, el backend NO debe darle acceso admin."""
        forged = jwt.encode(
            {"sub": regular_user.username, "user_id": regular_user.id, "role": "ADMIN",
             "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
            "fake-secret",
            algorithm=ALGORITHM,
        )
        resp = client.get("/admin/users", headers={"Authorization": f"Bearer {forged}"})
        assert resp.status_code == 401  # firma rechazada antes que el rol

    def test_role_check_uses_db_not_token(self, client, regular_user, user_token, db):
        """Aunque consigamos un token válido para un USER, no podemos usarlo
        para acceder a /admin/users."""
        # user_token es legítimo y firma válida, pero role=USER
        resp = client.get("/admin/users", headers={"Authorization": f"Bearer {user_token}"})
        assert resp.status_code == 403
