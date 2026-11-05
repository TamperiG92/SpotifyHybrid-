import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, from, map, of, switchMap, tap, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { SECURITY_CONFIG } from '../security/security.config';
import {
  AuthResponse,
  LoginCredentials,
  LoginFailureReason,
  RegisterData,
  RegisterFailureReason,
  UserSession,
  isAuthResponse,
  isLoginResponse,
} from './auth.models';
import { LoginThrottleService } from './login-throttle.service';
import { TokenStorageService } from './token-storage.service';

/** Error de login ya "traducido" a un motivo genérico (sin detalles internos). */
export class LoginError extends Error {
  constructor(public readonly reason: LoginFailureReason) {
    super(reason);
    this.name = 'LoginError';
  }
}

/** Error de registro ya "traducido" a un motivo genérico. */
export class RegisterError extends Error {
  constructor(public readonly reason: RegisterFailureReason) {
    super(reason);
    this.name = 'RegisterError';
  }
}

/**
 * ============================================================================
 * SERVICIO DE AUTENTICACIÓN
 * ============================================================================
 * Decisiones de seguridad de la arquitectura:
 *
 * 1. TOKEN EN CAPACITOR PREFERENCES: el token de sesión que emite el backend
 *    se guarda en el almacenamiento nativo (TokenStorageService). En memoria
 *    (signal) solo se conserva un perfil público mínimo.
 *
 * 2. LA SESIÓN SE RE-VALIDA CON EL SERVIDOR: al abrir/recargar la app, el
 *    guard lee el token guardado y consulta `GET /auth/session`. Si el
 *    servidor lo rechaza, el token se borra y el usuario vuelve al login.
 *
 * 3. CADUCIDAD Y CIERRE POR INACTIVIDAD: se programa el cierre al llegar a
 *    `expiresAt` y tras X minutos sin interacción del usuario.
 *
 * 4. MENSAJES GENÉRICOS: no se distingue "usuario no existe" de "contraseña
 *    incorrecta" para evitar la enumeración de usuarios.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly throttle = inject(LoginThrottleService);
  private readonly tokens = inject(TokenStorageService);

  private readonly endpoints = {
    login: `${environment.apiUrl}/auth/login`,
    register: `${environment.apiUrl}/auth/register`,
    logout: `${environment.apiUrl}/auth/logout`,
    session: `${environment.apiUrl}/auth/session`,
  } as const;

  /** Perfil público en memoria (el token vive en Preferences, no aquí). */
  private readonly sessionState = signal<UserSession | null>(null);

  readonly session = this.sessionState.asReadonly();
  readonly currentUser = computed(() => this.sessionState()?.user ?? null);
  readonly isAuthenticated = computed(() => {
    const session = this.sessionState();
    return session !== null && session.expiresAt > Date.now();
  });

  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivity = Date.now();
  private readonly activityEvents = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
  private readonly onActivity = (): void => {
    this.lastActivity = Date.now();
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopSessionTimers());
  }

  /**
   * Inicia sesión.
   * - Credenciales por POST en el cuerpo (nunca en la URL → no quedan en logs,
   *   historial ni cabecera Referer).
   * - Si la respuesta es válida, el token se guarda en Preferences ANTES de
   *   dar la sesión por iniciada.
   */
  login(credentials: LoginCredentials): Observable<UserSession> {
    if (this.throttle.isLocked()) {
      return throwError(() => new LoginError('locked'));
    }

    return this.http.post<unknown>(this.endpoints.login, credentials).pipe(
      map((response) => {
        if (!isLoginResponse(response)) {
          throw new LoginError('unknown');
        }
        return { token: response.token, session: this.assertValidResponse(response) };
      }),
      switchMap(({ token, session }) => from(this.tokens.save(token)).pipe(map(() => session))),
      tap((session) => {
        this.throttle.reset();
        this.startSession(session);
      }),
      catchError((error: unknown) => throwError(() => this.toLoginError(error))),
    );
  }

  /**
   * Registra una cuenta nueva. No inicia sesión automáticamente: el usuario
   * pasa al login (flujo explícito y sin guardar la contraseña en ningún lado).
   */
  register(data: RegisterData): Observable<void> {
    return this.http.post<unknown>(this.endpoints.register, data).pipe(
      map(() => undefined),
      catchError((error: unknown) => throwError(() => this.toRegisterError(error))),
    );
  }

  /**
   * Cierra sesión: invalida el token en el servidor, lo borra del dispositivo
   * y redirige al login. `replaceUrl` impide volver atrás a una página protegida.
   */
  logout(reason: 'user' | 'expired' | 'idle' = 'user'): void {
    // La petición se lanza (y el interceptor adjunta el token) antes de borrarlo.
    this.http.post(this.endpoints.logout, {}).pipe(catchError(() => of(null))).subscribe();
    this.clearSession();
    void this.router.navigate(['/login'], {
      replaceUrl: true,
      queryParams: reason === 'user' ? {} : { reason },
    });
  }

  /**
   * Intenta recuperar la sesión con el token guardado (p. ej. al reabrir la
   * app). Devuelve false ante cualquier error: "fallar de forma segura".
   */
  restoreSession(): Observable<boolean> {
    if (this.isAuthenticated()) {
      return of(true);
    }
    return from(this.tokens.load()).pipe(
      switchMap((token) => {
        if (!token) {
          return of(false);
        }
        return this.http.get<unknown>(this.endpoints.session).pipe(
          map((response) => this.assertValidResponse(response)),
          tap((session) => this.startSession(session)),
          map(() => true),
        );
      }),
      catchError((error: unknown) => {
        // Token rechazado o respuesta inválida → se descarta el token.
        // Ante un fallo de red se conserva (puede ser algo temporal).
        if (!(error instanceof HttpErrorResponse) || error.status === 401 || error.status === 403) {
          void this.tokens.clear();
        }
        return of(false);
      }),
    );
  }

  /** Limpia el estado local y el token guardado (usado ante 401 y en logout). */
  clearSession(): void {
    this.sessionState.set(null);
    this.stopSessionTimers();
    void this.tokens.clear();
  }

  // ---------------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------------

  private assertValidResponse(response: unknown): UserSession {
    if (!isAuthResponse(response) || response.expiresAt <= Date.now()) {
      throw new LoginError('unknown');
    }
    // Copia defensiva con solo los campos esperados (se descarta cualquier extra).
    const { user, expiresAt }: AuthResponse = response;
    return {
      user: { id: user.id, email: user.email, displayName: user.displayName },
      expiresAt,
    };
  }

  private startSession(session: UserSession): void {
    this.sessionState.set(session);
    this.stopSessionTimers();

    // Cierre automático al expirar la sesión emitida por el servidor.
    const msToExpiry = session.expiresAt - Date.now();
    this.expiryTimer = setTimeout(() => this.logout('expired'), Math.min(msToExpiry, 2_147_483_647));

    // Cierre automático por inactividad.
    this.lastActivity = Date.now();
    this.activityEvents.forEach((evt) =>
      window.addEventListener(evt, this.onActivity, { passive: true, capture: true }),
    );
    this.idleTimer = setInterval(() => {
      if (Date.now() - this.lastActivity >= SECURITY_CONFIG.session.idleTimeoutMs) {
        this.logout('idle');
      }
    }, SECURITY_CONFIG.session.idleCheckIntervalMs);
  }

  private stopSessionTimers(): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
    this.activityEvents.forEach((evt) =>
      window.removeEventListener(evt, this.onActivity, { capture: true }),
    );
  }

  /**
   * Traduce errores HTTP a motivos genéricos y aplica la política anti fuerza
   * bruta. Nunca se propaga el mensaje del servidor a la interfaz.
   */
  private toLoginError(error: unknown): LoginError {
    if (error instanceof LoginError) {
      return error;
    }
    if (!(error instanceof HttpErrorResponse)) {
      return new LoginError('unknown');
    }

    switch (error.status) {
      case 0:
        return new LoginError('network');
      case 400:
      case 401:
      case 403:
        this.throttle.registerFailure();
        return new LoginError(this.throttle.isLocked() ? 'locked' : 'invalid-credentials');
      case 423: // Locked: el servidor ha bloqueado la cuenta temporalmente.
      case 429: {
        // Too Many Requests: se respeta la cabecera Retry-After del servidor.
        const retryAfter = Number(error.headers.get('Retry-After'));
        this.throttle.applyServerLock(retryAfter);
        return new LoginError('rate-limited');
      }
      default:
        return new LoginError('unknown');
    }
  }

  private toRegisterError(error: unknown): RegisterError {
    if (!(error instanceof HttpErrorResponse)) {
      return new RegisterError('unknown');
    }
    switch (error.status) {
      case 0:
        return new RegisterError('network');
      case 400:
      case 422:
        return new RegisterError('invalid-data');
      case 409:
        return new RegisterError('not-available');
      default:
        return new RegisterError('unknown');
    }
  }
}
