from fastapi import FastAPI, Depends, HTTPException, Query, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import or_
from database import get_db, init_db
from math import radians, cos, sin, asin, sqrt
from datetime import datetime
from models import Propiedad
from config.sites import ZONAS_PREDETERMINADAS
from services.idealista_api import IdealistaAPI
from services.scoring import valoracion_intrinseca, generar_huella_digital
import itertools

app = FastAPI(title="Buscador de Pisos API", version="2.0.0")

# CORS para React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def distancia_km(lat1, lon1, lat2, lon2):
    """Calcula la distancia entre dos coordenadas."""
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2)**2
    return 2 * R * asin(sqrt(a))

def db_from_request(
    request: Request,
    x_data_source: str = Header(default=None),
    source: str = Query(default=None)
):
    """Detecta si se está usando modo prod o test."""
    mode = (x_data_source or source or "prod").lower()
    mode = "test" if mode == "test" else "prod"
    yield from get_db(mode)


@app.on_event("startup")
def on_startup():
    init_db()
    print("✅ Bases de datos inicializadas (prod y test)")


@app.get("/")
def read_root():
    return {"message": "🏠 API Buscador de Pisos - TFG", "status": "active"}


@app.get("/propiedades")
def get_propiedades(operation: str, db: Session = Depends(db_from_request)):
    try:
        props = db.query(Propiedad).filter(Propiedad.operation == operation).all()
        return {"total": len(props), "propiedades": [p.as_dict() for p in props]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo propiedades: {str(e)}")


@app.get("/buscar")
def buscar_propiedades(
    ciudad: str = Query(..., description="Ciudad o zona"),
    operation: str = Query("rent", description="Tipo de operación"),
    request: Request = None,
    db: Session = Depends(db_from_request)
):
    from services.scoring import valoracion_intrinseca

    ciudad = ciudad.lower()
    if ciudad not in ZONAS_PREDETERMINADAS:
        return {"error": f"La ciudad '{ciudad}' no está disponible"}

    mode = (request.headers.get("x-data-source") or request.query_params.get("source") or "prod").lower()
    is_test = mode == "test"

    props_locales = db.query(Propiedad).filter(
        Propiedad.operation == operation,
        or_(
            Propiedad.district.ilike(f"%{ciudad}%"),
            Propiedad.neighborhood.ilike(f"%{ciudad}%")
        )
    ).all()

    if not props_locales:
        zona = ZONAS_PREDETERMINADAS[ciudad]
        center_lat, center_lon = map(float, zona["center"].split(","))
        max_dist_km = zona["distance"] / 1000

        props_locales = [
            p for p in db.query(Propiedad).filter(Propiedad.operation == operation).all()
            if p.latitude and p.longitude and
               distancia_km(center_lat, center_lon, p.latitude, p.longitude) <= max_dist_km
        ]
    if not props_locales:
        return {
            "ciudad": ciudad,
            "operation": operation,
            "total": 0,
            "propiedades": [],
            "origen": f"base_de_datos_{'test' if is_test else 'prod'}",
            "aviso": "No hay datos locales aún para esta zona/operación. Carga datos con /seed-idealista."
        }
    return {
        "ciudad": ciudad,
        "operation": operation,
        "total": len(props_locales),
        "propiedades": [
            {
                "propertyCode": p.propertyCode,
                "price": p.price,
                "size": p.size,
                "latitude": p.latitude,
                "longitude": p.longitude,
                "address": p.address,
                "url": p.url,
                "score": p.score_intrinseco or valoracion_intrinseca(p.as_dict())
            }
            for p in props_locales
        ],
        "origen": f"base_de_datos_{'test' if is_test else 'prod'}"
    }



@app.post("/seed-test")
def seed_test_data():
    """Llena la base de datos de PRUEBA (pisos_test.db) con propiedades simuladas."""
    from database import get_db
    from services.scoring import generar_huella_digital, valoracion_intrinseca
    from models import Propiedad

    gen = get_db("test")
    db = next(gen)
    try:
        datos_prueba = [
            # Vallecas (alquiler)
            {"propertyCode": "tv1", "price": 850, "size": 70, "rooms": 2, "bathrooms": 1,
            "address": "Calle de Peña Prieta", "district": "Puente de Vallecas",
            "latitude": 40.3895, "longitude": -3.6570, "operation": "rent",
            "score_intrinseco": 0.65},
            {"propertyCode": "tv2", "price": 950, "size": 80, "rooms": 3, "bathrooms": 2,
            "address": "Avenida de la Albufera", "district": "Vallecas",
            "latitude": 40.3875, "longitude": -3.6620, "operation": "rent",
            "score_intrinseco": 0.82},
            # Alcorcón (venta)
            {"propertyCode": "ta1", "price": 175000, "size": 90, "rooms": 3, "bathrooms": 2,
            "address": "Calle Mayor", "district": "Centro",
            "latitude": 40.3494, "longitude": -3.8283, "operation": "sale",
            "score_intrinseco": 0.77},
            {"propertyCode": "ta2", "price": 145000, "size": 75, "rooms": 2, "bathrooms": 1,
            "address": "Avenida de Lisboa", "district": "Norte",
            "latitude": 40.3501, "longitude": -3.8300, "operation": "sale",
            "score_intrinseco": 0.54},
        ]

        # Más mocks variados
        counter = itertools.count(3)
        for i in range(20):
            idx = next(counter)
            datos_prueba.append({
                "propertyCode": f"tm{idx}",
                "price": 700 + 25 * idx,
                "size": 55 + 2 * idx,
                "rooms": 1 + (idx % 3),
                "bathrooms": 1 + (idx % 2),
                "address": f"Calle Ficticia {idx}",
                "district": "MockDistrict",
                "latitude": 40.38 + (idx * 0.001),
                "longitude": -3.66 - (idx * 0.001),
                "operation": "rent" if idx % 2 == 0 else "sale",
                "hasLift": (idx % 2 == 0),
                "exterior": (idx % 3 == 0),
            })

        for d in datos_prueba:
            d["huella_digital"] = generar_huella_digital(d)
            d["score_intrinseco"] = valoracion_intrinseca(d)
            db.merge(Propiedad(**d))
        db.commit()
        return {"mensaje": "Base de PRUEBAS sembrada correctamente", "total": len(datos_prueba)}
    finally:
        try:
            next(gen)
        except StopIteration:
            pass

@app.post("/seed-idealista")
def cargar_datos_idealista(
    zona: str = Query("vallecas", description="Zona definida en ZONAS_PREDETERMINADAS"),
    operation: str = Query("rent", description="Tipo de operación: rent o sale"),
):
    from database import get_db
    from services.scoring import generar_huella_digital, valoracion_intrinseca
    from models import Propiedad
    from services.idealista_api import IdealistaAPI
    from datetime import datetime

    # 🔒 forzar prod
    gen = get_db("prod")
    db = next(gen)

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

            existente = db.query(Propiedad).filter(
                Propiedad.propertyCode == propiedad_data['propertyCode']
            ).first()

            if existente:
                for key, value in propiedad_data.items():
                    setattr(existente, key, value)
                existente.huella_digital = generar_huella_digital(propiedad_data)
                existente.score_intrinseco = valoracion_intrinseca(propiedad_data)
                existente.fecha_actualizacion = datetime.now()
                propiedades_actualizadas += 1
            else:
                propiedad_data['huella_digital'] = generar_huella_digital(propiedad_data)
                propiedad_data['score_intrinseco'] = valoracion_intrinseca(propiedad_data)
                propiedad_data['fecha_actualizacion'] = datetime.now()
                nueva = Propiedad(**propiedad_data)
                db.add(nueva)
                propiedades_nuevas += 1

        db.commit()

        return {
            "zona": zona,
            "operation": operation,
            "propiedades_nuevas": propiedades_nuevas,
            "propiedades_actualizadas": propiedades_actualizadas,
            "total_api": len(datos.get('elementList', [])),
            "mensaje": "Datos cargados/actualizados en base local"
        }

    except Exception as e:
        db.rollback()
        return {"error": f"Error cargando datos desde Idealista: {str(e)}"}
    finally:
        try:
            next(gen)
        except StopIteration:
            pass



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="localhost", port=8000)
