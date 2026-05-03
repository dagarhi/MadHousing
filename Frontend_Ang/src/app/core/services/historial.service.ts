import { Injectable } from '@angular/core';
import { BehaviorSubject, distinctUntilChanged, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HistorialItem } from '../models/historial.model';
import { FiltroBusqueda } from '../models/filtros.model';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { TranslocoService } from '@jsverse/transloco';
import { notifyError } from '../utils/notify-error';

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

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private transloco: TranslocoService,
    private snack: MatSnackBar,
  ) {
    // El servicio es singleton; reaccionamos a cambios de sesión para que
    // el historial de un usuario no se quede cacheado al entrar otro.
    this.auth.currentUser$
      .pipe(distinctUntilChanged((a, b) => a?.userId === b?.userId))
      .subscribe((user) => {
        if (user) this.cargarDesdeServidor();
        else this.clearLocal();
      });
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
      error: (err) => {
        console.error('[HistorialService] Error deleting history', err);
        notifyError(this.snack, this.transloco, err, 'DRAWER_HISTORIAL.ERRORS.DELETE');
      },
    });
  }

  borrarTodos() {
    const actual = [...this.currentHistorial];
    if (actual.length === 0) return;

    // Optimistic clear, luego recargamos desde servidor para reflejar la
    // verdad (si alguna DELETE falló, los items reaparecerán en vez de
    // quedar como "borrados" en el cliente pero persistentes en BBDD).
    this.historialSubject.next([]);

    let bulkFailed = false;
    const deletes = actual
      .map((item) => Number(item.id))
      .filter((n) => Number.isFinite(n))
      .map((id) =>
        this.http.delete(`${this.baseUrl}/${id}`).pipe(
          catchError((err) => {
            console.error('[HistorialService] Error deleting history (bulk)', err);
            bulkFailed = true;
            return of(null);
          }),
        ),
      );

    if (deletes.length === 0) return;

    forkJoin(deletes).subscribe(() => {
      this.cargarDesdeServidor();
      if (bulkFailed) {
        notifyError(this.snack, this.transloco, null, 'DRAWER_HISTORIAL.ERRORS.DELETE_ALL');
      }
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

  /**
   * Construye el resumen visible en el drawer de historial. Se traduce en el
   * momento de creación con el idioma activo. Si el usuario cambia de idioma
   * a mitad de sesión, los items previos conservan su idioma original (la
   * próxima recarga desde el servidor los regenera con el idioma activo).
   */
  private renderResumen(f: FiltroBusqueda): string {
    const t = (key: string, params?: object) => this.transloco.translate(key, params);
    const partes: string[] = [];
    if (f.municipio) partes.push(f.municipio);
    if (f.operation) {
      partes.push(t(f.operation === 'rent' ? 'COMMON.OPERATION.RENT_LOWER' : 'COMMON.OPERATION.SALE_LOWER'));
    }

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

    if (f.rooms != null) partes.push(t('DRAWER_HISTORIAL.RESUMEN_ROOMS', { n: f.rooms }));
    if (f.floor != null) partes.push(t('DRAWER_HISTORIAL.RESUMEN_FLOOR', { n: f.floor }));

    return partes.join(' · ') || t('DRAWER_HISTORIAL.RESUMEN_DEFAULT');
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
