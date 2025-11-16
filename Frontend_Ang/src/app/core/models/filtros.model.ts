export interface FiltroBusqueda {
  municipio?: string;
  distrito?: string;
  barrio?: string;
  operation?: 'sale' | 'rent';

  min_price?: number;
  max_price?: number;
  min_size?: number;
  max_size?: number;
  min_score?: number;
  max_score?: number;

  rooms?: number;
  floor?: number;
  per_page?: number;
  mostrarTodo?: boolean;
}
