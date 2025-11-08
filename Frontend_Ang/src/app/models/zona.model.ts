export interface Zona {
  district: string;
  neighborhood?: string;
  avg_price: number;
  avg_score_zona: number;
  polygon?: GeoJSON.Feature<GeoJSON.Polygon>;
}
