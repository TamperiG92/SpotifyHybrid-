/**
 * ============================================================================
 * NORMALIZACIÓN / SANEAMIENTO DE ENTRADAS
 * ============================================================================
 * Requisito: "Validar y sanear toda entrada del usuario antes de usarla".
 *
 * Notas de diseño:
 *  - Angular ya escapa automáticamente todo lo que se pinta con {{ }} o
 *    [property], por lo que el saneamiento aquí NO es para evitar XSS al
 *    renderizar, sino para enviar al backend datos canónicos y limpios.
 *  - La contraseña NUNCA se modifica (ni trim, ni minúsculas): alterarla
 *    cambiaría el secreto del usuario. Solo se valida su longitud.
 *  - El backend debe repetir SIEMPRE la validación: el cliente es manipulable.
 */

/**
 * Caracteres de control ASCII (U+0000–U+001F, U+007F) y caracteres invisibles
 * de formato (zero-width, BOM, marcas bidi) usados en ataques de suplantación
 * visual ("homograph"/"bidi spoofing") o para inyectar saltos de línea.
 */
const CONTROL_AND_INVISIBLE_CHARS = /[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

/**
 * Normaliza el identificador ("Email or username"):
 *  1. Unicode NFKC → evita que dos cadenas visualmente iguales sean distintas.
 *  2. Elimina caracteres de control / invisibles.
 *  3. Recorta espacios y pasa a minúsculas (el dominio no distingue mayúsculas).
 */
export function normalizeIdentifier(raw: unknown): string {
  if (typeof raw !== 'string') {
    return '';
  }
  return raw
    .normalize('NFKC')
    .replace(CONTROL_AND_INVISIBLE_CHARS, '')
    .trim()
    .toLowerCase();
}

/**
 * Devuelve true si el texto contiene caracteres de control o invisibles.
 * Se usa en validadores para rechazar (y no solo limpiar en silencio) entradas
 * sospechosas.
 */
export function hasControlChars(value: string): boolean {
  CONTROL_AND_INVISIBLE_CHARS.lastIndex = 0;
  const found = CONTROL_AND_INVISIBLE_CHARS.test(value);
  CONTROL_AND_INVISIBLE_CHARS.lastIndex = 0;
  return found;
}

/**
 * PREVENCIÓN DE "OPEN REDIRECT" (OWASP: Unvalidated Redirects and Forwards).
 *
 * Tras el login se redirige a `returnUrl` (query param). Si no se valida, un
 * atacante podría enviar un enlace como:
 *     /login?returnUrl=https://sitio-malicioso.com
 * y, tras autenticarse, la víctima acabaría en una web de phishing.
 *
 * Reglas: solo rutas internas relativas que empiecen por "/" (no "//", que el
 * navegador interpreta como otro dominio), sin esquema (javascript:, data:…),
 * sin barras invertidas y presentes en la lista blanca de rutas permitidas.
 */
const ALLOWED_REDIRECT_PREFIXES = ['/home'] as const;
export const DEFAULT_AUTHENTICATED_ROUTE = '/home';

export function sanitizeReturnUrl(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) {
    return DEFAULT_AUTHENTICATED_ROUTE;
  }

  let decoded: string;
  try {
    // Se decodifica para detectar trucos como "%2F%2Fevil.com" o "javascript%3A".
    decoded = decodeURIComponent(raw);
  } catch {
    return DEFAULT_AUTHENTICATED_ROUTE;
  }

  const isRelative = decoded.startsWith('/') && !decoded.startsWith('//');
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(decoded) || decoded.includes(':');
  const hasBackslash = decoded.includes('\\');
  const isWhitelisted = ALLOWED_REDIRECT_PREFIXES.some(
    (prefix) => decoded === prefix || decoded.startsWith(`${prefix}/`) || decoded.startsWith(`${prefix}?`),
  );

  if (!isRelative || hasScheme || hasBackslash || hasControlChars(decoded) || !isWhitelisted) {
    return DEFAULT_AUTHENTICATED_ROUTE;
  }
  return decoded;
}
