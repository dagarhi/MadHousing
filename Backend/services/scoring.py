import hashlib
from sqlalchemy import text
from models import Propiedad

# --- Constants ---
SCORE_MIN, SCORE_MAX = 10, 95
UMBRALES = {
    "rent": {"min": 700, "max": 2000},       # Total monthly price
    "sale": {"min": 2500, "max": 7000},      # Price per m²
}

# Pesos del score_contexto (suman 100). Orden según prioridad del usuario:
# transporte > sanidad > educación > parques > comercio > bici.
CONTEXT_WEIGHTS = {
    "transport":  30,
    "health":     20,
    "education":  15,
    "park":       15,
    "commerce":   10,
    "bike":       10,
}

# Mezcla del score_final (suman 1.0). El contexto pesa más porque captura
# varias dimensiones de ubicación; el intrínseco es solo una (precio/tamaño).
W_INTRINSECO = 0.4
W_CONTEXTO   = 0.6

def valoracion_intrinseca(piso):
    """
    Calculates a score (10–95) based on price/size ratio, adapted for Madrid.
    Returns SCORE_MIN for unknown operations to avoid mixing magnitudes
    (rent thresholds applied to a sale price/m², for example).
    """
    price = piso.get('price', 0)
    size = piso.get('size', 0)
    operation = piso.get('operation', 'rent').lower()

    if operation not in ("rent", "sale"):
        return SCORE_MIN

    if price <= 0:
        return 10.0

    u = UMBRALES[operation]

    if operation == "rent":
        precio_base = price
    else:
        if size <= 0:
            return SCORE_MIN
        precio_base = price / size

    if precio_base <= u["min"]:
        score = SCORE_MAX
    elif precio_base >= u["max"]:
        score = SCORE_MIN
    else:
        # Inverse interpolation
        ratio = (u["max"] - precio_base) / (u["max"] - u["min"])
        score = SCORE_MIN + (SCORE_MAX - SCORE_MIN) * ratio

    return round(score, 2)


def generar_huella_digital(piso):
    """Generates a unique hash for the property based on key attributes."""
    elementos = [
        piso.get('address', '').lower().strip(),
        str(int(piso.get('price', 0))),
        str(int(piso.get('size', 0))),
        str(piso.get('rooms', 0)),
        piso.get('floor', '').lower().strip()[:10]
    ]
    return hashlib.md5('|'.join(elementos).encode()).hexdigest()


def es_duplicado(db, piso_data):
    """Checks if a property already exists in the DB by code or digital footprint."""
    existente = db.query(Propiedad).filter(Propiedad.propertyCode == piso_data['propertyCode']).first()
    if existente:
        return True

    huella = generar_huella_digital(piso_data)
    existente = db.query(Propiedad).filter(Propiedad.huella_digital == huella).first()
    if existente:
        return True

    return False


# ── Context scoring ─────────────────────────────────────────────────────────
#
# subscore_by_distance: curva lineal a tramos (0-300m=100, decae a 0 en 2km).
# compute_distances_for_point: 1 query agregada a PostGIS por piso (GIST index).
# compute_score_contexto: combina las 6 distancias con los pesos de arriba.
# compute_score_final: mezcla score_intrinseco + score_contexto.

def subscore_by_distance(meters):
    """Map a distance in meters to a 0-100 subscore. Closer is better."""
    if meters is None or meters < 0:
        return 0.0
    if meters <= 300:
        return 100.0
    if meters <= 600:
        return 100.0 - (meters - 300) / 300 * 30      # 100 → 70
    if meters <= 1000:
        return 70.0 - (meters - 600) / 400 * 30       # 70 → 40
    if meters <= 2000:
        return 40.0 - (meters - 1000) / 1000 * 40     # 40 → 0
    return 0.0


def compute_distances_for_point(db, lat, lng):
    """Query PostGIS for the distance (m) to the nearest POI of each category.
    Returns a dict {dist_transport_m, dist_health_m, …} — None if no POIs found.
    Uses geography cast so distances are real meters on the ellipsoid.
    """
    keys = [f"dist_{c}_m" for c in CONTEXT_WEIGHTS]
    if lat is None or lng is None:
        return {k: None for k in keys}

    rows = db.execute(text("""
        SELECT category,
               MIN(ST_Distance(geom::geography, ST_GeogFromText(:wkt))) AS dist_m
          FROM pois
          GROUP BY category
    """), {"wkt": f"SRID=4326;POINT({lng} {lat})"}).fetchall()

    out = {k: None for k in keys}
    for category, dist in rows:
        if category in CONTEXT_WEIGHTS and dist is not None:
            out[f"dist_{category}_m"] = float(dist)
    return out


def compute_score_contexto(distances):
    """Weighted average of per-category distance subscores. Returns 0-100."""
    total = 0.0
    for cat, weight in CONTEXT_WEIGHTS.items():
        meters = distances.get(f"dist_{cat}_m")
        total += subscore_by_distance(meters) * weight / 100.0
    return round(total, 2)


def compute_score_final(score_intrinseco, score_contexto):
    """Weighted mix of intrinsic (price/size) and contextual (location) scores."""
    i = score_intrinseco if score_intrinseco is not None else 0.0
    c = score_contexto   if score_contexto   is not None else 0.0
    return round(W_INTRINSECO * i + W_CONTEXTO * c, 2)
