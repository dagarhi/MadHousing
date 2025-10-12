from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import get_db, init_db
from datetime import datetime
from models import Propiedad
from config.sites import ZONAS_PREDETERMINADAS
from services.idealista_api import IdealistaAPI
from services.scoring import valoracion_intrinseca, generar_huella_digital

app = FastAPI(title="Buscador de Pisos API", version="1.0.0")

# CORS para React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def actualizar_datos_desde_idealista(db: Session, zona="madrid_centro", operation="rent"):
    """Actualiza o inserta propiedades desde la API de Idealista"""
    try:
        api = IdealistaAPI()
        z = ZONAS_PREDETERMINADAS.get(zona)
        if not z:
            return {"error": f"Zona '{zona}' no definida"}

        datos = api.search_by_area(
            center=z["center"],
            distance=z["distance"],
            operation=operation,
            num_pages=3
        )

        if "error" in datos:
            return {"error": datos["error"]}

        propiedades_nuevas = 0
        propiedades_actualizadas = 0

        for elemento in datos.get("elementList", []):
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
                'url': elemento.get('url', ''),
                'operation': operation
            }

            propiedad_existente = db.query(Propiedad).filter(
                Propiedad.propertyCode == propiedad_data['propertyCode']
            ).first()

            if propiedad_existente:
                for key, value in propiedad_data.items():
                    setattr(propiedad_existente, key, value)
                propiedad_existente.huella_digital = generar_huella_digital(propiedad_data)
                propiedad_existente.score_intrinseco = valoracion_intrinseca(propiedad_data)
                propiedad_existente.fecha_actualizacion = datetime.now()
                propiedades_actualizadas += 1
            else:
                propiedad_data['huella_digital'] = generar_huella_digital(propiedad_data)
                propiedad_data['score_intrinseco'] = valoracion_intrinseca(propiedad_data)
                nueva_propiedad = Propiedad(**propiedad_data)
                db.add(nueva_propiedad)
                propiedades_nuevas += 1

        db.commit()

        return {
            "propiedades_nuevas": propiedades_nuevas,
            "propiedades_actualizadas": propiedades_actualizadas,
            "total_api": len(datos.get('elementList', [])),
            "zona": zona,
            "operation": operation,
            "error": None
        }

    except Exception as e:
        db.rollback()
        return {"error": f"Error actualizando datos: {str(e)}"}


@app.on_event("startup")
def on_startup():
    init_db()
    print("✅ Base de datos inicializada")

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


# ========= ENDPOINTS PRINCIPALES ==========

@app.get("/")
def read_root():
    return {"message": "🏠 API Buscador de Pisos - TFG", "status": "active"}


@app.get("/propiedades")
def get_propiedades(operation: str, db: Session = Depends(get_db)):
    try:
        props = db.query(Propiedad).filter(Propiedad.operation == operation).all()
        return {"total": len(props), "propiedades": [p.as_dict() for p in props]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo propiedades: {str(e)}")


@app.get("/buscar")
def buscar_propiedades(
    ciudad: str = Query(..., description="Ciudad o zona (clave del catálogo)"),
    operation: str = Query("rent", description="Tipo de operación: rent o sale")
):
    ciudad = ciudad.lower()
    if ciudad not in ZONAS_PREDETERMINADAS:
        return {"error": f"La ciudad '{ciudad}' no está disponible"}

    zona = ZONAS_PREDETERMINADAS[ciudad]
    api = IdealistaAPI()
    datos = api.search_by_area(center=zona["center"], distance=zona["distance"], operation=operation, num_pages=3)

    if "error" in datos:
        return {"error": datos["error"]}

    propiedades = [
        {
            "propertyCode": p.get("propertyCode"),
            "price": p.get("price"),
            "size": p.get("size"),
            "latitude": p.get("latitude"),
            "longitude": p.get("longitude"),
            "address": p.get("address"),
            "score": valoracion_intrinseca(p),
            "url": p.get("url"),
        }
        for p in datos.get("elementList", [])
    ]

    return {"ciudad": ciudad, "operation": operation, "total": len(propiedades), "propiedades": propiedades}


@app.get("/actualizar-datos")
def actualizar_datos_get(
    zona: str = "madrid_centro",
    operation: str = "rent",
    db: Session = Depends(get_db)
):
    return actualizar_datos_desde_idealista(db, zona=zona, operation=operation)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="localhost", port=8000)
