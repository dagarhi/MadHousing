import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Propiedad } from '../models/propiedad.model';

@Injectable({ providedIn: 'root' })
export class FavoritosService {
  private favoritosSubject = new BehaviorSubject<Propiedad[]>(this.cargar());
  favoritos$ = this.favoritosSubject.asObservable();

  private cargar(): Propiedad[] {
    const data = localStorage.getItem('favoritos');
    return data ? JSON.parse(data) : [];
  }

  private guardar(favs: Propiedad[]) {
    localStorage.setItem('favoritos', JSON.stringify(favs));
  }

  toggleFavorito(piso: Propiedad) {
    const actual = this.favoritosSubject.value;
    const existe = actual.some(f => f.propertyCode === piso.propertyCode);
    const nuevos = existe
      ? actual.filter(f => f.propertyCode !== piso.propertyCode)
      : [...actual, piso];
    this.guardar(nuevos);
    this.favoritosSubject.next(nuevos);
  }

  borrarTodos() {
    localStorage.removeItem('favoritos');
    this.favoritosSubject.next([]);
  }
  get currentFavoritos(): Propiedad[] {
    return this.favoritosSubject.value;
  }

}
