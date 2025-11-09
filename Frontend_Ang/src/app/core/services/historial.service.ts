import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { HistorialItem } from '../models/historial.model';

@Injectable({ providedIn: 'root' })
export class HistorialService {
  private historialSubject = new BehaviorSubject<HistorialItem[]>(this.cargar());
  historial$ = this.historialSubject.asObservable();

  private cargar(): HistorialItem[] {
    const data = localStorage.getItem('historial');
    return data ? JSON.parse(data) : [];
  }

  private guardar(historial: HistorialItem[]) {
    localStorage.setItem('historial', JSON.stringify(historial));
  }

  agregar(entrada: HistorialItem) {
    const nuevo = [entrada, ...this.historialSubject.value].slice(0, 10);
    this.guardar(nuevo);
    this.historialSubject.next(nuevo);
  }

  eliminar(fecha: string) {
    const nuevo = this.historialSubject.value.filter(h => h.fecha !== fecha);
    this.guardar(nuevo);
    this.historialSubject.next(nuevo);
  }

  borrarTodos() {
    localStorage.removeItem('historial');
    this.historialSubject.next([]);
  }
}
