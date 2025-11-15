from fastapi import APIRouter, Query, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from database import get_db
from models import Propiedad

router = APIRouter(prefix="/heatmap", tags=["heatmap"])

@router.get("")
def get_heatmap(
    operation: str = Query("rent", pattern="^(rent|sale)$"),
    cell_size: float = Query(0.01, gt=0.0001, le=1.0),
    min_count: int = Query(1, ge=1),
    db: Session = Depends(get_db),   # ✅ usa la sesión del dependency
):
    """
    Devuelve celdas geográficas (lat/lon) agregadas:
    - lat, lon: centro de la celda
    - count: nº de pisos
    - avg_score: score_intrinseco medio (0..100)
    """
    lat_bucket = func.floor(Propiedad.latitude / cell_size)
    lon_bucket = func.floor(Propiedad.longitude / cell_size)

    q = (
        db.query(
            (lat_bucket * cell_size + (cell_size / 2.0)).label("lat_center"),
            (lon_bucket * cell_size + (cell_size / 2.0)).label("lon_center"),
            func.count(Propiedad.propertyCode).label("count"),
            func.avg(func.coalesce(Propiedad.score_intrinseco, 50.0)).label("avg_score"),
        )
        .filter(Propiedad.operation == operation)
        .filter(Propiedad.latitude.isnot(None))
        .filter(Propiedad.longitude.isnot(None))
        .group_by(lat_bucket, lon_bucket)
        .having(func.count(Propiedad.propertyCode) >= min_count)
    )

    rows = q.all()

    result: List[Dict[str, Any]] = [
        {
            "lat": float(r.lat_center),
            "lon": float(r.lon_center),
            "count": int(r.count),
            "avg_score": float(r.avg_score),
        }
        for r in rows
    ]

    return {
        "operation": operation,
        "cell_size": cell_size,
        "min_count": min_count,
        "heatmap": result,
    }
