import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, distinctUntilChanged, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoService } from '@jsverse/transloco';
import { Propiedad } from '../models/propiedad.model';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { notifyError } from '../utils/notify-error';

interface FavoriteDto {
  id: number;
  property_code: string;
  created_at: string;
  nota: string;
  propiedad: Propiedad;
}

@Injectable({ providedIn: 'root' })
export class FavoritosService {
  private readonly baseUrl = `${environment.apiBaseUrl}/favoritos`;

  private favoritosSubject = new BehaviorSubject<Propiedad[]>([]);
  favoritos$ = this.favoritosSubject.asObservable();

  /** Map propertyCode -> favorite ID in backend */
  private idsPorProperty = new Map<string, number>();
  /** Map propertyCode -> nota */
  private notasPorProperty = new Map<string, string>();

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private snack: MatSnackBar,
    private transloco: TranslocoService,
  ) {
    // Resetea y recarga al cambiar de usuario para no cachear favoritos
    // de la sesión anterior cuando entra otro usuario.
    this.auth.currentUser$
      .pipe(distinctUntilChanged((a, b) => a?.userId === b?.userId))
      .subscribe((user) => {
        if (user) this.cargarDesdeServidor();
        else this.clearLocal();
      });
  }

  private cargarDesdeServidor(): void {
    this.http.get<FavoriteDto[]>(this.baseUrl).subscribe({
      next: (lista) => {
        const props: Propiedad[] = [];
        this.idsPorProperty.clear();
        this.notasPorProperty.clear();

        for (const fav of lista) {
          if (fav.property_code) {
            this.idsPorProperty.set(fav.property_code, fav.id);
            this.notasPorProperty.set(fav.property_code, fav.nota ?? '');
          }
          if (fav.propiedad) {
            props.push(fav.propiedad);
          }
        }

        this.favoritosSubject.next(props);
      },
      error: (err) => {
        console.error('[FavoritosService] Error loading favorites', err);
        this.idsPorProperty.clear();
        this.notasPorProperty.clear();
        this.favoritosSubject.next([]);
      },
    });
  }

  get currentFavoritos(): Propiedad[] {
    return this.favoritosSubject.value;
  }

  esFavorito(propertyCode?: string | null): boolean {
    if (!propertyCode) return false;
    return this.idsPorProperty.has(String(propertyCode));
  }

  toggleFavorito(piso: Propiedad): void {
    const propertyCode = piso.propertyCode;
    if (!propertyCode) {
      console.warn('[FavoritosService] toggleFavorito called without propertyCode');
      return;
    }

    if (this.idsPorProperty.has(propertyCode)) {
      // DELETE
      const favId = this.idsPorProperty.get(propertyCode)!;
      this.http.delete(`${this.baseUrl}/${favId}`).subscribe({
        next: () => {
          this.idsPorProperty.delete(propertyCode);
          const nuevos = this.currentFavoritos.filter(
            (p) => p.propertyCode !== propertyCode,
          );
          this.favoritosSubject.next(nuevos);
        },
        error: (err) => {
          console.error('[FavoritosService] Error deleting favorite', err);
          notifyError(this.snack, this.transloco, err, 'DRAWER_FAVORITOS.ERRORS.DELETE');
        },
      });
      return;
    }

    // CREATE
    this.http
      .post<FavoriteDto>(this.baseUrl, { property_code: propertyCode })
      .subscribe({
        next: (resp) => {
          const prop = resp.propiedad ?? piso;
          this.idsPorProperty.set(propertyCode, resp.id);
          this.notasPorProperty.set(propertyCode, resp.nota ?? '');

          const actuales = this.currentFavoritos;
          const yaEstaba = actuales.some(
            (p) => p.propertyCode === propertyCode,
          );
          if (!yaEstaba) {
            this.favoritosSubject.next([...actuales, prop]);
          }
        },
        error: (err) => {
          console.error('[FavoritosService] Error creating favorite', err);
          notifyError(this.snack, this.transloco, err, 'DRAWER_FAVORITOS.ERRORS.CREATE');
        },
      });
  }

  getNota(propertyCode?: string | null): string {
    if (!propertyCode) return '';
    return this.notasPorProperty.get(String(propertyCode)) ?? '';
  }

  updateNota(propertyCode: string, nota: string): Observable<void> {
    const id = this.idsPorProperty.get(propertyCode);
    if (!id) return new Observable((obs) => obs.error('Favorito no encontrado'));
    return new Observable((obs) => {
      this.http.patch<FavoriteDto>(`${this.baseUrl}/${id}`, { nota }).subscribe({
        next: (resp) => {
          this.notasPorProperty.set(propertyCode, resp.nota ?? '');
          obs.next();
          obs.complete();
        },
        error: (err) => obs.error(err),
      });
    });
  }

  borrarTodos(): void {
    const ids = Array.from(this.idsPorProperty.values());
    if (ids.length === 0) return;

    // Limpia local de forma optimista; reloadFromServer al final garantiza
    // que si alguna DELETE falla, el estado refleja la BBDD real.
    this.idsPorProperty.clear();
    this.notasPorProperty.clear();
    this.favoritosSubject.next([]);

    let bulkFailed = false;
    const deletes = ids.map((id) =>
      this.http.delete(`${this.baseUrl}/${id}`).pipe(
        catchError((err) => {
          console.error('[FavoritosService] Error deleting favorite (bulk)', err);
          bulkFailed = true;
          return of(null);
        }),
      ),
    );

    forkJoin(deletes).subscribe(() => {
      this.cargarDesdeServidor();
      if (bulkFailed) {
        notifyError(this.snack, this.transloco, null, 'DRAWER_FAVORITOS.ERRORS.DELETE_ALL');
      }
    });
  }

  reloadFromServer(): void {
    this.cargarDesdeServidor();
  }

  clearLocal(): void {
    this.idsPorProperty.clear();
    this.notasPorProperty.clear();
    this.favoritosSubject.next([]);
  }
}
