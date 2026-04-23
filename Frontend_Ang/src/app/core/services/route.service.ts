import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { FeatureCollection } from 'geojson';

export type RouteProfile = 'foot-walking' | 'cycling-regular' | 'driving-car';

@Injectable({ providedIn: 'root' })
export class RouteService {
  private readonly baseUrl = 'https://api.openrouteservice.org/v2/directions';

  constructor(private http: HttpClient) {}

  getRoute(
    start: [number, number],
    end: [number, number],
    profile: RouteProfile,
  ): Observable<FeatureCollection> {
    const url = `${this.baseUrl}/${profile}/geojson`;
    const headers = new HttpHeaders({
      Authorization: environment.orsApiKey,
      'Content-Type': 'application/json',
    });
    const body = { coordinates: [start, end] };
    return this.http.post<FeatureCollection>(url, body, { headers });
  }
}
