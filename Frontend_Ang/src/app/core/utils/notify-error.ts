import type { MatSnackBar } from '@angular/material/snack-bar';
import type { TranslocoService } from '@jsverse/transloco';
import { mapBackendError } from './backend-errors';

/**
 * Helper unificado de notificación de error al usuario:
 * traduce el error del backend (o usa el fallback) y lo muestra
 * en un snackbar de 4 s con botón OK.
 *
 * Política: usar SOLO en errores que el usuario haya iniciado
 * (login, guardar/borrar favorito, búsqueda, abrir un drawer, etc.).
 * Para cargas de fondo, dejar `console.error` silencioso.
 */
export function notifyError(
  snack: MatSnackBar,
  transloco: TranslocoService,
  err: unknown,
  fallbackKey: string,
): void {
  const key = mapBackendError(err, fallbackKey);
  snack.open(transloco.translate(key), 'OK', { duration: 4000 });
}
