import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

import { hasControlChars, normalizeIdentifier } from './input-sanitizer';

/**
 * Reglas de fortaleza de contraseña para el REGISTRO (se muestran en vivo como
 * checklist). En el LOGIN no se aplican: allí solo se valida la longitud, para
 * no dar pistas sobre la política de contraseñas.
 * El backend (simulado) aplica exactamente las mismas reglas.
 */
export interface PasswordRule {
  readonly key: 'length' | 'upper' | 'lower' | 'digit' | 'symbol';
  readonly label: string;
  readonly test: (value: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { key: 'length', label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { key: 'upper', label: 'One uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { key: 'lower', label: 'One lowercase letter', test: (v) => /[a-z]/.test(v) },
  { key: 'digit', label: 'One number', test: (v) => /[0-9]/.test(v) },
  { key: 'symbol', label: 'One symbol (!@#$...)', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

/**
 * ============================================================================
 * VALIDADORES PERSONALIZADOS DE SEGURIDAD (Reactive Forms)
 * ============================================================================
 * Validación en el cliente = mejor UX + menos tráfico basura hacia el backend.
 * NO sustituye a la validación del servidor (OWASP ASVS 5.1).
 */
export class SecurityValidators {
  /**
   * Correo con formato estricto (lista blanca de caracteres).
   * Se usa una expresión acotada y SIN cuantificadores anidados para evitar
   * ReDoS (Regular expression Denial of Service).
   */
  private static readonly EMAIL_PATTERN =
    /^[a-z0-9._%+-]{1,64}@[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})*\.[a-z]{2,24}$/;

  /**
   * Nombre de usuario: lista blanca de 3 a 30 caracteres alfanuméricos,
   * punto, guion y guion bajo. Cualquier otro carácter (<, >, ", ', espacios,
   * etc.) se rechaza, lo que reduce la superficie de inyección.
   */
  private static readonly USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;

  /**
   * Nombre completo: letras de cualquier idioma (incluye tildes y ñ), espacios,
   * apóstrofo, punto y guion. Entre 2 y 60 caracteres. Sin < > " ni dígitos.
   */
  static readonly FULL_NAME_PATTERN = /^[\p{L}][\p{L}\p{M} '.-]{1,59}$/u;

  /** Expuesto para que el backend simulado aplique la misma regla. */
  static isValidEmail(value: string): boolean {
    return SecurityValidators.EMAIL_PATTERN.test(value);
  }

  /** Nombre completo en lista blanca de caracteres (ver FULL_NAME_PATTERN). */
  static fullName(): ValidatorFn {
    return (control: AbstractControl<string | null>): ValidationErrors | null => {
      const value = (control.value ?? '').trim();
      if (value.length === 0) {
        return null;
      }
      return SecurityValidators.FULL_NAME_PATTERN.test(value) ? null : { fullNameFormat: true };
    };
  }

  /**
   * Email estricto, complementario a `Validators.email` de Angular (que es más
   * permisivo, p. ej. acepta "a@b" sin dominio de nivel superior).
   */
  static strictEmail(): ValidatorFn {
    return (control: AbstractControl<string | null>): ValidationErrors | null => {
      const value = control.value ?? '';
      if (value.length === 0) {
        return null;
      }
      return SecurityValidators.EMAIL_PATTERN.test(normalizeIdentifier(value)) ? null : { strictEmail: true };
    };
  }

  /**
   * Fortaleza de contraseña (solo registro). Devuelve la lista de reglas que
   * faltan para poder pintarlas en la interfaz.
   */
  static passwordStrength(): ValidatorFn {
    return (control: AbstractControl<string | null>): ValidationErrors | null => {
      const value = control.value ?? '';
      if (value.length === 0) {
        return null;
      }
      const missing = PASSWORD_RULES.filter((rule) => !rule.test(value)).map((rule) => rule.key);
      return missing.length === 0 ? null : { passwordStrength: { missing } };
    };
  }

  /** Acepta "Email or username" (como en el diseño) con formato estricto. */
  static emailOrUsername(): ValidatorFn {
    return (control: AbstractControl<string | null>): ValidationErrors | null => {
      const value = control.value ?? '';
      if (value.length === 0) {
        return null; // De "obligatorio" se encarga Validators.required.
      }
      const normalized = normalizeIdentifier(value);
      const pattern = normalized.includes('@')
        ? SecurityValidators.EMAIL_PATTERN
        : SecurityValidators.USERNAME_PATTERN;
      return pattern.test(normalized) ? null : { identifierFormat: true };
    };
  }

  /**
   * Rechaza caracteres de control o invisibles (saltos de línea, zero-width,
   * marcas bidi...). Previene inyección de cabeceras/logs y suplantación visual.
   */
  static noControlChars(): ValidatorFn {
    return (control: AbstractControl<string | null>): ValidationErrors | null => {
      const value = control.value ?? '';
      return hasControlChars(value) ? { controlChars: true } : null;
    };
  }

  /**
   * Campo "honeypot" (trampa anti-bots). Es un input invisible para humanos;
   * los bots que rellenan todos los campos automáticamente lo completan y el
   * formulario queda invalidado sin revelar el motivo.
   */
  static honeypot(): ValidatorFn {
    return (control: AbstractControl<string | null>): ValidationErrors | null =>
      control.value ? { bot: true } : null;
  }
}
