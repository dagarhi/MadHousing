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

  /** Carga el historial del usuario autenticado desde el backend */
  private cargarDesdeServidor(): void {
    this.http.get<SearchHistoryDto[]>(this.baseUrl).subscribe({
      next: (registros) => {
        const items = registros
          .map((dto) => this.dtoToItem(dto))
          .slice(0, this.MAX);
        this.historialSubject.next(items);
      },
      error: (err) => {
        console.error('[HistorialService] Error al cargar historial', err);
        this.historialSubject.next([]);
      },
    });
  }

  /** Snapshot síncrono */
  get currentHistorial(): HistorialItem[] {
    return this.historialSubject.value;
  }

  /**
   * Añade una entrada nueva al historial del usuario.
   * Antes devolvía HistorialItem, ahora es asíncrono (no retorna nada).
   * Si en algún sitio usabas el return, basta con quitarlo.
   */
  add(filtros: FiltroBusqueda, resumen?: string): void {
    const body = { query: filtros };

    this.http.post<SearchHistoryDto>(this.baseUrl, body).subscribe({
      next: (dto) => {
        const item = this.dtoToItem(dto, resumen);

        // dedupe por hash: si ya hay una búsqueda igual, la quitamos y ponemos esta arriba
        const hash = item.hash;
        const dedup = this.currentHistorial.filter((h) => h.hash !== hash);
        const nuevo = [item, ...dedup].slice(0, this.MAX);

        this.historialSubject.next(nuevo);
      },
      error: (err) => {
        console.error('[HistorialService] Error creando entrada de historial', err);
      },
    });
  }

  eliminarById(id: string) {
    const numId = Number(id);

    this.http.delete(`${this.baseUrl}/${numId}`).subscribe({
      next: () => {
        const nuevo = this.currentHistorial.filter((h) => h.id !== id);
        this.historialSubject.next(nuevo);
      },
      error: (err) => {
        console.error('[HistorialService] Error eliminando historial', err);
      },
    });
  }

  borrarTodos() {
    const actual = [...this.currentHistorial];
    this.historialSubject.next([]);

    actual.forEach((item) => {
      const numId = Number(item.id);
      if (!Number.isFinite(numId)) return;

      this.http.delete(`${this.baseUrl}/${numId}`).subscribe({
        error: (err) =>
          console.error('[HistorialService] Error borrando historial (masivo)', err),
      });
    });
  }

  // -------- helpers de mapeo / presentación --------

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
    const municipio = (f as any).municipio as string | undefined;
    const op = (f as any).operation as string | undefined;

    if (municipio) partes.push(municipio);
    if (op) partes.push(op === 'rent' ? 'alquiler' : 'venta');

    const r = (label: string, a?: number, b?: number) =>
      a != null || b != null
        ? `${label} ${a ?? ''}${a != null && b != null ? '–' : ''}${b ?? ''}`.trim()
        : undefined;

    const precio = r('€', (f as any).min_price, (f as any).max_price);
    const size = r('m²', (f as any).min_size, (f as any).max_size);
    const score = r('score', (f as any).min_score, (f as any).max_score);

    if (precio) partes.push(precio);
    if (size) partes.push(size);
    if (score) partes.push(score);

    const rooms = (f as any).rooms;
    if (rooms != null) partes.push(`${rooms}+ hab`);

    const floor = (f as any).floor;
    if (floor != null) partes.push(`planta ≥ ${floor}`);

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
