import { Injectable, OnDestroy } from '@angular/core';
import maplibregl from 'maplibre-gl';
import { MapService } from './map.service';
import { Propiedad } from '../models/propiedad.model';
import { PopupPropiedadService } from './popup-propiedad.service';
import { MapLayer } from './map-layer.interface';

type LngLat = [number, number];

export interface PinsOptions {
  colorByOperation?: boolean;
  showPopupOnClick?: boolean;
  popupBuilder?: (p: Propiedad) => string | HTMLElement;
}

type PinData = {
  propiedad: Propiedad;
  coord: LngLat;
};

/** Sentinel used in `icon-size` expressions when no pin is hovered/selected. */
const NO_ID = '__no_pin__';

/**
 * Cross-fade entre puntos (low zoom) y iconos (high zoom).
 * Por debajo de ZOOM_FADE_MIN solo se ven los dots; por encima de
 * ZOOM_FADE_MAX solo los iconos; entre medias, ambos con opacidad lineal.
 */
const ZOOM_FADE_MIN = 13;
const ZOOM_FADE_MAX = 15;

/**
 * Colores de los dots por tipo de operación.
 * Elegidos para no chocar con las capas POI:
 *  - Rent: emerald-600, más oscuro que parques (#4ade80) y que bici (#14b8a6).
 *  - Sale: fuchsia-600, desplazado de comercio (#a855f7) hacia magenta.
 * Mantienen familia de color con los PNG (verde/violeta) para que el
 * cross-fade zoom↔icono se vea continuo.
 */
const DOT_COLOR_RENT = '#059669';
const DOT_COLOR_SALE = '#c026d3';

@Injectable({ providedIn: 'root' })
export class PinsLayerService implements OnDestroy, MapLayer {
  readonly id = 'pins';
  readonly zIndex = 30;

  private map?: maplibregl.Map;

  private readonly sourceId = 'pins-source';
  readonly layerId = 'pins-layer';
  private readonly dotLayerId = 'pins-dot-layer';

  private options: Required<Pick<PinsOptions, 'colorByOperation' | 'showPopupOnClick'>> & {
    popupBuilder: (p: Propiedad) => string | HTMLElement;
  } = {
    colorByOperation: true,
    showPopupOnClick: true,
    popupBuilder: (p) => this.defaultPopupHTML(p),
  };

  private visible = true;
  private hoveredId?: string;
  private selectedId?: string;
  private popupSuppressed = false;

  private dataById = new Map<string, PinData>();
  private attached = false;
  private lastPopupPropertyCode?: string;

  constructor(
    private readonly mapSvc: MapService,
    private readonly popupSvc: PopupPropiedadService,
  ) {}

