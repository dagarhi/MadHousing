def valoracion_intrinseca(piso):
    """
    Calcula un score (10–95) basado en la relación entre precio y tamaño,
    adaptado al tipo de operación ('rent' o 'sale') y con umbrales para la Comunidad de Madrid.
    """

    price = piso.get('price', 0)
    size = piso.get('size', 0)
    operation = piso.get('operation', 'rent').lower()

    if price <= 0:
        return 10.0  # valor mínimo por defecto

    # Rango común de salida (para evitar 0 o 100)
    SCORE_MIN, SCORE_MAX = 10, 95

    # --- Parámetros de mercado para Madrid ---
    UMBRALES = {
        "rent": {"min": 700, "max": 2000},       # precio total mensual
        "sale": {"min": 2500, "max": 7000},      # €/m²
    }

    # --- Selección de umbrales según tipo de operación ---
    u = UMBRALES.get(operation, UMBRALES["rent"])

    # --- Calcular score ---
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
        # Interpolación inversa dentro del rango
        ratio = (u["max"] - precio_base) / (u["max"] - u["min"])
        score = SCORE_MIN + (SCORE_MAX - SCORE_MIN) * ratio

    return round(score, 2)


def generar_huella_digital(piso):
    import hashlib
    elementos = [
        piso.get('address', '').lower().strip(),
        str(int(piso.get('price', 0))),
        str(int(piso.get('size', 0))),
        str(piso.get('rooms', 0)),
        piso.get('floor', '').lower().strip()[:10]
    ]
    return hashlib.md5('|'.join(elementos).encode()).hexdigest()


def es_duplicado(db, piso_data):
    from models import Propiedad

    existente = db.query(Propiedad).filter(Propiedad.propertyCode == piso_data['propertyCode']).first()
    if existente:
        return True

    huella = generar_huella_digital(piso_data)
    existente = db.query(Propiedad).filter(Propiedad.huella_digital == huella).first()
    if existente:
        return True

    return False
