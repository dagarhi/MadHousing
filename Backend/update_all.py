import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from geoalchemy2.elements import WKTElement
from database import SessionLocal, init_db
from models import Propiedad, ScraperState
from services.idealista_api import IdealistaAPI
from services.scoring import (
    valoracion_intrinseca, generar_huella_digital,
    compute_distances_for_point, compute_score_contexto, compute_score_final,
)

ZONAS = [
    # ── High-interest zones (2 ops, wide radius) ──────────────────────────────
    # ── High-interest zones: 7 pages × 2 ops = 14 calls each ────────────────────
    {
        "name":       "madrid",
        "active":     True,
        "center":     "40.4168,-3.7038",
        "distance_m": 10000,
        "pages":      7,           # 7 pages × 2 ops = 14 calls
        "operations": ["rent", "sale"],
    },
    {
        "name":       "alcorcon",
        "active":     True,
        "center":     "40.3459,-3.8249",
        "distance_m": 5000,
        "pages":      7,           # 7 pages × 2 ops = 14 calls
        "operations": ["rent", "sale"],
    },
    # ── Madrid districts: 6 pages × 2 ops = 12 calls each (6 × 12 = 72) ────────
    {
        "name":       "vallecas",
        "active":     True,
        "center":     "40.3895,-3.6570",
        "distance_m": 4000,
        "pages":      6,           # 6 pages × 2 ops = 12 calls
        "operations": ["rent", "sale"],
    },
    {
        "name":       "retiro",
        "active":     True,
        "center":     "40.4113,-3.6833",
        "distance_m": 3000,
        "pages":      6,
        "operations": ["rent", "sale"],
    },
    {
        "name":       "arganzuela",
        "active":     True,
        "center":     "40.3982,-3.6956",
        "distance_m": 3000,
        "pages":      6,
        "operations": ["rent", "sale"],
    },
    {
        "name":       "moratalaz",
        "active":     True,
        "center":     "40.4075,-3.6520",
        "distance_m": 3000,
        "pages":      6,
        "operations": ["rent", "sale"],
    },
    {
        "name":       "usera",
        "active":     True,
        "center":     "40.3855,-3.7050",
        "distance_m": 3000,
        "pages":      6,
        "operations": ["rent", "sale"],
    },
    {
        "name":       "bellasvistas",
        "active":     True,
        "center":     "40.4489,-3.7088",
        "distance_m": 3000,
        "pages":      6,
        "operations": ["rent", "sale"],
    },
]

MONTHLY_BUDGET     = 100
MAX_ITEMS_PER_PAGE = 50

CITY_CORRECTIONS = {
    "mostol":        "mostoles",
    "alcorcon":      "alcorcon",
    "fuenlabrad":    "fuenlabrada",
    "getafe":        "getafe",
    "leganes":       "leganes",
    "pozuelo":       "pozuelo de alarcon",
    "roz":           "las rozas de madrid",
    "alcobend":      "alcobendas",
    "parla":         "parla",
    "coslada":       "coslada",
    "torrejon":      "torrejon de ardoz",
    "san sebastian": "san sebastian de los reyes",
    "alcala":        "alcala de henares",
    "rivas":         "rivas vaciamadrid",
    "majadahonda":   "majadahonda",
    "boadilla":      "boadilla del monte",
    "arroyomolinos": "arroyomolinos",
    "villaviciosa":  "villaviciosa de odon",
}

# ── State persistence ─────────────────────────────────────────────────────────
#
# Scraper state lives in the `scraper_state` table (Supabase in prod, local
# Postgres in dev). Each row is keyed by a string id ('call_log', 'last_updated')
# and stores a JSON blob under `value`. Ephemeral filesystems (Cloud Run Jobs)
# can't use a JSON file because the disk resets between runs.

def load_state() -> dict:
    db = SessionLocal()
    try:
        rows = db.query(ScraperState).all()
        state = {row.id: row.value for row in rows}
    finally:
        db.close()
    state.setdefault("call_log", [])
    state.setdefault("last_updated", {})
    return state

def save_state(state: dict):
    db = SessionLocal()
    try:
        for key, value in state.items():
            db.merge(ScraperState(id=key, value=value))
        db.commit()
    finally:
        db.close()

def _parse_ts(ts: str) -> datetime:
    """Parse ISO timestamp, treating naive values as UTC (legacy state)."""
    dt = datetime.fromisoformat(ts)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt

WINDOW_DAYS = 30  # Idealista restores calls over a rolling 30-day window

def calls_in_window(state: dict) -> int:
    """Count API calls made within the last WINDOW_DAYS days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS)
    return sum(
        entry["n"]
        for entry in state.get("call_log", [])
        if _parse_ts(entry["ts"]) >= cutoff
    )

def record_calls(state: dict, n: int):
    """Append a call record and prune entries older than the window."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS)
    state.setdefault("call_log", [])
    state["call_log"].append({"ts": datetime.now(timezone.utc).isoformat(), "n": n})
    state["call_log"] = [e for e in state["call_log"] if _parse_ts(e["ts"]) >= cutoff]

def get_last_updated(state: dict, name: str, op: str):
    ts = state.get("last_updated", {}).get(f"{name}:{op}")
    return _parse_ts(ts) if ts else None

def set_last_updated(state: dict, name: str, op: str):
    state.setdefault("last_updated", {})
    state["last_updated"][f"{name}:{op}"] = datetime.now(timezone.utc).isoformat()

# ── Task scheduling ───────────────────────────────────────────────────────────

_EPOCH_MIN = datetime.min.replace(tzinfo=timezone.utc)

