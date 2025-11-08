import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Propiedad } from '../../models/propiedad.model';

@Injectable({ providedIn: 'root' })
export class FavoritosService {
  private readonly STORAGE_KEY = 'favoritos';
  private favoritosSubject: BehaviorSubject<Propiedad[]>;

  favoritos$ = new BehaviorSubject<Propiedad[]>([]);

  constructor() {
    const inicial = this.cargarFavoritos();
    this.favoritosSubject = new BehaviorSubject<Propiedad[]>(inicial);
    this.favoritos$ = this.favoritosSubject;
  }

  /** Carga inicial desde localStorage */
  private cargarFavoritos(): Propiedad[] {
    const data = localStorage.getItem(this.STORAGE_KEY);
    try {
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  /** Guarda lista actual en localStorage */
  private guardar(favoritos: Propiedad[]) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(favoritos));
  }

  /** Devuelve la lista actual de favoritos */
  getFavoritos(): Propiedad[] {
    return this.favoritosSubject.getValue();
  }

  /** Añade o quita una propiedad de favoritos */
  toggleFavorito(propiedad: Propiedad) {
    const lista = this.getFavoritos();
    const existe = lista.some(p => p.propertyCode === propiedad.propertyCode);

    const nuevaLista = existe
      ? lista.filter(p => p.propertyCode !== propiedad.propertyCode)
      : [...lista, propiedad];

    this.guardar(nuevaLista);
    this.favoritosSubject.next(nuevaLista);
  }

  /** Limpia toda la lista */
  clearFavoritos() {
    this.guardar([]);
    this.favoritosSubject.next([]);
  }

  /** Verifica si una propiedad está marcada */
  esFavorito(code: string): boolean {
    return this.getFavoritos().some(p => p.propertyCode === code);
  }
}
