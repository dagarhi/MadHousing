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

  async initMap(container: HTMLElement): Promise<void> {
    if (this.map) return;

    this.map = new maplibregl.Map({
      container,
      style: 'https://tiles.stadiamaps.com/styles/alidade_smooth.json',
      center: [-3.7038, 40.4168],
      zoom: 9.2,
    });

    await new Promise<void>((resolve) => {
      this.map!.on('load', () => { this.mapaCargado = true; resolve(); });
    });
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

  /** Borra todos los marcadores del mapa */
  limpiarMarkers(): void {
    for (const m of this.markers) m.remove();
    this.markers = [];
  }

  /** Cierra popup activo si lo hay */
  cerrarPopup(): void {
    this.activePopup?.remove();
    this.activePopup = undefined;
  }

  /**
   * Dibuja marcadores nativos de MapLibre y lanza onClick al pulsar.
   * Cubre múltiples variantes de coordenadas (lat/lon/lng/location.*).
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
      const lat = Number(p.latitude ?? p.latitude ?? p.location?.lat);
      const lon = Number(p.longitude ?? p.longitude ?? p.longitude ?? p.location?.lng ?? p.location?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      // Elemento DOM del marcador (visible sin CSS externo: estilos inline)
      const el = document.createElement('div');
      el.style.width = '16px';
      el.style.height = '16px';
      el.style.borderRadius = '50%';
      el.style.border = '2px solid #000';
      el.style.boxShadow = '0 0 6px rgba(0,0,0,0.5)';
      el.style.cursor = 'pointer';

      const score = Number(p.score_intrinseco ?? p.score ?? 0);
      el.style.background = score >= 70 ? '#2ecc71' : score >= 50 ? '#f1c40f' : '#e74c3c';

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
    const popup = new maplibregl.Popup({ offset: 18, closeButton: true, closeOnClick: true })
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
}