  attach(map?: maplibregl.Map) {
    this.map = map ?? this.mapSvc.getMap() ?? this.map;
    if (!this.map) return;

    const hasSource = !!this.map.getSource(this.sourceId);
    const hasLayer = !!this.map.getLayer(this.layerId);
    const hasDotLayer = !!this.map.getLayer(this.dotLayerId);

    if (this.attached && (!hasSource || !hasLayer || !hasDotLayer)) {
      this.detachHandlers();
      if (hasLayer) { try { this.map.removeLayer(this.layerId); } catch { } }
      if (hasDotLayer) { try { this.map.removeLayer(this.dotLayerId); } catch { } }
      if (hasSource) { try { this.map.removeSource(this.sourceId); } catch { } }
      this.attached = false;
    }

    if (this.attached) return;

    if (!this.map.getSource(this.sourceId)) {
      this.map.addSource(this.sourceId, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }

    // Dots: visibles al alejar. Se añaden primero para que en la zona de
    // transición los iconos (que entran encima) queden por arriba.
    if (!this.map.getLayer(this.dotLayerId)) {
      this.map.addLayer({
        id: this.dotLayerId,
        type: 'circle',
        source: this.sourceId,
        paint: {
          'circle-color': [
            'match', ['get', 'operation'],
            'rent', DOT_COLOR_RENT,
            'sale', DOT_COLOR_SALE,
            DOT_COLOR_SALE,
          ],
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            8, 2.5,
            12, 3.5,
            14, 4.5,
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
          'circle-opacity': [
            'interpolate', ['linear'], ['zoom'],
            ZOOM_FADE_MIN, 1,
            ZOOM_FADE_MAX, 0,
          ],
          'circle-stroke-opacity': [
            'interpolate', ['linear'], ['zoom'],
            ZOOM_FADE_MIN, 1,
            ZOOM_FADE_MAX, 0,
          ],
        },
      });
    }

    if (!this.map.getLayer(this.layerId)) {
      this.map.addLayer({
        id: this.layerId,
        type: 'symbol',
        source: this.sourceId,
        layout: {
          'icon-image': [
            'match', ['get', 'operation'],
            'rent', 'pin-rent',
            'sale', 'pin-sale',
            'pin-sale',
          ],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-anchor': 'bottom',
          'icon-size': this.buildSizeExpr(),
        },
        paint: {
          'icon-opacity': [
            'interpolate', ['linear'], ['zoom'],
            ZOOM_FADE_MIN, 0,
            ZOOM_FADE_MAX, 1,
          ],
        },
      });
    }

    this.attachHandlers();
    this.attached = true;

    // Re-push cached data so style reloads restore pins automatically.
    if (this.dataById.size > 0) this.rebuildSourceFromData();
  }

  detach() {
    if (!this.map || !this.attached) return;
    this.detachHandlers();
    if (this.map.getLayer(this.layerId)) {
      try { this.map.removeLayer(this.layerId); } catch { }
    }
    if (this.map.getLayer(this.dotLayerId)) {
      try { this.map.removeLayer(this.dotLayerId); } catch { }
    }
    if (this.map.getSource(this.sourceId)) {
      try { this.map.removeSource(this.sourceId); } catch { }
    }
    this.attached = false;
  }

  ngOnDestroy() {
    this.clear();
  }

  clear() {
    this.detach();
    this.dataById.clear();
    this.selectedId = undefined;
    this.hoveredId = undefined;
    this.mapSvc.cerrarPopup?.();
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    if (!this.map) return;
    for (const id of [this.layerId, this.dotLayerId]) {
      if (this.map.getLayer(id)) {
        this.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      }
    }
  }

  /** When true, clicking a pin does not open its popup (used by route mode). */
  setPopupSuppressed(suppressed: boolean) {
    this.popupSuppressed = suppressed;
  }

  render(map: maplibregl.Map, pisos: Propiedad[], opts?: PinsOptions): void;
  render(pisos: Propiedad[], opts?: PinsOptions): void;
  render(a: any, b?: any, c?: any): void {
    const isMapFirst = a && typeof a === 'object' && typeof a.addLayer === 'function';
    const map = isMapFirst ? (a as maplibregl.Map) : undefined;
    const pisos: Propiedad[] = isMapFirst ? (b as Propiedad[] ?? []) : (a as Propiedad[] ?? []);
    const opts: PinsOptions = (isMapFirst ? c : b) ?? {};

    this.attach(map);
    if (!this.map) return;

    this.mapSvc.cerrarPopup();
    this.options = { ...this.options, ...opts };

    this.dataById.clear();
    for (const p of pisos ?? []) {
      const id = p.propertyCode;
      if (!id) continue;
      const coord = this.getLngLat(p);
      if (!coord) continue;
      this.dataById.set(id, { propiedad: p, coord });
    }

    this.rebuildSourceFromData();
    this.setVisible(this.visible);
  }

  setData(pisos: Propiedad[], opts?: PinsOptions) {
    this.render(pisos, opts);
  }

  hasPin(propertyCode: string): boolean {
    return this.dataById.has(propertyCode);
  }

  addOne(
    p: Propiedad,
    options?: { fly?: boolean; zoom?: number; openPopup?: boolean },
  ): boolean {
    if (!this.map) return false;

    const id = p.propertyCode;
    if (!id) return false;

    if (this.dataById.has(id)) {
      if (options?.fly) {
        this.focusOn(id, options.zoom, options.openPopup ?? false);
      }
      return false;
    }

    const coord = this.getLngLat(p);
    if (!coord) return false;

    this.dataById.set(id, { propiedad: p, coord });
    this.rebuildSourceFromData();

    if (options?.fly) {
      this.focusOn(id, options.zoom, options.openPopup ?? false);
    }
    return true;
  }

  setSelected(propertyCode?: string) {
    if (this.selectedId === propertyCode) return;
    this.selectedId = propertyCode;
    this.refreshSizeExpr();
  }

  focusOn(propertyCode: string, zoom?: number, withPopup = true) {
    if (!this.map) return;
    const rec = this.dataById.get(propertyCode);
    if (!rec) return;

    const [lng, lat] = rec.coord;

    this.map.easeTo({
      center: rec.coord,
      zoom: zoom ?? Math.max(this.map.getZoom(), ZOOM_FADE_MAX),
      duration: 600,
    });

    if (withPopup && this.options.showPopupOnClick) {
      const samePin = this.lastPopupPropertyCode === propertyCode;
      const popupOpen = this.mapSvc.hasActivePopup();

      if (samePin && popupOpen) {
        this.mapSvc.cerrarPopup();
        return;
      }
      const isDark =
        document.documentElement.getAttribute('data-theme') === 'dark';

      // Guard against the auto-close fired when opening another pin's popup:
      // only clear selection if this specific pin is still the selected one.
      const pinId = propertyCode;
      this.popupSvc.open(rec.propiedad, [lng, lat], isDark, () => {
        if (this.selectedId === pinId) {
          this.selectedId = undefined;
          this.refreshSizeExpr();
        }
        if (this.lastPopupPropertyCode === pinId) {
          this.lastPopupPropertyCode = undefined;
        }
      });
      this.lastPopupPropertyCode = propertyCode;
    }
  }

  fitToMarkers(
    padding: number | { top: number; bottom: number; left: number; right: number } = 40,
  ) {
    if (!this.map || this.dataById.size === 0) return;

    const bounds = new maplibregl.LngLatBounds();
    for (const rec of this.dataById.values()) {
      bounds.extend(rec.coord);
    }
    this.map.fitBounds(bounds, { padding, duration: 600 });
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private attachHandlers() {
    if (!this.map) return;
    for (const id of [this.layerId, this.dotLayerId]) {
      this.map.on('click', id, this.handleClick);
      this.map.on('mousemove', id, this.handleMouseMove);
      this.map.on('mouseleave', id, this.handleMouseLeave);
    }
  }

  private detachHandlers() {
    if (!this.map) return;
    for (const id of [this.layerId, this.dotLayerId]) {
      this.map.off('click', id, this.handleClick);
      this.map.off('mousemove', id, this.handleMouseMove);
      this.map.off('mouseleave', id, this.handleMouseLeave);
    }
  }

  private rebuildSourceFromData() {
    if (!this.map) return;
    const src = this.map.getSource(this.sourceId) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    const features: any[] = [];
    for (const [id, rec] of this.dataById.entries()) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: rec.coord },
        properties: { id, operation: rec.propiedad.operation },
      });
    }

    src.setData({ type: 'FeatureCollection', features });
  }

  private handleClick = (e: any) => {
    if (!this.map || !e.features?.length) return;
    if (this.popupSuppressed) return;
    const f = e.features[0];
    const id: string | undefined = f.properties?.id;
    if (!id) return;

    this.setSelected(id);
    this.focusOn(id, undefined, true);
  };

  private handleMouseMove = (e: any) => {
    if (!this.map || !e.features?.length) return;
    const id: string | undefined = e.features[0].properties?.id;
    if (!id || id === this.hoveredId) return;
    this.hoveredId = id;
    this.refreshSizeExpr();
    this.map.getCanvas().style.cursor = 'pointer';
  };

  private handleMouseLeave = () => {
    if (!this.map) return;
    this.map.getCanvas().style.cursor = '';
    if (this.hoveredId !== undefined) {
      this.hoveredId = undefined;
      this.refreshSizeExpr();
    }
  };

  /**
   * Zoom-interpolated icon size, with per-feature hover / selected multipliers.
   * Layout properties can't read `feature-state`, so we compare `['get', 'id']`
   * to the currently-hovered/selected IDs and rebuild the expression when they
   * change. MapLibre allows only one zoom-based `interpolate` per property, so
   * the id-branching lives inside each stop.
   */
  private buildSizeExpr(): any {
    const hId = this.hoveredId ?? NO_ID;
    const sId = this.selectedId ?? NO_ID;
    const stop = (base: number, hover: number, selected: number) => [
      'case',
      ['==', ['get', 'id'], sId], selected,
      ['==', ['get', 'id'], hId], hover,
      base,
    ];
    return [
      'interpolate', ['linear'], ['zoom'],
      10, stop(0.5,  0.7,  0.8),
      14, stop(1.0,  1.2,  1.4),
      18, stop(1.35, 1.6,  1.8),
    ];
  }

  private refreshSizeExpr() {
    if (!this.map || !this.map.getLayer(this.layerId)) return;
    this.map.setLayoutProperty(this.layerId, 'icon-size', this.buildSizeExpr());
  }

  private getLngLat(p: Propiedad): LngLat | null {
    const lat = Number(p.latitude ?? p.location?.lat);
    const lon = Number(p.longitude ?? p.location?.lng ?? p.location?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return [lon, lat];
  }

  private defaultPopupHTML(p: Propiedad) {
    const precio = (p.price ?? 0).toLocaleString('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    });
    const tam = p.size ? `${p.size} m²` : '';
    const dir = [p.address, p.neighborhood, p.district, p.city].filter(Boolean).join(' · ');
    const tipo = p.operation === 'rent' ? 'Alquiler' : p.operation === 'sale' ? 'Venta' : '—';
    const url = p.url ?? '#';

    return `
      <div class="popup-propiedad">
        <div class="header">
          <div class="precio">${precio}</div>
          <div class="tipo">${tipo}${tam ? ' · ' + tam : ''}</div>
        </div>
        <div class="direccion">${dir}</div>
        ${url !== '#' ? `<a class="link" href="${url}" target="_blank" rel="noopener">Ver anuncio</a>` : ''}
      </div>
    `;
  }
}
