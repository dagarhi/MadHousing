import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, shareReplay } from 'rxjs';
import type { FeatureCollection, Geometry } from 'geojson';
import { environment } from '../../../environments/environment';

/** Categories exposed by GET /pois. Must match backend POI_CATEGORIES. */
export type PoiCategory =
  | 'transport'
  | 'health'
  | 'education'
  | 'park'
  | 'commerce'
  | 'bike';

export interface NearbyPoi {
  id: number;
  subtype: string | null;
  name: string | null;
  dist_m: number;
  geometry: Geometry;
}

export type NearbyByCategory = Record<PoiCategory, NearbyPoi[]>;

/**
 * Client for backend POI endpoints. Full-category requests are cached in-memory
 * via shareReplay so each category is only fetched once per session (the server
 * also sends Cache-Control: max-age=1w for HTTP-level caching across reloads).
 */
@Injectable({ providedIn: 'root' })
export class PoiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  private readonly cache = new Map<PoiCategory, Observable<FeatureCollection>>();

  /** All POIs of a category, as a GeoJSON FeatureCollection. */
  getPois(category: PoiCategory): Observable<FeatureCollection> {
    let cached = this.cache.get(category);
    if (!cached) {
      cached = this.http
        .get<FeatureCollection>(`${this.base}/pois`, { params: { category } })
        .pipe(shareReplay(1));
      this.cache.set(category, cached);
    }
    return cached;
  }

  /** N nearest POIs per category around a point. Used by the entorno drawer. */
  getNearby(
    lat: number,
    lng: number,
    opts: { category?: PoiCategory; limit?: number; radiusM?: number } = {},
  ): Observable<NearbyByCategory> {
    const params: Record<string, string> = {
      lat: String(lat),
      lng: String(lng),
      limit: String(opts.limit ?? 3),
      radius_m: String(opts.radiusM ?? 2000),
    };
    if (opts.category) params['category'] = opts.category;
    return this.http.get<NearbyByCategory>(`${this.base}/pois/nearby`, { params });
  }

  /** For unit tests or when POIs have been refreshed server-side. */
  invalidate(category?: PoiCategory): void {
    if (category) this.cache.delete(category);
    else this.cache.clear();
  }
}
