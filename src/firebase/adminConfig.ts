/**
 * Configuración de Cuentas Administradoras y Permisos de Acceso para Lavadero eLeGe
 * Etapa 2: Autenticación de Administradora con Firebase Auth
 */

/**
 * Lista extensible de UIDs autorizados para acceder con rol de Administradora
 * a la plataforma de Lavadero eLeGe.
 */
export const AUTHORIZED_ADMIN_UIDS: readonly string[] = [
  'eBvTLPVNQIefDTc52fmcmK0ID0K3', // Administradora Principal (admin@elege.com)
];

/**
 * Correo oficial predeterminado de administración
 */
export const DEFAULT_ADMIN_EMAIL = 'admin@elege.com';

/**
 * Verifica si un UID de usuario autenticado corresponde a una administradora autorizada
 */
export function isAuthorizedAdminUid(uid: string | null | undefined): boolean {
  if (!uid) return false;
  return AUTHORIZED_ADMIN_UIDS.includes(uid);
}

/**
 * Convierte los códigos de error de Firebase Authentication en mensajes claros en español
 */
export function getAuthErrorMessage(codeOrMessage: string): string {
  if (!codeOrMessage) {
    return 'No pudimos conectar con el sistema. Intentá nuevamente';
  }

  const code = codeOrMessage.toLowerCase();

  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
    return 'Correo electrónico o contraseña incorrectos. Verificá los datos ingresados.';
  }

  if (code.includes('invalid-email')) {
    return 'El formato del correo electrónico ingresado no es válido.';
  }

  if (code.includes('user-disabled')) {
    return 'Esta cuenta de administradora ha sido deshabilitada.';
  }

  if (code.includes('too-many-requests')) {
    return 'Demasiados intentos fallidos. Por seguridad, esperá unos momentos antes de reintentar.';
  }

  if (code.includes('unauthorized-uid')) {
    return 'Acceso denegado: este usuario no tiene permisos de administradora en Lavadero eLeGe.';
  }

  // Cualquier otro error de red, API key, inicialización o Firebase
  return 'No pudimos conectar con el sistema. Intentá nuevamente';
}

