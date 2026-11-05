import { Injectable, computed, signal } from '@angular/core';

import { SECURITY_CONFIG } from '../security/security.config';

/** Estado persistido: solo contadores y marcas de tiempo, nunca datos personales. */
interface ThrottleState {
  failedAttempts: number;
  lockouts: number;
  lockedUntil: number;
}

const INITIAL_STATE: ThrottleState = { failedAttempts: 0, lockouts: 0, lockedUntil: 0 };

/**
 * ============================================================================
 * LIMITADOR DE INTENTOS DE LOGIN (anti fuerza bruta en el cliente)
 * ============================================================================
 * - Tras N intentos fallidos bloquea el formulario durante un tiempo.
 * - Cada bloqueo sucesivo duplica la espera (backoff exponencial) con un tope.
 * - Se guarda en sessionStorage para que recargar la página no lo reinicie
 *   trivialmente (se borra al cerrar la pestaña).
 *
 * ⚠️ Defensa en profundidad: un atacante puede saltarse este control llamando
 * directamente a la API. El backend DEBE aplicar su propio rate limiting
 * (p. ej. por IP + cuenta) y responder 429 / 423.
 */
@Injectable({ providedIn: 'root' })
export class LoginThrottleService {
  private readonly cfg = SECURITY_CONFIG.throttle;
  private readonly state = signal<ThrottleState>(this.load());

  /** Momento (epoch ms) hasta el que el formulario está bloqueado. */
  readonly lockedUntil = computed(() => this.state().lockedUntil);

  /** Intentos restantes antes del siguiente bloqueo. */
  readonly remainingAttempts = computed(
    () => Math.max(0, this.cfg.maxAttempts - this.state().failedAttempts),
  );

  /** Milisegundos que faltan para desbloquear (0 si no está bloqueado). */
  remainingLockMs(now = Date.now()): number {
    return Math.max(0, this.state().lockedUntil - now);
  }

  isLocked(now = Date.now()): boolean {
    return this.remainingLockMs(now) > 0;
  }

  /** Registra un intento fallido y, si procede, activa un bloqueo exponencial. */
  registerFailure(): void {
    const current = this.state();
    const failedAttempts = current.failedAttempts + 1;

    if (failedAttempts >= this.cfg.maxAttempts) {
      const duration = Math.min(
        this.cfg.baseLockoutMs * 2 ** current.lockouts,
        this.cfg.maxLockoutMs,
      );
      this.update({ failedAttempts: 0, lockouts: current.lockouts + 1, lockedUntil: Date.now() + duration });
    } else {
      this.update({ ...current, failedAttempts });
    }
  }

  /**
   * Aplica un bloqueo dictado por el servidor (cabecera `Retry-After` de un 429).
   * El servidor es la fuente de verdad, así que su valor tiene prioridad.
   */
  applyServerLock(retryAfterSeconds: number): void {
    const seconds = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : 60;
    const capped = Math.min(seconds * 1000, this.cfg.maxLockoutMs);
    this.update({ ...this.state(), failedAttempts: 0, lockedUntil: Date.now() + capped });
  }

  /** Login correcto → se reinician los contadores. */
  reset(): void {
    this.update({ ...INITIAL_STATE });
  }

  // ---------------------------------------------------------------------------
  // Persistencia tolerante a fallos (modo privado, almacenamiento bloqueado...)
  // ---------------------------------------------------------------------------

  private update(next: ThrottleState): void {
    this.state.set(next);
    try {
      sessionStorage.setItem(this.cfg.storageKey, JSON.stringify(next));
    } catch {
      /* Si el almacenamiento no está disponible el control sigue funcionando en memoria. */
    }
  }

  private load(): ThrottleState {
    try {
      const raw = sessionStorage.getItem(this.cfg.storageKey);
      if (!raw) {
        return { ...INITIAL_STATE };
      }
      const parsed = JSON.parse(raw) as Partial<ThrottleState>;
      // Validación del contenido: el storage es manipulable desde DevTools.
      const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
      return {
        failedAttempts: num(parsed.failedAttempts),
        lockouts: num(parsed.lockouts),
        lockedUntil: num(parsed.lockedUntil),
      };
    } catch {
      return { ...INITIAL_STATE };
    }
  }
}
