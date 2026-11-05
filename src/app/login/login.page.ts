import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

import { environment } from '../../environments/environment';
import { LoginFailureReason } from '../core/auth/auth.models';
import { AuthService, LoginError } from '../core/auth/auth.service';
import { LoginThrottleService } from '../core/auth/login-throttle.service';
import { SocialAuthService, SocialProvider } from '../core/auth/social-auth.service';
import { normalizeIdentifier, sanitizeReturnUrl } from '../core/security/input-sanitizer';
import { SECURITY_CONFIG } from '../core/security/security.config';
import { SecurityValidators } from '../core/security/security.validators';

/**
 * Mensajes de error GENÉRICOS (OWASP Authentication Cheat Sheet):
 * nunca se indica si el usuario existe o si lo incorrecto es la contraseña,
 * ni se muestra el mensaje técnico devuelto por el servidor.
 */
const ERROR_MESSAGES: Record<LoginFailureReason, string> = {
  'invalid-credentials': 'Incorrect username or password.',
  locked: 'Too many attempts. Please wait before trying again.',
  'rate-limited': 'Too many attempts. Please wait before trying again.',
  network: 'Unable to connect. Check your connection and try again.',
  unknown: 'Something went wrong. Please try again.',
};

/** Lista blanca de avisos que pueden llegar por query string (?reason=...). */
const INFO_MESSAGES: Readonly<Record<string, string>> = {
  expired: 'Your session has expired. Please log in again.',
  idle: 'You were logged out due to inactivity.',
  registered: 'Account created. You can log in now.',
};

@Component({
  selector: 'app-login',
  templateUrl: 'login.page.html',
  styleUrls: ['login.page.scss'],
  standalone: false,
})
export class LoginPage implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly throttle = inject(LoginThrottleService);
  private readonly social = inject(SocialAuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly limits = SECURITY_CONFIG.limits;

  /**
   * Pista de credenciales demo: solo se muestra mientras se use el backend
   * simulado (con una API real, `demoHint` debe ser null).
   */
  readonly demoHint = environment.useMockBackend ? environment.demoHint : null;

  /**
   * FORMULARIO REACTIVO con validación declarativa:
   *  - identifier: obligatorio, longitud máxima, formato en lista blanca y sin
   *    caracteres de control.
   *  - password: obligatoria y con límites de longitud. En el LOGIN no se
   *    exigen reglas de complejidad (eso va en el registro); hacerlo aquí
   *    daría pistas sobre la política de contraseñas.
   *  - website: honeypot anti-bots (invisible para personas).
   */
  readonly form = this.fb.group({
    identifier: [
      '',
      [
        Validators.required,
        Validators.maxLength(this.limits.emailMaxLength),
        SecurityValidators.noControlChars(),
        SecurityValidators.emailOrUsername(),
      ],
    ],
    password: [
      '',
      [
        Validators.required,
        Validators.minLength(this.limits.passwordMinLength),
        Validators.maxLength(this.limits.passwordMaxLength),
      ],
    ],
    rememberMe: [false],
    website: ['', [SecurityValidators.honeypot()]],
  });

  // ---------------------------- Estado de la vista (signals) ----------------
  readonly loading = signal(false);
  readonly showPassword = signal(false);
  readonly capsLockOn = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly infoMessage = signal<string | null>(null);
  private readonly now = signal(Date.now());

  /** Segundos restantes de bloqueo (cuenta atrás visible). */
  readonly lockSeconds = computed(() => Math.ceil(Math.max(0, this.throttle.lockedUntil() - this.now()) / 1000));
  readonly isLocked = computed(() => this.lockSeconds() > 0);

  /** Estado de validez del formulario como signal (se actualiza en cada tecla). */
  private readonly formValid = toSignal(this.form.statusChanges.pipe(map((status) => status === 'VALID')), {
    initialValue: this.form.valid,
  });

  /**
   * BLOQUEO DECLARATIVO: el botón LOG IN solo se habilita si el formulario es
   * válido y no hay un envío en curso ni un bloqueo por intentos fallidos.
   */
  readonly canSubmit = computed(() => this.formValid() && !this.loading() && !this.isLocked());

  constructor() {
    // Reloj de 1 s solo para refrescar la cuenta atrás del bloqueo.
    const clock = setInterval(() => this.now.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => clearInterval(clock));
  }

  ngOnInit(): void {
    // El parámetro `reason` se valida contra una lista blanca; nunca se pinta tal cual.
    // Se escucha en cada navegación (no solo al crear la página) porque Ionic
    // reutiliza la página de login al volver desde /register o tras un logout.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const reason = params.get('reason') ?? '';
      if (Object.hasOwn(INFO_MESSAGES, reason)) {
        this.errorMessage.set(null);
        this.infoMessage.set(INFO_MESSAGES[reason]);
      }
    });
  }

  // ---------------------------- Helpers de plantilla -------------------------
  showError(control: 'identifier' | 'password'): boolean {
    const c = this.form.controls[control];
    return c.invalid && (c.touched || c.dirty);
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }

  /** Aviso de Bloq Mayús: evita fallos involuntarios que consumen intentos. */
  detectCapsLock(event: KeyboardEvent): void {
    if (typeof event.getModifierState === 'function') {
      this.capsLockOn.set(event.getModifierState('CapsLock'));
    }
  }

  // ---------------------------- Envío del formulario -------------------------
  submit(): void {
    // Evita dobles envíos y envíos durante el bloqueo.
    if (this.loading() || this.isLocked()) {
      return;
    }
    this.errorMessage.set(null);
    this.infoMessage.set(null);

    // Honeypot relleno → se finge un error genérico sin llamar al servidor.
    if (this.form.controls.website.invalid) {
      this.errorMessage.set(ERROR_MESSAGES.unknown);
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { identifier, password, rememberMe } = this.form.getRawValue();
    this.loading.set(true);

    this.auth
      .login({ identifier: normalizeIdentifier(identifier), password, rememberMe })
      .subscribe({
        next: () => {
          // Se borra la contraseña del formulario (no permanece en memoria de la vista).
          this.form.reset();
          this.loading.set(false);
          const target = sanitizeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
          void this.router.navigateByUrl(target, { replaceUrl: true });
        },
        error: (err: unknown) => {
          const reason: LoginFailureReason = err instanceof LoginError ? err.reason : 'unknown';
          this.errorMessage.set(ERROR_MESSAGES[reason]);
          // Tras un fallo se limpia SOLO la contraseña.
          this.form.controls.password.reset();
          this.showPassword.set(false);
          this.loading.set(false);
          this.now.set(Date.now());
        },
      });
  }

  // ---------------------------- Acciones secundarias -------------------------
  continueWith(provider: SocialProvider): void {
    if (!this.social.start(provider)) {
      this.infoMessage.set('Social login is not available in this demo environment.');
    }
  }

  /** Enlaces aún sin pantalla propia (Reset Password, Sign up, Settings). */
  comingSoon(feature: string): void {
    this.infoMessage.set(`${feature} is coming soon.`);
  }
}
