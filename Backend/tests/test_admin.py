"""Pruebas de integración de endpoints de admin.

Cubre:
  - GET /admin/users — solo ADMIN puede listar
  - PATCH /admin/users/{id} — cambio de rol, restricciones (self-edit, rol inválido)
  - DELETE /admin/users/{id} — borrado, no puedes auto-eliminarte
"""
from __future__ import annotations

from models import User


class TestListUsers:
    def test_admin_can_list_users(self, client, admin_user, regular_user, admin_headers):
        resp = client.get("/admin/users", headers=admin_headers)
        assert resp.status_code == 200
        users = resp.json()
        usernames = [u["username"] for u in users]
        assert admin_user.username in usernames
        assert regular_user.username in usernames

    def test_regular_user_forbidden(self, client, regular_user, user_headers):
        resp = client.get("/admin/users", headers=user_headers)
        assert resp.status_code == 403
        assert "administradores" in resp.json()["detail"].lower()

    def test_unauthenticated_returns_401(self, client):
        resp = client.get("/admin/users")
        assert resp.status_code == 401

    def test_response_includes_required_fields(self, client, admin_user, admin_headers):
        resp = client.get("/admin/users", headers=admin_headers)
        u = resp.json()[0]
        assert {"id", "username", "role", "created_at"} <= set(u.keys())


class TestUpdateRole:
    def test_admin_can_promote_user(self, client, admin_user, regular_user, admin_headers, db):
        resp = client.patch(
            f"/admin/users/{regular_user.id}",
            json={"role": "ADMIN"},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["role"] == "ADMIN"

        # Persistencia real
        refreshed = db.query(User).filter(User.id == regular_user.id).first()
        assert refreshed.role == "ADMIN"

    def test_admin_can_demote_to_user(self, client, admin_user, admin_headers, db):
        # Crear otro admin para no auto-modificarnos
        other = User(username="otroadmin", password_hash="x", role="ADMIN")
        db.add(other); db.commit(); db.refresh(other)

        resp = client.patch(
            f"/admin/users/{other.id}",
            json={"role": "USER"},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["role"] == "USER"

    def test_cannot_modify_own_role(self, client, admin_user, admin_headers):
        resp = client.patch(
            f"/admin/users/{admin_user.id}",
            json={"role": "USER"},
            headers=admin_headers,
        )
        assert resp.status_code == 400
        assert "propio rol" in resp.json()["detail"].lower()

    def test_invalid_role_returns_400(self, client, admin_user, regular_user, admin_headers):
        resp = client.patch(
            f"/admin/users/{regular_user.id}",
            json={"role": "SUPERADMIN"},  # rol no permitido
            headers=admin_headers,
        )
        assert resp.status_code == 400
        assert "inválido" in resp.json()["detail"].lower()

    def test_nonexistent_user_returns_404(self, client, admin_user, admin_headers):
        resp = client.patch(
            "/admin/users/9999",
            json={"role": "USER"},
            headers=admin_headers,
        )
        assert resp.status_code == 404

    def test_regular_user_forbidden(self, client, regular_user, admin_user, user_headers):
        resp = client.patch(
            f"/admin/users/{admin_user.id}",
            json={"role": "USER"},
            headers=user_headers,
        )
        assert resp.status_code == 403


class TestDeleteUser:
    def test_admin_can_delete_user(self, client, admin_user, regular_user, admin_headers, db):
        user_id = regular_user.id
        resp = client.delete(f"/admin/users/{user_id}", headers=admin_headers)
        assert resp.status_code == 204

        # Realmente desaparece de BBDD
        assert db.query(User).filter(User.id == user_id).first() is None

    def test_cannot_delete_own_account(self, client, admin_user, admin_headers):
        resp = client.delete(f"/admin/users/{admin_user.id}", headers=admin_headers)
        assert resp.status_code == 400
        assert "propia cuenta" in resp.json()["detail"].lower()

    def test_nonexistent_user_returns_404(self, client, admin_user, admin_headers):
        resp = client.delete("/admin/users/9999", headers=admin_headers)
        assert resp.status_code == 404

    def test_regular_user_forbidden(self, client, regular_user, admin_user, user_headers):
        resp = client.delete(f"/admin/users/{admin_user.id}", headers=user_headers)
        assert resp.status_code == 403
