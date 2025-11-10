// src/app/core/services/heat-value-map.service.ts
import { Injectable, OnDestroy } from '@angular/core';
import maplibregl from 'maplibre-gl';
import type { Feature, FeatureCollection, Point } from 'geojson';

// ⚠️ Ajusta estas rutas a tu estructura real
import { Propiedad } from '../models/propiedad.model'; 
import { MapService } from './map.service';

export interface HeatValueOptions {
  /** Valor de cada punto (p.ej. p => p.price o p => p.score) */
  valueAccessor?: (p: Propiedad) => number | undefined;
  /** Radio por punto. Si no lo das, se autoescala según el valor. */
  radiusAccessor?: (p: Propiedad) => number | undefined;
  /** 'px' (por defecto) o 'm' (metros geográficos) */
  radiusUnit?: 'px' | 'm';
  /** Si no hay radiusAccessor, rango al que se normaliza el radio (px o m según unidad) */
  radiusRange?: { min: number; max: number };
  /** Número de bandas de valor (capas) */
  bins?: number;
  /** Paleta (debe tener ≥ bins elementos; si no, se repite el último) */
  colorRamp?: string[];
  /** Apariencia */
  opacity?: number;  // 0..1
  blur?: number;     // 0..1
  /** Id base para esta familia de capas */
  idBase?: string;
  /** Si true, bandas altas encima (por defecto true) */
  highOnTop?: boolean;
}

/** Opciones ya resueltas (defaults aplicados). radiusAccessor sigue siendo opcional. */
type ResolvedHeatValueOptions = {
  valueAccessor: (p: Propiedad) => number | undefined;
  radiusAccessor?: (p: Propiedad) => number | undefined;
  radiusUnit: 'px' | 'm';
  radiusRange: { min: number; max: number };
  bins: number;
  colorRamp: string[];
  opacity: number;
  blur: number;
  idBase?: string;
  highOnTop: boolean;
};

type HeatProps = { v: number; r?: number };

function toGeoJSON(
  pisos: Propiedad[],
  valueAccessor: (p: Propiedad) => number | undefined,
  radiusAccessor?: (p: Propiedad) => number | undefined
): FeatureCollection<Point, HeatProps> {
  const features: Feature<Point, HeatProps>[] = [];

  for (const p of pisos) {
    // Intenta varias propiedades típicas de localización
    const lat = Number(
      (p as any).latitude ??
      (p as any).lat ??
      (p as any).location?.lat
    );
    const lon = Number(
      (p as any).longitude ??
      (p as any).lng ??
      (p as any).lon ??
      (p as any).location?.lng ??
      (p as any).location?.lon
    );
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const v = valueAccessor(p);
    if (v == null || Number.isNaN(v)) continue;

    const r = radiusAccessor?.(p);

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { v, r }
    });
  }

  const fc: FeatureCollection<Point, HeatProps> = {
    type: 'FeatureCollection',
    features
  };
  return fc;
}

const DEFAULT_RAMP = ['#540101ff','#46337E','#365C8D','#277F8E','#1FA187','#4AC16D','#FDE725'];

@Injectable({ providedIn: 'root' })
export class HeatValueMapService implements OnDestroy {
  private map?: maplibregl.Map;

  private idBase = `value-spots-${Math.random().toString(36).slice(2, 7)}`;
  private sourceId = `${this.idBase}-src`;
  private layerIds: string[] = [];

  private metersMode = false;
  private moveHandler?: () => void;

  private lastData?: FeatureCollection<Point, HeatProps>;
  private lastOpts?: ResolvedHeatValueOptions;
  private lastBinsEdges?: number[];
  private currentVisible = true;

  constructor(private readonly mapSvc: MapService) {}

  attach(map?: maplibregl.Map) {
    this.map = map ?? (this.mapSvc as any).getMap?.() ?? this.map;
  }

  ngOnDestroy() {
    this.clear();
  }

