from datetime import datetime
import time

from database import SessionLocal, init_db
from models import Propiedad
from services.idealista_api import IdealistaAPI
from services.scoring import valoracion_intrinseca, generar_huella_digital



# Zonas y operaciones a actualizar (igual que tu script actual)
ZONAS = ["madrid", "alcorcon"]
OPERACIONES = ["rent", "sale"]

# Coordenadas predefinidas (copiado de main.py)
CENTROS = {
    "madrid": ("40.4168,-3.7038", 10000),
    "alcorcon": ("40.3459,-3.8249", 5000),
    "vallecas": ("40.3895,-3.6570", 4000),
    "retiro": ("40.4113,-3.6833", 3000),
    "arganzuela": ("40.3982,-3.6956", 3000),
    "moratalaz": ("40.4075,-3.6520", 3000),
    "usera": ("40.3855,-3.7050", 3000),
    "bellasvistas": ("40.4489,-3.7088", 3000),
}


def seed_zona(db, api: IdealistaAPI, zona: str, operation: str):
    """Replica la lógica de /seed-idealista pero sin FastAPI."""
    center, distance_m = CENTROS.get(zona.lower(), ("40.4168,-3.7038", 8000))
    print(f"   → centro={center} distancia={distance_m}m (zona={zona}, op={operation})")

    # Idealista usa km en el parámetro distance (como en tu main.py)
    datos = api.search_by_area(
        center=center,
        distance=distance_m,
        operation=operation,
    )

    if not isinstance(datos, dict) or "elementList" not in datos:
        raise RuntimeError(f"Respuesta inesperada de Idealista en {zona} ({operation}): {datos}")

    nuevas = 0
    actualizadas = 0

    for e in datos.get("elementList", []):
        lat = e.get("latitude")
        lon = e.get("longitude")
        if lat is None or lon is None:
            continue

        # --- Corrección del municipio (copiado de main.py) ---
        city_val = e.get("municipality") or ""
        district_val = e.get("district") or ""
        neigh_val = e.get("neighborhood") or ""

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

        # --- Mapeo Idealista → modelo Propiedad (igual que en main.py) ---
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
            "city": city_val,   # 👈 municipio normalizado
            "latitude": lat,
            "longitude": lon,
            "hasLift": e.get("hasLift", False),
            "exterior": e.get("exterior", False),
            "url": e.get("url", ""),
            "operation": operation,
        }

        if not payload["propertyCode"]:
            continue

        # Enriquecer con huella y score (como en main.py)
        payload["huella_digital"] = generar_huella_digital(payload)
        payload["score_intrinseco"] = valoracion_intrinseca(payload)
        payload["fecha_actualizacion"] = datetime.now()
        payload["fecha_obtencion"] = datetime.now()

        existe = (
            db.query(Propiedad)
            .filter(Propiedad.propertyCode == payload["propertyCode"])
            .first()
        )

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


def main():
    # Asegurar tablas
    init_db()

    api = IdealistaAPI()

    total_calls = len(ZONAS) * len(OPERACIONES)
    print(f"\n🚀 Iniciando actualización directa contra Idealista ({total_calls} llamadas)\n")

    for i, zona in enumerate(ZONAS, start=1):
        for op in OPERACIONES:
            print(f"[{i}/{len(ZONAS)}] ⏳ Actualizando {zona.upper()} ({op})...")
            db = SessionLocal()
            try:
                res = seed_zona(db, api, zona, op)
                print(
                    f"✅ {zona} ({op}): "
                    f"{res['total_guardadas']} guardadas | "
                    f"{res['nuevas']} nuevas | "
                    f"{res['actualizadas']} actualizadas"
                )
            except Exception as e:
                db.rollback()
                print(f"❌ Error en {zona} ({op}): {e}")
            finally:
                db.close()

            # Pausa para no ser agresivos con Idealista
            time.sleep(5)

    print("\n🎯 Actualización completada.\n")


if __name__ == "__main__":
    main()
