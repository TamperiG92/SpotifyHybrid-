/**
 * ============================================================================
 * MODELOS DE AUTENTICACIÓN
 * ============================================================================
 * El backend devuelve un TOKEN DE SESIÓN al iniciar sesión. El token se guarda
 * con Capacitor Preferences (ver token-storage.service.ts) y viaja en la
 * cabecera `Authorization: Bearer ...` SOLO hacia nuestra API.
 *
 * El token es un JWT: su payload es Base64 LEGIBLE por cualquiera, por eso el
 * backend solo incluye en él datos no sensibles (id de usuario y caducidad).
 * Nunca contraseñas, emails ni permisos que el cliente pueda "creerse".
 */

/** Datos que el usuario introduce en el formulario de login. */
export interface LoginCredentials {
  /** Correo electrónico o nombre de usuario (ya normalizado). */
  readonly identifier: string;
  readonly password: string;
  /**
   * "Remember me": pide al backend una sesión más larga (7 días en lugar de
   * 30 minutos). La contraseña JAMÁS se guarda en el dispositivo.
   */
  readonly rememberMe: boolean;
}

/** Datos del formulario de registro (campos mínimos: nombre, email y contraseña). */
export interface RegisterData {
  readonly fullName: string;
  readonly email: string;
  readonly password: string;
  readonly acceptTerms: boolean;
}

/** Perfil público mínimo del usuario (principio de mínimo privilegio/datos). */
export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
}

/** Respuesta del endpoint de sesión (`GET /auth/session`). */
export interface AuthResponse {
  readonly user: AuthUser;
  /** Instante (epoch ms) en que caduca la sesión en el servidor. */
  readonly expiresAt: number;
}

/** Respuesta del login: la sesión + el token que se debe almacenar. */
export interface LoginResponse extends AuthResponse {
  readonly token: string;
}

/** Sesión mantenida en memoria (el token va aparte, en Preferences). */
export interface UserSession extends AuthResponse {}

/** Motivos por los que puede fallar un login, mapeados a mensajes genéricos. */
export type LoginFailureReason =
  | 'invalid-credentials'
  | 'locked'
  | 'rate-limited'
  | 'network'
  | 'unknown';

/** Motivos por los que puede fallar un registro. */
export type RegisterFailureReason = 'not-available' | 'invalid-data' | 'network' | 'unknown';

/**
 * Formato JWT (header.payload.firma en Base64URL) y tamaño acotado.
 * Se usa para descartar valores manipulados en el almacenamiento.
 */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,512}\.[A-Za-z0-9_-]{1,2048}\.[A-Za-z0-9_-]{1,512}$/;

export function isWellFormedToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

/**
 * Validación defensiva de la respuesta del servidor ("no confíes en nada que
 * llegue de la red"). Si la respuesta no tiene la forma esperada se descarta.
 */
export function isAuthResponse(value: unknown): value is AuthResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const user = candidate['user'] as Record<string, unknown> | undefined;
  return (
    typeof candidate['expiresAt'] === 'number' &&
    Number.isFinite(candidate['expiresAt']) &&
    typeof user === 'object' &&
    user !== null &&
    typeof user['id'] === 'string' &&
    typeof user['email'] === 'string' &&
    typeof user['displayName'] === 'string'
  );
}

export function isLoginResponse(value: unknown): value is LoginResponse {
  return isAuthResponse(value) && isWellFormedToken((value as unknown as Record<string, unknown>)['token']);
}
