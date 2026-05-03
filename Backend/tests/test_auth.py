"""Pruebas de integración de los endpoints de autenticación.

Cubre:
  - POST /auth/register (éxito, validación de campos, duplicados)
  - POST /auth/login (éxito, credenciales mal, status 401)
  - GET /auth/me (token válido, ausencia de token, token inválido)
"""
from __future__ import annotations

from tests.conftest import ADMIN_PASSWORD, USER_PASSWORD


# ── /auth/register ──────────────────────────────────────────────────────────

class TestRegister:
    def test_register_success(self, client):
        resp = client.post("/auth/register", json={
            "username": "nuevo_user",
            "password": "password_seguro_123",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["username"] == "nuevo_user"
        assert data["role"] == "USER"
        assert "user_id" in data

    def test_register_strips_username_whitespace(self, client):
        resp = client.post("/auth/register", json={
            "username": "  Espacios  ",
            "password": "password_seguro_123",
        })
        assert resp.status_code == 201
        # Tras strip + lower: "  Espacios  " -> "espacios".
        assert resp.json()["username"] == "espacios"

    def test_register_then_login_case_insensitive(self, client):
        # Registrar con mayúsculas; el login debe aceptar cualquier capitalización.
        client.post("/auth/register", json={
            "username": "Alice",
            "password": "password_seguro_123",
        })
        for variant in ("alice", "ALICE", "AlIcE"):
            resp = client.post("/auth/login", json={
                "username": variant,
                "password": "password_seguro_123",
            })
            assert resp.status_code == 200, f"login failed for {variant!r}"
            assert resp.json()["username"] == "alice"

    def test_register_duplicate_case_insensitive_returns_400(self, client):
        client.post("/auth/register", json={
            "username": "Alice",
            "password": "password_seguro_123",
        })
        resp = client.post("/auth/register", json={
            "username": "alice",  # mismo usuario, distinta capitalización
            "password": "otra_password_123",
        })
        assert resp.status_code == 400
        assert "ya está en uso" in resp.json()["detail"]

    def test_register_duplicate_returns_400(self, client, regular_user):
        resp = client.post("/auth/register", json={
            "username": "usertest",  # ya existe (regular_user fixture)
            "password": "otra_password_123",
        })
        assert resp.status_code == 400
        assert "ya está en uso" in resp.json()["detail"]

    def test_register_short_password_returns_422(self, client):
        # Validación Pydantic Field(min_length=6) → 422 Unprocessable Entity
        resp = client.post("/auth/register", json={
            "username": "newuser",
            "password": "abc",  # < 6 chars
        })
        assert resp.status_code == 422

    def test_register_short_username_returns_422(self, client):
        resp = client.post("/auth/register", json={
            "username": "ab",  # < 3 chars
            "password": "password_seguro_123",
        })
        assert resp.status_code == 422

    def test_register_missing_fields_returns_422(self, client):
        resp = client.post("/auth/register", json={"username": "solo"})
        assert resp.status_code == 422


# ── /auth/login ─────────────────────────────────────────────────────────────

class TestLogin:
    def test_login_success_returns_token(self, client, regular_user):
        resp = client.post("/auth/login", json={
            "username": regular_user.username,
            "password": USER_PASSWORD,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["access_token"]
        assert data["token_type"] == "bearer"
        assert data["user_id"] == regular_user.id
        assert data["username"] == regular_user.username
        assert data["role"] == "USER"

    def test_login_wrong_password_returns_401(self, client, regular_user):
        resp = client.post("/auth/login", json={
            "username": regular_user.username,
            "password": "password_incorrecto",
        })
        # Status code DEBE ser 401 Unauthorized (no 400 como antes del fix)
        assert resp.status_code == 401
        assert "incorrectos" in resp.json()["detail"].lower()

    def test_login_unknown_user_returns_401(self, client):
        resp = client.post("/auth/login", json={
            "username": "user_inexistente",
            "password": "cualquier",
        })
        assert resp.status_code == 401

    def test_login_strips_username_whitespace(self, client, regular_user):
        resp = client.post("/auth/login", json={
            "username": f"  {regular_user.username}  ",
            "password": USER_PASSWORD,
        })
        assert resp.status_code == 200

    def test_login_admin_returns_admin_role(self, client, admin_user):
        resp = client.post("/auth/login", json={
            "username": admin_user.username,
            "password": ADMIN_PASSWORD,
        })
        assert resp.status_code == 200
        assert resp.json()["role"] == "ADMIN"


# ── /auth/me ────────────────────────────────────────────────────────────────

class TestMe:
    def test_me_with_valid_token_returns_user(self, client, regular_user, user_headers):
        resp = client.get("/auth/me", headers=user_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["user_id"] == regular_user.id
        assert data["username"] == regular_user.username
        assert data["role"] == "USER"

    def test_me_without_token_returns_401(self, client):
        resp = client.get("/auth/me")
        assert resp.status_code == 401

    def test_me_with_invalid_token_returns_401(self, client):
        resp = client.get("/auth/me", headers={"Authorization": "Bearer not.a.real.jwt"})
        assert resp.status_code == 401
