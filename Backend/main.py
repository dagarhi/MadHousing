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
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

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

security = HTTPBearer(auto_error=False)
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
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(db_from_request),
):
    """
    Extrae el token Bearer del header Authorization usando HTTPBearer,
    valida el JWT y devuelve el usuario autenticado.
    """
    # 1) ¿Ha llegado algo en el header Authorization?
    if credentials is None:
        raise HTTPException(status_code=401, detail="Token de autenticación no enviado")

    # HTTPBearer ya comprueba que el esquema sea "Bearer"
    token = credentials.credentials

    # 2) Decodificar JWT
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("user_id")
        username: str = payload.get("sub")
        if user_id is None or username is None:
            raise HTTPException(status_code=401, detail="Token inválido (sin user_id o sub)")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido")

    # 3) Buscar usuario en BD
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
    municipio: str = Query(..., description="Municipio (obligatorio)"),
    distrito: Optional[str] = Query(None, description="Distrito (opcional)"),
    barrio: Optional[str] = Query(None, description="Barrio (opcional)"),
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
    Busca propiedades filtrando por municipio, distrito y barrio usando
    los campos city, district y neighborhood de la tabla Propiedad.

    - municipio: filtra por city (obligatorio).
    - distrito: refina por district (opcional).
    - barrio: refina por neighborhood (opcional).

    Además aplica filtros numéricos (precio, tamaño, habitaciones, ascensor) y paginación.
    """
    # Normalizar a minúsculas / quitar espacios
    municipio = municipio.strip().lower()
    distrito = distrito.strip().lower() if distrito else None
    barrio = barrio.strip().lower() if barrio else None

    query = db.query(Propiedad).filter(Propiedad.operation == operation)

    # 1) Filtro base: municipio (city)
    query = query.filter(Propiedad.city.ilike(f"%{municipio}%"))

    # 2) Refinar por distrito si viene
    if distrito:
        query = query.filter(Propiedad.district.ilike(f"%{distrito}%"))

    # 3) Refinar por barrio si viene
    if barrio:
        query = query.filter(Propiedad.neighborhood.ilike(f"%{barrio}%"))

    # Filtros numéricos
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
    precios = [p.price for p in props_filtradas if p.price is not None]
    tamanos = [p.size for p in props_filtradas if p.size is not None]
    scores = [p.score_intrinseco for p in props_filtradas if p.score_intrinseco is not None]

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
        "municipio": municipio,
        "distrito": distrito,
        "barrio": barrio,
        "operation": operation,
        "total": total,
        "pagina": page,
        "por_pagina": per_page,
        "propiedades": [p.as_dict() for p in props_page],
        "stats": stats,
    }


# 🌍 Zonas jerárquicas automáticas (para el buscador)
@app.get("/zonas-jerarquicas")
def obtener_zonas_jerarquicas(
    operation: Optional[str] = Query(
        None,
        description="Filtrar zonas que tienen al menos una propiedad de este tipo de operación (rent/sale)"
    ),
    municipio: Optional[str] = Query(
        None,
        description="Filtrar por municipio (city) si se desea"
    ),
    db: Session = Depends(db_from_request),
):
    jerarquia = defaultdict(lambda: defaultdict(set))

    query = db.query(
        Propiedad.city,
        Propiedad.district,
        Propiedad.neighborhood,
    ).distinct()

    # 🔹 Filtrado por operación (rent / sale)
    if operation:
        query = query.filter(Propiedad.operation == operation)

    # 🔹 Filtrado por municipio si lo quieres limitar (ej. "madrid")
    if municipio:
        muni_norm = municipio.strip().lower()
        query = query.filter(Propiedad.city.ilike(f"%{muni_norm}%"))

    props = query.all()

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
    props = db.query(Propiedad).all()

    # zona -> op -> [propiedades]
    agrupado = defaultdict(lambda: defaultdict(list))

    for p in props:
        zona = (p.district or "Desconocido").strip()
        op = (p.operation or "desconocido").strip()
        agrupado[zona][op].append(p)

    resultado = {}

    for zona, por_op in agrupado.items():
        resultado[zona] = {}
        for op, lista in por_op.items():
            precios = [p.price for p in lista if p.price is not None]
            tamanos = [p.size for p in lista if p.size is not None]
            scores = [p.score_intrinseco for p in lista if p.score_intrinseco is not None]

            resultado[zona][op] = {
                "count": len(lista),
                "precio_medio": mean(precios) if precios else 0,
                "tamano_medio": mean(tamanos) if tamanos else 0,
                "score_medio": mean(scores) if scores else 0,
                "precio_min": min(precios) if precios else 0,
                "precio_max": max(precios) if precios else 0,
            }

    return resultado

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
