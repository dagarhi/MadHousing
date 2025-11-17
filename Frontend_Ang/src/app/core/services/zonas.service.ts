import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ZonasService {
  private baseUrl = `${environment.apiBaseUrl}/zonas-jerarquicas`;

  constructor(private http: HttpClient) {}

  getZonasJerarquicas(
    operation?: 'rent' | 'sale',
    municipio?: string
  ): Observable<any> {
    let params = new HttpParams();

    if (operation) {
      params = params.set('operation', operation);
    }
    if (municipio) {
      params = params.set('municipio', municipio);
    }

    return this.http.get(this.baseUrl, { params });
  }
}