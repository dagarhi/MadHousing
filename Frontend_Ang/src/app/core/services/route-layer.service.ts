import { Injectable, OnDestroy } from '@angular/core';
import maplibregl from 'maplibre-gl';
import type { FeatureCollection, Feature, Point } from 'geojson';
import { MapService } from './map.service';
import { MapLayer } from './map-layer.interface';

type LngLat = [number, number];
type RouteProfile = 'foot-walking' | 'cycling-regular' | 'driving-car';

// SVG inlineable (sin dependencia de lucide-angular, que necesita compilación).
// Mismo path que los iconos footprints/bike/car usados en el resto de la UI.
const SVG_BASE = 'width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

const PROFILE_SVG: Record<RouteProfile, string> = {
  'foot-walking': `
    <svg ${SVG_BASE}>
      <path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/>
      <path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/>
      <path d="M16 17h4"/>
      <path d="M4 13h4"/>
    </svg>`,
  'cycling-regular': `
    <svg ${SVG_BASE}>
      <circle cx="18.5" cy="17.5" r="3.5"/>
      <circle cx="5.5" cy="17.5" r="3.5"/>
      <circle cx="15" cy="5" r="1"/>
      <path d="M12 17.5V14l-3-3 4-3 2 3h2"/>
    </svg>`,
  'driving-car': `
    <svg ${SVG_BASE}>
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
      <circle cx="7" cy="17" r="2"/>
      <path d="M9 17h6"/>
      <circle cx="17" cy="17" r="2"/>
    </svg>`,
};

@Injectable({ providedIn: 'root' })
export class RouteLayerService implements OnDestroy, MapLayer {
  readonly id = 'route';
  readonly zIndex = 40;

  private map?: maplibregl.Map;

  private readonly routeSrcId   = 'route-src';
  private readonly casingLayer  = 'route-line-casing';
  private readonly lineLayer    = 'route-line';
  private readonly endsSrcId    = 'route-ends-src';
  private readonly endsLayerId  = 'route-ends';

  private cachedRoute: FeatureCollection | null = null;
  private cachedOrigin: LngLat | null = null;
  private cachedDest: LngLat | null = null;
  private cachedProfile: RouteProfile | null = null;
  private visible = true;

  // Hover popup state — follows the cursor while over the route line.
  private hoverPopup: maplibregl.Popup | null = null;
  private boundMove?: (e: maplibregl.MapMouseEvent) => void;
  private boundLeave?: () => void;

  constructor(private readonly mapSvc: MapService) {}

  attach(map?: maplibregl.Map) {
    this.map = map ?? this.mapSvc.getMap() ?? this.map;
    if (!this.map) return;
    this.rebuildRoute();
    this.rebuildEndpoints();
  }

  detach() {
    if (!this.map) return;
    this.detachRoute();
    this.detachEndpoints();
  }

  ngOnDestroy() { this.clear(); }

  clear() {
    this.detach();
    this.cachedRoute  = null;
    this.cachedOrigin = null;
    this.cachedDest   = null;
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    if (!this.map) return;
    const v = visible ? 'visible' : 'none';
    for (const id of [this.casingLayer, this.lineLayer, this.endsLayerId]) {
      if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', v);
    }
  }

  setRoute(fc: FeatureCollection | null, profile: RouteProfile | null = null) {
    this.cachedRoute = fc;
    this.cachedProfile = profile;
    if (!this.map) return;
    if (!fc) { this.detachRoute(); return; }
    this.rebuildRoute();
  }

  setEndpoints(origin: LngLat | null, dest: LngLat | null) {
    this.cachedOrigin = origin;
    this.cachedDest   = dest;
    if (!this.map) return;
    this.rebuildEndpoints();
  }

  private rebuildRoute() {
    if (!this.map || !this.cachedRoute) return;
    this.detachRoute();
    const vis = this.visible ? 'visible' : 'none';

    this.map.addSource(this.routeSrcId, { type: 'geojson', data: this.cachedRoute as any });

    this.map.addLayer({
      id: this.casingLayer,
      type: 'line',
      source: this.routeSrcId,
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: vis },
      paint: { 'line-color': '#1e3a8a', 'line-width': 8, 'line-opacity': 0.35 },
    });

