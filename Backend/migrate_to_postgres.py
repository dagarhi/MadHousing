"""
Migración SQLite → PostgreSQL
------------------------------
Ejecutar UNA SOLA VEZ desde la VM de Oracle (o cualquier máquina con
acceso a ambas bases de datos):

    pip install psycopg2-binary sqlalchemy python-dotenv
    python migrate_to_postgres.py

Variables de entorno necesarias (en .env o exportadas):
    SQLITE_PATH   → ruta al fichero pisos.db  (por defecto: ./pisos.db)
    DATABASE_URL  → postgresql://user:pass@host:port/dbname
"""

import os
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

load_dotenv()

# ── Conexiones ────────────────────────────────────────────────────────────────

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sqlite_path = os.getenv("SQLITE_PATH", os.path.join(BASE_DIR, "pisos.db"))
pg_url = os.getenv("DATABASE_URL", "")

if not pg_url or not pg_url.startswith("postgresql"):
    print("❌  DATABASE_URL no está configurada o no apunta a PostgreSQL.")
    print("    Ejemplo: postgresql://user:pass@host:5432/madhousing")
    sys.exit(1)

print(f"📂  SQLite:     {sqlite_path}")
print(f"🐘  PostgreSQL: {pg_url.split('@')[-1]}")  # oculta credenciales en log
print()

sqlite_engine = create_engine(f"sqlite:///{sqlite_path}", future=True)
pg_engine     = create_engine(pg_url, future=True, pool_pre_ping=True)

SqliteSession = sessionmaker(bind=sqlite_engine)
PgSession     = sessionmaker(bind=pg_engine)

# ── Crear tablas en PostgreSQL ────────────────────────────────────────────────

# Importamos Base desde models para que SQLAlchemy conozca el esquema
sys.path.insert(0, BASE_DIR)
from models import Base, Propiedad, User, Favorite, SearchHistory

print("🔨  Creando tablas en PostgreSQL...")
Base.metadata.create_all(bind=pg_engine)
print("✅  Tablas listas\n")

# ── Helpers ───────────────────────────────────────────────────────────────────

def migrate_table(model, label: str):
    src = SqliteSession()
    dst = PgSession()
    try:
        rows = src.query(model).all()
        total = len(rows)
        print(f"➡️   {label}: {total} filas")

        if total == 0:
            return

        # Detach de la sesión SQLite para poder reutilizar los objetos
        for row in rows:
            src.expunge(row)
            # make_transient no existe en todas las versiones — borramos el estado
            row._sa_instance_state.key = None

        # Insertar en bloques de 500 para no saturar la memoria
        batch_size = 500
        for i in range(0, total, batch_size):
            batch = rows[i:i + batch_size]
            dst.bulk_save_objects(batch)
            dst.commit()
            print(f"    … {min(i + batch_size, total)}/{total}")

        print(f"✅  {label} migrada\n")
    except Exception as e:
        dst.rollback()
        print(f"❌  Error migrando {label}: {e}")
        raise
    finally:
        src.close()
        dst.close()


# ── Migración en orden (respeta foreign keys) ─────────────────────────────────

print("=" * 50)
print("  INICIO DE MIGRACIÓN")
print("=" * 50 + "\n")

migrate_table(Propiedad,     "propiedades")
migrate_table(User,          "users")
migrate_table(Favorite,      "favorites")
migrate_table(SearchHistory, "search_history")

print("=" * 50)
print("  MIGRACIÓN COMPLETADA")
print("=" * 50)

# ── Verificación rápida ───────────────────────────────────────────────────────

print("\n🔍  Verificación de conteos:\n")
with pg_engine.connect() as conn:
    for tabla in ["propiedades", "users", "favorites", "search_history"]:
        count = conn.execute(text(f'SELECT COUNT(*) FROM "{tabla}"')).scalar()
        print(f"    {tabla}: {count} filas")
