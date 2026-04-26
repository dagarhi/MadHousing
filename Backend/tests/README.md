# Tests del backend

## Estructura

```
tests/
├── conftest.py         # fixtures: DB en memoria, TestClient, users, JWTs
├── test_scoring.py     # unit tests puros (services/scoring.py)
├── test_auth.py        # /auth/* (login, register, me)
├── test_admin.py       # /admin/users (listar, cambiar rol, eliminar)
├── test_properties.py  # /buscar, /buscar-todo, /zonas-jerarquicas, /estadisticas-globales
├── test_favorites.py   # /favoritos (CRUD + aislamiento entre usuarios)
├── test_history.py     # /historial (CRUD + aislamiento)
└── test_security.py    # OWASP-aligned: access control, JWT, SQL injection
```

## Cómo ejecutar

Desde la raíz del proyecto:

```bash
cd ~/MadHousing-1/Backend

# instalar dependencias dev una sola vez
../venv/bin/pip install -r requirements-dev.txt

# ejecutar todos los tests
../venv/bin/pytest

# con cobertura
../venv/bin/pytest --cov=. --cov-report=term-missing --cov-report=html

# solo un fichero
../venv/bin/pytest tests/test_scoring.py

# solo una clase
../venv/bin/pytest tests/test_admin.py::TestUpdateRole

# verbose + parar al primer fallo
../venv/bin/pytest -x -vv
```

## Cómo funciona el aislamiento

Cada test recibe una BBDD SQLite **fresca en memoria** vía la fixture `db_engine`.
El `TestClient` se monta sobre `app` con `dependency_overrides` apuntando a esa
sesión, así los seeds que crea el test son inmediatamente visibles desde los
endpoints. Al terminar el test, el engine se descarta y todo se limpia.

## Tests con PostGIS (no implementados aquí)

Los endpoints `/pois` y `/pois/nearby` usan funciones espaciales (`ST_DWithin`,
`ST_Distance`, etc.) que SQLite no soporta. Esos tests están marcados con
`@pytest.mark.spatial` (cuando se añadan) y requerirían un Postgres+PostGIS
real. Para esta entrega del TFG se han validado manualmente sobre el entorno
de desarrollo (podman) y producción (Supabase).

## Convención de nombres

- `Test<Endpoint>` agrupa los tests del mismo endpoint
- `test_<comportamiento>_<expectativa>` describe el caso (en español o inglés
  según lectura natural)
