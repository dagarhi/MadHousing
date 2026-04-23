from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv
from models import Base

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
db_path = os.path.join(BASE_DIR, "pisos.db")
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{db_path}")

_is_sqlite = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    future=True,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    pool_pre_ping=True,
    **({} if _is_sqlite else {"pool_size": 5, "max_overflow": 10}),
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

def init_db():
    """Crea las tablas si no existen en la base de datos principal."""
    Base.metadata.create_all(bind=engine)
    print("✅ Tablas creadas o verificadas correctamente")

def get_db():
    """Devuelve una sesión de base de datos."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
