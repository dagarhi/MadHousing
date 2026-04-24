import { Injectable } from '@angular/core';
import { PoiLayerBase, PoiLayerStyle } from './poi-layer.base';

/** Carril bici dedicado (highway=cycleway). Geometrías LineString. */
@Injectable({ providedIn: 'root' })
export class BikeLayerService extends PoiLayerBase {
  readonly id = 'bike';
  readonly zIndex = 16; // over parks, under most else

  protected readonly category = 'bike' as const;
  protected readonly style: PoiLayerStyle = {
    type: 'line',
    paint: {
      'line-color': '#14b8a6',
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        10, 1,
        16, 3,
      ],
      'line-opacity': 0.85,
    },
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
  };
}
