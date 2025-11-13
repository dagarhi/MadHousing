from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv
from models import Base

load_dotenv()

# 🔹 Solo una URL (producción / “real”)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./pisos.db")

# 🔹 Engine único
engine = create_engine(DATABASE_URL, future=True)

# 🔹 SessionLocal única
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
