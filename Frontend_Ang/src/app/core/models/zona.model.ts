export interface ZonasJerarquicas {
  [municipio: string]: {
    [distrito: string]: string[]; // barrios
  };
}
