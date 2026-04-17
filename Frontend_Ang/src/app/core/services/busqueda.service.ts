import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Propiedad } from '../models/propiedad.model';
import { Observable, lastValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { FiltroBusqueda } from '../models/filtros.model';

interface SearchResponse {
  propiedades: Propiedad[];
  total: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

@Injectable({ providedIn: 'root' })
export class BusquedaService {
  private baseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) { }

  private readCache(key: string): Propiedad[] | null {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const { data, ts } = JSON.parse(raw);
      if (Date.now() - ts < CACHE_TTL_MS) return data as Propiedad[];
      localStorage.removeItem(key);
    } catch { localStorage.removeItem(key); }
    return null;
  }

  private writeCache(key: string, data: Propiedad[]): void {
    try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); }
    catch { /* cuota excedida — ignorar */ }
  }

  buscar(filtros: FiltroBusqueda): Observable<SearchResponse> {
    const params = new HttpParams({
      fromObject: Object.entries(filtros)
        .filter(([_, v]) => v !== undefined && v !== null && v !== '')
        .reduce((acc, [k, v]) => ({ ...acc, [k]: String(v) }), {}),
    });

    return this.http.get<SearchResponse>(`${this.baseUrl}/buscar`, { params });
  }

  async buscarTodasPaginas(paramsBase: FiltroBusqueda): Promise<Propiedad[]> {
    const per_page = 100;

    const sanitize = (obj: Record<string, any>) =>
      Object.fromEntries(
        Object.entries(obj).filter(([_, v]) =>
          v !== undefined && v !== null && v !== '' && !(typeof v === 'boolean' && v === false)
        )
      );

    const base = sanitize(paramsBase as any);

    const buildParams = (extra: Record<string, any>) =>
      new HttpParams({
        fromObject: Object.fromEntries(
          Object.entries({ ...base, ...extra }).map(([k, v]) => [k, String(v)])
        ),
      });

    // Fetch first page to learn total, then remaining pages in parallel
    const firstRes = await lastValueFrom(
      this.http.get<SearchResponse>(`${this.baseUrl}/buscar`, { params: buildParams({ page: 1, per_page }) })
    );
    const firstChunk = firstRes?.propiedades || [];
    const total = firstRes?.total ?? firstChunk.length;
    const totalPages = Math.ceil(total / per_page);

    if (totalPages <= 1) return firstChunk;

    const remaining = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) =>
        lastValueFrom(
          this.http.get<SearchResponse>(`${this.baseUrl}/buscar`, { params: buildParams({ page: i + 2, per_page }) })
        ).then(r => r?.propiedades || [])
      )
    );

    return [firstChunk, ...remaining].flat();
  }

  async buscarTodo(operation: 'rent' | 'sale'): Promise<Propiedad[]> {
    const cacheKey = `mh_pisos_${operation}`;
    const cached = this.readCache(cacheKey);
    if (cached) return cached;

    const per_page = 2000;
    const opParam = operation ? { operation } : {};

    const makeParams = (page: number) =>
      new HttpParams({ fromObject: { ...opParam, page, per_page } as any });

    // Fetch first page to learn total, then remaining pages in parallel
    const firstRes = await lastValueFrom(
      this.http.get<SearchResponse>(`${this.baseUrl}/buscar-todo`, { params: makeParams(1) })
    );
    const firstChunk = firstRes?.propiedades || [];
    const total = firstRes?.total ?? firstChunk.length;
    const totalPages = Math.ceil(total / per_page);

    let result = firstChunk;

    if (totalPages > 1) {
      const remaining = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, i) =>
          lastValueFrom(
            this.http.get<SearchResponse>(`${this.baseUrl}/buscar-todo`, { params: makeParams(i + 2) })
          ).then(r => r?.propiedades || [])
        )
      );
      result = [firstChunk, ...remaining].flat();
    }

    this.writeCache(cacheKey, result);
    return result;
  }
}
