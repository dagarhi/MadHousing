import { Injectable } from '@angular/core';
import { PoiLayerBase, PoiLayerStyle } from './poi-layer.base';

@Injectable({ providedIn: 'root' })
export class MetroLayerService extends PoiLayerBase {
  readonly id = 'metro';
  readonly zIndex = 35; // above pins (30), below route (40)

  protected readonly geojsonUrl = 'assets/poi/metro.geojson';
  protected readonly style: PoiLayerStyle = {
    type: 'circle',
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        10, 3,
        14, 5,
        18, 7,
      ],
      'circle-color': '#e11d48',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
    },
    minzoom: 10,
  };
}
