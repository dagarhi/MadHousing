import { Injectable, OnDestroy } from '@angular/core';
import maplibregl from 'maplibre-gl';
import type { FeatureCollection, Feature, Point } from 'geojson';
import { MapService } from './map.service';
import { MapLayer } from './map-layer.interface';

type LngLat = [number, number];

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
  private visible = true;

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

  setRoute(fc: FeatureCollection | null) {
    this.cachedRoute = fc;
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
