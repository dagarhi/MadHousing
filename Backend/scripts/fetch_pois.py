#!/usr/bin/env python3
"""Fetch POI snapshots from OSM Overpass and write to the PostGIS ``pois`` table.

Target area: Comunidad de Madrid (ISO 3166-2 ES-MD).

Usage:
    python Backend/scripts/fetch_pois.py                # all categories
    python Backend/scripts/fetch_pois.py park commerce  # subset

Reads DATABASE_URL from Backend/.env (override in shell for Supabase).
Idempotent: each category does DELETE + INSERT so reruns refresh the
snapshot cleanly without duplicates.
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

# Load backend's .env (lets us run standalone with local DATABASE_URL).
BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")
sys.path.insert(0, str(BACKEND_DIR))

from database import SessionLocal  # noqa: E402
from models import POI  # noqa: E402
from geoalchemy2.elements import WKTElement  # noqa: E402


OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT   = "MadHousing-POI-fetch/1.0 (https://madhousing.netlify.app)"

# Overpass QL per category. Each returns elements with enough info to build WKT.
QUERIES: dict[str, str] = {
    # Transporte público: metro + Cercanías. Bus fuera intencionadamente
    # (saturan el mapa y no discriminan para scoring).
    "transport": """
        [out:json][timeout:120];
        area["ISO3166-2"="ES-MD"]->.a;
        (
          node["railway"="station"]["station"="subway"](area.a);
          node["railway"="station"]["subway"="yes"](area.a);
          node["railway"="station"]["network"~"[Cc]ercan"](area.a);
          node["railway"="station"]["operator"~"[Cc]ercan"](area.a);
        );
        out;
    """,
    # Sanidad: hospitales + clínicas + farmacias. Todas con name para
    # descartar entradas basura / sin identificar.
    "health": """
        [out:json][timeout:180];
        area["ISO3166-2"="ES-MD"]->.a;
        (
          node["amenity"~"^(hospital|clinic|pharmacy)$"]["name"](area.a);
          way["amenity"~"^(hospital|clinic|pharmacy)$"]["name"](area.a);
        );
        out geom tags;
    """,
    "education": """
        [out:json][timeout:180];
        area["ISO3166-2"="ES-MD"]->.a;
        (
          node["amenity"="school"]["name"](area.a);
          way["amenity"="school"]["name"](area.a);
        );
        out geom tags;
    """,
    # Parques: solo con nombre (Madrid tiene miles de micro-jardines sin nombre
    # que inflarían la tabla sin aportar valor al usuario).
    "park": """
        [out:json][timeout:180];
        area["ISO3166-2"="ES-MD"]->.a;
        (
          way["leisure"="park"]["name"](area.a);
          relation["leisure"="park"]["name"](area.a);
        );
        out geom tags;
    """,
    "commerce": """
        [out:json][timeout:180];
        area["ISO3166-2"="ES-MD"]->.a;
        (
          node["shop"="supermarket"]["name"](area.a);
          way["shop"="supermarket"]["name"](area.a);
        );
        out geom tags;
    """,
    # Bici: solo carriles dedicados (highway=cycleway). Los cycleway:left/right
    # sobre calzada son numerosísimos y de calidad de datos variable.
    "bike": """
        [out:json][timeout:180];
        area["ISO3166-2"="ES-MD"]->.a;
        (
          way["highway"="cycleway"](area.a);
        );
        out geom;
    """,
}


def fetch(query: str) -> dict:
    r = requests.post(
        OVERPASS_URL,
        data={"data": query},
        headers={"User-Agent": USER_AGENT},
        timeout=240,
    )
    r.raise_for_status()
    return r.json()


# ── WKT builders ────────────────────────────────────────────────────────────

def _ring(coords: list[list[float]]) -> str:
    return ", ".join(f"{c[0]} {c[1]}" for c in coords)


def element_to_wkt(el: dict) -> str | None:
    """Convert an OSM element to a WKT string. Returns None if unrepresentable."""
    etype = el["type"]
    tags = el.get("tags") or {}

    if etype == "node":
        return f"POINT({el['lon']} {el['lat']})"

    if etype == "way":
        geom = el.get("geometry")
        if not geom or len(geom) < 2:
            return None
        coords = [[p["lon"], p["lat"]] for p in geom]

        # Closed + non-road → polygon. Anything else → linestring. This handles
        # cycleway loops (rare) as linestrings, which is the right call.
        is_closed = len(coords) >= 4 and coords[0] == coords[-1]
        is_linear = "highway" in tags

        if is_closed and not is_linear:
            return f"POLYGON(({_ring(coords)}))"
        return f"LINESTRING({_ring(coords)})"

    if etype == "relation" and tags.get("type") == "multipolygon":
        # Outer rings only (inner holes dropped — fine for city-level park fills).
        outers = []
        for m in el.get("members", []):
            if m.get("type") != "way" or m.get("role") != "outer":
                continue
            g = m.get("geometry")
            if not g or len(g) < 3:
                continue
            coords = [[p["lon"], p["lat"]] for p in g]
            if coords[0] != coords[-1]:
                continue
            outers.append(f"(({_ring(coords)}))")
        if not outers:
            return None
        return f"MULTIPOLYGON({','.join(outers)})"

    return None


# ── Tag helpers ─────────────────────────────────────────────────────────────

def infer_subtype(category: str, tags: dict) -> str | None:
    if category == "transport":
        if tags.get("station") == "subway" or tags.get("subway") == "yes":
            return "metro"
        return "cercanias"
    if category == "health":
        # amenity ∈ {hospital, clinic, pharmacy} tal cual
        return tags.get("amenity")
    if category == "education":
        return "school"
    if category == "park":
        return "park"
    if category == "commerce":
        return "supermarket"
    if category == "bike":
        return "cycleway"
    return None


# Subset of tags we keep as `extra` JSONB — useful for popups/route labels later.
EXTRA_KEYS = {
    "operator", "network", "line", "brand",
    "wheelchair", "opening_hours", "surface",
}

def relevant_extra(tags: dict) -> dict | None:
    extra = {k: v for k, v in tags.items() if k in EXTRA_KEYS}
    return extra or None


# ── Main per-category pipeline ──────────────────────────────────────────────

def process_category(db, category: str) -> int:
    print(f"[{category}] querying Overpass…", flush=True)
    t0 = time.time()
    osm = fetch(QUERIES[category])
    t_fetch = time.time() - t0

    # Idempotent refresh: clear previous snapshot of this category.
    deleted = db.query(POI).filter(POI.category == category).delete()
    db.commit()
    if deleted:
        print(f"[{category}] cleared {deleted} previous rows")

    inserted = 0
    for el in osm.get("elements", []):
        wkt = element_to_wkt(el)
        if not wkt:
            continue
        tags = el.get("tags") or {}
        poi = POI(
            category=category,
            subtype=infer_subtype(category, tags),
            name=tags.get("name"),
            geom=WKTElement(wkt, srid=4326),
            extra=relevant_extra(tags),
        )
        db.add(poi)
        inserted += 1
        if inserted % 500 == 0:
            db.commit()
    db.commit()

    dt = time.time() - t0
    print(f"[{category}] {inserted} inserted ({t_fetch:.1f}s fetch, {dt:.1f}s total)")
    return inserted


def main() -> int:
    targets = sys.argv[1:] or list(QUERIES)
    unknown = [t for t in targets if t not in QUERIES]
    if unknown:
        print(f"Unknown categories: {unknown}. Available: {list(QUERIES)}")
        return 2

    dsn = os.getenv("DATABASE_URL", "")
    safe_dsn = dsn.split("@")[-1] if "@" in dsn else dsn
    print(f"Using DATABASE_URL: …@{safe_dsn}")

    db = SessionLocal()
    try:
        for cat in targets:
            process_category(db, cat)
            time.sleep(3)  # polite gap between heavy Overpass queries
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
