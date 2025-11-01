from fastapi import FastAPI, Depends, HTTPException, Query, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import get_db, init_db
from models import Propiedad
from config.sites import ZONAS_PREDETERMINADAS
from services.idealista_api import IdealistaAPI
from services.scoring import valoracion_intrinseca, generar_huella_digital
from datetime import datetime
from math import radians, cos, sin, asin, sqrt

app = FastAPI(title="Buscador de Pisos API", version="3.0.1")

# --- Configuración CORS para el frontend React ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Función auxiliar ---
def distancia_km(lat1, lon1, lat2, lon2):
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
    """Determina si usar la base de datos prod o test según el header/source."""
    mode = (x_data_source or source or "prod").lower()
    mode = "test" if mode == "test" else "prod"
    yield from get_db(mode)

@app.on_event("startup")
def on_startup():
    """Inicializa las tablas si no existen."""
    init_db()
    print("✅ Base de datos lista")

@app.get("/")
def read_root():
    return {"message": "🏠 API Buscador de Pisos (modo local)", "status": "active"}

@app.get("/buscar")
def buscar_propiedades(
    ciudad: str = Query(...),
    operation: str = Query("rent"),
    min_price: float = Query(None),
    max_price: float = Query(None),
    min_size: float = Query(None),
    max_size: float = Query(None),
    rooms: int = Query(None),
    hasLift: bool = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, le=100),
    db: Session = Depends(db_from_request),
):
    """Busca propiedades locales aplicando filtro por radio geográfico."""
    ciudad_original = ciudad
    ciudad = ciudad.lower()

    # --- Validación flexible con alias ---
    if ciudad not in ZONAS_PREDETERMINADAS:
        for key, zona in ZONAS_PREDETERMINADAS.items():
            for alias in zona.get("alias", []):
                if alias.lower() in ciudad or ciudad in alias.lower():
                    ciudad = key
                    break
            else:
                continue
            break
        else:
            raise HTTPException(status_code=400, detail=f"Zona '{ciudad_original}' no disponible")

    # --- Carga de datos de la zona ---
    zona_actual = ZONAS_PREDETERMINADAS[ciudad]
    lat_centro, lon_centro = map(float, zona_actual["center"].split(","))
    radio_km = zona_actual["distance"] / 1000  # convertir metros a km

    # --- Filtro base ---
    filtros = [Propiedad.operation == operation]

    # --- Filtros adicionales ---
    if min_price:
        filtros.append(Propiedad.price >= min_price)
    if max_price:
        filtros.append(Propiedad.price <= max_price)
    if min_size:
        filtros.append(Propiedad.size >= min_size)
    if max_size:
        filtros.append(Propiedad.size <= max_size)
    if rooms:
        filtros.append(Propiedad.rooms >= rooms)
    if hasLift is not None:
        filtros.append(Propiedad.hasLift == hasLift)

    # --- Obtener todas las propiedades y filtrar por distancia geográfica ---
    props_all = db.query(Propiedad).filter(*filtros).all()
    props_filtradas = []

    for p in props_all:
        if not (p.latitude and p.longitude):
            continue
        d = distancia_km(lat_centro, lon_centro, p.latitude, p.longitude)
        if d <= radio_km:
            props_filtradas.append(p)

    total = len(props_filtradas)
    inicio = (page - 1) * per_page
    fin = inicio + per_page
    props_page = props_filtradas[inicio:fin]

    # --- Calcular estadísticas ---
    precios = [p.price for p in props_filtradas if p.price]
    tamanios = [p.size for p in props_filtradas if p.size]
    scores = [p.score_intrinseco for p in props_filtradas if p.score_intrinseco]

    stats = {
        "price": {"min": min(precios) if precios else 0, "max": max(precios) if precios else 0},
        "size": {"min": min(tamanios) if tamanios else 0, "max": max(tamanios) if tamanios else 0},
        "score": {"min": min(scores) if scores else 0, "max": max(scores) if scores else 100},
    }

    return {
        "ciudad": ciudad,
        "operation": operation,
        "total": total,
        "pagina": page,
        "por_pagina": per_page,
        "propiedades": [p.as_dict() for p in props_page],
        "origen": "base_local",
        "stats": stats,
    }

