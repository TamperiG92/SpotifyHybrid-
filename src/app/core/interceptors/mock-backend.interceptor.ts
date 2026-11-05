import { HttpErrorResponse, HttpHeaders, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, delay, dematerialize, materialize, of, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthResponse, LoginResponse } from '../auth/auth.models';
import { hasControlChars, normalizeIdentifier } from '../security/input-sanitizer';
import { SECURITY_CONFIG } from '../security/security.config';
import { PASSWORD_RULES, SecurityValidators } from '../security/security.validators';

/**
 * ============================================================================
 * BACKEND SIMULADO
 * ============================================================================
 * El proyecto aún no tiene servidor real: este interceptor responde a
 * /api/auth/* como lo haría un backend seguro. Cuando exista la API real,
 * `environment.useMockBackend = false` y este código ni se registra.
 *
 * Comportamientos de seguridad que emula (y que el backend REAL debe tener):
 *  - VALIDACIÓN BACKEND: repite todas las validaciones del formulario; el
 *    cliente no tiene la última palabra.
 *  - Respuesta 401 genérica, igual para usuario inexistente o clave errónea.
 *  - Latencia constante → no revela por tiempo si el usuario existe.
 *  - Rate limiting: 429 + `Retry-After` tras demasiados fallos.
 *  - Token JWT cuyo payload (Base64 legible) NO contiene datos sensibles.
 */

interface MockUser {
  readonly id: string;
  readonly email: string;
  readonly username: string | null;
  readonly displayName: string;
  // En un backend real se guardaría un hash Argon2id/bcrypt, nunca el texto plano.
  readonly password: string;
}

/**
 * "Base de datos" de usuarios. Vive SOLO en memoria: las cuentas creadas en
 * /register duran hasta que se recarga la página. Así la demo nunca escribe
 * contraseñas en el almacenamiento del dispositivo.
 */
const USERS: MockUser[] = [
  {
    id: 'u-0001',
    email: 'demo@spotifyhybrid.dev',
    username: 'demo',
    displayName: 'Demo User',
    password: 'Demo1234!',
  },
];

const SERVER_MAX_FAILURES = 10;
const CONSTANT_LATENCY_MS = 700;
let serverFailures = 0;

// ---------------------------------------------------------------------------
// Sesiones del "servidor": token → sesión. Se persisten para simular que el
// servidor recuerda las sesiones aunque se recargue la app.
// ---------------------------------------------------------------------------
const SESSIONS_KEY = 'sh.mock.server-sessions';

function loadSessions(): Record<string, AuthResponse> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? '{}') as Record<string, AuthResponse>;
    const now = Date.now();
    return Object.fromEntries(Object.entries(parsed).filter(([, s]) => s && s.expiresAt > now));
  } catch {
    return {};
  }
}

function saveSessions(sessions: Record<string, AuthResponse>): void {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch {
    /* sin almacenamiento: las sesiones viven solo en memoria */
  }
}

const sessions = loadSessions();

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Comparación en tiempo constante (evita ataques de temporización). */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function base64Url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Emite un JWT. El payload solo lleva `sub` (id), `iat` y `exp`: cualquiera
 * puede decodificarlo, así que NUNCA lleva email, contraseña ni roles.
 * La firma aquí es aleatoria (simulación); un servidor real la calcula con
 * HMAC/RSA y una clave secreta que jamás sale del backend.
 */
function issueToken(userId: string, expiresAt: number): string {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({ sub: userId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(expiresAt / 1000) }),
  );
  const signature = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  return `${header}.${payload}.${signature}`;
}

