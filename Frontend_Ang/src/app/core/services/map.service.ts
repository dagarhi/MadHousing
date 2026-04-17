import { Injectable } from '@angular/core';
import maplibregl from 'maplibre-gl';
import { Propiedad } from '../models/propiedad.model';
import { environment } from '../../../environments/environment';

type LngLatTuple = [number, number];

// --- Constants ---
const MARKER_SIZE_PX = 34;
const COLORS = {
  SALE: '#2E7D32', // Green
  RENT: '#1565C0', // Blue
  DEFAULT: '#6E6E6E', // Grey
  CHINCHETA_BG: '#FF3B30' // Red default
};

@Injectable({ providedIn: 'root' })
export class MapService {
  private map?: maplibregl.Map;
  private mapaCargado = false;

  private markers: maplibregl.Marker[] = [];
  private activePopup?: maplibregl.Popup;

  async initMap(container: HTMLElement, styleUrl?: string): Promise<void> {
    if (this.map) return;

    this.map = new maplibregl.Map({
      container,
      style: styleUrl ?? environment.mapStyleLight,
      center: [-3.7038, 40.4168],
      zoom: 12,
      maxTileCacheSize: 1000, // más tiles en caché en memoria → menos re-descargas al navegar
    });

    // Debug access
    if (typeof window !== 'undefined') {
      (window as any).map = this.map;
    }

    await new Promise<void>((resolve) => {
      this.map!.once('load', () => { this.mapaCargado = true; resolve(); });
    });
    await this.loadPinsIcons();
    this.map.resize();
  }

  getMap(): maplibregl.Map | undefined {
    return this.map;
  }

  async dibujarMapaCoropletico(pisos: Propiedad[]): Promise<void> {
    if (!this.map) return;

    if (!this.mapaCargado) {
      await new Promise<void>((resolve) => {
        this.map!.once('load', () => { this.mapaCargado = true; resolve(); });
      });
    }

    const res = await fetch('/assets/municipios_cam.geojson');
    const geojson = await res.json();

    const medias: Record<string, number> = {};
    const cuenta: Record<string, number> = {};

    for (const p of pisos) {
      const key = (p.city || p.district || p.neighborhood || 'desconocido').toLowerCase().trim();
      const s = Number(p.score_intrinseco ?? p.score ?? 0);
      if (!Number.isFinite(s)) continue;
      if (!medias[key]) { medias[key] = 0; cuenta[key] = 0; }
      medias[key] += s; cuenta[key]++;
    }
    Object.keys(medias).forEach(k => { if (cuenta[k] > 0) medias[k] /= cuenta[k]; });

    for (const f of geojson.features) {
      const nombre = String(f.properties?.NAMEUNIT ?? '').toLowerCase().trim();
      f.properties.valor = medias[nombre] ?? null;
    }

    this.clearChoroplethLayers();

    this.map.addSource('muni_cam', { type: 'geojson', data: geojson });

    this.map.addLayer({
      id: 'muni-fill', type: 'fill', source: 'muni_cam',
      paint: {
        'fill-color': [
          'interpolate', ['linear'], ['coalesce', ['get', 'valor'], 0],
          0, '#f1eef6', 40, '#bdc9e1', 60, '#74a9cf', 80, '#2b8cbe', 100, '#045a8d'
        ],
        'fill-opacity': ['case', ['==', ['get', 'valor'], null], 0.18, 0.7]
      }
    });

    this.map.addLayer({
      id: 'muni-line', type: 'line', source: 'muni_cam',
      paint: { 'line-color': '#333', 'line-width': 0.8 }
    });
  }

  setChoroplethVisible(v: boolean): void {
    if (!this.map) return;
    for (const id of ['muni-fill', 'muni-line']) {
      if (this.map.getLayer(id)) {
        this.map.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none');
      }
    }
  }

  clearChoropleth(): void {
    if (!this.map) return;
    this.clearChoroplethLayers();

    // Fallback cleanup
    const style = this.map.getStyle();
    const layerIds = (style?.layers ?? []).map(l => l.id);
    for (const id of layerIds) {
      if (/(muni|choro|coropl)/i.test(id) && this.map.getLayer(id)) {
        try { this.map.removeLayer(id); } catch { }
      }
    }
  }

