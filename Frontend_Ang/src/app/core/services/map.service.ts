import { Injectable } from '@angular/core';
import maplibregl from 'maplibre-gl';
import { environment } from '../../../environments/environment';

type LngLatTuple = [number, number];

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

  async loadPinsIcons(): Promise<void> {
    if (!this.map) return;

    const loadIcon = (id: string, url: string) =>
      new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          try {
            if (this.map!.hasImage(id)) this.map!.removeImage(id);
            this.map!.addImage(id, img as any, { pixelRatio: 2 });
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
      loadIcon('pin-rent', 'assets/icons/PisoAlquiler.png'),
      loadIcon('pin-sale', 'assets/icons/PisoVenta.png'),
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
