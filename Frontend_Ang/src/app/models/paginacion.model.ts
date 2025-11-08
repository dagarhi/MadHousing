import { Propiedad } from './propiedad.model';

export interface RangoMinMax {
  min: number;
  max: number;
}

export interface BuscarStats {
  price: RangoMinMax;
  size: RangoMinMax;
  score: RangoMinMax;
}

export interface BuscarResponse {
  ciudad_consultada: string;
  operation: 'rent' | 'sale';
  total: number;
  pagina: number;
  por_pagina: number;
  propiedades: Propiedad[];
  stats: BuscarStats;
}

export interface BuscarTodoResponse {
  total: number;
  pagina: number;
  por_pagina: number;
  propiedades: Propiedad[];
  origen: string;
}
