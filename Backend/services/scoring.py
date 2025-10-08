def valoracion_intrinseca(piso):
    score = 0
    
    # Precio por m² (más barato = mejor)
    if piso.get('size', 0) > 0:
        precio_m2 = piso['price'] / piso['size']
        # Normalizar: asumimos que >2000€/m² es caro, <1000€/m² es barato
        if precio_m2 < 1000:
            score += 30
        elif precio_m2 < 1500:
            score += 20
        elif precio_m2 < 2000:
            score += 10
    
    # Características bonus
    if piso.get('hasLift'): score += 15
    if piso.get('garage'): score += 12
    if piso.get('terrace'): score += 10
    if piso.get('airConditioning'): score += 8
    if piso.get('exterior'): score += 10
    if piso.get('swimmingPool'): score += 5
    
    # Tamaño y habitaciones
    if piso.get('size', 0) > 80: score += 5
    if piso.get('rooms', 0) >= 2: score += 5
    if piso.get('bathrooms', 0) >= 2: score += 3
    
    return min(100, max(0, score))

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
    
    # Verificar por propertyCode
    existente = db.query(Propiedad).filter(Propiedad.propertyCode == piso_data['propertyCode']).first()
    if existente:
        return True
    
    # Verificar por huella digital
    huella = generar_huella_digital(piso_data)
    existente = db.query(Propiedad).filter(Propiedad.huella_digital == huella).first()
    if existente:
        return True
    
    return False