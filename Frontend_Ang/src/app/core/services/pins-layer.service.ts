import { Injectable, OnDestroy } from '@angular/core';
import maplibregl from 'maplibre-gl';
import { MapService } from './map.service';
import { Propiedad } from '../models/propiedad.model';
import { PopupPropiedadService } from './popup-propiedad.service';

type LngLat = [number, number];

export interface PinsOptions {
  sizePx?: number;
  colorByOperation?: boolean;
  rentColor?: string;
  saleColor?: string;
  fallbackColor?: string;
  showPopupOnClick?: boolean;
  popupBuilder?: (p: Propiedad) => string | HTMLElement;
  popupOffsetY?: number;
  hoverScale?: number;
  selectedScale?: number;
  zIndexBase?: number;
}

type PinData = {
  propiedad: Propiedad;
  coord: LngLat;
};

@Injectable({ providedIn: 'root' })
export class PinsLayerService implements OnDestroy {
  private map?: maplibregl.Map;

  private readonly sourceId = 'pins-source';
  private readonly layerId = 'pins-layer';

  private options: Required<PinsOptions> = {
    sizePx: 34,
    colorByOperation: true,
    rentColor: '#22c55e',
    saleColor: '#3b82f6',
    fallbackColor: '#9ca3af',
    showPopupOnClick: true,
    popupBuilder: (p) => this.defaultPopupHTML(p),
    popupOffsetY: 14,
    hoverScale: 1.08,
    selectedScale: 1.2,
    zIndexBase: 10,
  };

  private visible = true;
  private selectedId?: string;

  // Mantenemos datos mínimos para cada pin
  private dataById = new Map<string, PinData>();
  private attached = false;

  constructor(
    private readonly mapSvc: MapService,
    private readonly popupSvc: PopupPropiedadService,
  ) {}

  // Se llama desde el MapLayerManager en el init
  attach(map?: maplibregl.Map) {
    this.map = map ?? (this.mapSvc as any).getMap?.() ?? this.map;
    if (!this.map || this.attached) return;

    // 1) Fuente GeoJSON vacía
    if (!this.map.getSource(this.sourceId)) {
      this.map.addSource(this.sourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      } as any);
    }

    // 2) Capa de círculos (de momento; luego podemos pasar a symbol + iconos)
    if (!this.map.getLayer(this.layerId)) {
      this.map.addLayer({
        id: this.layerId,
        type: 'symbol',
        source: this.sourceId,
        layout: {
          'icon-image': [
            'case',
            ['==', ['get', 'operation'], 'rent'], 'pin-rent',
            ['==', ['get', 'operation'], 'sale'], 'pin-sale',
            'pin-sale'
          ],
          'icon-size': 0.9,
          'icon-allow-overlap': true,
        },
      } as any);
    }

    // Eventos de interacción
    this.map.on('click', this.layerId, this.handleClick);
    this.map.on('mouseenter', this.layerId, this.handleMouseEnter);
    this.map.on('mouseleave', this.layerId, this.handleMouseLeave);

