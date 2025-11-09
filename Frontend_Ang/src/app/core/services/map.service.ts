import { Injectable } from '@angular/core';
import maplibregl from 'maplibre-gl';

@Injectable({ providedIn: 'root' })
export class MapService {
  map?: maplibregl.Map;

  initMap(container: HTMLElement, dark: boolean): maplibregl.Map {
    const styleUrl = dark
      ? 'https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json'
      : 'https://tiles.stadiamaps.com/styles/alidade_smooth.json';

    this.map = new maplibregl.Map({
      container,
      style: styleUrl,
      center: [-3.7038, 40.4168],
      zoom: 9.2,
    });
    return this.map;
  }

  async cargarMunicipios(geojsonUrl: string, medias: Record<string, number>) {
    if (!this.map) return;
    const res = await fetch('assets/municipios_cam.geojson');
    const geojson = await res.json();

    for (const f of geojson.features) {
      const nombre = (f.properties?.NAMEUNIT || '').toLowerCase();
      f.properties.valor = medias[nombre] ?? null;
    }

    if (this.map.getSource('muni_cam')) this.map.removeSource('muni_cam');
    this.map.addSource('muni_cam', { type: 'geojson', data: geojson });

    this.map.addLayer({
      id: 'muni-fill',
      type: 'fill',
      source: 'muni_cam',
      paint: {
        'fill-color': [
          'interpolate',
          ['linear'],
          ['coalesce', ['get', 'valor'], 0],
          0, '#f1eef6',
          40, '#bdc9e1',
          60, '#74a9cf',
          80, '#2b8cbe',
          100, '#045a8d',
        ],
        'fill-opacity': [
          'case',
          ['==', ['get', 'valor'], null],
          0.18,
          0.7,
        ],
      },
    });
  }

  limpiar() {
    if (this.map) this.map.remove();
  }
}
