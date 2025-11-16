import { Injectable, OnDestroy } from '@angular/core';
import maplibregl from 'maplibre-gl';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { Propiedad } from '../models/propiedad.model';
import { MapService } from './map.service';
import { PALETTE_RDYLGN } from '../styles/score-colors';

export interface HeatValueOptions {

  weightAccessor?: (p: Propiedad) => number | undefined;

  radiusRange?: { min: number; max: number };
  blur?: number;
  highOnTop?: boolean;

  opacity?: number;

  radiusStops?: Array<[zoom: number, radiusPx: number]>;
  intensityStops?: Array<[zoom: number, intensity: number]>;
  colorRamp?: string[];
  idBase?: string;

  minZoom?: number;
  maxZoom?: number;
}

type ResolvedHeatValueOptions = {
  weightAccessor: (p: Propiedad) => number | undefined;
  opacity: number;
  radiusStops: Array<[number, number]>;
  intensityStops: Array<[number, number]>;
  colorRamp: string[];
  minZoom: number;
  maxZoom: number;
};

type HeatProps = { w: number };

function toGeoJSON(
  pisos: Propiedad[],
  weightAccessor: (p: Propiedad) => number | undefined
): FeatureCollection<Point, HeatProps> {
  const features: Feature<Point, HeatProps>[] = [];

  for (const p of pisos) {
    const lat = Number(
      p.latitude ??
      p.location?.lat
    );
    const lon = Number(
      p.longitude ??
      p.location?.lon ??
      p.location?.lng
    );

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const raw = weightAccessor(p);
    if (raw == null || Number.isNaN(raw as any)) continue;
    const w = Number(raw);
    if (!Number.isFinite(w) || w <= 0) continue;

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { w }
    });
  }

  return {
    type: 'FeatureCollection',
    features
  };
}


const DEFAULT_HEAT_COLORS: string[] = (() => {
  const src = (PALETTE_RDYLGN as any[]) ?? [];
  if (!src.length) {
    return ['#00ff00', '#ffff00', '#ffa500', '#ff0000'];
  }
  const colors = src.map((item: any) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      if (typeof item.color === 'string') return item.color;
      if (Array.isArray(item) && typeof item[1] === 'string') return item[1];
    }
    return '#ffffff';
  });
  return colors.reverse();
})();

function buildHeatmapColorExpression(colors: string[]): any[] {
  const ramp = (colors.length ? colors : DEFAULT_HEAT_COLORS).slice();
  const expr: any[] = ['interpolate', ['linear'], ['heatmap-density']];

  expr.push(0, 'rgba(0,0,0,0)');

  const n = ramp.length;
  if (n === 0) {
    expr.push(1, '#ff0000');
    return expr;
  }

  for (let i = 0; i < n; i++) {
    const t = (i + 1) / n; 
    expr.push(t, ramp[i]);
  }

  return expr;
}

@Injectable({ providedIn: 'root' })
export class HeatValueMapService implements OnDestroy {
  private map?: maplibregl.Map;

  private idBase = `heat-density-${Math.random().toString(36).slice(2, 7)}`;
  private sourceId = `${this.idBase}-src`;
  private layerId = `${this.idBase}-layer`;

  private lastData?: FeatureCollection<Point, HeatProps>;
  private lastOpts?: ResolvedHeatValueOptions;
  private currentVisible = true;

  constructor(private readonly mapSvc: MapService) {}

  attach(map?: maplibregl.Map) {
    this.map = map ?? (this.mapSvc as any).getMap?.() ?? this.map;
  }

  ngOnDestroy() {
    this.clear();
  }

  clear(map?: maplibregl.Map) {
    const m = map ?? this.map;
    if (!m) return;

    if (m.getLayer(this.layerId)) {
      try { m.removeLayer(this.layerId); } catch {}
    }

    if (m.getSource(this.sourceId)) {
      try { m.removeSource(this.sourceId as any); } catch {}
    }

    this.lastData = undefined;
    this.lastOpts = undefined;
  }

