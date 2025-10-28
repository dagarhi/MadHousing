from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv
from models import Base

load_dotenv()

DATABASE_URL_PROD = os.getenv("DATABASE_URL", "sqlite:///./pisos.db")
DATABASE_URL_TEST = os.getenv("DATABASE_URL_TEST", "sqlite:///./pisos_test.db")

engines = {
    "prod": create_engine(DATABASE_URL_PROD),
    "test": create_engine(DATABASE_URL_TEST),
}

SessionLocal = {
    "prod": sessionmaker(autocommit=False, autoflush=False, bind=engines["prod"]),
    "test": sessionmaker(autocommit=False, autoflush=False, bind=engines["test"]),
}


def init_db():
    """Crea las tablas en ambas bases (prod y test)."""
    for e in engines.values():
        Base.metadata.create_all(bind=e)


def get_db(mode: str = "prod"):
    """Devuelve una sesión de base de datos según el modo."""
    DB = SessionLocal.get(mode, SessionLocal["prod"])
    db = DB()
    try:
        yield db
    finally:
        db.close()
