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
  score?: number;

  latitude?: number;
  longitude?: number;
  location?: {
    lat?: number;
    lon?: number;
    lng?: number;
  };

  url?: string;
  operation?: 'sale' | 'rent';
}