@app.post("/seed-idealista")
def cargar_datos_idealista(
    zona: str = Query(..., description="Nombre de la zona, ej: 'madrid_centro'"),
    operation: str = Query("rent", description="Tipo de operación: rent o sale"),
):
    """Carga o actualiza datos desde Idealista manualmente."""
    from database import get_db
    from models import Propiedad
    from services.scoring import valoracion_intrinseca, generar_huella_digital

    gen = get_db("prod")
    db = next(gen)

    try:
        if zona not in ZONAS_PREDETERMINADAS:
            raise HTTPException(status_code=400, detail=f"Zona '{zona}' no está definida en ZONAS_PREDETERMINADAS")

        z = ZONAS_PREDETERMINADAS[zona]
        lat, lon = map(float, z["center"].split(","))
        distance = z["distance"] / 1000

        api = IdealistaAPI()
        datos = api.search_by_area(
            center=f"{lat},{lon}",
            distance=distance,
            operation=operation,
            num_pages=3,
        )

        if "error" in datos:
            raise HTTPException(status_code=502, detail=f"Error en la API de Idealista: {datos['error']}")

        nuevas, actualizadas = 0, 0
        for e in datos.get("elementList", []):
            lat_p = e.get("latitude")
            lon_p = e.get("longitude")

            if lat_p and lon_p:
                d = distancia_km(lat, lon, lat_p, lon_p)
                if d > distance:
                    continue

            payload = {
                "propertyCode": str(e.get("propertyCode", "")),
                "price": e.get("price", 0),
                "size": e.get("size", 0),
                "rooms": e.get("rooms", 0),
                "bathrooms": e.get("bathrooms", 0),
                "floor": e.get("floor", ""),
                "address": e.get("address", ""),
                "district": e.get("district", ""),
                "neighborhood": e.get("neighborhood", ""),
                "latitude": lat_p,
                "longitude": lon_p,
                "hasLift": e.get("hasLift", False),
                "exterior": e.get("exterior", False),
                "url": e.get("url", ""),
                "operation": operation,
            }

            payload["huella_digital"] = generar_huella_digital(payload)
            payload["score_intrinseco"] = valoracion_intrinseca(payload)
            payload["fecha_actualizacion"] = datetime.now()
            payload["fecha_obtencion"] = datetime.now()

            existe = db.query(Propiedad).filter(Propiedad.propertyCode == payload["propertyCode"]).first()
            db.merge(Propiedad(**payload))
            if existe:
                actualizadas += 1
            else:
                nuevas += 1

        db.commit()

        return {
            "zona": zona,
            "operation": operation,
            "propiedades_nuevas": nuevas,
            "propiedades_actualizadas": actualizadas,
            "total_guardadas": nuevas + actualizadas,
            "total_recibidas_api": len(datos.get("elementList", [])),
            "mensaje": f"Datos cargados localmente para zona '{zona}' ✅",
        }

    except HTTPException as e:
        raise e
    except Exception as e:
        db.rollback()
        return {"error": f"Error cargando datos desde Idealista: {str(e)}"}
    finally:
        try:
            next(gen)
        except StopIteration:
            pass


@app.get("/buscar-todo")
def buscar_todo(
    operation: str = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(100, le=500),
    db: Session = Depends(db_from_request),
):
    """Devuelve todas las propiedades sin filtrar por ciudad."""
    query = db.query(Propiedad)
    if operation:
        query = query.filter(Propiedad.operation == operation)

    total = query.count()
    props = query.offset((page - 1) * per_page).limit(per_page).all()

    return {
        "total": total,
        "pagina": page,
        "por_pagina": per_page,
        "propiedades": [p.as_dict() for p in props],
        "origen": "base_local",
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=True)
