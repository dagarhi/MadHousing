export interface ResumenOperacion {
  count: number;
  precio_medio: number;
  tamano_medio: number;
  score_medio: number;
}

// zona (clave string) -> { sale, rent }
export type EstadisticasGlobales = Record<string, {
  sale: ResumenOperacion;
  rent: ResumenOperacion;
}>;
