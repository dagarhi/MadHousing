#!/usr/bin/env python3
"""Backfill spatial distances and context/final scores for every property.

Runs once after PostGIS setup + POI ingestion. Iterates all propiedades,
calls compute_distances_for_point (one PostGIS query per piso) and writes
back dist_*_m, score_contexto and score_final. Commits in batches of 200.

Reads DATABASE_URL from Backend/.env. Idempotent — safe to re-run after
POIs are refreshed (will recompute against the new snapshot).
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")
sys.path.insert(0, str(BACKEND_DIR))

from database import SessionLocal  # noqa: E402
from models import Propiedad  # noqa: E402
from services.scoring import (  # noqa: E402
    compute_distances_for_point,
    compute_score_contexto,
    compute_score_final,
)


def main() -> int:
    db = SessionLocal()
    try:
        pisos = db.query(Propiedad).all()
        total = len(pisos)
        print(f"Backfill sobre {total} propiedades…")

        updated = skipped = 0
        t0 = time.time()

        for i, p in enumerate(pisos, start=1):
            if p.latitude is None or p.longitude is None:
                skipped += 1
                continue

            dists = compute_distances_for_point(db, p.latitude, p.longitude)
            p.dist_transport_m = dists.get("dist_transport_m")
            p.dist_health_m    = dists.get("dist_health_m")
            p.dist_education_m = dists.get("dist_education_m")
            p.dist_park_m      = dists.get("dist_park_m")
            p.dist_commerce_m  = dists.get("dist_commerce_m")
            p.dist_bike_m      = dists.get("dist_bike_m")
            p.score_contexto   = compute_score_contexto(dists)
            p.score_final      = compute_score_final(p.score_intrinseco, p.score_contexto)
            updated += 1

            if i % 200 == 0:
                db.commit()
                dt = time.time() - t0
                print(f"  …{i}/{total} ({dt:.1f}s)")

        db.commit()
        dt = time.time() - t0
        print(f"\n✅ Backfill completado: {updated} actualizadas, {skipped} sin coords, en {dt:.1f}s")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
