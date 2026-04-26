"""Pruebas de integración de endpoints de búsqueda de propiedades.

Cubre:
  - GET /buscar (filtros, paginación, edge cases)
  - GET /buscar-todo (requiere auth tras el fix de seguridad)
  - GET /zonas-jerarquicas (jerarquía city→district→neighborhood)
  - GET /estadisticas-globales (agregaciones por distrito + operación)
"""
from __future__ import annotations


# ── /buscar ─────────────────────────────────────────────────────────────────

class TestBuscar:
    def test_buscar_madrid_devuelve_solo_madrid(self, client, propiedad_factory):
        propiedad_factory(
            {"code": "p1", "city": "Madrid", "operation": "rent"},
            {"code": "p2", "city": "Alcorcón", "operation": "rent"},
        )
        resp = client.get("/buscar", params={"municipio": "madrid"})
        assert resp.status_code == 200
        codes = [p["propertyCode"] for p in resp.json()["propiedades"]]
        assert "p1" in codes
        assert "p2" not in codes

    def test_buscar_filtra_por_distrito(self, client, propiedad_factory):
        propiedad_factory(
            {"code": "centro", "city": "Madrid", "district": "Centro", "operation": "rent"},
            {"code": "retiro", "city": "Madrid", "district": "Retiro", "operation": "rent"},
        )
        resp = client.get("/buscar", params={"municipio": "madrid", "distrito": "centro"})
        codes = [p["propertyCode"] for p in resp.json()["propiedades"]]
        assert codes == ["centro"]

    def test_buscar_filtra_por_precio(self, client, propiedad_factory):
        propiedad_factory(
            {"code": "barato", "price": 600, "operation": "rent"},
            {"code": "medio", "price": 1200, "operation": "rent"},
            {"code": "caro", "price": 2500, "operation": "rent"},
        )
        resp = client.get("/buscar", params={
            "municipio": "madrid",
            "min_price": 1000,
            "max_price": 2000,
        })
        codes = [p["propertyCode"] for p in resp.json()["propiedades"]]
        assert codes == ["medio"]

    def test_buscar_filtra_por_floor_num(self, client, propiedad_factory):
        """Test del bug #1: filtro `floor` (planta mínima) ahora funciona."""
        propiedad_factory(
            {"code": "bj", "floor_num": None, "operation": "rent"},   # bajo no numérico
            {"code": "p2",  "floor_num": 2, "operation": "rent"},
            {"code": "p5",  "floor_num": 5, "operation": "rent"},
        )
        resp = client.get("/buscar", params={"municipio": "madrid", "floor": 3})
        codes = [p["propertyCode"] for p in resp.json()["propiedades"]]
        assert codes == ["p5"]

    def test_buscar_filtra_por_score_intrinseco(self, client, propiedad_factory):
        """Test del bug #11: min_score/max_score ahora se respetan."""
        propiedad_factory(
            {"code": "low",  "score_intrinseco": 30, "operation": "rent"},
            {"code": "mid",  "score_intrinseco": 60, "operation": "rent"},
            {"code": "high", "score_intrinseco": 90, "operation": "rent"},
        )
        resp = client.get("/buscar", params={
            "municipio": "madrid",
            "min_score": 50,
            "max_score": 80,
        })
        codes = [p["propertyCode"] for p in resp.json()["propiedades"]]
        assert codes == ["mid"]

    def test_buscar_filtra_por_score_contexto(self, client, propiedad_factory):
        propiedad_factory(
            {"code": "low",  "score_contexto": 20, "operation": "rent"},
            {"code": "high", "score_contexto": 80, "operation": "rent"},
        )
        resp = client.get("/buscar", params={"municipio": "madrid", "context_min": 50})
        codes = [p["propertyCode"] for p in resp.json()["propiedades"]]
        assert codes == ["high"]

    def test_buscar_paginacion(self, client, propiedad_factory):
        propiedad_factory(*[
            {"code": f"p{i}", "operation": "rent"} for i in range(25)
        ])
        # 25 propiedades, per_page=10 → página 1 = 10, página 3 = 5
        page1 = client.get("/buscar", params={"municipio": "madrid", "per_page": 10, "page": 1})
        page3 = client.get("/buscar", params={"municipio": "madrid", "per_page": 10, "page": 3})
        assert len(page1.json()["propiedades"]) == 10
        assert len(page3.json()["propiedades"]) == 5
        # El total reportado debe reflejar el conjunto entero
        assert page1.json()["total"] == 25
        assert page3.json()["total"] == 25

    def test_buscar_sin_resultados_devuelve_total_cero(self, client):
        resp = client.get("/buscar", params={"municipio": "valladolid"})
        assert resp.status_code == 200
        assert resp.json()["total"] == 0
        assert resp.json()["propiedades"] == []

    def test_buscar_per_page_max_100(self, client):
        # per_page=200 → 422 porque le=100
        resp = client.get("/buscar", params={"municipio": "madrid", "per_page": 200})
        assert resp.status_code == 422

    def test_buscar_municipio_obligatorio(self, client):
        resp = client.get("/buscar")
        assert resp.status_code == 422

    def test_buscar_filtra_por_haslift(self, client, propiedad_factory):
        propiedad_factory(
            {"code": "con", "has_lift": True, "operation": "rent"},
            {"code": "sin", "has_lift": False, "operation": "rent"},
        )
        resp = client.get("/buscar", params={"municipio": "madrid", "hasLift": True})
        codes = [p["propertyCode"] for p in resp.json()["propiedades"]]
        assert codes == ["con"]

    def test_buscar_devuelve_stats_agregados(self, client, propiedad_factory):
        propiedad_factory(
            {"code": "a", "price": 800,  "size": 50, "score_intrinseco": 40, "operation": "rent"},
            {"code": "b", "price": 1500, "size": 90, "score_intrinseco": 80, "operation": "rent"},
        )
        resp = client.get("/buscar", params={"municipio": "madrid"})
        stats = resp.json()["stats"]
        assert stats["price"] == {"min": 800, "max": 1500}
        assert stats["size"]  == {"min": 50,  "max": 90}
        assert stats["score"] == {"min": 40,  "max": 80}


