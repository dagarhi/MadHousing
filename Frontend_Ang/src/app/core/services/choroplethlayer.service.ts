import { Injectable } from '@angular/core';
import maplibregl, { Map as MapLibreMap, type ExpressionSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import { MapService } from './map.service';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';
import { BACKEND_SCORE_DOMAIN, robustDomainFromScores, colorInterpolateExpr } from '../styles/score-colors';
import { Propiedad } from '../models/propiedad.model';


type PolyGeom = Polygon | MultiPolygon;

type AggregationMode =
  | 'count'
  | 'avgPrice'
  | 'avgUnitPrice'
  | 'avgScore';

export interface ChoroplethOptions {
  idField?: string;           // campo ID del polígono (por ejemplo 'id' o 'BARRIO_ID')
  filterOperation?: 'venta' | 'alquiler' | 'all';
  mode?: AggregationMode;
}

@Injectable({ providedIn: 'root' })
export class ChoroplethLayerService {
  private map?: MapLibreMap;

  // Polígonos de barrios cargados
  private barrioPolys?: FeatureCollection<PolyGeom>;
  private idField = 'id';

  // Estado visible/oculto
  private visible = false;

  // Últimos datos renderizados + opciones
  private lastData: Propiedad[] = [];
  private currentOptions: Required<ChoroplethOptions> = {
    idField: 'id',
    filterOperation: 'all',
    mode: 'count'
  };

  // Listener styledata (para re-crear capas tras style change)
  private onStyleDataBound?: () => void;

  // IDs de fuente/capas
  private readonly SOURCE_ID = 'choropleth-source';
  private readonly FILL_ID   = 'choropleth-fill';
  private readonly LINE_ID   = 'choropleth-outline';
  private readonly HIT_ID    = 'choropleth-hit';

  // Índice por bbox e extent global
  private indexedPolys?: Array<{
    feat: Feature<PolyGeom>;
    bbox: [number, number, number, number]; // [minX, minY, maxX, maxY]
    id: string;
  }>;
  private extent?: [number, number, number, number];

  // Popup hover
  private popup?: maplibregl.Popup;
  private hoverBound = false;

  constructor(private mapSvc: MapService) {}

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

  /** Carga/establece los polígonos de barrios */
  setPolygons(polys: FeatureCollection<PolyGeom>, idField = 'id') {
    this.barrioPolys = polys;
    this.idField = idField || 'id';
    this.buildSpatialIndex(polys, this.idField);
    if (this.map && this.map.getSource(this.SOURCE_ID)) {
      (this.map.getSource(this.SOURCE_ID) as any).setData(polys);
    }
  }

  /** Visible/oculto sin destruir */
  setVisible(v: boolean) {
    this.visible = v;
    this.applyVisibility();
    if (v && this.lastData.length) this.updateData(this.lastData, this.currentOptions);
  }

  /** Render principal (no fuerza visible) */
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

  /** Limpia capas+fuente y marca invisible */
  clear() {
    this.visible = false;
    if (!this.map) return;
    if (this.map.getLayer(this.HIT_ID))  this.map.removeLayer(this.HIT_ID);
    if (this.map.getLayer(this.FILL_ID)) this.map.removeLayer(this.FILL_ID);
    if (this.map.getLayer(this.LINE_ID)) this.map.removeLayer(this.LINE_ID);
    if (this.map.getSource(this.SOURCE_ID)) this.map.removeSource(this.SOURCE_ID);
  }

  /** --------- EVENTOS DE MAPA --------- */
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
    if (this.map.getLayer(this.HIT_ID))  this.map.setLayoutProperty(this.HIT_ID,  'visibility', vis);
  }

  private ensureLayers() {
    if (!this.map) return;

    // Fuente vacía si no existe
    if (!this.map.getSource(this.SOURCE_ID)) {
      const empty: FeatureCollection<PolyGeom> = { type: 'FeatureCollection', features: [] };
      this.map.addSource(this.SOURCE_ID, { type: 'geojson', data: empty });
    }

    // Relleno (color)
    if (!this.map.getLayer(this.FILL_ID)) {
      const fillColorExpr = colorInterpolateExpr('value', BACKEND_SCORE_DOMAIN, undefined, 12) as unknown as ExpressionSpecification;

      this.map.addLayer({
        id: this.FILL_ID,
        type: 'fill',
        source: this.SOURCE_ID,
        layout: { visibility: this.visible ? 'visible' : 'none' },
        paint: {
          // ✅ expresión tipada como ExpressionSpecification
          'fill-color': fillColorExpr,
          // barrios sin datos → transparentes (se mantiene)
          'fill-opacity': ['case', ['>', ['get', 'value'], 0], 0.6, 0]
        }
      });
    }

    // Contorno
    if (!this.map.getLayer(this.LINE_ID)) {
      this.map.addLayer({
        id: this.LINE_ID,
        type: 'line',
        source: this.SOURCE_ID,
        layout: { visibility: this.visible ? 'visible' : 'none' },
        paint: {
          'line-color': '#111827',
          'line-opacity': 0.25,
          'line-width': 0.5
        }
      });
    }

    // Capa "hit" para eventos
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
      closeButton: false, closeOnClick: false, offset: 12
    });

    const fmtInt = (n: number) =>
      Number.isFinite(n) ? n.toLocaleString('es-ES') : '—';
    const fmtFixed = (n: number, d = 0) =>
      Number.isFinite(n) ? n.toFixed(d).replace('.', ',') : '—';

    this.map!.on('mousemove', this.HIT_ID, (e: any) => {
      const f = (e.features?.[0] as any) || undefined;
      if (!f) { 
        this.popup?.remove(); 
        return;                 // ✅ asegura retorno void
      }

      const props: any = f.properties ?? {};
      const html = `
        <div style="font: 12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;">
          <div><strong>${props['name'] ?? props['id'] ?? ''}</strong></div>
          <div>Nº pisos: ${fmtInt(Number(props['count']))}</div>
          <div>Score: ${fmtFixed(Number(props['value']), 2)}</div>
          <div>€/m²: ${fmtInt(Number(props['avgUnitPrice']))}</div>
          <div>Precio medio: ${fmtInt(Number(props['avgPrice']))}</div>
        </div>
      `;
      this.popup!.setLngLat(e.lngLat).setHTML(html).addTo(this.map!);
    });

    this.map!.on('mouseleave', this.HIT_ID, () => this.popup?.remove());
  }

  /** Renderiza datos (agrega por barrio) y actualiza colores */
  private updateData(pisos: Propiedad[], opts: Required<ChoroplethOptions>) {
    if (!this.map) return;
    if (!this.barrioPolys) {
      console.warn('[Choropleth] No hay polígonos cargados. Llama a setPolygons(...) antes de render().');
      return;
    }

    const fc = this.aggregateByPolygons(pisos, opts);
    const src = this.map.getSource(this.SOURCE_ID) as any;
    src?.setData?.(fc);

    // dominio robusto p5–p95 dentro del backend y actualización del color
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

  /** --------- AGREGACIÓN POR BARRIOS (POLÍGONOS) --------- */
  private aggregateByPolygons(pisos: Propiedad[], opts: Required<ChoroplethOptions>): FeatureCollection<PolyGeom> {
    const idField = opts.idField || this.idField;
    if (!this.indexedPolys?.length) {
      console.warn('[Choropleth] Sin índice espacial (polígonos no establecidos).');
      return { type: 'FeatureCollection', features: [] };
    }

    // Acumuladores por barrio
    type Acc = {
      count: number;
      sumPrice: number;
      sumUnitPrice: number;
      validUnit: number;
      sumScore: number;      
      validScore: number;    
    };
    const accById = new Map<string, Acc>();

    // Filtro por operación
    const filtered = opts.filterOperation === 'all'
      ? pisos
      : pisos.filter(p => {
          const raw = (p.operation ?? '').toString().toLowerCase();
          const norm = raw === 'sale' ? 'venta' : raw === 'rent' ? 'alquiler' : raw;
          return norm === opts.filterOperation;
        });

    // Asigna cada piso al primer polígono candidato (bbox) que lo contenga (PIP)
    for (const p of filtered) {
      const lon = (p.longitude ?? p.longitude ?? p.longitude ?? p.location?.lng ?? p.location?.lon);
      const lat = (p.latitude ?? p.latitude ?? p.location?.lat);
      if (!Number.isFinite(lon!) || !Number.isFinite(lat!)) continue;

      const candidate = this.findFirstContainingPolygon(lon!, lat!);
      if (!candidate) continue;
      const id = candidate.id;

      const acc = accById.get(id) ?? { count: 0, sumPrice: 0, sumUnitPrice: 0, validUnit: 0, sumScore: 0, validScore: 0 };
      acc.count += 1;
      if (Number.isFinite(p.price)) acc.sumPrice += Number(p.price);
      if (Number.isFinite(p.price) && Number.isFinite(p.size) && p.size! > 0) {
        acc.sumUnitPrice += (Number(p.price) / Number(p.size));
        acc.validUnit += 1;
      }
      const s = this.asNum((p as any).score ?? (p as any).score_intrinseco);
      if (s !== undefined) {
        acc.sumScore += s;
        acc.validScore += 1;
      }

      accById.set(id, acc);
    }

    // Construye FeatureCollection
    const out: FeatureCollection<PolyGeom> = { type: 'FeatureCollection', features: [] };
    for (const { feat, id } of this.indexedPolys!) {
      const acc = accById.get(id);
      const count = acc?.count ?? 0;
      const avgPrice = count > 0 ? acc!.sumPrice / count : 0;
      const avgUnitPrice = (acc?.validUnit ?? 0) > 0 ? acc!.sumUnitPrice / acc!.validUnit : 0;
      const avgScore = (acc?.validScore ?? 0) > 0 ? acc!.sumScore / acc!.validScore : 0

      // Valor que usamos para colorear (value)
      let value = 0;
      switch (opts.mode) {
        case 'count': value = count; break;
        case 'avgPrice': value = avgPrice; break;
        case 'avgUnitPrice': value = avgUnitPrice; break;
        case 'avgScore':     value = avgScore; break;
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

  /** --------- UTILIDADES (PIP, bbox, etc.) --------- */

  private asNum(v: any): number | undefined {
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
    if (v == null) return undefined;
    const n = Number(String(v).trim().replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }

  /** Encuentra el primer polígono cuyo bbox contiene el punto y luego confirma con PIP */
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

  /** Construye índice por bbox + extent */
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

    // Recorre recursivamente arrays de coords
    const scan = (coords: any) => {
      for (const c of coords) {
        if (Array.isArray(c[0])) {
          scan(c);
        } else {
          // Position [lon, lat]
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