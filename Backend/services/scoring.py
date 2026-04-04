import hashlib
from models import Propiedad

# --- Constants ---
SCORE_MIN, SCORE_MAX = 10, 95
UMBRALES = {
    "rent": {"min": 700, "max": 2000},       # Total monthly price
    "sale": {"min": 2500, "max": 7000},      # Price per m²
}

def valoracion_intrinseca(piso):
    """
    Calculates a score (10–95) based on price/size ratio, adapted for Madrid.
    """
    price = piso.get('price', 0)
    size = piso.get('size', 0)
    operation = piso.get('operation', 'rent').lower()

    if price <= 0:
        return 10.0

    u = UMBRALES.get(operation, UMBRALES["rent"])

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