  private clearChoroplethLayers() {
    if (!this.map) return;
    for (const id of ['muni-fill', 'muni-line']) {
      if (this.map.getLayer(id)) try { this.map.removeLayer(id); } catch { }
    }
    if (this.map.getSource('muni_cam')) try { this.map.removeSource('muni_cam'); } catch { }
  }

  limpiarMarkers(): void {
    for (const m of this.markers) m.remove();
    this.markers = [];
  }

  cerrarPopup(): void {
    if (this.activePopup) {
      this.activePopup.remove();
      this.activePopup = undefined;
    }
  }

  hasActivePopup(): boolean {
    return !!this.activePopup;
  }

  async dibujarChinchetasMapLibre(
    pisos: Propiedad[],
    onClick: (p: Propiedad, lngLat: LngLatTuple) => void
  ): Promise<void> {
    if (!this.map) return;

    if (!this.mapaCargado) {
      await new Promise<void>((resolve) => {
        this.map!.once('load', () => { this.mapaCargado = true; resolve(); });
      });
    }

    this.limpiarMarkers();

    for (const p of pisos) {
      const lat = Number(p.latitude ?? p.location?.lat);
      const lon = Number(p.longitude ?? p.location?.lng ?? p.location?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      const el = this.buildPinElement(p);

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([lon, lat])
        .addTo(this.map!);

      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onClick(p, [lon, lat]);
      });

      this.markers.push(marker);
    }
  }

  abrirPopupEn(
    lngLat: LngLatTuple,
    mount: (container: HTMLElement) => void,
    onClose?: () => void
  ): void {
    if (!this.map) return;
    this.cerrarPopup();

    const container = document.createElement('div');
    const popup = new maplibregl.Popup({
      offset: [0, -40],
      closeButton: false,
      closeOnClick: true,
      className: 'tfg-popup'
    })
      .setLngLat(lngLat)
      .setDOMContent(container)
      .addTo(this.map);

    popup.on('close', () => {
      onClose?.();
      this.activePopup = undefined;
    });

    this.activePopup = popup;
    mount(container);
  }

  destroy(): void {
    this.cerrarPopup();
    this.limpiarMarkers();
    this.map?.remove();
    this.map = undefined;
    this.mapaCargado = false;
  }

  // --- Helpers ---

  private buildPinElement(p: Propiedad): HTMLDivElement {
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.cursor = 'pointer';
    el.style.zIndex = '2';
    el.style.width = `${MARKER_SIZE_PX}px`;
    el.style.height = `${MARKER_SIZE_PX}px`;
    el.innerHTML = this.pinSVG(this.colorForOperacion(p), MARKER_SIZE_PX);
    return el;
  }

  private colorForOperacion(p: Propiedad): string {
    const raw = p.tipo ?? p.operation ?? '';
    const t = String(raw).toLowerCase();
    if (t.includes('venta') || t.includes('sale')) return COLORS.SALE;
    if (t.includes('alquiler') || t.includes('rent')) return COLORS.RENT;
    return COLORS.DEFAULT;
  }

  private pinSVG(color = COLORS.CHINCHETA_BG, size = 34): string {
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

  async loadPinsIcons(): Promise<void> {
    if (!this.map) return;

    const loadIcon = (id: string, url: string) =>
      new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          try {
            if (!this.map!.hasImage(id)) {
              this.map!.addImage(id, img as any);
            }
            resolve();
          } catch (err) {
            console.error('[MapService] Error registering icon', id, err);
            reject(err);
          }
        };

        img.onerror = (ev) => {
          console.error('[MapService] Error loading icon', id, url, ev);
          reject(ev);
        };
        img.src = url;
      });

    await Promise.all([
      loadIcon('pin-sale', 'assets/icons/house-fill.svg'),
      loadIcon('pin-rent', 'assets/icons/key-fill.svg'),
    ]);
  }

  resetNorth(animate: boolean = true): void {
    if (!this.map) return;
    if (animate) {
      this.map.easeTo({ bearing: 0, duration: 500 });
    } else {
      this.map.setBearing(0);
    }
  }
}
