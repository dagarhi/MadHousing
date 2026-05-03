import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';

/**
 * Acceso centralizado a los GeoJSON estáticos del frontend.
 * Cada recurso se descarga una sola vez por sesión y se reparte
 * vía shareReplay(1) entre todos los suscriptores.
 */
@Injectable({ providedIn: 'root' })
export class GeojsonService {
  private http = inject(HttpClient);
  private municipiosCAM$?: Observable<FeatureCollection<Polygon | MultiPolygon>>;

  getMunicipiosCAM(): Observable<FeatureCollection<Polygon | MultiPolygon>> {
    if (!this.municipiosCAM$) {
      this.municipiosCAM$ = this.http
        .get<FeatureCollection<Polygon | MultiPolygon>>('assets/municipios_cam.geojson')
        .pipe(shareReplay(1));
    }
    return this.municipiosCAM$;
  }
}