    this.map.addLayer({
      id: this.lineLayer,
      type: 'line',
      source: this.routeSrcId,
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: vis },
      paint: { 'line-color': '#2563eb', 'line-width': 4 },
    });

    this.attachHover();
  }

  // ── Hover tooltip ──────────────────────────────────────────────────────────
  //
  // Mousemove sobre la ruta muestra un popup siguiendo el cursor con icono de
  // modo + distancia + duración. Usamos el casingLayer (más ancho) para que
  // sea fácil acertar con el ratón aunque la línea fina sea de 4px.

  private attachHover() {
    if (!this.map) return;
    this.detachHover();

    const summary = this.readSummary();
    if (!summary) return;

    const profileSvg = this.cachedProfile ? PROFILE_SVG[this.cachedProfile] : '';
    const distKm = (summary.distance / 1000).toFixed(summary.distance < 10000 ? 1 : 0);
    const durMin = Math.max(1, Math.round(summary.duration / 60));
    const html = `
      <div class="route-hover__body">
        ${profileSvg ? `<span class="route-hover__mode">${profileSvg}</span>` : ''}
        <span class="route-hover__stat"><strong>${distKm}</strong> km</span>
        <span class="route-hover__sep">·</span>
        <span class="route-hover__stat"><strong>${durMin}</strong> min</span>
      </div>`;

    this.hoverPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: 'route-hover-popup',
    });

    this.boundMove = (e) => {
      if (!this.hoverPopup || !this.map) return;
      this.hoverPopup.setLngLat(e.lngLat).setHTML(html).addTo(this.map);
      this.map.getCanvas().style.cursor = 'pointer';
    };
    this.boundLeave = () => {
      this.hoverPopup?.remove();
      if (this.map) this.map.getCanvas().style.cursor = '';
    };

    this.map.on('mousemove', this.casingLayer, this.boundMove);
    this.map.on('mouseleave', this.casingLayer, this.boundLeave);
  }

  private detachHover() {
    if (!this.map) return;
    if (this.boundMove)  this.map.off('mousemove',  this.casingLayer, this.boundMove);
    if (this.boundLeave) this.map.off('mouseleave', this.casingLayer, this.boundLeave);
    this.boundMove = undefined;
    this.boundLeave = undefined;
    this.hoverPopup?.remove();
    this.hoverPopup = null;
    if (this.map) this.map.getCanvas().style.cursor = '';
  }

  private readSummary(): { distance: number; duration: number } | null {
    const feat: any = this.cachedRoute?.features?.[0];
    const s = feat?.properties?.summary;
    if (!s || typeof s.distance !== 'number' || typeof s.duration !== 'number') return null;
    return { distance: s.distance, duration: s.duration };
  }

  private rebuildEndpoints() {
    if (!this.map) return;
    this.detachEndpoints();

    const feats: Feature<Point, { kind: string }>[] = [];
    if (this.cachedOrigin) {
      feats.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: this.cachedOrigin },
        properties: { kind: 'origin' },
      });
    }
    if (this.cachedDest) {
      feats.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: this.cachedDest },
        properties: { kind: 'dest' },
      });
    }
    if (feats.length === 0) return;

    const vis = this.visible ? 'visible' : 'none';

    this.map.addSource(this.endsSrcId, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: feats } as any,
    });

    this.map.addLayer({
      id: this.endsLayerId,
      type: 'circle',
      source: this.endsSrcId,
      layout: { visibility: vis },
      paint: {
        'circle-radius': 7,
        'circle-color': [
          'match', ['get', 'kind'],
          'origin', '#10b981',
          'dest',   '#ef4444',
          '#888888',
        ],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });
  }

  private detachRoute() {
    if (!this.map) return;
    this.detachHover();
    if (this.map.getLayer(this.lineLayer))   { try { this.map.removeLayer(this.lineLayer); } catch { } }
    if (this.map.getLayer(this.casingLayer)) { try { this.map.removeLayer(this.casingLayer); } catch { } }
    if (this.map.getSource(this.routeSrcId)) { try { this.map.removeSource(this.routeSrcId); } catch { } }
  }

  private detachEndpoints() {
    if (!this.map) return;
    if (this.map.getLayer(this.endsLayerId)) { try { this.map.removeLayer(this.endsLayerId); } catch { } }
    if (this.map.getSource(this.endsSrcId))  { try { this.map.removeSource(this.endsSrcId); } catch { } }
  }
}
