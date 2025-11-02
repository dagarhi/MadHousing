from fastapi import FastAPI, Depends, HTTPException, Query, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import get_db, init_db
from models import Propiedad
from services.idealista_api import IdealistaAPI
from services.scoring import valoracion_intrinseca, generar_huella_digital
from datetime import datetime
from math import radians, cos, sin, asin, sqrt
from collections import defaultdict
from statistics import mean

app = FastAPI(title="Buscador de Pisos API", version="4.0.0")

# --- Configuración CORS para frontend React ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Funciones auxiliares ---
def distancia_km(lat1, lon1, lat2, lon2):
    """Calcula la distancia entre dos coordenadas (km)."""
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * R * asin(sqrt(a))

def db_from_request(
    request: Request,
    x_data_source: str = Header(default=None),
    source: str = Query(default=None),
):
    """Determina si usar la BD prod o test según cabecera o query param."""
    mode = (x_data_source or source or "prod").lower()
    mode = "test" if mode == "test" else "prod"
    yield from get_db(mode)

@app.on_event("startup")
def on_startup():
    """Inicializa las tablas si no existen."""
    init_db()
    print("✅ Base de datos inicializada correctamente")

# --------------------------------------------------------------
#                 ENDPOINTS PRINCIPALES
# --------------------------------------------------------------

@app.get("/")
def read_root():
    return {"message": "🏠 API Buscador de Pisos dinámica", "status": "active"}


# 🔍 Buscar propiedades (sin zonas predefinidas)
@app.get("/buscar")
def buscar_propiedades(
    ciudad: str = Query(..., description="Ciudad, distrito o barrio a buscar"),
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
    """
    Busca propiedades filtrando por city, district o neighborhood.
    Ya no depende de zonas predefinidas ni radios.
    """
    ciudad_original = ciudad
    ciudad = ciudad.lower()

    filtros = [Propiedad.operation == operation]

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

    props_all = db.query(Propiedad).filter(*filtros).all()

    # Filtro textual flexible (coincidencia parcial)
    props_filtradas = [
        p
        for p in props_all
        if (
            (p.city and ciudad in p.city.lower())
            or (p.district and ciudad in p.district.lower())
            or (p.neighborhood and ciudad in p.neighborhood.lower())
        )
    ]

    total = len(props_filtradas)
    inicio = (page - 1) * per_page
    fin = inicio + per_page
    props_page = props_filtradas[inicio:fin]

    # Estadísticas básicas
    precios = [p.price for p in props_filtradas if p.price]
    tamanos = [p.size for p in props_filtradas if p.size]
    scores = [p.score_intrinseco for p in props_filtradas if p.score_intrinseco]

    stats = {
        "price": {"min": min(precios) if precios else 0, "max": max(precios) if precios else 0},
        "size": {"min": min(tamanos) if tamanos else 0, "max": max(tamanos) if tamanos else 0},
        "score": {"min": min(scores) if scores else 0, "max": max(scores) if scores else 100},
    }

    return {
        "ciudad_consultada": ciudad_original,
        "operation": operation,
        "total": total,
        "pagina": page,
        "por_pagina": per_page,
        "propiedades": [p.as_dict() for p in props_page],
        "stats": stats,
    }


# 🌍 Zonas jerárquicas automáticas (para el buscador)
@app.get("/zonas-jerarquicas")
def obtener_zonas_jerarquicas(db: Session = Depends(db_from_request)):
    """
    Devuelve jerarquía ciudad → distrito → barrio basada en los datos reales.
    Permite crear selects anidados dinámicos en el frontend.
    """
    jerarquia = defaultdict(lambda: defaultdict(set))
    props = db.query(Propiedad.city, Propiedad.district, Propiedad.neighborhood).distinct().all()

    for city, district, neighborhood in props:
        if not city:
            continue
        city = city.strip()
        district = (district or "Desconocido").strip()
        neighborhood = (neighborhood or "").strip()

        jerarquia[city][district].add(neighborhood)

    # Convertir sets a listas ordenadas
    result = {}
    for city, distritos in jerarquia.items():
        result[city] = {}
        for d, barrios in distritos.items():
            result[city][d] = sorted(list(barrios - {""}))
    return result


# 🌐 Buscar todo (sin filtros de zona)
@app.get("/buscar-todo")
def buscar_todo(
    operation: str = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(500, le=1000),
    db: Session = Depends(db_from_request),
):
    """Devuelve todas las propiedades, opcionalmente filtradas por tipo de operación."""
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


# 📊 Estadísticas globales agrupadas por distrito
@app.get("/estadisticas-globales")
def estadisticas_por_zona(db: Session = Depends(db_from_request)):
    """Devuelve estadísticas agrupadas por zona (district o neighborhood)."""
    zonas = defaultdict(lambda: {"sale": [], "rent": []})

    props = db.query(Propiedad).all()
    for p in props:
        zona = p.district or p.neighborhood or "Desconocido"
        zonas[zona][p.operation].append(p)

    def resumen(lista):
        precios = [p.price for p in lista if p.price]
        tamanos = [p.size for p in lista if p.size]
        scores = [p.score_intrinseco for p in lista if p.score_intrinseco]
        return {
            "count": len(lista),
            "precio_medio": round(mean(precios), 2) if precios else 0,
            "tamano_medio": round(mean(tamanos), 2) if tamanos else 0,
            "score_medio": round(mean(scores), 2) if scores else 0,
        }

    data = {zona: {"sale": resumen(t["sale"]), "rent": resumen(t["rent"])} for zona, t in zonas.items()}
    return data


# 🧱 Cargar datos desde Idealista
@app.post("/seed-idealista")
def cargar_datos_idealista(
    zona: str = Query(..., description="Nombre de la zona, ej: 'Vallecas' o 'Alcorcón'"),
    operation: str = Query("rent", description="Tipo de operación: rent o sale"),
):
    """Carga o actualiza datos desde la API de Idealista."""
    from database import get_db
    from models import Propiedad

    gen = get_db("prod")
    db = next(gen)
    try:
        api = IdealistaAPI()
        datos = api.search_by_area_name(zona, operation=operation, num_pages=3)

        if "error" in datos:
            raise HTTPException(status_code=502, detail=f"Error en la API de Idealista: {datos['error']}")

        nuevas, actualizadas = 0, 0
        for e in datos.get("elementList", []):
            lat = e.get("latitude")
            lon = e.get("longitude")
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
                "city": e.get("municipality", ""),
                "latitude": lat,
                "longitude": lon,
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
            "nuevas": nuevas,
            "actualizadas": actualizadas,
            "total_guardadas": nuevas + actualizadas,
            "mensaje": f"Datos cargados correctamente para '{zona}' ✅",
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error cargando datos: {str(e)}")
    finally:
        try:
            next(gen)
        except StopIteration:
            pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=True)
