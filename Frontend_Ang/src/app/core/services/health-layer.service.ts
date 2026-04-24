import { Injectable } from '@angular/core';
import { PoiLayerBase, PoiLayerStyle } from './poi-layer.base';

/** Sanidad: hospital + clínica + farmacia. */
@Injectable({ providedIn: 'root' })
export class HealthLayerService extends PoiLayerBase {
  readonly id = 'health';
  readonly zIndex = 34;

  protected readonly category = 'health' as const;
  protected readonly style: PoiLayerStyle = {
    type: 'circle',
    paint: {
      // Hospital > clínica > farmacia en tamaño, para priorizar visualmente.
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        11,
          ['match', ['get', 'subtype'], 'hospital', 4, 'clinic', 3, 'pharmacy', 2, 2],
        16,
          ['match', ['get', 'subtype'], 'hospital', 8, 'clinic', 6, 'pharmacy', 4, 4],
      ],
      'circle-color': [
        'match', ['get', 'subtype'],
        'hospital', '#ef4444',
        'clinic',   '#f97316',
        'pharmacy', '#fb7185',
        '#f87171',
      ],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1,
    },
    minzoom: 11,
  };
}
