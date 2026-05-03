/**
 * Estadísticas agregadas devueltas por GET /buscar.stats.
 *
 * El backend devuelve además `contexto` y `final` (5 campos en total),
 * pero el frontend actual solo consume 3. Si en el futuro la UI muestra
 * sliders de score contextual o final, ampliar esta interface.
 */
export interface RangeStat {
  min: number;
  max: number;
}

export interface Stats {
  price: RangeStat;
  size:  RangeStat;
  score: RangeStat;
}
