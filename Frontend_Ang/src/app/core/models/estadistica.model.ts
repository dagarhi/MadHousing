export interface EstadisticaZona {
  precio_medio?: number;
  tamano_medio?: number;
  score_medio?: number;
  count?: number;
}

export interface EstadisticasGlobales {
  [zona: string]: {
    sale?: EstadisticaZona;
    rent?: EstadisticaZona;
  };
}