def build_tasks(state: dict) -> list:
    """Expand active zones into (zone_cfg, op) pairs, sorted stalest-first."""
    tasks = [
        (zone, op)
        for zone in ZONAS
        if zone["active"]
        for op in zone["operations"]
    ]
    return sorted(tasks, key=lambda t: get_last_updated(state, t[0]["name"], t[1]) or _EPOCH_MIN)

# ── DB helpers ────────────────────────────────────────────────────────────────

def normalise_city(city_val: str, district_val: str, neigh_val: str) -> str:
    if city_val.lower() != "madrid":
        return city_val
    txt = f"{district_val} {neigh_val}".lower()
    for key, corrected in CITY_CORRECTIONS.items():
        if key in txt:
            return corrected
    return city_val

def upsert_properties(db, elements: list, operation: str) -> dict:
    nuevas = actualizadas = 0
    for e in elements:
        lat = e.get("latitude")
        lon = e.get("longitude")
        if lat is None or lon is None:
            continue

        city_val     = e.get("municipality") or ""
        district_val = e.get("district") or ""
        neigh_val    = e.get("neighborhood") or ""

        payload = {
            "propertyCode": str(e.get("propertyCode", "")),
            "price":        e.get("price", 0),
            "size":         e.get("size", 0),
            "rooms":        e.get("rooms", 0),
            "bathrooms":    e.get("bathrooms", 0),
            "floor":        e.get("floor", ""),
            "address":      e.get("address", ""),
            "district":     district_val,
            "neighborhood": neigh_val,
            "city":         normalise_city(city_val, district_val, neigh_val),
            "latitude":     lat,
            "longitude":    lon,
            "hasLift":      e.get("hasLift", False),
            "exterior":     e.get("exterior", False),
            "url":          e.get("url", ""),
            "operation":    operation,
        }
        if not payload["propertyCode"]:
            continue

        huella = generar_huella_digital(payload)
        payload["huella_digital"]      = huella
        payload["score_intrinseco"]    = valoracion_intrinseca(payload)
        payload["fecha_actualizacion"] = datetime.now(timezone.utc)

        # Spatial: geom + distancias + score_contexto + score_final
        payload["geom"] = WKTElement(f"POINT({lon} {lat})", srid=4326)
        distancias = compute_distances_for_point(db, lat, lon)
        payload.update(distancias)
        payload["score_contexto"] = compute_score_contexto(distancias)
        payload["score_final"]    = compute_score_final(payload["score_intrinseco"], payload["score_contexto"])

        # Dedupe: another property (different code) with the same fingerprint
        # means Idealista is listing the same physical home via another agency.
        original = db.query(Propiedad).filter(
            Propiedad.huella_digital == huella,
            Propiedad.propertyCode != payload["propertyCode"],
        ).first()
        if original:
            payload["es_duplicado"]       = True
            payload["propiedad_original"] = original.propertyCode
        else:
            payload["es_duplicado"]       = False
            payload["propiedad_original"] = None

        existe = db.query(Propiedad).filter(
            Propiedad.propertyCode == payload["propertyCode"]
        ).first()

        if existe:
            for k, v in payload.items():
                setattr(existe, k, v)
            actualizadas += 1
        else:
            payload["fecha_obtencion"] = datetime.now(timezone.utc)
            db.add(Propiedad(**payload))
            nuevas += 1

    db.commit()
    return {"nuevas": nuevas, "actualizadas": actualizadas}

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    init_db()
    state = load_state()
    api   = IdealistaAPI()

    used      = calls_in_window(state)
    remaining = MONTHLY_BUDGET - used

    print(f"\n📊 Budget: {used}/{MONTHLY_BUDGET} llamadas usadas en los últimos 30 días ({remaining} restantes)")

    if remaining < 1:
        print("⛔ Sin llamadas disponibles. Vuelve cuando se restauren más.")
        return

    tasks_run = tasks_skipped = 0

    for zone, op in build_tasks(state):
        name  = zone["name"]
        pages = zone["pages"]

        if remaining < pages:
            print(f"\n⚠️  Solo quedan {remaining} llamadas — insuficientes para {name} ({pages} páginas). Parando.")
            break

        last = get_last_updated(state, name, op)
        print(f"\n⏳ {name.upper()} ({op}) — última vez: {last.strftime('%Y-%m-%d %H:%M') if last else 'nunca'}")

        db = SessionLocal()
        try:
            search_kwargs = dict(
                operation=op,
                max_items=MAX_ITEMS_PER_PAGE,
                num_pages=pages,
            )
            if "location_id" in zone:
                search_kwargs["locationId"] = zone["location_id"]
            else:
                search_kwargs["center"]   = zone["center"]
                search_kwargs["distance"] = zone["distance_m"]

            datos = api.search_by_area(**search_kwargs)

            if not isinstance(datos, dict) or "elementList" not in datos:
                print(f"  ❌ Respuesta inesperada: {datos}")
                tasks_skipped += 1
                continue

            pages_used = datos.get("pages_used", 0)
            res = upsert_properties(db, datos["elementList"], op)
            print(f"  ✅ {res['nuevas']} nuevas | {res['actualizadas']} actualizadas "
                  f"| total recibidas: {len(datos['elementList'])} | páginas usadas: {pages_used}/{pages}")

            record_calls(state, pages_used)
            set_last_updated(state, name, op)
            remaining  -= pages_used
            tasks_run  += 1

        except Exception as e:
            db.rollback()
            print(f"  ❌ Error: {e}")
            tasks_skipped += 1
        finally:
            db.close()
            save_state(state)  # persist after every task — progress never lost

        time.sleep(2)

    print(f"\n🎯 Run completado: {tasks_run} tareas actualizadas, {tasks_skipped} con error.")
    print(f"📊 Llamadas usadas (últimos 30 días): {calls_in_window(state)}/{MONTHLY_BUDGET}\n")


if __name__ == "__main__":
    main()
