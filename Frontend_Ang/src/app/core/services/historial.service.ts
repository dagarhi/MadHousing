import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { HistorialItem } from '../models/historial.model';
import { FiltroBusqueda } from '../models/filtros.model';

@Injectable({ providedIn: 'root' })
export class HistorialService {
  private readonly STORAGE_KEY = 'historial_busquedas_v1';
  private readonly MAX = 20;

  private historialSubject = new BehaviorSubject<HistorialItem[]>(this.cargar());
  historial$ = this.historialSubject.asObservable();

  add(filtros: FiltroBusqueda, resumen?: string): HistorialItem {
    const nowISO = new Date().toISOString();
    const id = `${nowISO}-${Math.random().toString(36).slice(2, 8)}`;
    const hash = this.hashFiltros(filtros);

    const item: HistorialItem = {
      id,
      fechaISO: nowISO,
      filtros,
      hash,
      resumen: resumen ?? this.renderResumen(filtros),
    };

    // dedupe por hash (opcional): mueve al principio si existe
    const dedup = this.historialSubject.value.filter(h => h.hash !== hash);
    const nuevo = [item, ...dedup].slice(0, this.MAX);

    this.guardar(nuevo);
    this.historialSubject.next(nuevo);
    return item;
  }

  // ✅ BORRADO POR ID (consistente con tu item actual)
  eliminarById(id: string) {
    const nuevo = this.historialSubject.value.filter(h => h.id !== id);
    console.log('[Service] eliminarById', id);
    this.guardar(nuevo);
    this.historialSubject.next(nuevo);
  }

  borrarTodos() {
    sessionStorage.removeItem(this.STORAGE_KEY);
    this.historialSubject.next([]);
  }

  // -------- persistencia + migración --------
  private cargar(): HistorialItem[] {
    try {
      const raw = sessionStorage.getItem(this.STORAGE_KEY);
      const arr: any[] = raw ? JSON.parse(raw) : [];
      // 🔁 migración: normaliza a {id, fechaISO, ...}
      return arr.map((x) => {
        const fechaISO = x.fechaISO ?? x.fecha ?? new Date().toISOString();
        const id = x.id ?? `${fechaISO}-${Math.random().toString(36).slice(2, 8)}`;
        return {
          id,
          fechaISO,
          filtros: x.filtros,
          hash: x.hash ?? this.hashFiltros(x.filtros ?? {}),
          resumen: x.resumen ?? 'Búsqueda',
        } as HistorialItem;
      });
    } catch {
      return [];
    }
  }

  private guardar(historial: HistorialItem[]) {
    sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(historial));
  }

  // -------- helpers --------
  private renderResumen(f: FiltroBusqueda): string {
    const partes: string[] = [];
    const ciudad = (f as any).ciudad as string | undefined;
    const op = (f as any).operation as string | undefined;

    if (ciudad) partes.push(ciudad);
    if (op) partes.push(op === 'rent' ? 'alquiler' : 'venta');

    const r = (label: string, a?: number, b?: number) =>
      (a != null || b != null) ? `${label} ${a ?? ''}${(a!=null && b!=null) ? '–' : ''}${b ?? ''}`.trim() : undefined;

    const precio = r('€', (f as any).min_price, (f as any).max_price);
    const size   = r('m²', (f as any).min_size,  (f as any).max_size);
    const score  = r('score', (f as any).min_score, (f as any).max_score);

    if (precio) partes.push(precio);
    if (size) partes.push(size);
    if (score) partes.push(score);

    const rooms = (f as any).rooms;
    if (rooms != null) partes.push(`${rooms}+ hab`);

    const floor = (f as any).floor;
    if (floor != null) partes.push(`planta ≥ ${floor}`);

    return partes.join(' · ');
  }

  private hashFiltros(f: FiltroBusqueda): string {
    const stable = (obj: any): any => {
      if (Array.isArray(obj)) return obj.map(stable);
      if (obj && typeof obj === 'object') {
        return Object.keys(obj).sort().reduce((acc: any, k) => {
          acc[k] = stable(obj[k]); return acc;
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
}
