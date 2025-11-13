from fastapi import FastAPI, Depends, HTTPException, Query, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import get_db, init_db
from models import Propiedad, User, Favorite, SearchHistory
from services.idealista_api import IdealistaAPI
from services.scoring import valoracion_intrinseca, generar_huella_digital
from datetime import datetime, timedelta
from math import radians, cos, sin, asin, sqrt
from collections import defaultdict
from statistics import mean
from routers.heatmap_router import router as heatmap_router

from pydantic import BaseModel
from typing import Optional, List
from jose import jwt, JWTError
from passlib.context import CryptContext
import os
import json

# --------------------------------------------------------------
#                 CONFIGURACIÓN AUTENTICACIÓN
# --------------------------------------------------------------

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "cambia-esto-en-produccion")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60  # minutos

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    username: str
    profile: Optional[str] = None

class FavoriteCreate(BaseModel):
    property_code: str  # el propertyCode del piso


class FavoriteOut(BaseModel):
    id: int
    property_code: str
    created_at: datetime
    propiedad: dict  # devolveremos el as_dict() de la propiedad


class SearchHistoryCreate(BaseModel):
    query: dict  # aquí meterás los parámetros de búsqueda del frontend


class SearchHistoryOut(BaseModel):
    id: int
    created_at: datetime
    query: dict


app = FastAPI(title="Buscador de Pisos API", version="5.0.0")
app.include_router(heatmap_router)

# --- Configuración CORS para frontend Angular ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4200",
        "http://127.0.0.1:4200",
        "*",  # si quieres limitarlo más, quita este
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Funciones auxiliares ---

def distancia_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calcula la distancia entre dos coordenadas (km)."""
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * R * asin(sqrt(a))


def db_from_request(request: Request):
    """
    En esta versión siempre usamos la BD principal.
    Si en tu database.py mantienes soporte para 'prod'/'test',
    adapta esta función para pasar el modo correspondiente.
    """
    yield from get_db()


def get_current_user(
    authorization: str = Header(None),
    db: Session = Depends(db_from_request),
):
    """
    Lee el header Authorization: Bearer <token>, valida el JWT
    y devuelve el usuario.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token de autenticación no encontrado")

    token = authorization.split(" ", 1)[1]

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("user_id")
        username: str = payload.get("sub")
        if user_id is None or username is None:
            raise HTTPException(status_code=401, detail="Token inválido")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")

    return user


def seed_default_users():
    """
    Crea las 3 cuentas por defecto si no existen:

    - novato / novato123
    - intermedio / intermedio123
    - avanzado / avanzado123
    """
    gen = get_db()
    db = next(gen)
    try:
        defaults = [
            ("novato", "novato123", "novato"),
            ("intermedio", "intermedio123", "intermedio"),
            ("avanzado", "avanzado123", "avanzado"),
        ]

        for username, plain_pw, profile in defaults:
            existing = db.query(User).filter(User.username == username).first()
            if not existing:
                user = User(
                    username=username,
                    password_hash=get_password_hash(plain_pw),
                    profile=profile,
                )
                db.add(user)

        db.commit()
        print("✅ Usuarios por defecto verificados/creados")
    finally:
        try:
            next(gen)
        except StopIteration:
            pass


@app.on_event("startup")
def on_startup():
    """Inicializa las tablas y crea los usuarios por defecto."""
    init_db()
    seed_default_users()
    print("✅ Base de datos inicializada correctamente")


# --------------------------------------------------------------
#                       AUTENTICACIÓN
# --------------------------------------------------------------

@app.post("/auth/login", response_model=TokenResponse)
def login(
    credentials: LoginRequest,
    db: Session = Depends(db_from_request),
):
    """
    Login sencillo con JSON:
    {
        "username": "novato",
        "password": "novato123"
    }
    """
    user = db.query(User).filter(User.username == credentials.username).first()
    if not user:
        raise HTTPException(status_code=400, detail="Usuario o contraseña incorrectos")

    if not verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Usuario o contraseña incorrectos")

    access_token = create_access_token(
        data={"sub": user.username, "user_id": user.id}
    )

    return TokenResponse(
        access_token=access_token,
        user_id=user.id,
        username=user.username,
        profile=user.profile,
    )


