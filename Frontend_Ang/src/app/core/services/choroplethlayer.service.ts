import { Injectable } from '@angular/core';
import maplibregl, { Map as MapLibreMap } from 'maplibre-gl';
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import { MapService } from './map.service';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';

// Ajusta según tu modelo real
export interface Propiedad {
  lon?: number; lng?: number; longitude?: number; location?: { lng?: number; lon?: number };
  lat?: number; latitude?: number; location2?: { lat?: number };
  price?: number; size?: number;
  operation?: string;
}

type PolyGeom = Polygon | MultiPolygon;

export type ChoroplethMetric =
  | 'count'        // nº de pisos por barrio (por defecto)
  | 'avgPrice'     // precio medio
  | 'avgUnitPrice' // precio/m2 medio (price/size)
;

export interface ChoroplethOptions {
  metric?: ChoroplethMetric;
  idField?: string;               // p.ej. 'CODIGOINE' o 'NAMEUNIT'
  filterOperation?: 'venta' | 'alquiler' | 'all';
  priceField?: keyof Propiedad;   // por si tu campo no es 'price'
  sizeField?: keyof Propiedad;    // por si tu campo no es 'size'
}

@Injectable({ providedIn: 'root' })
export class ChoroplethLayerService {
  private map?: MapLibreMap;
  private visible = false;
  private lastData: Propiedad[] = [];

  // Hover
  private hoverBound = false;
  private popup?: maplibregl.Popup;

  // Polígonos y opciones
  private barrioPolys?: FeatureCollection<PolyGeom>;
  private polygonIdField = 'id';
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

  // Opciones vigentes
  private currentOptions: Required<ChoroplethOptions> = {
    metric: 'count',
    idField: 'id',
    filterOperation: 'all',
    priceField: 'price',
    sizeField: 'size',
  };

  constructor(private readonly mapSvc: MapService) {}

  /** Llamar tras init del mapa */
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
    this.polygonIdField = idField;
    this.currentOptions.idField = idField;

    // Construye el índice (feat + bbox + id) y guarda extent
    this.buildIndexFromPolys(idField);

    this.ensureLayers();
    if (this.lastData.length) this.updateData(this.lastData, this.currentOptions);
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

  // ----------------- Internas -----------------

  private onStyleData() {
    if (!this.map) return;
    this.ensureLayers();
    this.applyVisibility();
    if (this.visible && this.lastData.length) {
      this.updateData(this.lastData, this.currentOptions);
    }
  }

