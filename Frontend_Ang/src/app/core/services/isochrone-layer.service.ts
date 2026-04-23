import { Injectable, OnDestroy } from '@angular/core';
import maplibregl from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { MapService } from './map.service';
import { MapLayer } from './map-layer.interface';

// Green palette: darkest (near) → lightest (far)
const ISO_COLORS: Record<number, string> = {
  600:  '#2d6a4f',
  1200: '#52b788',
  1800: '#b7e4c7',
};
const ISO_COLOR_DEFAULT = '#b7e4c7';

@Injectable({ providedIn: 'root' })
export class IsochroneLayerService implements OnDestroy, MapLayer {
  readonly id = 'isochrone';
  readonly zIndex = 26;

  private map?: maplibregl.Map;

  private readonly sourceId    = 'isochrone-src';
  private readonly fillLayerId = 'isochrone-fill';
  private readonly lineLayerId = 'isochrone-line';

  private cached: FeatureCollection | null = null;
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

  setData(fc: FeatureCollection | null) {
    this.cached = fc;
    if (!this.map) return;
    if (!fc) { this.detach(); return; }
    this.rebuild();
  }

  private rebuild() {
    if (!this.map || !this.cached) return;
    this.detach();
    const vis = this.visible ? 'visible' : 'none';

    this.map.addSource(this.sourceId, { type: 'geojson', data: this.cached as any });

    // fill-sort-key: multiply value by -1 so largest polygons render first (bottom)
    this.map.addLayer({
      id: this.fillLayerId,
      type: 'fill',
      source: this.sourceId,
      layout: {
        visibility: vis,
        'fill-sort-key': ['*', -1, ['get', 'value']],
      },
      paint: {
        'fill-color': [
          'match', ['get', 'value'],
          600,  ISO_COLORS[600],
          1200, ISO_COLORS[1200],
          1800, ISO_COLORS[1800],
          ISO_COLOR_DEFAULT,
        ],
        'fill-opacity': 0.55,
      },
    });

    this.map.addLayer({
      id: this.lineLayerId,
      type: 'line',
      source: this.sourceId,
      layout: { visibility: vis },
      paint: {
        'line-color': '#1b4332',
        'line-width': 1.5,
        'line-opacity': 0.7,
      },
    });
  }
}
