export interface FiltrosBuscar {
  ciudad: string;             // requerido por /buscar
  operation?: 'rent' | 'sale';
  minPrice?: number;
  maxPrice?: number;
  minSize?: number;
  maxSize?: number;
  rooms?: number;
  hasLift?: boolean;
  page?: number;              // default 1
  perPage?: number;           // default 20
}
