import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { throwError, timeout } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { TokenStorageService } from '../auth/token-storage.service';
import { SECURITY_CONFIG } from '../security/security.config';

/**
 * Devuelve true si la URL pertenece a NUESTRA API. Solo a esas peticiones se
 * les adjunta el token; así nunca se filtra a dominios de terceros (CDN,
 * analítica, etc.).
 */
function isOwnApi(url: string): boolean {
  try {
    const target = new URL(url, window.location.origin);
    const api = new URL(environment.apiUrl, window.location.origin);
    return target.origin === api.origin && target.pathname.startsWith(api.pathname);
  } catch {
    return false;
  }
}

/** Hosts locales donde http:// es aceptable (desarrollo en la propia máquina). */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * true si la petición saldría por http:// (sin cifrar) hacia un host remoto.
 * Los esquemas de las apps nativas (capacitor://, https://localhost en
 * Android) no son http:, así que funcionan sin problema.
 */
function isInsecureRequest(url: string): boolean {
  try {
    const target = new URL(url, window.location.origin);
    return target.protocol === 'http:' && !LOCAL_HOSTS.has(target.hostname);
  } catch {
    return true;
  }
}

/**
 * ============================================================================
 * INTERCEPTOR DE SEGURIDAD HTTP
 * ============================================================================
 * Se aplica a TODAS las peticiones salientes:
 *  1. SOLO TRÁFICO HTTPS: en producción bloquea cualquier petición http://
 *     hacia un host remoto (evita ataques Man-in-the-Middle).
 *  2. Adjunta `Authorization: Bearer <token>` SOLO a la API propia.
 *  3. Añade `X-Requested-With`, señal adicional que el backend puede exigir.
 *  4. Aplica un tiempo máximo de espera para no dejar peticiones colgadas.
 */
export const securityInterceptor: HttpInterceptorFn = (req, next) => {
  if (environment.production && isInsecureRequest(req.url)) {
    return throwError(
      () => new HttpErrorResponse({ status: 0, statusText: 'Insecure request blocked', url: req.url }),
    );
  }

  let secured = req;
  if (isOwnApi(req.url)) {
    const token = inject(TokenStorageService).current;
    secured = req.clone({
      setHeaders: {
        'X-Requested-With': 'XMLHttpRequest',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  }

  return next(secured).pipe(timeout(SECURITY_CONFIG.httpTimeoutMs));
};

/**
 * ============================================================================
 * INTERCEPTOR DE SESIÓN EXPIRADA (401)
 * ============================================================================
 * Si cualquier llamada a la API (excepto las de autenticación) devuelve 401,
 * el token ya no es válido: se borra, se limpia el estado y se manda al login.
 */
export const authErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const isAuthEndpoint = req.url.startsWith(`${environment.apiUrl}/auth/`);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && !isAuthEndpoint && isOwnApi(req.url)) {
        auth.logout('expired');
      }
      return throwError(() => error);
    }),
  );
};
