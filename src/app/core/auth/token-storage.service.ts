import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

import { isWellFormedToken } from './auth.models';

/**
 * ============================================================================
 * ALMACENAMIENTO DEL TOKEN — Capacitor Preferences
 * ============================================================================
 * Estrategias evaluadas (ver diapositiva "Estrategias de Almacenamiento"):
 *
 *  | Mecanismo             | Dónde vive                         | Evaluación                       |
 *  |-----------------------|------------------------------------|----------------------------------|
 *  | localStorage (web)    | Caché interna de la WebView        | NO: el SO puede purgarla         |
 *  | Capacitor Preferences | SharedPreferences / NSUserDefaults | SÍ (elegida): persistencia nativa|
 *  | Secure Storage        | KeyStore / KeyChain                | Nivel bancario (cifrado hardware)|
 *
 * Se usa Capacitor Preferences: en Android/iOS el token queda en el
 * almacenamiento NATIVO, independiente de la WebView. En el navegador (ng
 * serve) el plugin usa localStorage como respaldo, solo para desarrollo.
 *
 * Si la app llegara a manejar datos de nivel bancario, se cambiaría SOLO este
 * servicio por un plugin de Secure Storage (KeyStore/KeyChain); el resto de la
 * app no se entera porque todo pasa por esta clase.
 *
 * Reglas:
 *  - Solo se guarda el token (nunca la contraseña ni datos personales).
 *  - Al leerlo se valida su formato: el almacenamiento es manipulable.
 *  - Se mantiene una copia en memoria para que el interceptor HTTP pueda
 *    añadir la cabecera de forma síncrona.
 */
const TOKEN_KEY = 'sh.auth.token';

@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  private cached: string | null = null;
  private loaded = false;

  /** Token actual en memoria (null si no hay sesión o aún no se ha cargado). */
  get current(): string | null {
    return this.cached;
  }

  /** Lee el token de Preferences (una sola vez; después usa la copia en memoria). */
  async load(): Promise<string | null> {
    if (!this.loaded) {
      try {
        const { value } = await Preferences.get({ key: TOKEN_KEY });
        this.cached = isWellFormedToken(value) ? value : null;
        if (value !== null && this.cached === null) {
          await Preferences.remove({ key: TOKEN_KEY }); // Valor corrupto o manipulado.
        }
      } catch {
        this.cached = null;
      }
      this.loaded = true;
    }
    return this.cached;
  }

  async save(token: string): Promise<void> {
    if (!isWellFormedToken(token)) {
      throw new Error('Invalid token format');
    }
    this.cached = token;
    this.loaded = true;
    await Preferences.set({ key: TOKEN_KEY, value: token });
  }

  async clear(): Promise<void> {
    this.cached = null;
    this.loaded = true;
    try {
      await Preferences.remove({ key: TOKEN_KEY });
    } catch {
      /* Si falla el borrado, el token igualmente deja de usarse en memoria. */
    }
  }
}
