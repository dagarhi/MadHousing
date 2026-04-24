export interface Propiedad {
  propertyCode: string;
  address?: string;
  city?: string;
  district?: string;
  neighborhood?: string;

  price?: number;
  size?: number;
  rooms?: number;
  bathrooms?: number;
  floor?: number;

  hasLift?: boolean;
  score_intrinseco?: number;
  score_contexto?: number;
  score_final?: number;
  score?: number;

  dist_transport_m?: number;
  dist_health_m?: number;
  dist_education_m?: number;
  dist_park_m?: number;
  dist_commerce_m?: number;
  dist_bike_m?: number;

  latitude?: number;
  longitude?: number;
  location?: {
    lat?: number;
    lon?: number;
    lng?: number;
  };

  url?: string;
  operation?: 'sale' | 'rent';
  tipo?: string; // added for compatibility
}
