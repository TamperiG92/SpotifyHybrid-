/**
 * ============================================================================
 * CONFIGURACIÓN CENTRAL DE SEGURIDAD (FRONTEND)
 * ============================================================================
 * Todos los "números mágicos" relacionados con seguridad viven aquí para que
 * puedan auditarse y ajustarse en un único lugar (principio de configuración
 * centralizada). Ningún valor de este archivo es secreto: TODO lo que se
 * empaqueta en el frontend es público y puede leerse desde el navegador, por
 * eso aquí NUNCA deben ir claves, tokens ni contraseñas.
 */
export const SECURITY_CONFIG = {
  /** Límites de longitud de los campos (evitan payloads gigantes / DoS). */
  limits: {
    /** RFC 5321: longitud máxima práctica de una dirección de correo. */
    emailMaxLength: 254,
    /** OWASP ASVS 2.1.1: contraseñas de al menos 8 caracteres. */
    passwordMinLength: 8,
    /** OWASP ASVS 2.1.2: permitir al menos 64; se limita a 128 para evitar DoS por hashing. */
    passwordMaxLength: 128,
  },

  /**
   * Protección contra fuerza bruta en el cliente.
   * IMPORTANTE: es una defensa en profundidad y de UX; el límite REAL
   * (rate limiting / bloqueo de cuenta) debe aplicarlo el backend, ya que un
   * atacante puede saltarse cualquier control del navegador.
   */
  throttle: {
    /** Intentos fallidos permitidos antes de bloquear temporalmente. */
    maxAttempts: 5,
    /** Duración del primer bloqueo (ms). */
    baseLockoutMs: 30_000,
    /** Tope del bloqueo exponencial (ms). */
    maxLockoutMs: 15 * 60_000,
    /** Clave de almacenamiento (solo guarda contadores, nunca datos personales). */
    storageKey: 'sh.login.throttle',
  },

  /** Gestión de sesión. */
  session: {
    /** Cierre de sesión automático tras inactividad (OWASP ASVS 3.3). */
    idleTimeoutMs: 15 * 60_000,
    /** Cada cuánto se comprueba la inactividad (ms). */
    idleCheckIntervalMs: 30_000,
  },

  /** Tiempo máximo de espera de una petición HTTP antes de abortarla. */
  httpTimeoutMs: 15_000,
} as const;
