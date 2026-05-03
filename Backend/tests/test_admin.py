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


class TestBulkDelete:
    def test_admin_can_bulk_delete(self, client, admin_user, admin_headers, db, user_factory):
        u1 = user_factory(username="bulk1", role="USER")
        u2 = user_factory(username="bulk2", role="USER")
        u3 = user_factory(username="bulk3", role="USER")

        resp = client.post(
            "/admin/users/bulk-delete",
            json={"ids": [u1.id, u2.id, u3.id]},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert sorted(body["deleted"]) == sorted([u1.id, u2.id, u3.id])
        assert body["not_found"] == []
        assert body["rejected"] == []

        # Verificar en BBDD
        for uid in [u1.id, u2.id, u3.id]:
            assert db.query(User).filter(User.id == uid).first() is None

    def test_bulk_delete_skips_own_account(self, client, admin_user, admin_headers, user_factory):
        u1 = user_factory(username="bulk_a", role="USER")

        resp = client.post(
            "/admin/users/bulk-delete",
            json={"ids": [u1.id, admin_user.id]},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["deleted"] == [u1.id]
        assert body["rejected"] == [admin_user.id]

    def test_bulk_delete_reports_not_found(self, client, admin_user, admin_headers, user_factory):
        u1 = user_factory(username="bulk_x", role="USER")

        resp = client.post(
            "/admin/users/bulk-delete",
            json={"ids": [u1.id, 9999]},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["deleted"] == [u1.id]
        assert body["not_found"] == [9999]

    def test_bulk_delete_empty_list_returns_422(self, client, admin_user, admin_headers):
        resp = client.post(
            "/admin/users/bulk-delete",
            json={"ids": []},
            headers=admin_headers,
        )
        # Validación Pydantic Field(min_length=1) → 422 Unprocessable Entity.
        assert resp.status_code == 422

    def test_bulk_delete_too_many_ids_returns_422(self, client, admin_user, admin_headers):
        # Tope superior: max_length=500 evita DoS por payload masivo.
        resp = client.post(
            "/admin/users/bulk-delete",
            json={"ids": list(range(1, 502))},  # 501 IDs
            headers=admin_headers,
        )
        assert resp.status_code == 422

    def test_bulk_delete_regular_user_forbidden(self, client, regular_user, user_headers, user_factory):
        u1 = user_factory(username="bulk_z", role="USER")
        resp = client.post(
            "/admin/users/bulk-delete",
            json={"ids": [u1.id]},
            headers=user_headers,
        )
        assert resp.status_code == 403


class TestStats:
    def test_admin_can_view_stats(self, client, admin_user, regular_user, admin_headers, db, propiedad_factory):
        # seed: 1 propiedad para que el contador no sea 0
        propiedad_factory({"code": "p_admin_1", "city": "Madrid"})

        resp = client.get("/admin/stats", headers=admin_headers)
        assert resp.status_code == 200
        body = resp.json()

        # Estructura esperada
        for key in ("total_users", "total_admins", "total_regular",
                    "total_favorites", "total_searches", "total_properties"):
            assert key in body

        # Coherencia: hay 1 admin (admin_user) y 1 regular (regular_user)
        assert body["total_users"]   == 2
        assert body["total_admins"]  == 1
        assert body["total_regular"] == 1
        assert body["total_properties"] >= 1

    def test_stats_regular_user_forbidden(self, client, regular_user, user_headers):
        resp = client.get("/admin/stats", headers=user_headers)
        assert resp.status_code == 403

    def test_stats_unauthenticated_returns_401(self, client):
        resp = client.get("/admin/stats")
        assert resp.status_code == 401
