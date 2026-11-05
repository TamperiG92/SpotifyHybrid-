import { Injectable } from '@angular/core';

import { environment } from '../../../environments/environment';

/** Lista blanca de proveedores admitidos ("Continue with ..."). */
export const SOCIAL_PROVIDERS = ['facebook', 'google', 'apple'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

const STATE_STORAGE_KEY = 'sh.oauth.state';

/**
 * ============================================================================
 * LOGIN SOCIAL (Facebook / Google / Apple) — patrón BFF
 * ============================================================================
 * Arquitectura recomendada por la IETF ("OAuth 2.0 for Browser-Based Apps"):
 *
 *   Navegador ──► /api/auth/oauth/{provider}?state=…  (nuestro backend, BFF)
 *   Backend   ──► Proveedor (Authorization Code + PKCE, con client_secret)
 *   Proveedor ──► Backend (callback) ──► Set-Cookie HttpOnly ──► /home
 *
 * Ventajas de seguridad:
 *  - El `client_secret` y los tokens del proveedor NUNCA llegan al navegador.
 *  - El parámetro `state` (aleatorio, criptográficamente seguro) protege
 *    contra CSRF en el flujo OAuth: el backend lo devuelve y se compara.
 *  - El proveedor se valida contra una lista blanca: no se puede construir
 *    una URL de redirección arbitraria desde la interfaz.
 */
@Injectable({ providedIn: 'root' })
export class SocialAuthService {
  /**
   * Inicia el flujo OAuth. Devuelve false si no está disponible (p. ej. con
   * el backend simulado de desarrollo).
   */
  start(provider: SocialProvider): boolean {
    if (!SOCIAL_PROVIDERS.includes(provider)) {
      return false;
    }
    if (environment.useMockBackend) {
      // El backend simulado no implementa OAuth: no se redirige a ningún sitio.
      return false;
    }

    const state = this.generateState();
    try {
      sessionStorage.setItem(STATE_STORAGE_KEY, state);
    } catch {
      return false; // Sin almacenamiento no se puede verificar `state` → se aborta.
    }

    const url = new URL(`${environment.apiUrl}/auth/oauth/${provider}`, window.location.origin);
    url.searchParams.set('state', state);
    // Redirección a NUESTRO origen (el backend), nunca a una URL recibida por parámetro.
    window.location.assign(url.toString());
    return true;
  }

  /** Comprueba (y consume, de un solo uso) el `state` devuelto en el callback. */
  verifyState(returned: string | null): boolean {
    try {
      const expected = sessionStorage.getItem(STATE_STORAGE_KEY);
      sessionStorage.removeItem(STATE_STORAGE_KEY);
      return !!expected && !!returned && expected === returned;
    } catch {
      return false;
    }
  }

  /** 32 bytes aleatorios de la Web Crypto API (NUNCA Math.random para seguridad). */
  private generateState(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
}
