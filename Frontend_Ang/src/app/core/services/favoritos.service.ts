import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { Propiedad } from '../models/propiedad.model';
import { environment } from '../../../environments/environment';

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

  constructor(private http: HttpClient) {
    this.cargarDesdeServidor();
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
        error: (err) => console.error('[FavoritosService] Error deleting favorite', err),
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
        error: (err) => console.error('[FavoritosService] Error creating favorite', err),
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
    this.idsPorProperty.clear();
    this.notasPorProperty.clear();
    this.favoritosSubject.next([]);

    ids.forEach((id) => {
      this.http.delete(`${this.baseUrl}/${id}`).subscribe({
        error: (err) =>
          console.error('[FavoritosService] Error deleting favorite (bulk)', err),
      });
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
