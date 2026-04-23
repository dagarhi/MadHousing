#!/usr/bin/env python3
"""Fetch POI snapshots from OSM Overpass and save as GeoJSON.

Target area: Comunidad de Madrid (ISO 3166-2 ES-MD). Output goes to
`Frontend_Ang/src/assets/poi/<key>.geojson`.

Usage:
    python Backend/scripts/fetch_pois.py              # all categories
    python Backend/scripts/fetch_pois.py parks metro  # subset

Snapshot tool — OSM data changes slowly for metro/parks/schools, so this is
expected to be re-run manually (monthly-ish) rather than on a schedule.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import requests

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Overpass etiquette: identify the client. Default requests UA gets 406'd.
USER_AGENT = "MadHousing-POI-fetch/1.0 (https://madhousing.netlify.app)"

# Output location (relative to repo root — Backend/scripts/fetch_pois.py → ../../)
REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR   = REPO_ROOT / "Frontend_Ang" / "src" / "assets" / "poi"


# Overpass queries. Each returns `out geom;` so coordinates are inlined in
# the JSON response — no second lookup pass needed.
QUERIES: dict[str, str] = {
    # Named parks only — excludes the thousands of unnamed micro-gardens that
    # would bloat the snapshot to ~10 MB. Named parks are what users can
    # actually identify/reason about in a housing search context.
    "parks": """
        [out:json][timeout:180];
        area["ISO3166-2"="ES-MD"]->.a;
        (
          way["leisure"="park"]["name"](area.a);
          relation["leisure"="park"]["name"](area.a);
        );
        out geom tags;
    """,
    "metro": """
        [out:json][timeout:120];
        area["ISO3166-2"="ES-MD"]->.a;
        (
          node["railway"="station"]["station"="subway"](area.a);
          node["railway"="station"]["subway"="yes"](area.a);
        );
        out;
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


def _coords(geom: list[dict]) -> list[list[float]]:
    return [[p["lon"], p["lat"]] for p in geom]


def _is_closed(ring: list[list[float]]) -> bool:
    return len(ring) >= 4 and ring[0] == ring[-1]


def to_point_fc(osm: dict) -> dict:
    features = []
    for el in osm.get("elements", []):
        if el.get("type") != "node":
            continue
        tags = el.get("tags") or {}
        props = {"id": el["id"]}
        for k in ("name", "line", "operator", "network"):
            if k in tags:
                props[k] = tags[k]
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [el["lon"], el["lat"]]},
            "properties": props,
        })
    return {"type": "FeatureCollection", "features": features}


def to_polygon_fc(osm: dict) -> dict:
    """Ways (closed) → Polygon; type=multipolygon relations → MultiPolygon.
    Inner rings from relations are dropped for simplicity — visually fine for
    park fills at city zoom levels."""
    features = []
    for el in osm.get("elements", []):
        tags = el.get("tags") or {}
        props = {"id": el["id"]}
        if "name" in tags:
            props["name"] = tags["name"]

        if el["type"] == "way":
            geom = el.get("geometry")
            if not geom or len(geom) < 3:
                continue
            coords = _coords(geom)
            if not _is_closed(coords):
                coords.append(coords[0])
            features.append({
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [coords]},
                "properties": props,
            })
        elif el["type"] == "relation" and tags.get("type") == "multipolygon":
            outers = []
            for m in el.get("members", []):
                if m.get("type") != "way" or m.get("role") != "outer":
                    continue
                geom = m.get("geometry")
                if not geom or len(geom) < 3:
                    continue
                coords = _coords(geom)
                if not _is_closed(coords):
                    continue
                outers.append([coords])
            if not outers:
                continue
            features.append({
                "type": "Feature",
                "geometry": {"type": "MultiPolygon", "coordinates": outers},
                "properties": props,
            })
    return {"type": "FeatureCollection", "features": features}


CONVERTERS = {
    "parks": to_polygon_fc,
    "metro": to_point_fc,
}


def run_one(key: str) -> None:
    print(f"[{key}] querying Overpass…", flush=True)
    t0 = time.time()
    osm = fetch(QUERIES[key])
    fc  = CONVERTERS[key](osm)
    dt  = time.time() - t0

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{key}.geojson"
    out.write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")))
    size_kb = out.stat().st_size / 1024
    print(f"[{key}] {len(fc['features'])} features in {dt:.1f}s → {out.relative_to(REPO_ROOT)} ({size_kb:.0f} KB)")


def main() -> int:
    targets = sys.argv[1:] or list(QUERIES)
    unknown = [t for t in targets if t not in QUERIES]
    if unknown:
        print(f"Unknown POIs: {unknown}. Available: {list(QUERIES)}")
        return 2
    for key in targets:
        run_one(key)
    return 0


if __name__ == "__main__":
    sys.exit(main())
