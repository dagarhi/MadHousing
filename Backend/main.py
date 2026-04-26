from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, text
from sqlalchemy.orm import Session
from database import get_db, init_db, SessionLocal
from models import Propiedad, User, Favorite, SearchHistory
from datetime import datetime, timedelta, timezone
from collections import defaultdict
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from pydantic import BaseModel, Field
from typing import Optional, List
from jose import jwt, JWTError
from passlib.context import CryptContext
import os
import json
from dotenv import load_dotenv

load_dotenv()

# --- Auth Configuration ---
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY environment variable is not set")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
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
    role: str

class RegisterRequest(BaseModel):
    # Validación server-side de longitud — el frontend ya valida pero un
    # cliente malicioso puede saltársela y registrar con password vacío.
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=128)

class UpdateUserRequest(BaseModel):
    role: Optional[str] = None

class FavoriteCreate(BaseModel):
    property_code: str

class FavoriteOut(BaseModel):
    id: int
    property_code: str
    created_at: datetime
    nota: str = ""
    propiedad: dict

class FavoriteUpdate(BaseModel):
    nota: str

class SearchHistoryCreate(BaseModel):
    query: dict

class SearchHistoryOut(BaseModel):
    id: int
    created_at: datetime
    query: dict

security = HTTPBearer(auto_error=False)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Reemplaza al deprecated @app.on_event('startup')."""
    init_db()
    seed_admin()
    print("✅ Base de datos inicializada correctamente")
    yield
    # No hay teardown explícito — Cloud Run gestiona el cierre.


app = FastAPI(title="Buscador de Pisos API", version="5.0.0", lifespan=lifespan)

# --- CORS Configuration ---
# Origins explícitos: localhost dev + URL de prod del frontend.
# Regex añadida para deploy previews de Netlify (deploy-preview-N--site.netlify.app
# y branch-deploys como nombre-rama--site.netlify.app).
_explicit_origins = [
    "http://localhost:4200",
    "http://127.0.0.1:4200",
    *([os.getenv("FRONTEND_URL")] if os.getenv("FRONTEND_URL") else []),
]
_netlify_preview_regex = r"https://[a-z0-9-]+--madhousing\.netlify\.app"

app.add_middleware(
    CORSMiddleware,
    allow_origins=_explicit_origins,
    allow_origin_regex=_netlify_preview_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Helper Functions ---

def db_from_request():
    yield from get_db()

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(db_from_request),
):
    """validates JWT and returns current user"""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Token de autenticación no enviado")

    token = credentials.credentials

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("user_id")
        username: str = payload.get("sub")
        if user_id is None or username is None:
            raise HTTPException(status_code=401, detail="Token inválido (sin user_id o sub)")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")

    return user

def seed_admin():
    """Creates the admin user from environment variables if it doesn't exist."""
    admin_username = os.getenv("ADMIN_USERNAME")
    admin_password = os.getenv("ADMIN_PASSWORD")

    if not admin_username or not admin_password:
        print("⚠️  ADMIN_USERNAME o ADMIN_PASSWORD no configurados — cuenta admin no creada")
        return

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == admin_username).first()
        if not existing:
            db.add(User(
                username=admin_username,
                password_hash=get_password_hash(admin_password),
                role="ADMIN",
            ))
            db.commit()
            print(f"✅ Usuario admin '{admin_username}' creado")
        else:
            print(f"✅ Usuario admin '{admin_username}' ya existe")
    finally:
        db.close()

# --- Authentication ---

@app.post("/auth/login", response_model=TokenResponse)
def login(
    credentials: LoginRequest,
    db: Session = Depends(db_from_request),
):
    user = db.query(User).filter(User.username == credentials.username.strip()).first()
    if not user:
        # 401 Unauthorized — credencial inválida; 400 sería para payload mal formado.
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")

    if not verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")

    access_token = create_access_token(
        data={"sub": user.username, "user_id": user.id, "role": user.role}
    )

    return TokenResponse(
        access_token=access_token,
        user_id=user.id,
        username=user.username,
        role=user.role,
    )

@app.get("/auth/me", response_model=TokenResponse)
def me(current_user: User = Depends(get_current_user)):
    return TokenResponse(
        access_token="",
        user_id=current_user.id,
        username=current_user.username,
        role=current_user.role,
    )

