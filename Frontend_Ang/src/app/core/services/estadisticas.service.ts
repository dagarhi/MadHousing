import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment.development';

@Injectable({ providedIn: 'root' })
export class EstadisticasService {
  private baseUrl = `${environment.apiBaseUrl}/estadisticas-globales`;

  constructor(private http: HttpClient) {}

  obtenerGlobales(): Observable<any> {
    return this.http.get(this.baseUrl);
  }

  obtenerDatosPorOperacion(stats: any, tipo: 'sale' | 'rent', metrica: string) {
    return Object.entries(stats)
      .map(([zona, valores]: any) => ({
        zona,
        valor: Number(valores?.[tipo]?.[metrica] ?? 0),
      }))
      .filter((z) => z.valor > 0);
  }
}
