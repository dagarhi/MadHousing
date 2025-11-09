import { FiltroBusqueda } from './filtros.model';
export interface HistorialItem {
  fecha: string; // ejemplo: "9/11/2025, 17:35:22"
  ciudad?: string;
  operation: 'sale' | 'rent';
  cantidad: number;
  filtros?: FiltroBusqueda;
}
