// Tipos para las variables de entorno inyectadas por @ngx-env/builder
// en build-time. Solo se expone lo que empieza por NG_APP_*.
//
// Declaramos `process` directamente como global (en lugar de usar
// @types/node) porque solo necesitamos `process.env` y nada más del
// runtime de Node en el bundle del navegador.
declare const process: {
  env: {
    readonly NG_APP_MAPTILER_KEY: string;
    readonly NG_APP_ORS_API_KEY: string;
  };
};
