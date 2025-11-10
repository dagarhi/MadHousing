import { Injectable, OnDestroy } from '@angular/core';
import maplibregl, { Marker, Popup } from 'maplibre-gl';
import { MapService } from './map.service';
import { Propiedad } from '../models/propiedad.model'; 

type LngLat = [number, number];

export interface PinsOptions {
  /** Tamaño de la chincheta en px */
  sizePx?: number;
  /** Colorear según operation ('rent'/'sale') */
  colorByOperation?: boolean;
  /** Color para 'rent' (si colorByOperation=true) */
  rentColor?: string;
  /** Color para 'sale' (si colorByOperation=true) */
  saleColor?: string;
  /** Color por defecto si falta operation o no quieres por operación */
  fallbackColor?: string;
  /** Mostrar popup al click (por defecto true) */
  showPopupOnClick?: boolean;
  /** Builder opcional del contenido del popup (string o HTMLElement) */
  popupBuilder?: (p: Propiedad) => string | HTMLElement;
  /** Offset vertical del popup (subirlo para no tapar el marker) */
  popupOffsetY?: number;
  /** Elevar chincheta en hover/selección (escala) */
  hoverScale?: number;
  selectedScale?: number;
  /** Z-index base para markers */
  zIndexBase?: number;
}

type MarkerRecord = {
  marker: Marker;
  propiedad: Propiedad;
  element: HTMLElement;
};

@Injectable({ providedIn: 'root' })
export class PinsLayerService implements OnDestroy {
  private map?: maplibregl.Map;

  private options: Required<PinsOptions> = {
    sizePx: 34,
    colorByOperation: true,
    rentColor: '#22c55e',   // green
    saleColor: '#3b82f6',   // blue
    fallbackColor: '#9ca3af', // gray-400
    showPopupOnClick: true,
    popupBuilder: (p) => this.defaultPopupHTML(p),
    popupOffsetY: 14,
    hoverScale: 1.1,
    selectedScale: 1.2,
    zIndexBase: 10,
  };

  private markersById = new Map<string, MarkerRecord>();
  private visible = true;

  private activePopup?: Popup;
  private selectedId?: string;

  constructor(private readonly mapSvc: MapService) {}

  /** Conecta con el mapa existente */
  attach(map?: maplibregl.Map) {
    this.map = map ?? (this.mapSvc as any).getMap?.() ?? this.map;
  }

  /** Libera todo */
  ngOnDestroy() {
    this.clear();
  }

  /** Limpia marcadores y popups */
  clear() {
    this.closePopup();
    for (const rec of this.markersById.values()) {
      rec.marker.remove();
    }
    this.markersById.clear();
    this.selectedId = undefined;
  }

  /** Mostrar/ocultar sin destruir */
  setVisible(visible: boolean) {
    this.visible = visible;
    for (const rec of this.markersById.values()) {
      rec.element.style.display = visible ? 'block' : 'none';
    }
    if (!visible) this.closePopup();
  }

  /** Render inicial o actualización incremental */
  render(pisos: Propiedad[], opts: PinsOptions = {}) {
    this.attach();
    if (!this.map) return;

    // merge opciones
    this.options = { ...this.options, ...opts };

    const incomingIds = new Set<string>();
    for (const p of pisos) {
      const id = p.propertyCode;
      if (!id) continue;
      const ll = this.getLngLat(p);
      if (!ll) continue;

      incomingIds.add(id);

      const existing = this.markersById.get(id);
      if (existing) {
        // Actualiza posición / datos si cambian
        existing.marker.setLngLat(ll);
        existing.propiedad = p;
        // (podrías actualizar color/HTML si cambia operation/estado)
        this.updateMarkerAppearance(existing);
      } else {
        const rec = this.createMarker(p, ll);
        this.markersById.set(id, rec);
      }
    }

    // elimina los que ya no están
    for (const [id, rec] of this.markersById) {
      if (!incomingIds.has(id)) {
        rec.marker.remove();
        this.markersById.delete(id);
      }
    }

    // respeta visibilidad actual
    this.setVisible(this.visible);
  }

  /** Reemplaza todos los datos (atajo a render) */
  setData(pisos: Propiedad[], opts?: PinsOptions) {
    this.render(pisos, opts);
  }

  /** Resalta uno (y des-resalta el anterior) */
  setSelected(propertyCode?: string) {
    const prev = this.selectedId && this.markersById.get(this.selectedId);
    if (prev) this.applyScale(prev.element, 1);
    this.selectedId = propertyCode;

    const next = propertyCode && this.markersById.get(propertyCode);
    if (next) this.applyScale(next.element, this.options.selectedScale);
  }

  /** Hace zoom/center al marker */
  focusOn(propertyCode: string, zoom?: number, withPopup = true) {
    if (!this.map) return;
    const rec = this.markersById.get(propertyCode);
    if (!rec) return;
    this.map.easeTo({ center: rec.marker.getLngLat(), zoom: zoom ?? Math.max(this.map.getZoom(), 14) });
    if (withPopup && this.options.showPopupOnClick) {
      this.openPopup(rec);
    }
  }