# ── /buscar-todo (requiere auth) ────────────────────────────────────────────

class TestBuscarTodo:
    def test_unauthenticated_returns_401(self, client):
        # Tras el fix de seguridad, /buscar-todo requiere auth
        resp = client.get("/buscar-todo")
        assert resp.status_code == 401

    def test_authenticated_returns_all(self, client, regular_user, user_headers, propiedad_factory):
        propiedad_factory(
            {"code": "a", "operation": "rent"},
            {"code": "b", "operation": "sale"},
        )
        resp = client.get("/buscar-todo", headers=user_headers)
        assert resp.status_code == 200
        assert resp.json()["total"] == 2

    def test_filter_by_operation(self, client, regular_user, user_headers, propiedad_factory):
        propiedad_factory(
            {"code": "rent1", "operation": "rent"},
            {"code": "rent2", "operation": "rent"},
            {"code": "sale1", "operation": "sale"},
        )
        resp = client.get("/buscar-todo?operation=rent", headers=user_headers)
        assert resp.status_code == 200
        codes = [p["propertyCode"] for p in resp.json()["propiedades"]]
        assert set(codes) == {"rent1", "rent2"}


# ── /zonas-jerarquicas ──────────────────────────────────────────────────────

class TestZonasJerarquicas:
    def test_devuelve_jerarquia_anidada(self, client, propiedad_factory):
        propiedad_factory(
            {"code": "1", "city": "Madrid", "district": "Centro", "neighborhood": "Sol"},
            {"code": "2", "city": "Madrid", "district": "Centro", "neighborhood": "Lavapiés"},
            {"code": "3", "city": "Madrid", "district": "Retiro", "neighborhood": "Pacífico"},
            {"code": "4", "city": "Alcorcón", "district": "Centro", "neighborhood": "Centro"},
        )
        resp = client.get("/zonas-jerarquicas")
        assert resp.status_code == 200
        data = resp.json()
        # Jerarquía: city → district → list[neighborhoods]
        assert "Madrid" in data
        assert "Alcorcón" in data
        assert sorted(data["Madrid"]["Centro"]) == ["Lavapiés", "Sol"]
        assert data["Madrid"]["Retiro"] == ["Pacífico"]

    def test_filtra_por_municipio(self, client, propiedad_factory):
        propiedad_factory(
            {"code": "m", "city": "Madrid", "district": "Centro"},
            {"code": "a", "city": "Alcorcón", "district": "Centro"},
        )
        resp = client.get("/zonas-jerarquicas?municipio=Madrid")
        data = resp.json()
        assert "Madrid" in data
        assert "Alcorcón" not in data


# ── /estadisticas-globales ──────────────────────────────────────────────────

class TestEstadisticasGlobales:
    def test_agrupa_por_distrito_y_operacion(self, client, propiedad_factory):
        propiedad_factory(
            {"code": "c1", "district": "Centro", "operation": "rent", "price": 1000, "score_intrinseco": 60},
            {"code": "c2", "district": "Centro", "operation": "rent", "price": 1500, "score_intrinseco": 70},
            {"code": "r1", "district": "Centro", "operation": "sale", "price": 200_000},
        )
        resp = client.get("/estadisticas-globales")
        assert resp.status_code == 200
        data = resp.json()
        assert "Centro" in data
        # Cada distrito tiene entradas por operación
        assert "rent" in data["Centro"]
        assert "sale" in data["Centro"]
        # Conteo y media correctos
        assert data["Centro"]["rent"]["count"] == 2
        assert data["Centro"]["rent"]["precio_medio"] == 1250  # (1000+1500)/2
