import { Injectable } from '@angular/core';
import maplibregl from 'maplibre-gl';
import { Propiedad } from '../models/propiedad.model';

type LngLatTuple = [number, number];

@Injectable({ providedIn: 'root' })
export class MapService {
  private map?: maplibregl.Map;
  private mapaCargado = false;

  private markers: maplibregl.Marker[] = [];
  private activePopup?: maplibregl.Popup;

  // Tamaño visual de la chincheta (px)
  private readonly markerSizePx = 34;

  async initMap(container: HTMLElement): Promise<void> {
    if (this.map) return;

    this.map = new maplibregl.Map({
      container,
      style: 'https://tiles.stadiamaps.com/styles/alidade_smooth.json',
      center: [-3.7038, 40.4168],
      zoom: 11,
    });
    if (typeof window !== 'undefined') {
      (window as any).map = this.map;
    }
    await new Promise<void>((resolve) => {
      this.map!.on('load', () => { this.mapaCargado = true; resolve(); });
    });
    this.loadPinsIcons();
  }

  getMap(): maplibregl.Map | undefined {
    return this.map;
  }

  /** Coroplético simple por municipio */
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
      const s = Number((p as any).score_intrinseco ?? (p as any).score ?? 0);
      if (!Number.isFinite(s)) continue;
      if (!medias[key]) { medias[key] = 0; cuenta[key] = 0; }
      medias[key] += s; cuenta[key]++;
    }
    Object.keys(medias).forEach(k => { if (cuenta[k] > 0) medias[k] /= cuenta[k]; });

    for (const f of geojson.features) {
      const nombre = String(f.properties?.NAMEUNIT ?? '').toLowerCase().trim();
      f.properties.valor = medias[nombre] ?? null;
    }

    if (this.map.getLayer('muni-fill')) this.map.removeLayer('muni-fill');
    if (this.map.getLayer('muni-line')) this.map.removeLayer('muni-line');
    if (this.map.getSource('muni_cam')) this.map.removeSource('muni_cam');

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

    // Quita capas si existen
    for (const id of ['muni-fill', 'muni-line']) {
      if (this.map.getLayer(id)) {
        try { this.map.removeLayer(id); } catch {}
      }
    }
    // Quita la fuente si existe
    if (this.map.getSource('muni_cam')) {
      try { this.map.removeSource('muni_cam'); } catch {}
    }

    // Fallback "por si acaso" si en algún momento cambias IDs
    const style = this.map.getStyle();
    const layerIds = (style?.layers ?? []).map(l => l.id);
    for (const id of layerIds) {
      if (/(muni|choro|coropl)/i.test(id) && this.map.getLayer(id)) {
        try { this.map.removeLayer(id); } catch {}
      }
    }
    const srcIds = Object.keys(style?.sources ?? {});
    for (const id of srcIds) {
      if (/(muni|choro|coropl)/i.test(id) && this.map.getSource(id)) {
        try { this.map.removeSource(id); } catch {}
      }
    }
  }

  /** Borra todos los marcadores del mapa */
  limpiarMarkers(): void {
    for (const m of this.markers) m.remove();
    this.markers = [];
  }

  /** Cierra popup activo si lo hay */
  cerrarPopup(): void {
    if (this.activePopup) {
      this.activePopup.remove();  
      this.activePopup = undefined;
    }
  }
  hasActivePopup(): boolean {
    return !!this.activePopup;
  }
  /**
   * Dibuja marcadores tipo chincheta (SVG inline) con color por operación.
   * Colores: venta (verde), alquiler (azul). Fallback gris.
   */
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
      // Coordenadas robustas
      const lat = Number((p as any).latitude ?? (p as any).location?.lat);
      const lon = Number((p as any).longitude ?? (p as any).location?.lng ?? (p as any).location?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      // Elemento DOM del marcador (auto-contenido, sin depender de CSS global)
      const el = this.buildPinElement(p);

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([lon, lat])
        .addTo(this.map!);

      // Click del marcador
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onClick(p, [lon, lat]);
      });

      this.markers.push(marker);
    }
  }

  /**
   * Abre un popup de MapLibre y permite montar un componente Angular dentro.
   * mount(container) debe crear y adjuntar el componente al container.
   * onClose se llama cuando el popup se cierra.
   */
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

  // =========================
  // Helpers de marcadores SVG
  // =========================

  /** Devuelve un DIV con la chincheta SVG coloreada por operación. */
  private buildPinElement(p: Propiedad): HTMLDivElement {
    const el = document.createElement('div');
    el.style.position = 'absolute';   // por si no carga el CSS global de MapLibre
    el.style.cursor = 'pointer';
    el.style.zIndex = '2';
    el.style.width = `${this.markerSizePx}px`;
    el.style.height = `${this.markerSizePx}px`;
    el.innerHTML = this.pinSVG(this.colorForOperacion(p), this.markerSizePx);
    return el;
    }

  /** Determina color por operación. */
  private colorForOperacion(p: Propiedad): string {
    const raw = (p as any)?.tipo ?? (p as any)?.operation ?? '';
    const t = String(raw).toLowerCase();
    if (t.includes('venta') || t.includes('sale')) return '#2E7D32';   // verde
    if (t.includes('alquiler') || t.includes('rent')) return '#1565C0';// azul
    return '#6E6E6E'; // gris fallback
  }

  /** SVG de chincheta (vectorial, nítida en retina) */
  private pinSVG(color = '#FF3B30', size = 34): string {
    // viewBox cuadrado y anclaje inferior (pico)
    return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true" focusable="false">
      <defs>
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity=".35"/>
        </filter>
      </defs>
      <!-- cuerpo de la chincheta -->
      <path d="M20 37s-11-11.5-11-19C9 8.5 13.9 4 20 4s11 4.5 11 14c0 7.5-11 19-11 19z"
            fill="${color}" filter="url(#shadow)"/>
      <!-- ojo interior -->
      <circle cx="20" cy="17" r="4.5" fill="#ffffff"/>
    </svg>`;
  }

  private async loadPinsIcons(): Promise<void> {
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
            console.error('[MapService] Error al registrar icono', id, err);
            reject(err);
          }
        };

        img.onerror = (ev) => {
          console.error('[MapService] Error al cargar icono', id, url, ev);
          reject(ev);
        };
        img.src = url;
      });

    await Promise.all([
      loadIcon('pin-sale', 'assets/icons/house-fill.svg'),
      loadIcon('pin-rent', 'assets/icons/key-fill.svg'),
    ]);
  }

}
