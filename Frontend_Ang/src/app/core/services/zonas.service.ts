import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ZonasService {
  private baseUrl = `${environment.apiBaseUrl}/zonas-jerarquicas`;
  constructor(private http: HttpClient) {}

  getZonasJerarquicas(): Observable<any> {
    return this.http.get(this.baseUrl);
  }
}
