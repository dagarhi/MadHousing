import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { Propiedad } from '../models/propiedad.model';
import { environment } from '../../../environments/environment';

interface FavoriteDto {
  id: number;
  property_code: string;
  created_at: string;
  propiedad: Propiedad;
}

@Injectable({ providedIn: 'root' })
export class FavoritosService {
  private readonly baseUrl = `${environment.apiBaseUrl}/favoritos`;

  private favoritosSubject = new BehaviorSubject<Propiedad[]>([]);
  favoritos$ = this.favoritosSubject.asObservable();

  /** Mapa propertyCode -> id de favorito en backend */
  private idsPorProperty = new Map<string, number>();

  constructor(private http: HttpClient) {
    this.cargarDesdeServidor();
  }

  /** Carga los favoritos del usuario autenticado desde la API */
  private cargarDesdeServidor(): void {
    this.http.get<FavoriteDto[]>(this.baseUrl).subscribe({
      next: (lista) => {
        const props: Propiedad[] = [];
        this.idsPorProperty.clear();

        for (const fav of lista) {
          if (fav.property_code) {
            this.idsPorProperty.set(fav.property_code, fav.id);
          }
          if (fav.propiedad) {
            props.push(fav.propiedad);
          }
        }

        this.favoritosSubject.next(props);
      },
      error: (err) => {
        console.error('[FavoritosService] Error al cargar favoritos', err);
        this.idsPorProperty.clear();
        this.favoritosSubject.next([]);
      },
    });
  }

  /** Snapshot síncrono de la lista de favoritos */
  get currentFavoritos(): Propiedad[] {
    return this.favoritosSubject.value;
  }

  esFavorito(propertyCode?: string | null): boolean {
    if (!propertyCode) return false;
    return this.idsPorProperty.has(String(propertyCode));
  }

  /** Alterna favorito para el piso dado, sincronizado con backend */
  toggleFavorito(piso: Propiedad): void {
    const propertyCode = String((piso as any).propertyCode ?? '');
    if (!propertyCode) {
      console.warn('[FavoritosService] toggleFavorito sin propertyCode');
      return;
    }

    // Caso 1: ya es favorito -> eliminar
    if (this.idsPorProperty.has(propertyCode)) {
      const favId = this.idsPorProperty.get(propertyCode)!;

      this.http.delete(`${this.baseUrl}/${favId}`).subscribe({
        next: () => {
          this.idsPorProperty.delete(propertyCode);
          const nuevos = this.currentFavoritos.filter(
            (p) => String((p as any).propertyCode) !== propertyCode,
          );
          this.favoritosSubject.next(nuevos);
        },
        error: (err) => {
          console.error('[FavoritosService] Error eliminando favorito', err);
        },
      });

      return;
    }

    // Caso 2: no es favorito -> crear
    this.http
      .post<FavoriteDto>(this.baseUrl, { property_code: propertyCode })
      .subscribe({
        next: (resp) => {
          const prop = (resp.propiedad as Propiedad) ?? piso;
          this.idsPorProperty.set(propertyCode, resp.id);

          const actuales = this.currentFavoritos;
          const yaEstaba = actuales.some(
            (p) => String((p as any).propertyCode) === propertyCode,
          );
          if (!yaEstaba) {
            this.favoritosSubject.next([...actuales, prop]);
          }
        },
        error: (err) => {
          console.error('[FavoritosService] Error creando favorito', err);
        },
      });
  }

  /** Borra TODOS los favoritos del usuario (frontend + backend, uno a uno) */
  borrarTodos(): void {
    const ids = Array.from(this.idsPorProperty.values());

    this.idsPorProperty.clear();
    this.favoritosSubject.next([]);

    ids.forEach((id) => {
      this.http.delete(`${this.baseUrl}/${id}`).subscribe({
        error: (err) =>
          console.error('[FavoritosService] Error borrando favorito (masivo)', err),
      });
    });
  }

  reloadFromServer(): void {
    this.cargarDesdeServidor();
  }
  clearLocal(): void {
    this.idsPorProperty.clear();
    this.favoritosSubject.next([]);
  }

}
