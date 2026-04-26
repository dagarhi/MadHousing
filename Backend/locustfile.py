"""Pruebas de carga del backend de MadHousing con Locust.

Cada locust user simula un usuario realista:
  1. on_start  → registra cuenta efímera + login → obtiene JWT
  2. tasks     → mezcla de búsquedas, listados y consultas POI ponderadas
                 según el patrón de uso esperado en producción.

Uso:
    pip install -r requirements-dev.txt   # incluye locust

    # Contra desarrollo local (podman):
    locust -f locustfile.py --host=http://localhost:8000

    # Contra producción Cloud Run:
    locust -f locustfile.py --host=https://madhousing-backend-37799814091.europe-southwest1.run.app

    # Headless (sin UI, para scripts/CI):
    locust -f locustfile.py --host=... --users 50 --spawn-rate 5 --run-time 5m --headless --csv resultados/run1

Notas:
  - Cloud Run con min-instances=0 sufre cold start: descarta los primeros
    ~5s de cada run nuevo (la primera petición arranca el contenedor).
  - Las cuotas de Supabase free tier son ~60 conexiones simultáneas; con
    50+ users concurrentes podrías ver errores de pool. Es información,
    no un bug del backend.
"""
from __future__ import annotations

import random

from locust import HttpUser, between, task


class MadHousingUser(HttpUser):
    """Simula un usuario web/móvil que navega el mapa y consulta datos."""

    # Espera entre tasks (segundos) — emula la "pensada" del usuario humano.
    wait_time = between(1, 3)

    # ── Setup ───────────────────────────────────────────────────────────────

    def on_start(self):
        """Cada user crea una cuenta efímera, hace login y guarda el JWT.

        Si el registro falla (cuenta ya existe por colisión aleatoria), se
        cae al login con esas credenciales — la mayoría de tasks requieren
        token desde que /buscar-todo pasó a ser auth-only.
        """
        suffix = random.randint(100_000, 999_999)
        self.username = f"loadtest_{suffix}"
        self.password = f"loadtest_password_{suffix}_xyz"

        # Registro (puede fallar si ya existe; lo ignoramos)
        self.client.post(
            "/auth/register",
            json={"username": self.username, "password": self.password},
            name="[setup] /auth/register",
        )

        # Login
        resp = self.client.post(
            "/auth/login",
            json={"username": self.username, "password": self.password},
            name="[setup] /auth/login",
        )
        if resp.status_code == 200:
            token = resp.json().get("access_token")
            if token:
                self.client.headers.update({"Authorization": f"Bearer {token}"})
                self.token_ok = True
                return
        self.token_ok = False  # tareas auth-only se omitirán

    # ── Búsquedas (lo más frecuente) ────────────────────────────────────────

    @task(5)
    def buscar_madrid_rent(self):
        self.client.get(
            "/buscar?operation=rent&municipio=Madrid&per_page=50",
            name="/buscar [Madrid rent]",
        )

    @task(3)
    def buscar_madrid_sale(self):
        self.client.get(
            "/buscar?operation=sale&municipio=Madrid&per_page=50",
            name="/buscar [Madrid sale]",
        )

    @task(2)
    def buscar_con_filtros(self):
        """Búsqueda con varios filtros — escenario realista de un usuario que filtra."""
        self.client.get(
            "/buscar?operation=rent&municipio=Madrid"
            "&min_price=500&max_price=1500&min_score=40&per_page=20",
            name="/buscar [con filtros]",
        )

    @task(2)
    def buscar_distrito(self):
        self.client.get(
            "/buscar?operation=rent&municipio=Madrid&distrito=Centro&per_page=20",
            name="/buscar [distrito]",
        )

    # ── Datasets globales (más caros) ───────────────────────────────────────

    @task(2)
    def buscar_todo_rent(self):
        if not self.token_ok:
            return  # /buscar-todo requiere auth
        self.client.get(
            "/buscar-todo?operation=rent&page=1&per_page=2000",
            name="/buscar-todo [rent]",
        )

    @task(1)
    def zonas_jerarquicas(self):
        self.client.get("/zonas-jerarquicas", name="/zonas-jerarquicas")

    @task(1)
    def estadisticas_globales(self):
        self.client.get("/estadisticas-globales", name="/estadisticas-globales")

    # ── POIs (queries PostGIS — las más caras) ──────────────────────────────

    @task(3)
    def pois_transporte(self):
        self.client.get("/pois?category=transport", name="/pois [transport]")

    @task(2)
    def pois_sanidad(self):
        self.client.get("/pois?category=health", name="/pois [health]")

    @task(2)
    def pois_nearby(self):
        # Coordenadas Sol (centro Madrid). 5 categorías a 2km.
        self.client.get(
            "/pois/nearby?lat=40.4168&lng=-3.7038&limit=3&radius_m=2000",
            name="/pois/nearby [Sol]",
        )

    # ── Favoritos / historial (auth-only) ───────────────────────────────────

    @task(2)
    def listar_favoritos(self):
        if not self.token_ok:
            return
        self.client.get("/favoritos", name="/favoritos")

    @task(1)
    def listar_historial(self):
        if not self.token_ok:
            return
        self.client.get("/historial", name="/historial")
