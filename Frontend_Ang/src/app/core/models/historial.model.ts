import { FiltroBusqueda } from './filtros.model';
export interface HistorialItem {
  id: string;               // uid
  fechaISO: string;         // timestamp ISO
  resumen: string;          // para mostrar en la lista
  filtros: FiltroBusqueda;  // snapshot de los filtros
  hash: string;             // huella deduplicación (sin fecha)
}