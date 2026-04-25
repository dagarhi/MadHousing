/**
 * Mapeo entre los `detail` que devuelve el backend (en español, hardcoded
 * en FastAPI) y las claves i18n del frontend. Permite que el cliente muestre
 * estos mensajes en el idioma activo sin tocar el backend.
 *
 * Cuando se traduzca el backend (Accept-Language en main.py), este mapa
 * pasa a ser un fallback / capa de compatibilidad.
 */
export const BACKEND_ERROR_KEY_MAP: Readonly<Record<string, string>> = {
  // Auth (login + register)
  'Usuario o contraseña incorrectos':            'LOGIN.ERRORS.BAD_CREDENTIALS',
  'El nombre de usuario ya está en uso':         'LOGIN.ERRORS.USERNAME_TAKEN',

  // Admin (gestión de usuarios)
  'Acceso restringido a administradores':        'ADMIN.ERRORS.FORBIDDEN',
  'No puedes modificar tu propio rol':           'ADMIN.ERRORS.SELF_ROLE',
  'Rol inválido. Valores permitidos: USER, ADMIN': 'ADMIN.ERRORS.INVALID_ROLE',
  'No puedes eliminar tu propia cuenta':         'ADMIN.ERRORS.SELF_DELETE',
  'Usuario no encontrado':                       'ADMIN.ERRORS.USER_NOT_FOUND',
};

/**
 * Resuelve el detail del error HTTP a una clave i18n.
 * Si el detail no está en el mapa, devuelve la `fallbackKey` que pase el caller.
 */
export function mapBackendError(err: unknown, fallbackKey: string): string {
  const detail =
    typeof err === 'object' && err !== null
      ? (err as { error?: { detail?: unknown } }).error?.detail
      : undefined;

  if (typeof detail !== 'string') return fallbackKey;
  return BACKEND_ERROR_KEY_MAP[detail] ?? fallbackKey;
}
