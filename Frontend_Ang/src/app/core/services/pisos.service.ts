import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment.development';
import { Propiedad } from '../../models/propiedad.model';

@Injectable({ providedIn: 'root' })
export class PisosService {
  private readonly API_URL = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  /** /buscar-todo → devuelve directamente Propiedad[] */
  buscarTodo(operation = 'sale', page = 1, perPage = 1000): Observable<Propiedad[]> {
    const params = new HttpParams()
      .set('operation', operation)
      .set('page', page)
      .set('per_page', perPage);

    return this.http
      .get<{ propiedades: Propiedad[] }>(`${this.API_URL}/buscar-todo`, { params })
      .pipe(map(res => res?.propiedades ?? []));
  }

  /** /buscar → búsqueda filtrada; devuelve propiedades y stats si las hay */
  buscar(filtros: Record<string, any>): Observable<{ propiedades: Propiedad[]; stats?: any }> {
    let params = new HttpParams();
    Object.entries(filtros || {}).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') params = params.set(k, v as any);
    });
    return this.http.get<{ propiedades: Propiedad[]; stats?: any }>(`${this.API_URL}/buscar`, { params });
  }

  /** /estadisticas → datos globales para el drawer */
  estadisticas(): Observable<any> {
    return this.http.get<any>(`${this.API_URL}/estadisticas`);
  }

  /** /zonas-jerarquicas → ciudades/distritos/barrios para el buscador */
  obtenerZonasJerarquicas(): Observable<Record<string, any>> {
    return this.http.get<Record<string, any>>(`${this.API_URL}/zonas-jerarquicas`);
  }
}
