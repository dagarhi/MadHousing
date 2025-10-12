from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()

class Propiedad(Base):
    __tablename__ = "propiedades"
    
    # Identificación
    propertyCode = Column(String(50), primary_key=True)
    url = Column(Text)
    
    # Datos básicos
    price = Column(Float)
    size = Column(Float)
    rooms = Column(Integer)
    bathrooms = Column(Integer)
    floor = Column(String(20))
    
    # Ubicación
    address = Column(String(255))
    district = Column(String(100))
    neighborhood = Column(String(100))
    latitude = Column(Float)
    longitude = Column(Float)
    
    # Características
    hasLift = Column(Boolean, default=False)
    garage = Column(Boolean, default=False)
    terrace = Column(Boolean, default=False)
    swimmingPool = Column(Boolean, default=False)
    airConditioning = Column(Boolean, default=False)
    exterior = Column(Boolean, default=False)
    operation = Column(String(10))  # 'rent' o 'sale'
    
    # Control de duplicados
    huella_digital = Column(String(32))
    es_duplicado = Column(Boolean, default=False)
    propiedad_original = Column(String(50), nullable=True)
    
    # Sistema de scoring
    score_intrinseco = Column(Float)
    score_zona = Column(Float)
    score_planta = Column(Float)
    score_final = Column(Float)
    
    # Metadata
    fecha_obtencion = Column(DateTime, default=datetime.now)
    fecha_actualizacion = Column(DateTime, default=datetime.now, onupdate=datetime.now)

def as_dict(self):
    """Convierte el objeto Propiedad en un diccionario serializable."""
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
        "garage": self.garage,
        "terrace": self.terrace,
        "swimmingPool": self.swimmingPool,
        "airConditioning": self.airConditioning,
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
    }
