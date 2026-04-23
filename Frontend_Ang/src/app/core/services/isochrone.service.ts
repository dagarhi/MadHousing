import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { FeatureCollection } from 'geojson';

export type IsochroneProfile = 'foot-walking' | 'cycling-regular' | 'driving-car';

export interface IsochroneRequest {
  lnglat: [number, number];
  profile: IsochroneProfile;
  ranges: number[]; // seconds, e.g. [600, 1200, 1800]
}

@Injectable({ providedIn: 'root' })
export class IsochroneService {
  private readonly baseUrl = 'https://api.openrouteservice.org/v2/isochrones';

  constructor(private http: HttpClient) {}

  getIsochrones(req: IsochroneRequest): Observable<FeatureCollection> {
    const url = `${this.baseUrl}/${req.profile}`;
    const headers = new HttpHeaders({
      Authorization: environment.orsApiKey,
      'Content-Type': 'application/json',
    });
    const body = {
      locations: [[req.lnglat[0], req.lnglat[1]]],
      range: req.ranges,
    };
    return this.http.post<FeatureCollection>(url, body, { headers });
  }
}
