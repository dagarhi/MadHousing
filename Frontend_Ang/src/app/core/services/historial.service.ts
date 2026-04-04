import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { HistorialItem } from '../models/historial.model';
import { FiltroBusqueda } from '../models/filtros.model';
import { environment } from '../../../environments/environment';

interface SearchHistoryDto {
  id: number;
  created_at: string;
  query: FiltroBusqueda;
}

@Injectable({ providedIn: 'root' })
export class HistorialService {
  private readonly baseUrl = `${environment.apiBaseUrl}/historial`;
  private readonly MAX = 20;

  private historialSubject = new BehaviorSubject<HistorialItem[]>([]);
  historial$ = this.historialSubject.asObservable();

  constructor(private http: HttpClient) {
    this.cargarDesdeServidor();
  }

  private cargarDesdeServidor(): void {
    this.http.get<SearchHistoryDto[]>(this.baseUrl).subscribe({
      next: (registros) => {
        const items = registros
          .map((dto) => this.dtoToItem(dto))
          .slice(0, this.MAX);
        this.historialSubject.next(items);
      },
      error: (err) => {
        console.error('[HistorialService] Error loading history', err);
        this.historialSubject.next([]);
      },
    });
  }

  get currentHistorial(): HistorialItem[] {
    return this.historialSubject.value;
  }

  add(filtros: FiltroBusqueda, resumen?: string): void {
    const body = { query: filtros };

    this.http.post<SearchHistoryDto>(this.baseUrl, body).subscribe({
      next: (dto) => {
        const item = this.dtoToItem(dto, resumen);

        // Deduplicate by hash
        const hash = item.hash;
        const dedup = this.currentHistorial.filter((h) => h.hash !== hash);
        const nuevo = [item, ...dedup].slice(0, this.MAX);

        this.historialSubject.next(nuevo);
      },
      error: (err) => console.error('[HistorialService] Error creating history item', err),
    });
  }

  eliminarById(id: string) {
    const numId = Number(id);
    this.http.delete(`${this.baseUrl}/${numId}`).subscribe({
      next: () => {
        const nuevo = this.currentHistorial.filter((h) => h.id !== id);
        this.historialSubject.next(nuevo);
      },
      error: (err) => console.error('[HistorialService] Error deleting history', err),
    });
  }

  borrarTodos() {
    const actual = [...this.currentHistorial];
    this.historialSubject.next([]);

    actual.forEach((item) => {
      const numId = Number(item.id);
      if (!Number.isFinite(numId)) return;

      this.http.delete(`${this.baseUrl}/${numId}`).subscribe({
        error: (err) => console.error('[HistorialService] Error deleting history (bulk)', err),
      });
    });
  }

  // --- Helpers ---

  private dtoToItem(dto: SearchHistoryDto, resumenOverride?: string): HistorialItem {
    const filtros = (dto.query ?? {}) as FiltroBusqueda;
    const fechaISO = dto.created_at ?? new Date().toISOString();
    const hash = this.hashFiltros(filtros);

    return {
      id: String(dto.id),
      fechaISO,
      filtros,
      hash,
      resumen: resumenOverride ?? this.renderResumen(filtros),
    };
  }

  private renderResumen(f: FiltroBusqueda): string {
    const partes: string[] = [];
    if (f.municipio) partes.push(f.municipio);
    if (f.operation) partes.push(f.operation === 'rent' ? 'alquiler' : 'venta');

    const fmt = (label: string, a?: number, b?: number) =>
      a != null || b != null
        ? `${label} ${a ?? ''}${a != null && b != null ? '–' : ''}${b ?? ''}`.trim()
        : undefined;

    const precio = fmt('€', f.min_price, f.max_price);
    const size = fmt('m²', f.min_size, f.max_size);
    const score = fmt('score', f.min_score, f.max_score);

    if (precio) partes.push(precio);
    if (size) partes.push(size);
    if (score) partes.push(score);

    if (f.rooms != null) partes.push(`${f.rooms}+ hab`);
    if (f.floor != null) partes.push(`planta ≥ ${f.floor}`);

    return partes.join(' · ') || 'Búsqueda';
  }

  private hashFiltros(f: FiltroBusqueda): string {
    const stable = (obj: any): any => {
      if (Array.isArray(obj)) return obj.map(stable);
      if (obj && typeof obj === 'object') {
        return Object.keys(obj)
          .sort()
          .reduce((acc: any, k) => {
            acc[k] = stable(obj[k]);
            return acc;
          }, {});
      }
      return obj;
    };
    const json = JSON.stringify(stable(f));
    let h = 0;
    for (let i = 0; i < json.length; i++) {
      h = (h << 5) - h + json.charCodeAt(i);
      h |= 0;
    }
    return String(h);
  }

  reloadFromServer(): void {
    this.cargarDesdeServidor();
  }

  clearLocal(): void {
    this.historialSubject.next([]);
  }
}
