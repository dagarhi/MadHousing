from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

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
    address = Column(String(255))
    district = Column(String(100))
    neighborhood = Column(String(100))
    latitude = Column(Float)
    longitude = Column(Float)
    hasLift = Column(Boolean, default=False)
    exterior = Column(Boolean, default=False)
    operation = Column(String(10))
    huella_digital = Column(String(32))
    es_duplicado = Column(Boolean, default=False)
    propiedad_original = Column(String(50), nullable=True)
    score_intrinseco = Column(Float)
    score_zona = Column(Float)
    score_planta = Column(Float)
    score_final = Column(Float)
    fecha_obtencion = Column(DateTime, default=datetime.now)
    fecha_actualizacion = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    city = Column(String(100))
    address = Column(String(255))

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
            "score_zona": self.score_zona,
            "score_planta": self.score_planta,
            "score_final": self.score_final,
            "fecha_obtencion": self.fecha_obtencion.isoformat() if self.fecha_obtencion else None,
            "fecha_actualizacion": self.fecha_actualizacion.isoformat() if self.fecha_actualizacion else None,
            "city": self.city,
        }

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    password_hash = Column(String(128), nullable=False)
    profile = Column(String(50), nullable=True)  # "novato", "intermedio", "avanzado" o lo que quieras
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    # Relaciones de conveniencia (opcional pero muy útil)
    favorites = relationship("Favorite", back_populates="user", cascade="all, delete-orphan")
    search_history = relationship("SearchHistory", back_populates="user", cascade="all, delete-orphan")


class Favorite(Base):
    __tablename__ = "favorites"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    property_code = Column(String(50), ForeignKey("propiedades.propertyCode"), nullable=False)
    created_at = Column(DateTime, default=datetime.now)

    # Relaciones
    user = relationship("User", back_populates="favorites")
    propiedad = relationship("Propiedad")


class SearchHistory(Base):
    __tablename__ = "search_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # Puedes guardar los parámetros de búsqueda en JSON (texto) o desglosados en columnas
    query = Column(Text, nullable=True)  # por ejemplo un JSON con la búsqueda
    created_at = Column(DateTime, default=datetime.now)

    user = relationship("User", back_populates="search_history")