  /** Ajusta el mapa para ver todas las chinchetas */
  fitToMarkers(padding: number | { top: number; bottom: number; left: number; right: number } = 40) {
    if (!this.map) return;
    const bounds = new maplibregl.LngLatBounds();
    let count = 0;
    for (const rec of this.markersById.values()) {
      bounds.extend(rec.marker.getLngLat());
      count++;
    }
    if (count > 0) {
      this.map.fitBounds(bounds, { padding, duration: 600 });
    }
  }

  // ============ Internos ============

  private createMarker(p: Propiedad, ll: LngLat): MarkerRecord {
    const color = this.getColor(p);
    const el = this.buildMarkerElement(this.options.sizePx, color);

    // interacciones
    el.addEventListener('mouseenter', () => this.applyScale(el, this.options.hoverScale));
    el.addEventListener('mouseleave', () => {
      const scale = (this.selectedId && this.selectedId === p.propertyCode) ? this.options.selectedScale : 1;
      this.applyScale(el, scale);
    });
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.setSelected(p.propertyCode);
      if (this.options.showPopupOnClick) {
        const rec = this.markersById.get(p.propertyCode!);
        if (rec) this.openPopup(rec);
      }
    });

    const marker = new maplibregl.Marker({
      element: el,
      anchor: 'bottom'
    })
      .setLngLat(ll)
      .addTo(this.map!);

    // z-index consistente
    (marker as any)._element.style.zIndex = String(this.options.zIndexBase);

    return { marker, propiedad: p, element: el };
  }

  private updateMarkerAppearance(rec: MarkerRecord) {
    const color = this.getColor(rec.propiedad);
    const size = this.options.sizePx;
    rec.element.innerHTML = this.getMarkerSVG(color, size);
  }

  private getColor(p: Propiedad): string {
    if (this.options.colorByOperation) {
      if (p.operation === 'rent') return this.options.rentColor;
      if (p.operation === 'sale') return this.options.saleColor;
    }
    return this.options.fallbackColor;
  }

  private applyScale(el: HTMLElement, scale: number) {
    el.style.transform = `translate(-50%, -100%) scale(${scale})`; // anchor bottom
    el.style.transition = 'transform 120ms ease';
  }

  private openPopup(rec: MarkerRecord) {
    this.closePopup();

    const content = this.options.popupBuilder?.(rec.propiedad);
    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      offset: [0, -this.options.popupOffsetY]
    });

    if (typeof content === 'string') {
      popup.setHTML(content);
    } else if (content instanceof HTMLElement) {
      popup.setDOMContent(content);
    } else {
      popup.setHTML(this.defaultPopupHTML(rec.propiedad));
    }

    popup.setLngLat(rec.marker.getLngLat()).addTo(this.map!);
    this.activePopup = popup;
  }

  private closePopup() {
    if (this.activePopup) {
      this.activePopup.remove();
      this.activePopup = undefined;
    }
  }

  private getLngLat(p: Propiedad): LngLat | null {
    const lat = Number(
      p.latitude ?? (p as any).lat ?? p.location?.lat
    );
    const lon = Number(
      p.longitude ?? (p as any).lng ?? (p as any).lon ?? p.location?.lng ?? p.location?.lon
    );
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return [lon, lat];
  }

  private buildMarkerElement(size: number, color: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'custom-pin';
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.transform = 'translate(-50%, -100%)'; // anchor bottom
    el.style.willChange = 'transform';
    el.innerHTML = this.getMarkerSVG(color, size);
    return el;
  }

  /** SVG simple con sombra y “ojo” blanco */
  private getMarkerSVG(color: string, size: number) {
    // Nota: viewBox 40x40; la punta toca el borde inferior
    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true" focusable="false">
        <defs>
          <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity=".35"/>
          </filter>
        </defs>
        <path d="M20 37s-11-11.5-11-19C9 8.5 13.9 4 20 4s11 4.5 11 14c0 7.5-11 19-11 19z"
              fill="${color}" filter="url(#shadow)"/>
        <circle cx="20" cy="17" r="4.5" fill="#ffffff"/>
      </svg>`;
  }

  private defaultPopupHTML(p: Propiedad) {
    const precio = (p.price ?? 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
    const tam = p.size ? `${p.size} m²` : '';
    const dir = [p.address, p.neighborhood, p.district, p.city].filter(Boolean).join(' · ');
    const tipo = p.operation === 'rent' ? 'Alquiler' : p.operation === 'sale' ? 'Venta' : '—';
    const url = p.url ?? '#';
    return `
      <div class="popup-propiedad">
        <div class="row-1">
          <strong>${precio}</strong>
          <span>${tam}</span>
        </div>
        <div class="row-2">${dir}</div>
        <div class="row-3">${tipo}</div>
        <div class="row-4">
          <a href="${url}" target="_blank" rel="noopener">Ver anuncio</a>
        </div>
      </div>
    `;
  }
}
