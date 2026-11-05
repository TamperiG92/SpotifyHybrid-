import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { map } from 'rxjs';

import { RegisterFailureReason } from '../core/auth/auth.models';
import { AuthService, RegisterError } from '../core/auth/auth.service';
import { normalizeIdentifier } from '../core/security/input-sanitizer';
import { SECURITY_CONFIG } from '../core/security/security.config';
import { PASSWORD_RULES, SecurityValidators } from '../core/security/security.validators';

/** Mensajes genéricos: nunca se muestra el mensaje técnico del servidor. */
const ERROR_MESSAGES: Record<RegisterFailureReason, string> = {
  'not-available': "We couldn't create the account with this email. If you already have one, log in.",
  'invalid-data': 'Some fields are not valid. Check them and try again.',
  network: 'Unable to connect. Check your connection and try again.',
  unknown: 'Something went wrong. Please try again.',
};

const STRENGTH_LABELS = ['Too weak', 'Too weak', 'Weak', 'Fair', 'Good', 'Strong'] as const;

/**
 * ============================================================================
 * PANTALLA DE REGISTRO
 * ============================================================================
 * Reducción de fricción:
 *  - Campos mínimos: nombre, email y contraseña (sin "confirmar contraseña":
 *    en su lugar se ofrece el botón del ojo para comprobar lo escrito).
 *  - Validación de patrones con expresiones regulares y checklist de
 *    fortaleza EN VIVO mientras se escribe la contraseña.
 *  - Transición instantánea al login con routerLink (SPA, sin recargar).
 */
@Component({
  selector: 'app-register',
  templateUrl: 'register.page.html',
  styleUrls: ['register.page.scss'],
  standalone: false,
})
export class RegisterPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly limits = SECURITY_CONFIG.limits;
  readonly fullNameMaxLength = 60;

  /** FormGroup con un FormControl por campo y validadores síncronos. */
  readonly form = this.fb.group({
    fullName: [
      '',
      [
        Validators.required,
        Validators.maxLength(this.fullNameMaxLength),
        SecurityValidators.noControlChars(),
        SecurityValidators.fullName(),
      ],
    ],
    email: [
      '',
      [
        Validators.required,
        Validators.email,
        Validators.maxLength(this.limits.emailMaxLength),
        SecurityValidators.noControlChars(),
        SecurityValidators.strictEmail(),
      ],
    ],
    password: [
      '',
      [
        Validators.required,
        Validators.minLength(this.limits.passwordMinLength),
        Validators.maxLength(this.limits.passwordMaxLength),
        SecurityValidators.passwordStrength(),
      ],
    ],
    acceptTerms: [false, [Validators.requiredTrue]],
    website: ['', [SecurityValidators.honeypot()]], // Honeypot anti-bots.
  });

  // ---------------------------- Estado de la vista ---------------------------
  readonly loading = signal(false);
  readonly showPassword = signal(false);
  readonly errorMessage = signal<string | null>(null);

  private readonly formValid = toSignal(this.form.statusChanges.pipe(map((s) => s === 'VALID')), {
    initialValue: this.form.valid,
  });

  /** Bloqueo declarativo: SIGN UP deshabilitado mientras el formulario sea inválido. */
  readonly canSubmit = computed(() => this.formValid() && !this.loading());

  // ---------------------------- Fortaleza en vivo ----------------------------
  private readonly passwordValue = toSignal(this.form.controls.password.valueChanges, { initialValue: '' });

  readonly passwordRules = computed(() => {
    const value = this.passwordValue();
    return PASSWORD_RULES.map((rule) => ({ key: rule.key, label: rule.label, ok: rule.test(value) }));
  });

  readonly strengthScore = computed(() => this.passwordRules().filter((r) => r.ok).length);
  readonly strengthPercent = computed(() => (this.strengthScore() / PASSWORD_RULES.length) * 100);
  readonly strengthLabel = computed(() => STRENGTH_LABELS[this.strengthScore()]);
  readonly strengthLevel = computed(() => {
    const score = this.strengthScore();
    return score <= 2 ? 'weak' : score <= 4 ? 'medium' : 'strong';
  });
  readonly hasPassword = computed(() => this.passwordValue().length > 0);

  // ---------------------------- Helpers de plantilla -------------------------
  showError(control: 'fullName' | 'email' | 'password' | 'acceptTerms'): boolean {
    const c = this.form.controls[control];
    return c.invalid && (c.touched || c.dirty);
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }

  // ---------------------------- Envío ----------------------------------------
  submit(): void {
    if (this.loading()) {
      return;
    }
    this.errorMessage.set(null);

    if (this.form.controls.website.invalid) {
      this.errorMessage.set(ERROR_MESSAGES.unknown);
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { fullName, email, password, acceptTerms } = this.form.getRawValue();
    this.loading.set(true);

    this.auth
      .register({
        fullName: fullName.normalize('NFKC').trim().replace(/\s+/g, ' '),
        email: normalizeIdentifier(email),
        password, // La contraseña nunca se modifica.
        acceptTerms,
      })
      .subscribe({
        next: () => {
          this.form.reset();
          this.loading.set(false);
          // Transición instantánea al login (navegación SPA, sin recarga).
          void this.router.navigate(['/login'], { replaceUrl: true, queryParams: { reason: 'registered' } });
        },
        error: (err: unknown) => {
          const reason: RegisterFailureReason = err instanceof RegisterError ? err.reason : 'unknown';
          this.errorMessage.set(ERROR_MESSAGES[reason]);
          this.loading.set(false);
        },
      });
  }
}