def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Acceso restringido a administradores")
    return current_user

@app.post("/auth/register", status_code=201)
def register(body: RegisterRequest, db: Session = Depends(db_from_request)):
    if db.query(User).filter(User.username == body.username.strip()).first():
        raise HTTPException(status_code=400, detail="El nombre de usuario ya está en uso")
    user = User(
        username=body.username.strip(),
        password_hash=get_password_hash(body.password),
        role="USER",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"user_id": user.id, "username": user.username, "role": user.role}

# --- Admin Endpoints ---

@app.get("/admin/users")
def listar_usuarios(
    current_user: User = Depends(require_admin),
    db: Session = Depends(db_from_request),
):
    users = db.query(User).order_by(User.created_at).all()
    return [
        {"id": u.id, "username": u.username, "role": u.role, "created_at": u.created_at}
        for u in users
    ]

@app.patch("/admin/users/{user_id}")
def actualizar_usuario(
    user_id: int,
    body: UpdateUserRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(db_from_request),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes modificar tu propio rol")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if body.role is not None:
        if body.role not in ("USER", "ADMIN"):
            raise HTTPException(status_code=400, detail="Rol inválido. Valores permitidos: USER, ADMIN")
        user.role = body.role
    db.commit()
    return {"id": user.id, "username": user.username, "role": user.role}

@app.delete("/admin/users/{user_id}", status_code=204)
def eliminar_usuario(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(db_from_request),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propia cuenta")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    db.delete(user)
    db.commit()
    return

# --- Property Endpoints ---

@app.get("/")
def read_root():
    return {"message": "🏠 API Buscador de Pisos dinámica", "status": "active"}

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
    min_score: Optional[float] = Query(None, ge=0, le=100, description="Umbral mínimo de score_intrinseco"),
    max_score: Optional[float] = Query(None, ge=0, le=100, description="Umbral máximo de score_intrinseco"),
    rooms: Optional[int] = Query(None),
    floor: Optional[int] = Query(None, ge=0, description="Planta mínima (numérica). Pisos sin planta numérica no aparecen al usar este filtro."),
    hasLift: Optional[bool] = Query(None),
    context_min: Optional[float] = Query(None, ge=0, le=100, description="Umbral mínimo de score_contexto"),
    final_min: Optional[float] = Query(None, ge=0, le=100, description="Umbral mínimo de score_final"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, le=100),
    db: Session = Depends(db_from_request),
):
    """Search properties with filters and pagination."""
    municipio = municipio.strip().lower()
    distrito = distrito.strip().lower() if distrito else None
    barrio = barrio.strip().lower() if barrio else None

    query = db.query(Propiedad).filter(Propiedad.operation == operation)
    query = query.filter(Propiedad.city.ilike(f"%{municipio}%"))

    if distrito:
        query = query.filter(Propiedad.district.ilike(f"%{distrito}%"))
    if barrio:
        query = query.filter(Propiedad.neighborhood.ilike(f"%{barrio}%"))

    if min_price is not None:
        query = query.filter(Propiedad.price >= min_price)
    if max_price is not None:
        query = query.filter(Propiedad.price <= max_price)
    if min_size is not None:
        query = query.filter(Propiedad.size >= min_size)
    if max_size is not None:
        query = query.filter(Propiedad.size <= max_size)
    if min_score is not None:
        query = query.filter(Propiedad.score_intrinseco >= min_score)
    if max_score is not None:
        query = query.filter(Propiedad.score_intrinseco <= max_score)
    if rooms is not None:
        query = query.filter(Propiedad.rooms >= rooms)
    if floor is not None:
        query = query.filter(Propiedad.floor_num >= floor)
    if hasLift is not None:
        query = query.filter(Propiedad.hasLift == hasLift)
    if context_min is not None:
        query = query.filter(Propiedad.score_contexto >= context_min)
    if final_min is not None:
        query = query.filter(Propiedad.score_final >= final_min)

    # Count + aggregated stats in a single DB query
    agg = query.with_entities(
        func.count(Propiedad.propertyCode),
        func.min(Propiedad.price),
        func.max(Propiedad.price),
        func.min(Propiedad.size),
        func.max(Propiedad.size),
        func.min(Propiedad.score_intrinseco),
        func.max(Propiedad.score_intrinseco),
        func.min(Propiedad.score_contexto),
        func.max(Propiedad.score_contexto),
        func.min(Propiedad.score_final),
        func.max(Propiedad.score_final),
    ).one()

    total = agg[0]
    stats = {
        "price":    {"min": agg[1] or 0, "max": agg[2]  or 0},
        "size":     {"min": agg[3] or 0, "max": agg[4]  or 0},
        "score":    {"min": agg[5] or 0, "max": agg[6]  or 100},  # score_intrinseco (legacy name)
        "contexto": {"min": agg[7] or 0, "max": agg[8]  or 100},
        "final":    {"min": agg[9] or 0, "max": agg[10] or 100},
    }

    props_page = query.offset((page - 1) * per_page).limit(per_page).all()

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

@app.get("/zonas-jerarquicas")
def obtener_zonas_jerarquicas(
    operation: Optional[str] = Query(None),
    municipio: Optional[str] = Query(None),
    db: Session = Depends(db_from_request),
):
    jerarquia = defaultdict(lambda: defaultdict(set))

    query = db.query(
        Propiedad.city,
        Propiedad.district,
        Propiedad.neighborhood,
    ).distinct()

    if operation:
        query = query.filter(Propiedad.operation == operation)
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

    result = {}
    for city, distritos in jerarquia.items():
        result[city] = {}
        for d, barrios in distritos.items():
            barrios_limpios = sorted([b for b in barrios if b])
            result[city][d] = barrios_limpios

    return result

@app.get("/buscar-todo")
def buscar_todo(
    operation: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(2000, le=5000),
    db: Session = Depends(db_from_request),
    current_user: User = Depends(get_current_user),
):
    """Devuelve todas las propiedades, opcionalmente filtradas por tipo de operación.

    Requiere autenticación: el endpoint puede devolver hasta 5000 filas y se
    expone fácilmente a abuso si fuera público (sin rate limit el atacante
    puede saturar Cloud Run o exfiltrar el dataset entero).
    """
    del current_user  # solo se usa para forzar auth via Depends
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

@app.get("/estadisticas-globales")
def estadisticas_por_zona(db: Session = Depends(db_from_request)):
    rows = (
        db.query(
            Propiedad.district,
            Propiedad.operation,
            func.count(Propiedad.propertyCode).label("count"),
            func.avg(Propiedad.price).label("precio_medio"),
            func.avg(Propiedad.size).label("tamano_medio"),
            func.avg(Propiedad.score_intrinseco).label("score_medio"),
            func.avg(Propiedad.score_contexto).label("contexto_medio"),
            func.avg(Propiedad.score_final).label("final_medio"),
            func.min(Propiedad.price).label("precio_min"),
            func.max(Propiedad.price).label("precio_max"),
        )
        .group_by(Propiedad.district, Propiedad.operation)
        .all()
    )

    resultado = {}
    for row in rows:
        zona = (row.district or "Desconocido").strip()
        op   = (row.operation or "desconocido").strip()
        resultado.setdefault(zona, {})
        resultado[zona][op] = {
            "count":          row.count,
            "precio_medio":   row.precio_medio   or 0,
            "tamano_medio":   row.tamano_medio   or 0,
            "score_medio":    row.score_medio    or 0,
            "contexto_medio": row.contexto_medio or 0,
            "final_medio":    row.final_medio    or 0,
            "precio_min":     row.precio_min     or 0,
            "precio_max":     row.precio_max     or 0,
        }

    return resultado

# --- POIs ---

POI_CATEGORIES = {"transport", "health", "education", "park", "commerce", "bike"}

@app.get("/pois")
def listar_pois(
    response: Response,
    category: str = Query(..., description="transport | health | education | park | commerce | bike"),
    bbox: Optional[str] = Query(None, description="lon_min,lat_min,lon_max,lat_max"),
    db: Session = Depends(db_from_request),
):
    """Return POIs of a category as GeoJSON FeatureCollection.
    Optionally filtered by viewport bbox. Cached 1 week client-side.
    """
    if category not in POI_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"category inválida. Valores: {sorted(POI_CATEGORIES)}")

    params = {"cat": category}
    bbox_sql = ""
    if bbox:
        try:
            lon_min, lat_min, lon_max, lat_max = [float(x) for x in bbox.split(",")]
        except ValueError:
            raise HTTPException(status_code=400, detail="bbox debe ser lon_min,lat_min,lon_max,lat_max")
        bbox_sql = "AND geom && ST_MakeEnvelope(:lon_min, :lat_min, :lon_max, :lat_max, 4326)"
        params.update({"lon_min": lon_min, "lat_min": lat_min, "lon_max": lon_max, "lat_max": lat_max})

    rows = db.execute(text(f"""
        SELECT id, subtype, name, ST_AsGeoJSON(geom) AS g, extra
          FROM pois
          WHERE category = :cat
          {bbox_sql}
    """), params).fetchall()

    features = []
    for r in rows:
        features.append({
            "type": "Feature",
            "id": r.id,
            "geometry": json.loads(r.g),
            "properties": {
                "subtype": r.subtype,
                "name":    r.name,
                **(r.extra or {}),
            },
        })

    response.headers["Cache-Control"] = "public, max-age=604800"  # 1 week
    return {"type": "FeatureCollection", "features": features}


