export interface Propiedad {
  id: any;
  propertyCode: string;
  url: string;
  operation: 'sale' | 'rent' | string;
  price: number;
  size: number;
  rooms: number;
  bathrooms: number;
  floor: string;
  address: string;
  district: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  hasLift: boolean;
  exterior: boolean;
  score_intrinseco: number;
  score_zona: number;
  score_planta: number;
  score_final: number;
  city: string;
}
