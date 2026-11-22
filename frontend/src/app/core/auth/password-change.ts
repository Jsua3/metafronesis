/**
 * Cambio de contraseña obligatorio (E2-9, RN-10): una cuenta aprobada por el administrador entra con una contraseña
 * temporal y el servidor responde 403 con este código a toda orden salvo `/api/auth/**` hasta que la persona fije la
 * suya. La pantalla vive fuera del portal, en esta ruta.
 */
export const CHANGE_PASSWORD_PATH = '/cambiar-contrasena';
export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';
/** Mínimo del servidor (`AUTH_PASSWORD_VALIDATORS`, E2-9); la interfaz decía 8. */
export const PASSWORD_MIN_LENGTH = 10;
