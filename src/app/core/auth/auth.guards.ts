import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router, UrlTree } from '@angular/router';
import { Observable, map } from 'rxjs';

import { AuthService } from './auth.service';

/**
 * ============================================================================
 * GUARDIANES DE RUTA (control de acceso en el cliente)
 * ============================================================================
 * Interceptan la navegación ANTES de cargar una página protegida (p. ej. /home):
 *   - Si el token existe y es válido → devuelven true y se permite navegar.
 *   - Si el token no existe o expiró → redirigen de inmediato a /login.
 *
 * Se usan dos tipos de guard sobre la misma regla:
 *   - `canActivate` (authGuard): se ejecuta en CADA navegación a la ruta,
 *     aunque el módulo ya esté descargado. Es el guard principal.
 *   - `canMatch` (authMatchGuard): además, si no hay sesión, Angular NI
 *     SIQUIERA descarga el código lazy de la ruta.
 *
 * ⚠️ Los guards son UX y defensa en profundidad. La autorización real la hace
 * SIEMPRE el backend en cada petición (el cliente es manipulable).
 */

function requireSession(requestedUrl: string): Observable<boolean | UrlTree> {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Se guarda la ruta solicitada para volver tras el login. Se validará con
  // `sanitizeReturnUrl` antes de usarse (anti open-redirect).
  return auth
    .restoreSession()
    .pipe(map((ok) => ok || router.createUrlTree(['/login'], { queryParams: { returnUrl: requestedUrl } })));
}

function requireGuest(): Observable<boolean | UrlTree> {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.restoreSession().pipe(map((ok) => (ok ? router.createUrlTree(['/home']) : true)));
}

/** AuthGuard (CanActivate): solo usuarios autenticados; si no, a /login. */
export const authGuard: CanActivateFn = (_route, state) => requireSession(state.url);

/** Misma regla en canMatch: evita descargar el módulo protegido sin sesión. */
export const authMatchGuard: CanMatchFn = (_route, segments) =>
  requireSession('/' + segments.map((s) => s.path).join('/'));

/** GuestGuard (CanActivate): un usuario con sesión no vuelve a ver login/registro. */
export const guestGuard: CanActivateFn = () => requireGuest();

/** Misma regla en canMatch. */
export const guestMatchGuard: CanMatchFn = () => requireGuest();
