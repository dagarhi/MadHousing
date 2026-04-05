import { Injectable } from '@angular/core';
import maplibregl, { Map as MapLibreMap, type ExpressionSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import { MapService } from './map.service';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';
import { BACKEND_SCORE_DOMAIN, robustDomainFromScores, colorInterpolateExpr } from '../styles/score-colors';
import { Propiedad } from '../models/propiedad.model';


type PolyGeom = Polygon | MultiPolygon;

type AggregationMode = 'count' | 'avgPrice' | 'avgUnitPrice' | 'avgScore';

export interface ChoroplethOptions {
  idField?: string;
  filterOperation?: 'venta' | 'alquiler' | 'all';
  mode?: AggregationMode;
}

@Injectable({ providedIn: 'root' })
export class ChoroplethLayerService {
  private map?: MapLibreMap;

  private barrioPolys?: FeatureCollection<PolyGeom>;
  private idField = 'id';

  private visible = false;

  private lastData: Propiedad[] = [];
  private currentOptions: Required<ChoroplethOptions> = {
    idField: 'id',
    filterOperation: 'all',
    mode: 'count'
  };

  private onStyleDataBound?: () => void;

  private readonly SOURCE_ID = 'choropleth-source';
  private readonly FILL_ID = 'choropleth-fill';
  private readonly LINE_ID = 'choropleth-outline';
  private readonly HIT_ID = 'choropleth-hit';

  private indexedPolys?: Array<{
    feat: Feature<PolyGeom>;
    bbox: [number, number, number, number]; // [minX, minY, maxX, maxY]
    id: string;
  }>;
  private extent?: [number, number, number, number];

  private popup?: maplibregl.Popup;
  private hoverBound = false;
  private lastHoverTs = 0;
  private readonly HOVER_THROTTLE_MS = 5;

  constructor(private mapSvc: MapService) { }

  attach() {
    this.map = this.mapSvc.getMap()!;
    if (!this.map) return;

    this.onStyleDataBound = this.onStyleData.bind(this);
    this.map.on('styledata', this.onStyleDataBound);

    this.ensureLayers();
    this.applyVisibility();
    if (this.lastData.length) this.updateData(this.lastData, this.currentOptions);
  }

  destroy() {
    if (this.map && this.onStyleDataBound) this.map.off('styledata', this.onStyleDataBound);
    this.clear();
    this.map = undefined;
    this.onStyleDataBound = undefined;
    this.lastData = [];
  }

  setPolygons(polys: FeatureCollection<PolyGeom>, idField = 'id') {
    this.barrioPolys = polys;
    this.idField = idField || 'id';
    this.buildSpatialIndex(polys, this.idField);
    if (this.map && this.map.getSource(this.SOURCE_ID)) {
      (this.map.getSource(this.SOURCE_ID) as any).setData(polys);
    }
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.applyVisibility();
    if (v && this.lastData.length) this.updateData(this.lastData, this.currentOptions);
  }

  render(pisos: Propiedad[], opts?: ChoroplethOptions) {
    this.lastData = Array.isArray(pisos) ? pisos : [];
    this.currentOptions = {
      ...this.currentOptions,
      ...(opts ?? {}),
      idField: opts?.idField ?? this.currentOptions.idField,
    };
    this.ensureLayers();
    this.updateData(this.lastData, this.currentOptions);
  }

  clear() {
    this.visible = false;
    this.lastData = [];
    this.hoverBound = false;
    if (!this.map) return;
    if (this.map.getLayer(this.HIT_ID)) this.map.removeLayer(this.HIT_ID);
    if (this.map.getLayer(this.FILL_ID)) this.map.removeLayer(this.FILL_ID);
    if (this.map.getLayer(this.LINE_ID)) this.map.removeLayer(this.LINE_ID);
    if (this.map.getSource(this.SOURCE_ID)) this.map.removeSource(this.SOURCE_ID);
  }

  private onStyleData() {
    this.ensureLayers();
    this.applyVisibility();
    if (this.lastData.length) this.updateData(this.lastData, this.currentOptions);
  }

  private applyVisibility() {
    if (!this.map) return;
    const vis = this.visible ? 'visible' : 'none';
    if (this.map.getLayer(this.FILL_ID)) this.map.setLayoutProperty(this.FILL_ID, 'visibility', vis);
    if (this.map.getLayer(this.LINE_ID)) this.map.setLayoutProperty(this.LINE_ID, 'visibility', vis);
    if (this.map.getLayer(this.HIT_ID)) this.map.setLayoutProperty(this.HIT_ID, 'visibility', vis);
  }

  private ensureLayers() {
    if (!this.map) return;

    if (!this.map.getSource(this.SOURCE_ID)) {
      const empty: FeatureCollection<PolyGeom> = { type: 'FeatureCollection', features: [] };
      this.map.addSource(this.SOURCE_ID, { type: 'geojson', data: empty });
    }

    if (!this.map.getLayer(this.FILL_ID)) {
      const fillColorExpr = colorInterpolateExpr('value', BACKEND_SCORE_DOMAIN, undefined, 12) as unknown as ExpressionSpecification;

      this.map.addLayer({
        id: this.FILL_ID,
        type: 'fill',
        source: this.SOURCE_ID,
        layout: { visibility: this.visible ? 'visible' : 'none' },
        paint: {
          'fill-color': fillColorExpr,
          'fill-opacity': ['case', ['>', ['get', 'value'], 0], 0.6, 0]
        }
      });
    }

    if (!this.map.getLayer(this.LINE_ID)) {
      this.map.addLayer({
        id: this.LINE_ID,
        type: 'line',
        source: this.SOURCE_ID,
        layout: { visibility: this.visible ? 'visible' : 'none' },
        paint: {
          'line-color': '#111827',
          'line-opacity': 0.5,
          'line-width': 1
        }
      });
    }

    if (!this.map.getLayer(this.HIT_ID)) {
      this.map.addLayer({
        id: this.HIT_ID,
        type: 'fill',
        source: this.SOURCE_ID,
        layout: { visibility: this.visible ? 'visible' : 'none' },
        paint: { 'fill-color': '#000000', 'fill-opacity': 0.001 }
      });
    }

    this.attachHoverOnce();
  }

  private attachHoverOnce() {
    if (this.hoverBound || !this.map) return;
    this.hoverBound = true;

    this.popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
    });

    const fmtInt = (n: number) =>
      Number.isFinite(n) ? n.toLocaleString('es-ES') : '—';
    const fmtFixed = (n: number, d = 0) =>
      Number.isFinite(n) ? n.toFixed(d).replace('.', ',') : '—';

    this.map!.on('mousemove', this.HIT_ID, (e: any) => {
      const now = performance.now();
      if (now - this.lastHoverTs < this.HOVER_THROTTLE_MS) return;
      this.lastHoverTs = now;

      const f = (e.features?.[0] as any) || undefined;
      if (!f) {
        this.popup?.remove();
        return;
      }

      const props: any = f.properties ?? {};

      const rawValue = Number(props['value']);
      const rawCount = Number(props['count']);

      const hasScore = Number.isFinite(rawValue) && rawValue > 0;
      const hasCount = Number.isFinite(rawCount) && rawCount > 0;

      if (!hasScore || !hasCount) {
        this.popup?.remove();
        return;
      }

      const html = `
        <div class="choro-tooltip">
          <div class="choro-tooltip__header">
            <div class="choro-tooltip__title">
              ${props['name'] ?? props['id'] ?? ''}
            </div>
            <div class="choro-tooltip__score">
              ${fmtFixed(rawValue, 1)}
            </div>
          </div>

          <div class="choro-tooltip__body">
            <div class="choro-tooltip__row">
              <span class="label">Nº pisos</span>
              <span class="value">${fmtInt(rawCount)}</span>
            </div>
            <div class="choro-tooltip__row">
              <span class="label">€/m²</span>
              <span class="value">${fmtInt(Number(props['avgUnitPrice']))}</span>
            </div>
            <div class="choro-tooltip__row">
              <span class="label">Precio medio</span>
              <span class="value">${fmtInt(Number(props['avgPrice']))}</span>
            </div>
          </div>
        </div>
      `;

      this.popup!.setLngLat(e.lngLat).setHTML(html).addTo(this.map!);
    });

    this.map!.on('mouseleave', this.HIT_ID, () => this.popup?.remove());
  }

  private updateData(pisos: Propiedad[], opts: Required<ChoroplethOptions>) {
    if (!this.map) return;
    if (!this.barrioPolys) {
      console.warn('[Choropleth] No known polygons. Call setPolygons(...) before render().');
      return;
    }

    const fc = this.aggregateByPolygons(pisos, opts);
    const src = this.map.getSource(this.SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    src?.setData(fc);

    const values = fc.features.map(f => Number(f.properties?.['value'] ?? 0)).filter(Number.isFinite);
    const isScore = this.currentOptions.mode === 'avgScore';
    const baseDomain = isScore
      ? BACKEND_SCORE_DOMAIN
      : { min: Math.min(...values, 0), max: Math.max(...values, 1) };

    const domain = robustDomainFromScores(values, baseDomain, 0.05, 0.95, 0);

    const expr = colorInterpolateExpr('value', domain, undefined, 12) as unknown as ExpressionSpecification;
    if (this.map.getLayer(this.FILL_ID)) {
      this.map.setPaintProperty(this.FILL_ID, 'fill-color', expr);
    }
  }

  private aggregateByPolygons(pisos: Propiedad[], opts: Required<ChoroplethOptions>): FeatureCollection<PolyGeom> {
    const idField = opts.idField || this.idField;
    if (!this.indexedPolys?.length) {
      console.warn('[Choropleth] No spatial index.');
      return { type: 'FeatureCollection', features: [] };
    }

    type Acc = {
      count: number;
      sumPrice: number;
      sumUnitPrice: number;
      validUnit: number;
      sumScore: number;
      validScore: number;
    };
    const accById = new Map<string, Acc>();

    const filtered = opts.filterOperation === 'all'
      ? pisos
      : pisos.filter(p => {
        const raw = (p.operation ?? '').toString().toLowerCase();
        const norm = raw === 'sale' ? 'venta' : raw === 'rent' ? 'alquiler' : raw;
        return norm === opts.filterOperation;
      });

    for (const p of filtered) {
      const lon = Number(p.longitude ?? p.location?.lng ?? p.location?.lon);
      const lat = Number(p.latitude ?? p.location?.lat);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

      const candidate = this.findFirstContainingPolygon(lon, lat);
      if (!candidate) continue;
      const id = candidate.id;

      let acc = accById.get(id);
      if (!acc) {
        acc = { count: 0, sumPrice: 0, sumUnitPrice: 0, validUnit: 0, sumScore: 0, validScore: 0 };
        accById.set(id, acc);
      }

      acc.count += 1;
      if (Number.isFinite(p.price)) acc.sumPrice += Number(p.price);
      if (Number.isFinite(p.price) && Number.isFinite(p.size) && p.size! > 0) {
        acc.sumUnitPrice += (Number(p.price) / Number(p.size));
        acc.validUnit += 1;
      }
      const s = this.asNum(p.score ?? p.score_intrinseco);
      if (s !== undefined) {
        acc.sumScore += s;
        acc.validScore += 1;
      }
    }

    const out: FeatureCollection<PolyGeom> = { type: 'FeatureCollection', features: [] };
    for (const { feat, id } of this.indexedPolys!) {
      const acc = accById.get(id);
      const count = acc?.count ?? 0;
      const avgPrice = count > 0 ? acc!.sumPrice / count : 0;
      const avgUnitPrice = (acc?.validUnit ?? 0) > 0 ? acc!.sumUnitPrice / acc!.validUnit : 0;
      const avgScore = (acc?.validScore ?? 0) > 0 ? acc!.sumScore / acc!.validScore : 0

      let value = 0;
      switch (opts.mode) {
        case 'count': value = count; break;
        case 'avgPrice': value = avgPrice; break;
        case 'avgUnitPrice': value = avgUnitPrice; break;
        case 'avgScore': value = avgScore; break;
      }

      out.features.push({
        type: 'Feature',
        geometry: feat.geometry,
        properties: {
          id,
          name: feat.properties?.['name'] ?? feat.properties?.['NAME'] ?? id,
          count,
          avgPrice,
          avgUnitPrice,
          value,
          avgScore
        }
      } as any);
    }
    return out;
  }

  private asNum(v: any): number | undefined {
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
    if (v == null) return undefined;
    const n = Number(String(v).trim().replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }

  private findFirstContainingPolygon(lon: number, lat: number) {
    if (!this.indexedPolys?.length) return undefined;
    const pt = turfPoint([lon, lat]) as any;
    for (const entry of this.indexedPolys) {
      const [minX, minY, maxX, maxY] = entry.bbox;
      if (lon < minX || lon > maxX || lat < minY || lat > maxY) continue;
      if (booleanPointInPolygon(pt, entry.feat as any)) return entry;
    }
    return undefined;
  }

  private buildSpatialIndex(fc: FeatureCollection<PolyGeom>, idField: string) {
    const boxes: Array<{ feat: Feature<PolyGeom>; bbox: [number, number, number, number]; id: string }> = [];

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const feat of fc.features) {
      const b = this.computeBbox(feat.geometry as any);
      if (!b) continue;
      boxes.push({
        feat,
        bbox: b,
        id: String((feat.properties?.[idField] ?? feat.id ?? 'NA')),
      });
      if (b[0] < minX) minX = b[0];
      if (b[1] < minY) minY = b[1];
      if (b[2] > maxX) maxX = b[2];
      if (b[3] > maxY) maxY = b[3];
    }

    this.indexedPolys = boxes;
    this.extent = (boxes.length ? [minX, minY, maxX, maxY] : undefined) as any;
  }

  private computeBbox(geom: PolyGeom): [number, number, number, number] | undefined {
    if (!geom) return undefined;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    const push = (x: number, y: number) => {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    };

    const scan = (coords: any) => {
      for (const c of coords) {
        if (Array.isArray(c[0])) {
          scan(c);
        } else {
          push(c[0], c[1]);
        }
      }
    };

    if (geom.type === 'Polygon') {
      scan(geom.coordinates);
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) scan(poly);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return undefined;
    }
    return [minX, minY, maxX, maxY];
  }
}