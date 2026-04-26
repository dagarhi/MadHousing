from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import declarative_base, relationship
from geoalchemy2 import Geometry
from datetime import datetime, timezone

def _utcnow():
    return datetime.now(timezone.utc)

Base = declarative_base()

class Propiedad(Base):
    __tablename__ = "propiedades"

    propertyCode = Column(String(50), primary_key=True)
    url = Column(Text)
    price = Column(Float)
    size = Column(Float)
    rooms = Column(Integer)
    bathrooms = Column(Integer)
    floor = Column(String(20))
    # Versión numérica de `floor` para filtrar por planta mínima en /buscar.
    # `floor` cruda incluye códigos no numéricos ('bj', 'en', 'st') que se
    # mapean a NULL → no aparecen al filtrar por floor_num >= N.
    floor_num = Column(Integer, nullable=True, index=True)
    address = Column(String(255))
    district = Column(String(100), index=True)
    neighborhood = Column(String(100))
    latitude = Column(Float)
    longitude = Column(Float)
    hasLift = Column(Boolean, default=False)
    exterior = Column(Boolean, default=False)
    operation = Column(String(10), index=True)
    huella_digital = Column(String(32))
    es_duplicado = Column(Boolean, default=False)
    propiedad_original = Column(String(50), nullable=True)
    score_intrinseco = Column(Float)
    score_contexto = Column(Float)
    score_final = Column(Float)
    dist_transport_m = Column(Float)
    dist_health_m = Column(Float)
    dist_education_m = Column(Float)
    dist_park_m = Column(Float)
    dist_commerce_m = Column(Float)
    dist_bike_m = Column(Float)
    geom = Column(Geometry(geometry_type="POINT", srid=4326))
    fecha_obtencion = Column(DateTime, default=_utcnow)
    fecha_actualizacion = Column(DateTime, default=_utcnow, onupdate=_utcnow)
    city = Column(String(100), index=True)

    def as_dict(self):
        return {
            "propertyCode": self.propertyCode,
            "url": self.url,
            "operation": self.operation,
            "price": self.price,
            "size": self.size,
            "rooms": self.rooms,
            "bathrooms": self.bathrooms,
            "floor": self.floor,
            "floor_num": self.floor_num,
            "address": self.address,
            "district": self.district,
            "neighborhood": self.neighborhood,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "hasLift": self.hasLift,
            "exterior": self.exterior,
            "huella_digital": self.huella_digital,
            "es_duplicado": self.es_duplicado,
            "propiedad_original": self.propiedad_original,
            "score_intrinseco": self.score_intrinseco,
            "score_contexto": self.score_contexto,
            "score_final": self.score_final,
            "dist_transport_m": self.dist_transport_m,
            "dist_health_m": self.dist_health_m,
            "dist_education_m": self.dist_education_m,
            "dist_park_m": self.dist_park_m,
            "dist_commerce_m": self.dist_commerce_m,
            "dist_bike_m": self.dist_bike_m,
            "fecha_obtencion": self.fecha_obtencion.isoformat() if self.fecha_obtencion else None,
            "fecha_actualizacion": self.fecha_actualizacion.isoformat() if self.fecha_actualizacion else None,
            "city": self.city,
        }

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    password_hash = Column(String(128), nullable=False)
    role = Column(String(10), nullable=False, default="USER")
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    favorites = relationship("Favorite", back_populates="user", cascade="all, delete-orphan")
    search_history = relationship("SearchHistory", back_populates="user", cascade="all, delete-orphan")


class Favorite(Base):
    __tablename__ = "favorites"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    property_code = Column(String(50), ForeignKey("propiedades.propertyCode"), nullable=False)
    created_at = Column(DateTime, default=_utcnow)
    nota = Column(Text, default="", server_default="")

    user = relationship("User", back_populates="favorites")
    propiedad = relationship("Propiedad")


class SearchHistory(Base):
    __tablename__ = "search_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    query = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    user = relationship("User", back_populates="search_history")


class ScraperState(Base):
    __tablename__ = "scraper_state"

    id = Column(String(50), primary_key=True)
    value = Column(JSON, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class POI(Base):
    __tablename__ = "pois"

    id = Column(Integer, primary_key=True, autoincrement=True)
    category = Column(String(20), nullable=False, index=True)  # transport | health | education | park | commerce | bike
    subtype = Column(String(30))                                # metro | cercanias | hospital | clinic | pharmacy | school | supermarket | cycleway
    name = Column(String(200))
    geom = Column(Geometry(geometry_type="GEOMETRY", srid=4326), nullable=False)
    extra = Column(JSON)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)