  render(pisos: Propiedad[], opts: HeatValueOptions = {}) {
    this.attach();
    if (!this.map) return;

    if (opts.idBase && opts.idBase !== this.idBase) {
      this.idBase = opts.idBase;
      this.sourceId = `${this.idBase}-src`;
      this.layerId = `${this.idBase}-layer`;
    }

    this.clear();

    const resolved = this.resolveOptions(opts);

    const fc = toGeoJSON(pisos, resolved.weightAccessor);
    if (!fc.features.length) {
      this.lastData = undefined;
      this.lastOpts = resolved;
      return;
    }

    this.map.addSource(this.sourceId, {
      type: 'geojson',
      data: fc
    });

    const paint: any = {
      'heatmap-weight': ['coalesce', ['get', 'w'], 0],
      'heatmap-radius': this.buildRadiusExpression(resolved.radiusStops),
      'heatmap-intensity': this.buildIntensityExpression(resolved.intensityStops),
      'heatmap-color': buildHeatmapColorExpression(resolved.colorRamp),
      'heatmap-opacity': resolved.opacity
    };

    const layer: any = {
      id: this.layerId,
      type: 'heatmap',
      source: this.sourceId,
      paint,
      layout: {
        visibility: this.currentVisible ? 'visible' : 'none'
      },
      minzoom: resolved.minZoom,
      maxzoom: resolved.maxZoom
    };

    this.map.addLayer(layer);

    this.lastData = fc;
    this.lastOpts = resolved;
  }

  updateData(pisos: Propiedad[]) {
    if (!this.map) {
      this.render(pisos);
      return;
    }

    if (!this.lastOpts) {
      this.render(pisos);
      return;
    }

    const src = this.map.getSource(this.sourceId) as maplibregl.GeoJSONSource | undefined;
    if (!src) {
      this.render(pisos, this.lastOpts);
      return;
    }

    const fc = toGeoJSON(pisos, this.lastOpts.weightAccessor);
    src.setData(fc);
    this.lastData = fc;
  }

  setVisible(visible: boolean) {
    this.currentVisible = visible;
    if (!this.map) return;
    if (this.map.getLayer(this.layerId)) {
      this.map.setLayoutProperty(this.layerId, 'visibility', visible ? 'visible' : 'none');
    }
  }

  private resolveOptions(opts: HeatValueOptions): ResolvedHeatValueOptions {
    const weightAccessor = opts.weightAccessor ?? (() => 1);

    let radiusStops: Array<[number, number]>;
    if (opts.radiusStops && opts.radiusStops.length) {
      radiusStops = opts.radiusStops;
    } else if (opts.radiusRange) {
      radiusStops = [
        [10, opts.radiusRange.min],
        [15, opts.radiusRange.max]
      ];
    } else {
      radiusStops = [
        [10, 18],
        [13, 30],
        [15, 50]
      ];
    }

    const intensityStops: Array<[number, number]> =
      opts.intensityStops && opts.intensityStops.length
        ? opts.intensityStops
        : [
            [10, 0.8],
            [15, 1.6]
          ];

    const colors = (opts.colorRamp && opts.colorRamp.length)
      ? opts.colorRamp.slice()
      : DEFAULT_HEAT_COLORS.slice();

    return {
      weightAccessor,
      opacity: opts.opacity ?? 0.75,
      radiusStops,
      intensityStops,
      colorRamp: colors,
      minZoom: opts.minZoom ?? 10,
      maxZoom: opts.maxZoom ?? 18
    };
  }

  private buildRadiusExpression(stops: Array<[number, number]>): any[] {
    const expr: any[] = ['interpolate', ['linear'], ['zoom']];
    for (const [z, r] of stops) {
      expr.push(z, r);
    }
    return expr;
  }

  private buildIntensityExpression(stops: Array<[number, number]>): any {
    if (!stops.length) return 1;
    if (stops.length === 1) {
      return stops[0][1];
    }
    const expr: any[] = ['interpolate', ['linear'], ['zoom']];
    for (const [z, value] of stops) {
      expr.push(z, value);
    }
    return expr;
  }
}
