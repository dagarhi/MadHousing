import { Injectable } from '@angular/core';
import { PoiLayerBase, PoiLayerStyle } from './poi-layer.base';

/** Comercio: supermercados. */
@Injectable({ providedIn: 'root' })
export class CommerceLayerService extends PoiLayerBase {
  readonly id = 'commerce';
  readonly zIndex = 32;

  protected readonly category = 'commerce' as const;
  protected readonly style: PoiLayerStyle = {
    type: 'circle',
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        12, 2,
        16, 5,
      ],
      'circle-color': '#a855f7',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1,
    },
    minzoom: 12,
  };
}
