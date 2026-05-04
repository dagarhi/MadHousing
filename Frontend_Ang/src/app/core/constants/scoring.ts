// Pesos del score_final, espejo de Backend/services/scoring.py:25-26
// (W_INTRINSECO, W_CONTEXTO). Mantener sincronizado a mano: un cambio
// en backend debe replicarse aquí. La fuente de verdad sigue siendo
// el backend; estas constantes existen para mostrar al usuario cómo
// se combinan los componentes en el panel de explicabilidad del score.
export const W_INTRINSECO = 0.4;
export const W_CONTEXTO = 0.6;