  private ensureLayers() {
    if (!this.map) return;

    // Fuente vacía si no existe
    if (!this.map.getSource(this.SOURCE_ID)) {
      const empty: FeatureCollection<PolyGeom> = { type: 'FeatureCollection', features: [] };
      this.map.addSource(this.SOURCE_ID, { type: 'geojson', data: empty });
    }

    // Relleno (colores por cuantiles) con opacidad condicional
    if (!this.map.getLayer(this.FILL_ID)) {
      this.map.addLayer({
        id: this.FILL_ID,
        type: 'fill',
        source: this.SOURCE_ID,
        layout: { visibility: this.visible ? 'visible' : 'none' },
        paint: {
          'fill-color': [
            'step', ['get', 'value'],
            '#f7fbff', 1, '#deebf7', 2, '#c6dbef', 3, '#9ecae1', 4, '#6baed6', 5, '#3182bd', 6, '#08519c'
          ],
          // barrios sin datos → transparentes
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
          'line-color': '#222',
          'line-opacity': 0.25,
          'line-width': 0.5
        }
      });
    }

    // Capa "hit" para eventos (casi invisible, captura mousemove/click)
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
      Number.isFinite(n) ? n.toLocaleString('es-ES', { maximumFractionDigits: 0 }) : '—';

    this.map.on('mousemove', this.HIT_ID, (e: any) => {
      const f = e.features?.[0]; if (!f) return;
      this.map!.getCanvas().style.cursor = 'pointer';

      const p = f.properties || {};
      const nombre = p.NAMEUNIT ?? p.NOMBRE ?? p.CODIGOINE ?? f.id ?? 'Zona';
      const count = +p._count || 0;
      const avg   = +p._avgPrice || 0;
      const unit  = +p._avgUnitPrice || 0;

      const html = `
        <div style="font:12px/1.4 system-ui,sans-serif">
          <div style="font-weight:600;margin-bottom:4px">${nombre}</div>
          <div>Viviendas: <b>${fmtInt(count)}</b></div>
          <div>Precio medio: <b>${fmtInt(avg)} €</b></div>
          <div>€/m²: <b>${fmtInt(unit)}</b></div>
        </div>`;

      this.popup!.setLngLat(e.lngLat).setHTML(html).addTo(this.map!);
    });

    this.map.on('mouseleave', this.HIT_ID, () => {
      this.map!.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
  }

  private applyVisibility() {
    if (!this.map) return;
    const vis = this.visible ? 'visible' : 'none';
    if (this.map.getLayer(this.FILL_ID)) this.map.setLayoutProperty(this.FILL_ID, 'visibility', vis);
    if (this.map.getLayer(this.LINE_ID)) this.map.setLayoutProperty(this.LINE_ID, 'visibility', vis);
    if (this.map.getLayer(this.HIT_ID))  this.map.setLayoutProperty(this.HIT_ID,  'visibility', vis);
  }

  private updateData(pisos: Propiedad[], opts: Required<ChoroplethOptions>) {
    if (!this.map) return;

    if (!this.barrioPolys) {
      console.warn('[Choropleth] No hay polígonos cargados. Llama a setPolygons(...) antes de render().');
      return;
    }

    const fc = this.aggregateByPolygons(pisos, opts);
    const src = this.map.getSource(this.SOURCE_ID) as any;
    src?.setData?.(fc);

    // Actualiza rampa de color (cuantiles)
    const values = fc.features
      .map(f => Number(f.properties?.['value'] ?? 0))
      .filter(Number.isFinite);
    const stepExpr = this.buildStepExpression(values);
    if (this.map.getLayer(this.FILL_ID)) {
      this.map.setPaintProperty(this.FILL_ID, 'fill-color', stepExpr);
    }
  }

  /** --------- AGREGACIÓN POR BARRIOS (POLÍGONOS) --------- */
  private aggregateByPolygons(pisos: Propiedad[], opts: Required<ChoroplethOptions>): FeatureCollection<PolyGeom> {
    const polys = this.barrioPolys!;
    const idField = opts.idField || this.polygonIdField;

    // Índice bbox asegurado
    if (!this.indexedPolys) this.buildIndexFromPolys(idField);
    const index = this.indexedPolys!;

    // Acumuladores por barrio
    type Acc = { count: number; sumPrice: number; sumUnitPrice: number; validUnit: number; };
    const accById = new Map<string, Acc>();

    // Filtro por operación (normalizando sale/rent)
    const filtered = opts.filterOperation === 'all'
      ? pisos
      : pisos.filter(p => {
          const raw = (p.operation ?? '').toString().toLowerCase();
          const norm = raw === 'sale' ? 'venta' : raw === 'rent' ? 'alquiler' : raw;
          return norm === opts.filterOperation;
        });

    // Asigna cada piso al primer polígono candidato (bbox) que lo contenga (PIP)
    for (const p of filtered) {
      const xy = this.getLngLat(p);
      if (!xy) continue;

      const [x, y] = xy;
      const pt = turfPoint(xy);

      for (const it of index) {
        const [minX, minY, maxX, maxY] = it.bbox;
        if (x < minX || x > maxX || y < minY || y > maxY) continue;

        const geom = it.feat.geometry as PolyGeom;
        if (!geom) continue;

        // evita asignar puntos exactamente en la frontera
        if (booleanPointInPolygon(pt, geom, { ignoreBoundary: true })) {
          const bid = it.id;
          const acc = accById.get(bid) ?? { count: 0, sumPrice: 0, sumUnitPrice: 0, validUnit: 0 };
          acc.count += 1;

          const price = this.getNum(p[opts.priceField] as any);
          const size  = this.getNum(p[opts.sizeField] as any);
          if (price) acc.sumPrice += price;
          if (price && size) { acc.sumUnitPrice += (price / size); acc.validUnit += 1; }

          accById.set(bid, acc);
          break; // asignado
        }
      }
    }

    // Construimos salida con métrica seleccionada
    const outFeatures: Feature<PolyGeom>[] = polys.features.map((feat) => {
      const bid = String((feat.properties?.[idField] ?? feat.id ?? 'NA'));
      const acc = accById.get(bid);

      let value = 0;
      if (acc) {
        switch (opts.metric) {
          case 'avgPrice':     value = acc.count ? acc.sumPrice / acc.count : 0; break;
          case 'avgUnitPrice': value = acc.validUnit ? acc.sumUnitPrice / acc.validUnit : 0; break;
          case 'count':
          default:             value = acc.count; break;
        }
      }

      const props = {
        ...(feat.properties ?? {}),
        _count: acc?.count ?? 0,
        _avgPrice: acc && acc.count ? acc.sumPrice / acc.count : 0,
        _avgUnitPrice: acc && acc.validUnit ? acc.sumUnitPrice / acc.validUnit : 0,
        value, // <- campo usado para pintar
      };

      return { type: 'Feature', properties: props, geometry: feat.geometry as PolyGeom };
    });

    return { type: 'FeatureCollection', features: outFeatures };
  }

  /** --------- FALLBACK A GRID (por si no hay barrios aún) --------- */
  private buildGridFallback(pisos: Propiedad[]): FeatureCollection<Polygon> {
    const pts = pisos.map(p => this.getLngLat(p)).filter((p): p is [number, number] => !!p);
    if (!pts.length) return { type: 'FeatureCollection', features: [] };

    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    for (const [lon, lat] of pts) {
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }

    const latMiddle = (minLat + maxLat) / 2;
    const degPerKm = 1 / 111;
    const cellKm = 0.4;
    const cellLat = cellKm * degPerKm;
    const cellLon = cellKm * degPerKm / Math.cos((latMiddle * Math.PI) / 180);

    const cols = Math.max(1, Math.ceil((maxLon - minLon) / cellLon));
    const rows = Math.max(1, Math.ceil((maxLat - minLat) / cellLat));

    const counts = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
    for (const [lon, lat] of pts) {
      const i = Math.min(cols - 1, Math.max(0, Math.floor((lon - minLon) / cellLon)));
      const j = Math.min(rows - 1, Math.max(0, Math.floor((lat - minLat) / cellLat)));
      counts[j][i] += 1;
    }

    const features: Feature<Polygon>[] = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const value = counts[j][i];
        if (value === 0) continue;
        const lon0 = minLon + i * cellLon;
        const lat0 = minLat + j * cellLat;
        const lon1 = lon0 + cellLon;
        const lat1 = lat0 + cellLat;

        features.push({
          type: 'Feature',
          properties: { i, j, value },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [lon0, lat0], [lon1, lat0], [lon1, lat1], [lon0, lat1], [lon0, lat0]
            ]]
          }
        });
      }
    }

    return { type: 'FeatureCollection', features };
  }

  // ---------------- utilidades ----------------

  private getLngLat(p: any): [number, number] | undefined {
    const lonRaw = p.lon ?? p.lng ?? p.longitude ?? p.location?.lng ?? p.location?.lon;
    const latRaw = p.lat ?? p.latitude ?? p.location?.lat ?? p.location2?.lat;

    let lon = this.asNum(lonRaw);
    let lat = this.asNum(latRaw);
    if (lon === undefined || lat === undefined) return undefined;

    // 1) Rango básico
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return undefined;

    // 2) Si tenemos extent, comprobamos dentro/fuera
    if (this.extent) {
      const ok = this.isInsideBBox([lon, lat], this.extent);
      if (!ok) {
        // Probar invertido
        if (this.isInsideBBox([lat, lon], this.extent)) {
          return [lat, lon]; // swap
        }
      }
    }

    // 3) Heurística extra (España ~ lon [-10,5], lat [35,45])
    if ((Math.abs(lon) <= 10 && Math.abs(lat) <= 90) === false) {
      const a = [lat, lon] as [number, number];
      if (!this.extent || this.isInsideBBox(a, this.extent)) return a;
    }

    return [lon, lat];
  }

  private getNum(v: any): number | undefined {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  }

  private quantiles(values: number[], probs: number[]): number[] {
    const v = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (v.length === 0) return [];
    const out: number[] = [];
    for (const p of probs) {
      const idx = (v.length - 1) * p;
      const lo = Math.floor(idx), hi = Math.ceil(idx);
      const h = idx - lo;
      const q = hi >= v.length ? v[v.length - 1] : v[lo] * (1 - h) + v[hi] * h;
      out.push(q);
    }
    return out;
  }

  private buildStepExpression(values: number[]): any[] {
    const v = values.filter(Number.isFinite);
    if (v.length === 0) return ['literal', '#cfd8dc']; // gris claro
    const min = Math.min(...v), max = Math.max(...v);
    if (min === max) return ['literal', '#9ecae1'];

    const raw = this.quantiles(v, [0.2, 0.4, 0.6, 0.8]);
    const eps = 1e-9;
    const th: number[] = [];
    for (const t of raw.sort((a, b) => a - b)) {
      if (!Number.isFinite(t)) continue;
      if (th.length === 0 || t > th[th.length - 1] + eps) th.push(t);
    }
    const palette = ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#3182bd'];
    const base = palette[0];
    const colors = palette.slice(0, Math.min(th.length + 1, palette.length));

    const expr: any[] = ['step', ['get', 'value'], base];
    for (let i = 0; i < th.length && i + 1 < colors.length; i++) {
      expr.push(th[i], colors[i + 1]);
    }
    return expr;
  }

  private asNum(v: any): number | undefined {
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
    if (v == null) return undefined;
    const n = Number(String(v).trim().replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }

  private isInsideBBox([lon, lat]: [number, number],
                       [minX, minY, maxX, maxY]: [number, number, number, number]) {
    return lon >= minX && lon <= maxX && lat >= minY && lat <= maxY;
  }

  private computeBBox(geom: PolyGeom): [number, number, number, number] {
    let minX =  Infinity, minY =  Infinity, maxX = -Infinity, maxY = -Infinity;

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

    scan(geom.type === 'Polygon' ? geom.coordinates : geom.coordinates);
    return [minX, minY, maxX, maxY];
  }

  private buildIndexFromPolys(idField: string) {
    const feats = this.barrioPolys?.features ?? [];
    const boxes: Array<{ feat: Feature<PolyGeom>, bbox: [number, number, number, number], id: string }> = [];

    let minX =  Infinity, minY =  Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const feat of feats) {
      const geom = feat.geometry as PolyGeom;
      if (!geom) continue;
      const b = this.computeBBox(geom);
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
}