@app.get("/pois/nearby")
def pois_cercanos(
    lat: float = Query(..., description="latitud del punto"),
    lng: float = Query(..., description="longitud del punto"),
    category: Optional[str] = Query(None, description="filtra por categoría (si se omite, devuelve todas)"),
    limit: int = Query(3, ge=1, le=20, description="POIs a devolver por categoría"),
    radius_m: float = Query(2000, ge=50, le=10000, description="radio de búsqueda en metros"),
    db: Session = Depends(db_from_request),
):
    """Return nearest POIs to a point, grouped by category.
    Used by the 'entorno' drawer in the frontend.
    """
    cats = [category] if category else sorted(POI_CATEGORIES)
    if category and category not in POI_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"category inválida. Valores: {sorted(POI_CATEGORIES)}")

    wkt = f"SRID=4326;POINT({lng} {lat})"
    resultado = {}
    for cat in cats:
        rows = db.execute(text("""
            SELECT id, subtype, name,
                   ST_AsGeoJSON(ST_Centroid(geom)) AS g,
                   ST_Distance(geom::geography, ST_GeogFromText(:wkt)) AS dist_m
              FROM pois
              WHERE category = :cat
                AND ST_DWithin(geom::geography, ST_GeogFromText(:wkt), :radius)
              ORDER BY dist_m ASC
              LIMIT :limit
        """), {"cat": cat, "wkt": wkt, "radius": radius_m, "limit": limit}).fetchall()

        resultado[cat] = [
            {
                "id":       r.id,
                "subtype":  r.subtype,
                "name":     r.name,
                "dist_m":   round(float(r.dist_m), 1),
                "geometry": json.loads(r.g),
            }
            for r in rows
        ]

    return resultado

