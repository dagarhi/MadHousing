import { Injectable } from '@angular/core';
import { PoiLayerBase, PoiLayerStyle } from './poi-layer.base';

/** Public transport: metro + Cercanías (bus deliberately out — too dense to be useful). */
@Injectable({ providedIn: 'root' })
export class TransportLayerService extends PoiLayerBase {
  readonly id = 'transport';
  readonly zIndex = 35; // above pins (30), below route (40)

  protected readonly category = 'transport' as const;
  protected readonly style: PoiLayerStyle = {
    type: 'circle',
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        10, 3,
        14, 5,
        18, 7,
      ],
      // Distinguish subtypes by color: metro = red, Cercanías = blue.
      'circle-color': [
        'match',
        ['get', 'subtype'],
        'metro', '#e11d48',
        'cercanias', '#2563eb',
        '#64748b',
      ],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
    },
    minzoom: 10,
  };
}
