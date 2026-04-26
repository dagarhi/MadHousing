"""Pruebas de integración del CRUD de historial de búsquedas.

Cubre:
  - Listado solo del propio usuario
  - Creación con query JSON arbitrario
  - Borrado propio vs ajeno
  - Auth requerida en todos los endpoints
"""
from __future__ import annotations

import json

from models import SearchHistory


class TestListarHistorial:
    def test_unauthenticated_returns_401(self, client):
        assert client.get("/historial").status_code == 401

    def test_devuelve_solo_los_propios(self, client, regular_user, user_headers, admin_user, db):
        db.add(SearchHistory(user_id=regular_user.id, query=json.dumps({"municipio": "madrid"})))
        db.add(SearchHistory(user_id=admin_user.id,   query=json.dumps({"municipio": "alcorcon"})))
        db.commit()

        resp = client.get("/historial", headers=user_headers)
        items = resp.json()
        assert len(items) == 1
        assert items[0]["query"] == {"municipio": "madrid"}

    def test_orden_descendente_por_fecha(self, client, regular_user, user_headers, db):
        # Insertamos 3 entradas; deben volver en orden inverso de creación
        for i in range(3):
            db.add(SearchHistory(user_id=regular_user.id, query=json.dumps({"i": i})))
            db.commit()

        items = client.get("/historial", headers=user_headers).json()
        # La más reciente (i=2) primero
        assert [it["query"]["i"] for it in items] == [2, 1, 0]

    def test_json_invalido_devuelve_dict_vacio(self, client, regular_user, user_headers, db):
        # Si por algún motivo la BBDD tiene JSON corrupto, no rompe la respuesta
        db.add(SearchHistory(user_id=regular_user.id, query="esto no es json"))
        db.commit()

        items = client.get("/historial", headers=user_headers).json()
        assert items[0]["query"] == {}


class TestCrearHistorial:
    def test_crea_con_query_dict(self, client, user_headers):
        body = {"query": {"municipio": "madrid", "operation": "rent", "min_price": 800}}
        resp = client.post("/historial", json=body, headers=user_headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["query"] == body["query"]
        assert "id" in data
        assert "created_at" in data

    def test_crea_con_query_vacio(self, client, user_headers):
        resp = client.post("/historial", json={"query": {}}, headers=user_headers)
        assert resp.status_code == 201
        assert resp.json()["query"] == {}


class TestEliminarHistorial:
    def test_borra_el_propio(self, client, regular_user, user_headers, db):
        h = SearchHistory(user_id=regular_user.id, query=json.dumps({"x": 1}))
        db.add(h); db.commit(); db.refresh(h)

        resp = client.delete(f"/historial/{h.id}", headers=user_headers)
        assert resp.status_code == 204
        assert db.query(SearchHistory).filter(SearchHistory.id == h.id).first() is None

    def test_no_puede_borrar_ajeno(self, client, user_headers, admin_user, db):
        h = SearchHistory(user_id=admin_user.id, query=json.dumps({"x": 1}))
        db.add(h); db.commit(); db.refresh(h)

        resp = client.delete(f"/historial/{h.id}", headers=user_headers)
        assert resp.status_code == 404
        # No se borra
        assert db.query(SearchHistory).filter(SearchHistory.id == h.id).first() is not None

    def test_borrar_inexistente_devuelve_404(self, client, user_headers):
        resp = client.delete("/historial/9999", headers=user_headers)
        assert resp.status_code == 404
