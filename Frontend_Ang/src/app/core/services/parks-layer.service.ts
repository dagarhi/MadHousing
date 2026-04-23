import { Injectable } from '@angular/core';
import { PoiLayerBase, PoiLayerStyle } from './poi-layer.base';

@Injectable({ providedIn: 'root' })
export class ParksLayerService extends PoiLayerBase {
  readonly id = 'parks';
  readonly zIndex = 15; // between choro (10) and heat (20) — decorative context

  protected readonly geojsonUrl = 'assets/poi/parks.geojson';
  protected readonly style: PoiLayerStyle = {
    type: 'fill',
    paint: {
      'fill-color': '#4ade80',
      'fill-opacity': 0.35,
      'fill-outline-color': '#166534',
    },
  };
}