# --- Favorites ---

@app.get("/favoritos", response_model=List[FavoriteOut])
def listar_favoritos(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(db_from_request),
):
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
                nota=fav.nota or "",
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
    prop = db.query(Propiedad).filter(Propiedad.propertyCode == body.property_code).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Propiedad no encontrada")

    existente = (
        db.query(Favorite)
        .filter(
            Favorite.user_id == current_user.id,
            Favorite.property_code == body.property_code,
        )
        .first()
    )
    if existente:
        return FavoriteOut(
            id=existente.id,
            property_code=existente.property_code,
            created_at=existente.created_at,
            nota=existente.nota or "",
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
        nota=fav.nota or "",
        propiedad=prop.as_dict(),
    )

@app.delete("/favoritos/{favorite_id}", status_code=204)
def eliminar_favorito(
    favorite_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(db_from_request),
):
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

@app.patch("/favoritos/{favorite_id}", response_model=FavoriteOut)
def actualizar_favorito(
    favorite_id: int,
    body: FavoriteUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(db_from_request),
):
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

    fav.nota = body.nota
    db.commit()
    db.refresh(fav)

    prop = db.query(Propiedad).filter(Propiedad.propertyCode == fav.property_code).first()
    return FavoriteOut(
        id=fav.id,
        property_code=fav.property_code,
        created_at=fav.created_at,
        nota=fav.nota or "",
        propiedad=prop.as_dict() if prop else {},
    )

# --- History ---

@app.get("/historial", response_model=List[SearchHistoryOut])
def listar_historial(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(db_from_request),
):
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
            print(f"[historial] ⚠️ JSON inválido en registro id={r.id}")
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
