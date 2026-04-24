import { Injectable } from '@angular/core';
import { PoiLayerBase, PoiLayerStyle } from './poi-layer.base';

/** Educación: colegios (primaria + secundaria, OSM no distingue bien). */
@Injectable({ providedIn: 'root' })
export class EducationLayerService extends PoiLayerBase {
  readonly id = 'education';
  readonly zIndex = 33;

  protected readonly category = 'education' as const;
  protected readonly style: PoiLayerStyle = {
    type: 'circle',
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        11, 2.5,
        16, 5,
      ],
      'circle-color': '#3b82f6',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1,
    },
    minzoom: 11,
  };
}
