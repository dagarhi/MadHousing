from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import get_db, init_db
from datetime import datetime

app = FastAPI(title="Buscador de Pisos API", version="1.0.0")

# CORS para React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def actualizar_datos_desde_idealista(db: Session):
    """Función reutilizable para actualizar datos desde Idealista"""
    try:
        from services.idealista_api import IdealistaAPI
        from services.scoring import valoracion_intrinseca, generar_huella_digital, es_duplicado
        from models import Propiedad
        
        api = IdealistaAPI()
        datos = api.search_properties(max_items=50)
        
        if "error" in datos:
            return {"error": datos["error"]}
        
        propiedades_nuevas = 0
        propiedades_duplicadas = 0
        
        for elemento in datos.get('elementList', []):
            propiedad_data = {
                'propertyCode': str(elemento.get('propertyCode', '')),
                'price': elemento.get('price', 0),
                'size': elemento.get('size', 0),
                'rooms': elemento.get('rooms', 0),
                'bathrooms': elemento.get('bathrooms', 0),
                'floor': elemento.get('floor', ''),
                'address': elemento.get('address', ''),
                'district': elemento.get('district', ''),
                'neighborhood': elemento.get('neighborhood', ''),
                'latitude': elemento.get('latitude', 0),
                'longitude': elemento.get('longitude', 0),
                'hasLift': elemento.get('hasLift', False),
                'exterior': elemento.get('exterior', False),
                'url': elemento.get('url', '')
            }
            
            if es_duplicado(db, propiedad_data):
                propiedades_duplicadas += 1
                continue
            
            propiedad_data['huella_digital'] = generar_huella_digital(propiedad_data)
            propiedad_data['score_intrinseco'] = valoracion_intrinseca(propiedad_data)
            
            nueva_propiedad = Propiedad(**propiedad_data)
            db.add(nueva_propiedad)
            propiedades_nuevas += 1
        
        db.commit()
        
        return {
            "propiedades_nuevas": propiedades_nuevas,
            "propiedades_duplicadas": propiedades_duplicadas,
            "total_api": len(datos.get('elementList', [])),
            "error": None
        }
        
    except Exception as e:
        db.rollback()
        return {"error": f"Error actualizando datos: {str(e)}"}

@app.on_event("startup")
def on_startup():
    init_db()
    print("✅ Base de datos inicializada")
    
    # Actualización automática al iniciar
    from database import SessionLocal
    db = SessionLocal()
    
    try:
        resultado = actualizar_datos_desde_idealista(db)
        if resultado.get("error"):
            print(f"⚠️  Actualización automática falló: {resultado['error']}")
        else:
            print(f"✅ Actualización automática: {resultado['propiedades_nuevas']} propiedades nuevas")
    except Exception as e:
        print(f"⚠️  Error en actualización automática: {e}")
    finally:
        db.close()

# ========== ENDPOINTS PRINCIPALES ==========

@app.get("/")
def read_root():
    return {"message": "🏠 API Buscador de Pisos - TFG", "status": "active"}

@app.get("/test")
def test_endpoint():
    return {
        "message": "✅ Backend funcionando correctamente", 
        "status": "active",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/propiedades")
def get_propiedades(db: Session = Depends(get_db)):
    try:
        from models import Propiedad
        propiedades = db.query(Propiedad).filter(Propiedad.es_duplicado == False).all()
        return {
            "total": len(propiedades),
            "propiedades": [
                {
                    "propertyCode": p.propertyCode,
                    "price": p.price,
                    "size": p.size,
                    "rooms": p.rooms,
                    "address": p.address,
                    "latitude": p.latitude,
                    "longitude": p.longitude,
                    "score_intrinseco": p.score_intrinseco
                }
                for p in propiedades
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo propiedades: {str(e)}")

@app.get("/propiedades-detalle")
def get_propiedades_detalle(db: Session = Depends(get_db)):
    from models import Propiedad
    propiedades = db.query(Propiedad).filter(Propiedad.es_duplicado == False).all()
    
    return {
        "total_en_bd": len(propiedades),
        "propiedades": [
            {
                "propertyCode": p.propertyCode,
                "price": p.price,
                "size": p.size,
                "rooms": p.rooms,
                "address": p.address,
                "score_intrinseco": p.score_intrinseco,
                "fecha_obtencion": p.fecha_obtencion.isoformat() if p.fecha_obtencion else None
            }
            for p in propiedades
        ]
    }

@app.get("/estadisticas")
def get_estadisticas(db: Session = Depends(get_db)):
    from models import Propiedad
    total = db.query(Propiedad).count()
    no_duplicados = db.query(Propiedad).filter(Propiedad.es_duplicado == False).count()
    duplicados = total - no_duplicados
    
    return {
        "total_propiedades": total,
        "propiedades_unicas": no_duplicados,
        "propiedades_duplicadas": duplicados
    }

# ========== ENDPOINTS DE ACTUALIZACIÓN ==========

@app.post("/actualizar-datos")
def actualizar_datos_post(db: Session = Depends(get_db)):
    """Endpoint POST para actualizar datos"""
    resultado = actualizar_datos_desde_idealista(db)
    
    if resultado.get("error"):
        raise HTTPException(status_code=500, detail=resultado["error"])
    
    return {
        "message": "Datos actualizados correctamente",
        **resultado,
        "fecha_actualizacion": datetime.now().isoformat()
    }

@app.get("/actualizar-datos")
def actualizar_datos_get(db: Session = Depends(get_db)):
    """Endpoint GET para actualizar datos desde navegador"""
    resultado = actualizar_datos_desde_idealista(db)
    
    if resultado.get("error"):
        return {"error": resultado["error"]}
    
    return {
        "message": "Datos actualizados correctamente",
        **resultado,
        "fecha_actualizacion": datetime.now().isoformat()
    }

# ========== ENDPOINTS DE DIAGNÓSTICO ==========

@app.get("/test-api")
def test_api():
    try:
        from services.idealista_api import IdealistaAPI
        api = IdealistaAPI()
        token = api.get_access_token()
        return {"message": "✅ API Idealista conectada", "token_obtenido": token is not None}
    except Exception as e:
        return {"message": "❌ Error con API Idealista", "error": str(e)}

@app.get("/test-idealista")
def test_idealista():
    try:
        from services.idealista_api import IdealistaAPI
        api = IdealistaAPI()
        
        token = api.get_access_token()
        if not token:
            return {"error": "No se pudo obtener token"}
        
        resultado = api.search_properties(max_items=5)
        
        return {
            "status": "success",
            "token_obtenido": True,
            "datos_recibidos": "error" not in resultado,
            "total_propiedades": len(resultado.get("elementList", [])),
            "primeras_propiedades": [
                {
                    "propertyCode": p.get("propertyCode"),
                    "price": p.get("price"),
                    "address": p.get("address")
                }
                for p in resultado.get("elementList", [])[:3]
            ]
        }
    except Exception as e:
        return {"error": str(e)}

@app.get("/debug-env")
def debug_env():
    import os
    from dotenv import load_dotenv
    load_dotenv()
    
    return {
        "api_key_loaded": os.getenv("IDEALISTA_API_KEY") is not None,
        "secret_loaded": os.getenv("IDEALISTA_SECRET") is not None,
        "api_key_length": len(os.getenv("IDEALISTA_API_KEY", "")),
        "secret_length": len(os.getenv("IDEALISTA_SECRET", ""))
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="localhost", port=8000)