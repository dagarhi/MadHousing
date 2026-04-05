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

@Injectable({ providedIn: 'root' })
export class BusquedaService {
  private baseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) { }

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
    let page = 1;
    let acumulado: Propiedad[] = [];

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

    return new Promise(async (resolve, reject) => {
      try {
        while (true) {
          const params = buildParams({ page, per_page });
          const res = await lastValueFrom(this.http.get<SearchResponse>(`${this.baseUrl}/buscar`, { params }));
          const chunk = res?.propiedades || [];
          acumulado = acumulado.concat(chunk);
          const total = res?.total ?? chunk.length;
          if (page * per_page >= total || chunk.length === 0) break;
          page++;
        }
        resolve(acumulado);
      } catch (e) {
        reject(e);
      }
    });
  }

  async buscarTodo(operation: 'rent' | 'sale'): Promise<Propiedad[]> {
    const per_page = 500;
    let page = 1;
    let acumulado: Propiedad[] = [];

    return new Promise(async (resolve, reject) => {
      try {
        while (true) {
          const params = new HttpParams({
            fromObject: {
              ...(operation ? { operation } : {}),
              page,
              per_page,
            } as any,
          });

          const res = await lastValueFrom(
            this.http.get<SearchResponse>(`${this.baseUrl}/buscar-todo`, { params })
          );

          const chunk = res?.propiedades || [];
          acumulado = acumulado.concat(chunk);

          const total = res?.total ?? chunk.length;
          if (page * per_page >= total || chunk.length === 0) break;
          page++;
        }
        resolve(acumulado);
      } catch (e) {
        reject(e);
      }
    });
  }
}
