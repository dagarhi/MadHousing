"""Pruebas de integración del CRUD de favoritos.

Cubre:
  - Listado solo del propio usuario (aislamiento entre cuentas)
  - Creación idempotente (POST mismo property_code 2 veces no duplica)
  - Borrado del propio favorito vs del de otro (404 si es de otro)
  - Update de nota
  - Auth requerida en todos los endpoints
"""
from __future__ import annotations

from models import Favorite


class TestListarFavoritos:
    def test_unauthenticated_returns_401(self, client):
        assert client.get("/favoritos").status_code == 401

    def test_devuelve_solo_los_propios(
        self, client, regular_user, user_headers, admin_user, propiedad_factory, db
    ):
        propiedad_factory(
            {"code": "p1", "operation": "rent"},
            {"code": "p2", "operation": "rent"},
        )
        # regular_user → favorito de p1; admin_user → favorito de p2
        db.add(Favorite(user_id=regular_user.id, property_code="p1"))
        db.add(Favorite(user_id=admin_user.id, property_code="p2"))
        db.commit()

        resp = client.get("/favoritos", headers=user_headers)
        codes = [f["property_code"] for f in resp.json()]
        assert codes == ["p1"]


class TestCrearFavorito:
    def test_creates_with_attached_property(self, client, user_headers, propiedad_factory):
        propiedad_factory({"code": "p1", "operation": "rent", "price": 999})
        resp = client.post("/favoritos", json={"property_code": "p1"}, headers=user_headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["property_code"] == "p1"
        assert data["nota"] == ""
        assert data["propiedad"]["price"] == 999

    def test_idempotent_when_called_twice(self, client, user_headers, propiedad_factory):
        propiedad_factory({"code": "p1", "operation": "rent"})
        first = client.post("/favoritos", json={"property_code": "p1"}, headers=user_headers)
        second = client.post("/favoritos", json={"property_code": "p1"}, headers=user_headers)
        # Mismo id devuelto, no se duplica
        assert first.json()["id"] == second.json()["id"]

    def test_propiedad_inexistente_devuelve_404(self, client, user_headers):
        resp = client.post("/favoritos", json={"property_code": "no_existe"}, headers=user_headers)
        assert resp.status_code == 404
        assert "Propiedad" in resp.json()["detail"]


class TestActualizarFavorito:
    def test_actualiza_nota_propia(self, client, user_headers, propiedad_factory):
        propiedad_factory({"code": "p1", "operation": "rent"})
        created = client.post("/favoritos", json={"property_code": "p1"}, headers=user_headers).json()
        resp = client.patch(
            f"/favoritos/{created['id']}",
            json={"nota": "Visita prevista el sábado"},
            headers=user_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["nota"] == "Visita prevista el sábado"

    def test_no_puede_modificar_favorito_ajeno(
        self, client, user_headers, admin_user, propiedad_factory, db
    ):
        propiedad_factory({"code": "p1", "operation": "rent"})
        # admin tiene el favorito; el regular_user (user_headers) intenta modificarlo
        fav = Favorite(user_id=admin_user.id, property_code="p1")
        db.add(fav); db.commit(); db.refresh(fav)

        resp = client.patch(
            f"/favoritos/{fav.id}",
            json={"nota": "hack"},
            headers=user_headers,
        )
        assert resp.status_code == 404  # no se filtra existencia; oculta del ajeno


class TestEliminarFavorito:
    def test_borra_el_propio(self, client, user_headers, propiedad_factory):
        propiedad_factory({"code": "p1", "operation": "rent"})
        created = client.post("/favoritos", json={"property_code": "p1"}, headers=user_headers).json()
        resp = client.delete(f"/favoritos/{created['id']}", headers=user_headers)
        assert resp.status_code == 204
        # No queda en el listado
        listado = client.get("/favoritos", headers=user_headers).json()
        assert listado == []

    def test_no_puede_borrar_ajeno(self, client, user_headers, admin_user, propiedad_factory, db):
        propiedad_factory({"code": "p1", "operation": "rent"})
        fav = Favorite(user_id=admin_user.id, property_code="p1")
        db.add(fav); db.commit(); db.refresh(fav)

        resp = client.delete(f"/favoritos/{fav.id}", headers=user_headers)
        assert resp.status_code == 404

        # El favorito sigue existiendo (no se ha borrado el ajeno)
        from models import Favorite as F
        assert db.query(F).filter(F.id == fav.id).first() is not None

    def test_borrar_inexistente_devuelve_404(self, client, user_headers):
        resp = client.delete("/favoritos/9999", headers=user_headers)
        assert resp.status_code == 404
