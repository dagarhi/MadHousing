import { Injectable, OnDestroy } from '@angular/core';
import maplibregl from 'maplibre-gl';
import type { Feature, Polygon } from 'geojson';
import { MapService } from './map.service';
import { MapLayer } from './map-layer.interface';

@Injectable({ providedIn: 'root' })
export class RadiusLayerService implements OnDestroy, MapLayer {
  readonly id = 'radius';
  readonly zIndex = 25;

  private map?: maplibregl.Map;

  private readonly sourceId    = 'radius-filter-src';
  private readonly fillLayerId = 'radius-filter-fill';
  private readonly lineLayerId = 'radius-filter-line';

  private cached: Feature<Polygon> | null = null;
  private visible = true;

  constructor(private readonly mapSvc: MapService) {}

  attach(map?: maplibregl.Map) {
    this.map = map ?? this.mapSvc.getMap() ?? this.map;
    if (!this.map) return;
    if (this.cached) this.rebuild();
  }

  detach() {
    if (!this.map) return;
    if (this.map.getLayer(this.lineLayerId)) { try { this.map.removeLayer(this.lineLayerId); } catch { } }
    if (this.map.getLayer(this.fillLayerId)) { try { this.map.removeLayer(this.fillLayerId); } catch { } }
    if (this.map.getSource(this.sourceId))   { try { this.map.removeSource(this.sourceId); } catch { } }
  }

  ngOnDestroy() { this.clear(); }

  clear() {
    this.detach();
    this.cached = null;
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    if (!this.map) return;
    const v = visible ? 'visible' : 'none';
    if (this.map.getLayer(this.fillLayerId)) this.map.setLayoutProperty(this.fillLayerId, 'visibility', v);
    if (this.map.getLayer(this.lineLayerId)) this.map.setLayoutProperty(this.lineLayerId, 'visibility', v);
  }

  setCircle(feature: Feature<Polygon> | null) {
    this.cached = feature;
    if (!this.map) return;
    if (!feature) { this.detach(); return; }
    this.rebuild();
  }

  private rebuild() {
    if (!this.map || !this.cached) return;
    this.detach();
    const vis = this.visible ? 'visible' : 'none';

    this.map.addSource(this.sourceId, { type: 'geojson', data: this.cached as any });

    this.map.addLayer({
      id: this.fillLayerId,
      type: 'fill',
      source: this.sourceId,
      layout: { visibility: vis },
      paint: { 'fill-color': '#a060a8', 'fill-opacity': 0.12 },
    });

    this.map.addLayer({
      id: this.lineLayerId,
      type: 'line',
      source: this.sourceId,
      layout: { visibility: vis },
      paint: { 'line-color': '#a060a8', 'line-width': 2, 'line-dasharray': [4, 3] },
    });
  }
}