# --------------------------------------------------------------
#                 ENDPOINTS PRINCIPALES EXISTENTES
# --------------------------------------------------------------

@app.get("/")
def read_root():
    return {"message": "🏠 API Buscador de Pisos dinámica", "status": "active"}


# 🔍 Buscar propiedades (sin zonas predefinidas)
@app.get("/buscar")
def buscar_propiedades(
    ciudad: str = Query(..., description="Ciudad, distrito o barrio a buscar"),
    operation: str = Query("rent"),
    min_price: Optional[float] = Query(None),
    max_price: Optional[float] = Query(None),
    min_size: Optional[float] = Query(None),
    max_size: Optional[float] = Query(None),
    rooms: Optional[int] = Query(None),
    hasLift: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, le=100),
    db: Session = Depends(db_from_request),
):
    """
    Busca propiedades filtrando por city, district o neighborhood (búsqueda textual),
    más filtros numéricos básicos. No depende de zonas predefinidas ni radios.
    """
    ciudad_original = ciudad
    ciudad = ciudad.lower()

    query = db.query(Propiedad).filter(Propiedad.operation == operation)

    # Filtro por texto en city / district / neighborhood
    like = f"%{ciudad}%"
    query = query.filter(
        (Propiedad.city.ilike(like))
        | (Propiedad.district.ilike(like))
        | (Propiedad.neighborhood.ilike(like))
    )

    if min_price is not None:
        query = query.filter(Propiedad.price >= min_price)
    if max_price is not None:
        query = query.filter(Propiedad.price <= max_price)
    if min_size is not None:
        query = query.filter(Propiedad.size >= min_size)
    if max_size is not None:
        query = query.filter(Propiedad.size <= max_size)
    if rooms is not None:
        query = query.filter(Propiedad.rooms >= rooms)
    if hasLift is not None:
        query = query.filter(Propiedad.hasLift == hasLift)

    props_filtradas = query.all()

    total = len(props_filtradas)
    inicio = (page - 1) * per_page
    fin = inicio + per_page
    props_page = props_filtradas[inicio:fin]

    # Estadísticas básicas
    precios = [p.price for p in props_filtradas if p.price]
    tamanos = [p.size for p in props_filtradas if p.size]
    scores = [p.score_intrinseco for p in props_filtradas if p.score_intrinseco]

    stats = {
        "price": {
            "min": min(precios) if precios else 0,
            "max": max(precios) if precios else 0,
        },
        "size": {
            "min": min(tamanos) if tamanos else 0,
            "max": max(tamanos) if tamanos else 0,
        },
        "score": {
            "min": min(scores) if scores else 0,
            "max": max(scores) if scores else 100,
        },
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
            # quitamos cadenas vacías
            barrios_limpios = sorted([b for b in barrios if b])
            result[city][d] = barrios_limpios

    return result


# 🌐 Buscar todo (sin filtros de zona)
@app.get("/buscar-todo")
def buscar_todo(
    operation: Optional[str] = Query(None),
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
    """Devuelve estadísticas agrupadas por distrito (price, size, score)."""
    props = db.query(Propiedad).all()
    agrupado = defaultdict(list)

    for p in props:
        zona = (p.district or "Desconocido").strip()
        agrupado[zona].append(p)

    resultados = []
    for zona, lista in agrupado.items():
        precios = [p.price for p in lista if p.price]
        tamanos = [p.size for p in lista if p.size]
        scores = [p.score_intrinseco for p in lista if p.score_intrinseco]

        resultados.append(
            {
                "zona": zona,
                "num_propiedades": len(lista),
                "precio_medio": mean(precios) if precios else 0,
                "tamano_medio": mean(tamanos) if tamanos else 0,
                "score_medio": mean(scores) if scores else 0,
                "precio_min": min(precios) if precios else 0,
                "precio_max": max(precios) if precios else 0,
            }
        )

    return resultados


# 🚀 Cargar datos desde Idealista
@app.post("/seed-idealista")
def cargar_datos_idealista(
    zona: str = Query(..., description="Nombre de la zona, ej: 'Vallecas' o 'Alcorcón'"),
    operation: str = Query("rent", description="Tipo de operación: rent o sale"),
):
    """Carga o actualiza datos desde la API de Idealista."""
    gen = get_db()
    db = next(gen)
    try:
        api = IdealistaAPI()
        # --- Coordenadas predefinidas para zonas comunes ---
        centros = {
            "madrid": ("40.4168,-3.7038", 10000),
            "alcorcon": ("40.3459,-3.8249", 5000),
            "vallecas": ("40.3895,-3.6570", 4000),
            "retiro": ("40.4113,-3.6833", 3000),
            "arganzuela": ("40.3982,-3.6956", 3000),
            "moratalaz": ("40.4075,-3.6520", 3000),
            "usera": ("40.3855,-3.7050", 3000),
            "bellasvistas": ("40.4489,-3.7088", 3000),
        }

        center, distance_m = centros.get(zona.lower(), ("40.4168,-3.7038", 8000))

        # Idealista usa km
        datos = api.search_by_area(
            center=center,
            distance=distance_m / 1000.0,
            operation=operation,
        )

        if not isinstance(datos, dict) or "elementList" not in datos:
            raise HTTPException(status_code=502, detail="Error en la API de Idealista")

        nuevas, actualizadas = 0, 0
        for e in datos.get("elementList", []):
            lat = e.get("latitude")
            lon = e.get("longitude")
            if lat is None or lon is None:
                continue

            # --- Corrección del municipio ---
            city_val = e.get("municipality") or ""
            district_val = e.get("district") or ""
            neigh_val = e.get("neighborhood") or ""

            # Si Idealista marca "Madrid" pero los campos secundarios indican otra localidad, usamos esos
            if city_val.lower() == "madrid":
                txt = f"{district_val} {neigh_val}".lower()
                if "mostol" in txt:
                    city_val = "mostoles"
                elif "alcorcon" in txt:
                    city_val = "alcorcon"
                elif "fuenlabrad" in txt:
                    city_val = "fuenlabrada"
                elif "getafe" in txt:
                    city_val = "getafe"
                elif "leganes" in txt:
                    city_val = "leganes"
                elif "pozuelo" in txt:
                    city_val = "pozuelo de alarcon"
                elif "roz" in txt:
                    city_val = "las rozas de madrid"
                elif "alcobend" in txt:
                    city_val = "alcobendas"
                elif "parla" in txt:
                    city_val = "parla"
                elif "coslada" in txt:
                    city_val = "coslada"
                elif "torrejon" in txt:
                    city_val = "torrejon de ardoz"
                elif "san sebastian" in txt:
                    city_val = "san sebastian de los reyes"
                elif "alcala" in txt:
                    city_val = "alcala de henares"
                elif "rivas" in txt:
                    city_val = "rivas vaciamadrid"
                elif "majadahonda" in txt:
                    city_val = "majadahonda"
                elif "boadilla" in txt:
                    city_val = "boadilla del monte"
                elif "arroyomolinos" in txt:
                    city_val = "arroyomolinos"
                elif "villaviciosa" in txt:
                    city_val = "villaviciosa de odon"

            payload = {
                "propertyCode": str(e.get("propertyCode", "")),
                "price": e.get("price", 0),
                "size": e.get("size", 0),
                "rooms": e.get("rooms", 0),
                "bathrooms": e.get("bathrooms", 0),
                "floor": e.get("floor", ""),
                "address": e.get("address", ""),
                "district": district_val,
                "neighborhood": neigh_val,
                "city": city_val,
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
        total_guardadas = nuevas + actualizadas

        return {
            "zona": zona,
            "operation": operation,
            "total_guardadas": total_guardadas,
            "nuevas": nuevas,
            "actualizadas": actualizadas,
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error cargando datos: {str(e)}")
    finally:
        try:
            next(gen)
        except StopIteration:
            pass

# --------------------------------------------------------------
#                      FAVORITOS POR USUARIO
# --------------------------------------------------------------

@app.get("/favoritos", response_model=List[FavoriteOut])
def listar_favoritos(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(db_from_request),
):
    """
    Devuelve la lista de favoritos del usuario autenticado,
    incluyendo los datos de la propiedad.
    """
    favoritos = (
        db.query(Favorite, Propiedad)
        .join(Propiedad, Favorite.property_code == Propiedad.propertyCode)
        .filter(Favorite.user_id == current_user.id)
        .order_by(Favorite.created_at.desc())
        .all()
    )

    resultado: List[FavoriteOut] = []
    for fav, prop in favoritos:
        resultado.append(
            FavoriteOut(
                id=fav.id,
                property_code=fav.property_code,
                created_at=fav.created_at,
                propiedad=prop.as_dict() if prop else {},
            )
        )

    return resultado

@app.post("/favoritos", response_model=FavoriteOut, status_code=201)
def crear_favorito(
    body: FavoriteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(db_from_request),
):
    """
    Crea un favorito para el usuario autenticado a partir de un property_code.
    """
    prop = db.query(Propiedad).filter(Propiedad.propertyCode == body.property_code).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Propiedad no encontrada")

    # Evitar duplicados (opcional pero recomendable)
    existente = (
        db.query(Favorite)
        .filter(
            Favorite.user_id == current_user.id,
            Favorite.property_code == body.property_code,
        )
        .first()
    )
    if existente:
        # Ya existía, simplemente lo devolvemos
        return FavoriteOut(
            id=existente.id,
            property_code=existente.property_code,
            created_at=existente.created_at,
            propiedad=prop.as_dict(),
        )

    fav = Favorite(
        user_id=current_user.id,
        property_code=body.property_code,
    )
    db.add(fav)
    db.commit()
    db.refresh(fav)

    return FavoriteOut(
        id=fav.id,
        property_code=fav.property_code,
        created_at=fav.created_at,
        propiedad=prop.as_dict(),
    )

@app.delete("/favoritos/{favorite_id}", status_code=204)
def eliminar_favorito(
    favorite_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(db_from_request),
):
    """
    Elimina un favorito del usuario autenticado.
    """
    fav = (
        db.query(Favorite)
        .filter(
            Favorite.id == favorite_id,
            Favorite.user_id == current_user.id,
        )
        .first()
    )

    if not fav:
        raise HTTPException(status_code=404, detail="Favorito no encontrado")

    db.delete(fav)
    db.commit()
    return

# --------------------------------------------------------------
#                  HISTORIAL DE BÚSQUEDAS POR USUARIO
# --------------------------------------------------------------

@app.get("/historial", response_model=List[SearchHistoryOut])
def listar_historial(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(db_from_request),
):
    """
    Devuelve el historial de búsqueda del usuario autenticado.
    """
    registros = (
        db.query(SearchHistory)
        .filter(SearchHistory.user_id == current_user.id)
        .order_by(SearchHistory.created_at.desc())
        .all()
    )

    resultado: List[SearchHistoryOut] = []
    for r in registros:
        try:
            q = json.loads(r.query) if r.query else {}
        except json.JSONDecodeError:
            q = {}
        resultado.append(
            SearchHistoryOut(
                id=r.id,
                created_at=r.created_at,
                query=q,
            )
        )
    return resultado

@app.post("/historial", response_model=SearchHistoryOut, status_code=201)
def crear_historial(
    body: SearchHistoryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(db_from_request),
):
    """
    Crea una nueva entrada de historial para el usuario autenticado.
    'query' puede ser cualquier dict con los filtros usados en la búsqueda.
    """
    r = SearchHistory(
        user_id=current_user.id,
        query=json.dumps(body.query),
    )
    db.add(r)
    db.commit()
    db.refresh(r)

    return SearchHistoryOut(
        id=r.id,
        created_at=r.created_at,
        query=body.query,
    )

@app.delete("/historial/{hist_id}", status_code=204)
def eliminar_historial(
    hist_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(db_from_request),
):
    """
    Elimina una entrada del historial del usuario autenticado.
    """
    r = (
        db.query(SearchHistory)
        .filter(
            SearchHistory.id == hist_id,
            SearchHistory.user_id == current_user.id,
        )
        .first()
    )

    if not r:
        raise HTTPException(status_code=404, detail="Entrada de historial no encontrada")

    db.delete(r)
    db.commit()
    return


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=True)
