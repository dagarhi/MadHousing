export interface ZonasJerarquicas {
  [ciudad: string]: {
    [distrito: string]: string[]; // barrios
  };
}
