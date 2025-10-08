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