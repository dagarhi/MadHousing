import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { EstadisticasGlobales } from '../models/estadistica.model';

export interface ChartDataPoint {
  zona: string;
  valor: number;
}

@Injectable({ providedIn: 'root' })
export class EstadisticasService {
  private baseUrl = `${environment.apiBaseUrl}/estadisticas-globales`;

  constructor(private http: HttpClient) { }

  obtenerGlobales(): Observable<EstadisticasGlobales> {
    return this.http.get<EstadisticasGlobales>(this.baseUrl);
  }

  obtenerDatosPorOperacion(stats: EstadisticasGlobales, tipo: 'sale' | 'rent', metrica: string): ChartDataPoint[] {
    return Object.entries(stats)
      .map(([zona, valores]) => ({
        zona,
        valor: Number(valores?.[tipo]?.[metrica] ?? 0),
      }))
      .filter((z) => z.valor > 0);
  }
}