  clear() {
    if (!this.map) return;
    for (const id of this.layerIds) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource(this.sourceId)) this.map.removeSource(this.sourceId);
    this.layerIds = [];
    this.detachMetersListener();
  }

  render(pisos: Propiedad[], opts: HeatValueOptions = {}) {
    this.attach();
    if (!this.map) return;

    this.clear();

    // Defaults (sin forzar radiusAccessor a obligatorio)
    const resolved: ResolvedHeatValueOptions = {
      valueAccessor: opts.valueAccessor ?? ((p: any) => p.price ?? p.score ?? p.score_intrinseco),
      radiusAccessor: opts.radiusAccessor, // ← opcional
      radiusUnit: opts.radiusUnit ?? 'px',
      radiusRange: opts.radiusRange ?? { min: 6, max: 22 },
      bins: Math.max(2, Math.floor(opts.bins ?? 7)),
      colorRamp: (opts.colorRamp?.length ? opts.colorRamp : DEFAULT_RAMP).slice(),
      opacity: opts.opacity ?? 0.65,
      blur: opts.blur ?? 0.6,
      idBase: opts.idBase,
      highOnTop: opts.highOnTop ?? true
    };

    if (resolved.idBase) {
      this.idBase = resolved.idBase;
      this.sourceId = `${this.idBase}-src`;
    }

    const fc = toGeoJSON(pisos, resolved.valueAccessor, resolved.radiusAccessor);
    if (!fc.features.length) return;

    // Extremos de valor y radio
    let minV = +Infinity, maxV = -Infinity, minR = +Infinity, maxR = -Infinity;
    for (const f of fc.features) {
      const v = f.properties.v;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;

      const r = f.properties.r;
      if (r != null && Number.isFinite(r)) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
      }
    }

    if (!Number.isFinite(minV) || !Number.isFinite(maxV)) return;
    const sameV = (maxV - minV) === 0;

    // Si no hay radiusAccessor -> radio derivado del valor
    if (!resolved.radiusAccessor) {
      for (const f of fc.features) {
        const t = sameV ? 0.5 : (f.properties.v - minV) / (maxV - minV);
        f.properties.r = resolved.radiusRange.min + t * (resolved.radiusRange.max - resolved.radiusRange.min);
      }
      minR = resolved.radiusRange.min; maxR = resolved.radiusRange.max;
    } else {
      if (!Number.isFinite(minR) || !Number.isFinite(maxR)) {
        minR = resolved.radiusRange.min; maxR = resolved.radiusRange.max;
      }
    }

    // Source
    this.map.addSource(this.sourceId, {
      type: 'geojson',
      data: fc
    });

    // Bins
    const edges: number[] = [];
    for (let i = 0; i <= resolved.bins; i++) {
      edges.push(minV + (i * (maxV - minV)) / resolved.bins);
    }

    // Asegura colores suficientes
    while (resolved.colorRamp.length < resolved.bins) {
      resolved.colorRamp.push(resolved.colorRamp[resolved.colorRamp.length - 1]);
    }

    // Orden de apilado
    const idxs = [...Array(resolved.bins).keys()];
    if (resolved.highOnTop) idxs.reverse();

    // Capas por banda
    for (const i of idxs) {
      const id = `${this.idBase}-bin-${i}`;
      this.layerIds.push(id);

      const vMin = edges[i];
      const vMax = edges[i + 1];
      const isLast = i === resolved.bins - 1;

      this.map.addLayer({
        id,
        type: 'circle',
        source: this.sourceId,
        filter: ['all',
          ['>=', ['get', 'v'], vMin],
          [isLast ? '<=' : '<', ['get', 'v'], vMax]
        ],
        paint: {
          'circle-radius': ['get', 'r'], // px por defecto; si 'm', se recalcula abajo
          'circle-color': resolved.colorRamp[Math.min(i, resolved.colorRamp.length - 1)],
          'circle-opacity': resolved.opacity,
          'circle-blur': resolved.blur,
          'circle-stroke-width': 0,
          'circle-stroke-color': 'rgba(0,0,0,0)'
        }
      });
    }

    // Radios en metros → listener para convertir a px por zoom/lat
    this.metersMode = (resolved.radiusUnit === 'm');
    if (this.metersMode) {
      this.attachMetersListener(minR, maxR);
    }

    // Guarda estado
    this.lastData = fc;
    this.lastBinsEdges = edges;
    this.lastOpts = resolved;
  }

  /** Re-render con los mismos parámetros pero nuevos datos */
  updateData(pisos: Propiedad[]) {
    if (!this.lastOpts) {
      this.render(pisos);
      return;
    }
    this.render(pisos, this.lastOpts);
  }

  private metersToPixels(meters: number): number {
    if (!this.map) return meters;
    const zoom = this.map.getZoom();
    const lat = this.map.getCenter().lat;
    const metersPerPixel = (156543.03392804097 * Math.cos(lat * Math.PI / 180)) / Math.pow(2, zoom);
    return meters / metersPerPixel;
  }

  private attachMetersListener(minR: number, maxR: number) {
    if (!this.map) return;

    const recalc = () => {
      if (!this.map) return;
      const pxMin = this.metersToPixels(minR);
      const pxMax = this.metersToPixels(maxR);

      for (const id of this.layerIds) {
        if (!this.map.getLayer(id)) continue;
        this.map.setPaintProperty(id, 'circle-radius', [
          'interpolate', ['linear'], ['get', 'r'],
          minR, pxMin,
          maxR, pxMax
        ]);
      }
    };

    this.moveHandler = recalc;
    this.map.on('move', recalc);
    recalc();
  }

  private detachMetersListener() {
    if (this.map && this.moveHandler) {
      this.map.off('move', this.moveHandler);
    }
    this.moveHandler = undefined;
  }
  setVisible(visible: boolean) {
    this.currentVisible = visible;
    if (!this.map) return;
    for (const id of this.layerIds) {
      if (this.map.getLayer(id)) {
        this.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      }
    }
  }
}