    this.attached = true;
    this.syncLayerStyle();
  }

  ngOnDestroy() {
    this.clear();
  }

  clear() {
    if (!this.map) return;

    if (this.map.getLayer(this.layerId)) {
      this.map.off('click', this.layerId, this.handleClick);
      this.map.off('mouseenter', this.layerId, this.handleMouseEnter);
      this.map.off('mouseleave', this.layerId, this.handleMouseLeave);
      this.map.removeLayer(this.layerId);
    }
    if (this.map.getSource(this.sourceId)) {
      this.map.removeSource(this.sourceId);
    }

    this.dataById.clear();
    this.selectedId = undefined;
    this.attached = false;
    this.mapSvc.cerrarPopup?.();
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    if (!this.map || !this.map.getLayer(this.layerId)) return;
    this.map.setLayoutProperty(this.layerId, 'visibility', visible ? 'visible' : 'none');
  }

  // Sobrecarga como ya tenías: render(map, pisos, opts) o render(pisos, opts)
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

    // Guardamos todos los pisos en el mapa interno
    this.dataById.clear();
    for (const p of pisos ?? []) {
      const id = (p as any).propertyCode as string;
      if (!id) continue;
      const coord = this.getLngLat(p);
      if (!coord) continue;
      this.dataById.set(id, { propiedad: p, coord });
    }

    // Actualizamos la fuente GeoJSON a partir de dataById
    this.rebuildSourceFromData();
    this.syncLayerStyle();
    this.setVisible(this.visible);
  }

  setData(pisos: Propiedad[], opts?: PinsOptions) {
    this.render(pisos, opts);
  }

  // ========= Métodos usados por otros componentes =========

  // Para saber si un pin ya está pintado (favoritos)
  hasPin(propertyCode: string): boolean {
    return this.dataById.has(propertyCode);
  }

  // Añadir un único pin (por ejemplo desde el drawer de favoritos)
  addOne(
    p: Propiedad | any,
    options?: { fly?: boolean; zoom?: number; openPopup?: boolean },
  ): boolean {
    if (!this.map) return false;

    const id = (p as any).propertyCode as string;
    if (!id) return false;

    // Si ya existe, opcionalmente solo hacemos focus
    if (this.dataById.has(id)) {
      if (options?.fly) {
        this.focusOn(id, options.zoom, options.openPopup ?? false);
      }
      return false;
    }

    const coord = this.getLngLat(p as Propiedad);
    if (!coord) return false;

    this.dataById.set(id, {
      propiedad: p as Propiedad,
      coord,
    });

    this.rebuildSourceFromData();

    if (options?.fly) {
      this.focusOn(id, options.zoom, options.openPopup ?? false);
    }

    return true;
  }

  // Sigue existiendo para favoritos, etc.
  setSelected(propertyCode?: string) {
    this.selectedId = propertyCode;
    this.syncLayerStyle();
  }

  focusOn(propertyCode: string, zoom?: number, withPopup = true) {
    if (!this.map) return;
    const rec = this.dataById.get(propertyCode);
    if (!rec) return;

    const [lng, lat] = rec.coord;
    this.map.easeTo({
      center: rec.coord,
      zoom: zoom ?? Math.max(this.map.getZoom(), 14),
    });

    if (withPopup && this.options.showPopupOnClick) {
      const isDark =
        document.documentElement.classList.contains('dark') ||
        document.body.classList.contains('dark');
      this.popupSvc.open(rec.propiedad, [lng, lat], isDark);
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

  // ========= Reconstruir fuente GeoJSON a partir de dataById =========

  private rebuildSourceFromData() {
    if (!this.map) return;
    const src = this.map.getSource(this.sourceId) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    const features: any[] = [];
    for (const [id, rec] of this.dataById.entries()) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: rec.coord,
        },
        properties: {
          id,
          operation: rec.propiedad.operation,
        },
      });
    }

    src.setData({
      type: 'FeatureCollection',
      features,
    } as any);
  }

  // ========= Eventos de mapa =========

  private handleClick = (e: any) => {
    if (!this.map || !e.features?.length) return;
    const f = e.features[0];
    const id: string | undefined = f.properties?.id;
    if (!id) return;

    this.setSelected(id);
    this.focusOn(id, undefined, true);
  };

  private handleMouseEnter = () => {
    if (!this.map) return;
    this.map.getCanvas().style.cursor = 'pointer';
  };

  private handleMouseLeave = () => {
    if (!this.map) return;
    this.map.getCanvas().style.cursor = '';
  };

  // ========= Estilo de la capa (color + seleccionado) =========

  private syncLayerStyle() {
    if (!this.map || !this.map.getLayer(this.layerId)) return;

    const sizeExpr: any = this.selectedId
      ? [
          'case',
          ['==', ['get', 'id'], this.selectedId],
          1.1,  
          0.9,  
        ]
      : 0.9;
    this.map.setLayoutProperty(this.layerId, 'icon-size', sizeExpr);
  }

  // ========= Utilidades =========

  private getLngLat(p: Propiedad): LngLat | null {
    const lat = Number(p.latitude ?? (p as any).lat ?? p.location?.lat);
    const lon = Number(
      p.longitude ??
        (p as any).lng ??
        (p as any).lon ??
        p.location?.lng ??
        p.location?.lon,
    );
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return [lon, lat];
  }

  // Popup HTML de fallback (por si algún día quieres usar popupBuilder)
  private defaultPopupHTML(p: Propiedad) {
    const precio = (p.price ?? 0).toLocaleString('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    });
    const tam = p.size ? `${p.size} m²` : '';
    const dir = [p.address, p.neighborhood, p.district, p.city]
      .filter(Boolean)
      .join(' · ');
    const tipo =
      p.operation === 'rent'
        ? 'Alquiler'
        : p.operation === 'sale'
        ? 'Venta'
        : '—';
    const url = p.url ?? '#';

    return `
      <div class="popup-propiedad">
        <div class="header">
          <div class="precio">${precio}</div>
          <div class="tipo">${tipo}${tam ? ' · ' + tam : ''}</div>
        </div>
        <div class="direccion">${dir}</div>
        ${
          url !== '#'
            ? `<a class="link" href="${url}" target="_blank" rel="noopener">Ver anuncio</a>`
            : ''
        }
      </div>
    `;
  }
}