function bearerToken(req: HttpRequest<unknown>): string | null {
  const header = req.headers.get('Authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function ok<T>(body: T, status = 200): Observable<HttpResponse<T>> {
  return of(new HttpResponse({ status, body }));
}

function fail(status: number, url: string, headers?: Record<string, string>): Observable<never> {
  return throwError(
    () =>
      new HttpErrorResponse({
        status,
        url,
        headers: new HttpHeaders(headers ?? {}),
        error: { message: 'Request failed' },
      }),
  );
}

function str(body: Record<string, unknown>, key: string): string {
  return typeof body[key] === 'string' ? (body[key] as string) : '';
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

function login(req: HttpRequest<unknown>): Observable<HttpResponse<unknown>> {
  if (serverFailures >= SERVER_MAX_FAILURES) {
    serverFailures = 0;
    return fail(429, req.url, { 'Retry-After': '60' });
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const identifier = normalizeIdentifier(str(body, 'identifier'));
  const password = str(body, 'password');
  const rememberMe = body['rememberMe'] === true;

  // Se recorren TODOS los usuarios (sin cortar al encontrar) → tiempo constante.
  let match: MockUser | null = null;
  for (const user of USERS) {
    const idOk = safeEqual(identifier, user.email) || (user.username !== null && safeEqual(identifier, user.username));
    const passOk = safeEqual(password, user.password);
    if (idOk && passOk) {
      match = user;
    }
  }

  if (!match) {
    serverFailures++;
    return fail(401, req.url);
  }

  serverFailures = 0;
  // "Remember me" → sesión más larga (7 días) frente a 30 minutos.
  const ttl = rememberMe ? 7 * 24 * 60 * 60_000 : 30 * 60_000;
  const expiresAt = Date.now() + ttl;
  const session: AuthResponse = {
    user: { id: match.id, email: match.email, displayName: match.displayName },
    expiresAt,
  };
  const token = issueToken(match.id, expiresAt);
  sessions[token] = session;
  saveSessions(sessions);

  const response: LoginResponse = { ...session, token };
  return ok(response);
}

/** VALIDACIÓN BACKEND: se repiten las reglas del formulario sin confiar en el cliente. */
function register(req: HttpRequest<unknown>): Observable<HttpResponse<unknown>> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const fullName = str(body, 'fullName').trim();
  const email = normalizeIdentifier(str(body, 'email'));
  const password = str(body, 'password');
  const { passwordMinLength, passwordMaxLength, emailMaxLength } = SECURITY_CONFIG.limits;

  const valid =
    SecurityValidators.FULL_NAME_PATTERN.test(fullName) &&
    !hasControlChars(fullName) &&
    email.length <= emailMaxLength &&
    SecurityValidators.isValidEmail(email) &&
    password.length >= passwordMinLength &&
    password.length <= passwordMaxLength &&
    PASSWORD_RULES.every((rule) => rule.test(password)) &&
    body['acceptTerms'] === true;

  if (!valid) {
    return fail(400, req.url);
  }
  if (USERS.some((u) => safeEqual(u.email, email))) {
    return fail(409, req.url);
  }

  USERS.push({
    id: `u-${base64Url(crypto.getRandomValues(new Uint8Array(6)))}`,
    email,
    username: null,
    displayName: fullName,
    password,
  });
  return ok({}, 201);
}

function session(req: HttpRequest<unknown>): Observable<HttpResponse<unknown>> {
  const token = bearerToken(req);
  const current = token ? sessions[token] : undefined;
  if (!token || !current || current.expiresAt <= Date.now()) {
    if (token) {
      delete sessions[token];
      saveSessions(sessions);
    }
    return fail(401, req.url);
  }
  return ok(current);
}

function logout(req: HttpRequest<unknown>): Observable<HttpResponse<unknown>> {
  const token = bearerToken(req);
  if (token) {
    delete sessions[token];
    saveSessions(sessions);
  }
  return ok({});
}

function handle(req: HttpRequest<unknown>): Observable<HttpResponse<unknown>> | null {
  const base = `${environment.apiUrl}/auth`;
  if (req.method === 'POST' && req.url === `${base}/login`) return login(req);
  if (req.method === 'POST' && req.url === `${base}/register`) return register(req);
  if (req.method === 'GET' && req.url === `${base}/session`) return session(req);
  if (req.method === 'POST' && req.url === `${base}/logout`) return logout(req);
  return null;
}

export const mockBackendInterceptor: HttpInterceptorFn = (req, next) => {
  const response = handle(req);
  if (!response) {
    return next(req);
  }
  // materialize/dematerialize permite aplicar el retraso también a los errores.
  return response.pipe(materialize(), delay(CONSTANT_LATENCY_MS), dematerialize());
};
