import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Propiedad } from '../models/propiedad.model';
import { Observable, lastValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment.development';

@Injectable({ providedIn: 'root' })
export class BusquedaService {
  private baseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  buscar(params: any): Observable<any> {
    return this.http.get(`${this.baseUrl}/buscar`, { params });
  }

  buscarTodo(operation: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/buscar-todo`, {
      params: { operation, page: 1, per_page: 1000 },
    });
  }

  async buscarTodasPaginas(paramsBase: any): Promise<Propiedad[]> {
    const per_page = 100;
    let page = 1;
    let acumulado: Propiedad[] = [];

    while (true) {
      const params = new HttpParams({ fromObject: { ...paramsBase, page, per_page } });
      const res: any = await lastValueFrom(this.http.get(`${this.baseUrl}/buscar`, { params }));
      const chunk = Array.isArray(res?.propiedades) ? res.propiedades : [];
      acumulado = acumulado.concat(chunk);
      const total = res?.total ?? chunk.length;
      if (page * per_page >= total || chunk.length === 0) break;
      page++;
    }
    return acumulado;
  }
}
