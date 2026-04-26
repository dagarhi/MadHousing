"""Pytest fixtures comunes para todos los tests de integración.

Estrategia:
  - SQLite en memoria con un engine fresco por test → aislamiento total.
  - Geometry de PostGIS sustituida por String (no se ejecutan queries
    espaciales en tests; los endpoints /pois* y derivados se marcan con
    `@pytest.mark.spatial` y se omiten en SQLite).
  - JWT_SECRET_KEY fijado antes de importar la app para no depender del .env.

Para tests con PostGIS real, exportar TEST_DATABASE_URL apuntando a un
postgres+postgis y usar la marca spatial (no implementado todavía).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# 1. Variables de entorno necesarias antes de importar la app.
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-only-for-pytest-do-not-use-in-prod")
# Forzamos SQLite en memoria para que database.py no intente conectarse a Postgres.
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
# No queremos que seed_admin se ejecute automáticamente en startup; lo
# controlamos manualmente desde fixtures.
os.environ.pop("ADMIN_USERNAME", None)
os.environ.pop("ADMIN_PASSWORD", None)

# 2. Monkey-patch geoalchemy2.Geometry → SQLAlchemy String. Esto debe
#    ocurrir ANTES de que models.py se importe (lo hace pytest al cargar
#    conftest, así que estamos a tiempo).
import sqlalchemy as _sa
import geoalchemy2 as _ga
import geoalchemy2.types as _ga_types


class _MockGeometry(_sa.types.TypeDecorator):  # noqa: N801 (snake_case OK)
    """Sustituto de Geometry para SQLite — almacena WKT como String.

    Acepta y descarta los kwargs de geoalchemy2 (`geometry_type`, `srid`,
    `spatial_index`, etc.) para que el modelo se importe sin errores.
    """
    impl = _sa.types.String
    cache_ok = True

    def __init__(self, *_args, **_kwargs):
        # Ignora geometry_type/srid/spatial_index/etc.
        super().__init__()


# Reemplazo en ambos puntos de importación que usa el código.
_ga.Geometry = _MockGeometry  # type: ignore[attr-defined]
_ga_types.Geometry = _MockGeometry  # type: ignore[attr-defined]

# 3. Path: añadir Backend/ al sys.path para que `from main import ...` funcione
#    al ejecutar pytest desde la raíz del proyecto.
_BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from main import app, get_password_hash, create_access_token, db_from_request  # noqa: E402
from models import Base, User, Propiedad  # noqa: E402


# ── Engine y sesión por test ────────────────────────────────────────────────

@pytest.fixture
def db_engine():
    """Engine SQLite en memoria, fresco por test.

    `StaticPool` fuerza al engine a usar UNA SOLA conexión persistente. Sin
    esto, cada Session abre su propia conexión a `:memory:`, que en SQLite
    es una BBDD distinta cada vez → las tablas creadas por una conexión no
    son visibles desde otra.
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture
def db(db_engine):
    """Sesión de BBDD para uso directo en tests (crear seeds, asserts)."""
    SessionLocal = sessionmaker(bind=db_engine, autocommit=False, autoflush=False)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


# ── TestClient con DB inyectada ─────────────────────────────────────────────

@pytest.fixture
def client(db_engine, db):
    """TestClient que comparte la misma sesión que la fixture `db`.

    Importante: usamos la MISMA sesión en el test y en el endpoint, porque
    así los seeds creados desde el test son visibles para los endpoints sin
    necesidad de commit/refresh adicionales.

    Sobreescribimos `db_from_request` (no `get_db`): los endpoints declaran
    `Depends(db_from_request)` y ese wrapper llama a `get_db()` directamente,
    no por inyección, así que un override solo sobre `get_db` no propaga.
    """
    def _override_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[db_from_request] = _override_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ── Users + tokens ──────────────────────────────────────────────────────────

ADMIN_PASSWORD = "admin_test_password_OK_123"
USER_PASSWORD = "user_test_password_OK_123"


@pytest.fixture
def admin_user(db) -> User:
    user = User(
        username="admintest",
        password_hash=get_password_hash(ADMIN_PASSWORD),
        role="ADMIN",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def regular_user(db) -> User:
    user = User(
        username="usertest",
        password_hash=get_password_hash(USER_PASSWORD),
        role="USER",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_token(admin_user) -> str:
    return create_access_token({
        "sub": admin_user.username,
        "user_id": admin_user.id,
        "role": admin_user.role,
    })


@pytest.fixture
def user_token(regular_user) -> str:
    return create_access_token({
        "sub": regular_user.username,
        "user_id": regular_user.id,
        "role": regular_user.role,
    })


@pytest.fixture
def admin_headers(admin_token) -> dict:
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def user_headers(user_token) -> dict:
    return {"Authorization": f"Bearer {user_token}"}


# ── Helpers para crear propiedades de prueba ────────────────────────────────

def _propiedad(
    code: str,
    *,
    operation: str = "rent",
    price: float = 1000.0,
    size: float = 70.0,
    rooms: int = 2,
    floor_num: int | None = 3,
    score_intrinseco: float = 60.0,
    score_contexto: float = 70.0,
    score_final: float = 65.0,
    city: str = "Madrid",
    district: str = "Centro",
    neighborhood: str = "Sol",
    has_lift: bool = True,
) -> Propiedad:
    """Construye una Propiedad de prueba con valores razonables por defecto."""
    return Propiedad(
        propertyCode=code,
        operation=operation,
        price=price,
        size=size,
        rooms=rooms,
        floor=str(floor_num) if floor_num is not None else "",
        floor_num=floor_num,
        score_intrinseco=score_intrinseco,
        score_contexto=score_contexto,
        score_final=score_final,
        city=city,
        district=district,
        neighborhood=neighborhood,
        hasLift=has_lift,
        latitude=40.4168,
        longitude=-3.7038,
        url=f"https://example.com/{code}",
        address=f"Calle Test {code}",
    )


@pytest.fixture
def propiedad_factory(db):
    """Factory que crea propiedades en BBDD. Devuelve la lista de los códigos."""
    created: list[str] = []

    def _create(*configs: dict) -> list[str]:
        for cfg in configs:
            db.add(_propiedad(**cfg))
            created.append(cfg["code"])
        db.commit()
        return created

    return _create
