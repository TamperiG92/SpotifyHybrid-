# Seguridad y usabilidad del acceso: login y registro

Este documento resume cómo **SpotifyHybrid** (Ionic 9 + Angular 22 + Capacitor 8) cumple los requisitos de la Semana 11 y los de seguridad (OWASP), y dónde está implementado cada uno. Todo el código está comentado en español.

## Estructura

```
src/app/
├── core/                              ← Capa transversal de seguridad
│   ├── security/
│   │   ├── security.config.ts         Límites y parámetros centralizados
│   │   ├── input-sanitizer.ts         Normalización de entradas + anti open-redirect
│   │   └── security.validators.ts     Validadores (email, nombre, fortaleza, honeypot...)
│   ├── auth/
│   │   ├── auth.models.ts             Modelos + validación de respuestas del servidor
│   │   ├── auth.service.ts            Login, registro, sesión, caducidad, inactividad, logout
│   │   ├── token-storage.service.ts   Token en Capacitor Preferences
│   │   ├── auth.guards.ts             authGuard (canActivate) + variantes canMatch
│   │   ├── login-throttle.service.ts  Bloqueo exponencial anti fuerza bruta
│   │   └── social-auth.service.ts     OAuth (Facebook/Google/Apple) vía backend + `state`
│   ├── interceptors/
│   │   ├── security.interceptor.ts    Solo HTTPS, token solo a la API, timeout, 401
│   │   └── mock-backend.interceptor.ts  Backend simulado (mientras no haya API real)
│   └── errors/global-error-handler.ts Sin trazas sensibles en producción
├── login/                             ← Pantalla de login (lazy module)
├── register/                          ← Pantalla de registro (lazy module)
└── home/                              ← Reproductor (protegido) + logout
src/theme/_auth-form.scss              Estilos compartidos de login/registro (48px)
src/theme/_device-frame.scss           Marco de teléfono compartido
capacitor.config.ts                    Configuración de la app nativa
```

## Requisitos de la Semana 11 → implementación

| Diapositiva | Cómo se cumple |
|---|---|
| **Anatomía de la pantalla de login** | `ion-header` + `ion-toolbar` con logotipo y título; contenedor `.auth` con scroll táctil (`overscroll-behavior: contain`); `ion-input` con `labelPlacement="floating"` e íconos `ion-icon` en `slot="start"`. |
| **Ergonomía táctil (48px)** | Inputs de 56px; botones, enlaces, botón del ojo, toggle y checkbox de al menos 48px (`$touch` en `_auth-form.scss`). |
| **Teclados específicos** | `inputmode="email"` / `type="email"` en los campos de correo y `type="password"` en las contraseñas. |
| **Feedback en tiempo real** | Los errores aparecen mientras se escribe (`dirty`) o al salir del campo (`touched`); checklist de fortaleza en vivo en el registro. |
| **Formularios reactivos** | `FormGroup` + `FormControl` (`NonNullableFormBuilder`), `Validators.required`, `Validators.email`, `minLength`/`maxLength`, `requiredTrue`; estado con `valid`/`invalid`, `dirty`, `touched`. |
| **Bloqueo declarativo** | `[disabled]="!canSubmit()"`: LOG IN y SIGN UP deshabilitados mientras el formulario sea inválido (signal derivada de `statusChanges`). |
| **Almacenamiento del token** | `TokenStorageService` usa **Capacitor Preferences** (SharedPreferences / NSUserDefaults). Si se requiriera nivel bancario, solo se cambia ese servicio por Secure Storage (KeyStore/KeyChain). |
| **Pantalla de registro** | `/register`: campos mínimos (nombre, email, contraseña), botón del ojo, checklist de fortaleza con regex en vivo y enlace al login con `routerLink` (sin recargar). |
| **Guardianes de ruta (CanActivate)** | `/home` usa `canActivate: [authGuard]`: con token válido navega; sin token o con token expirado redirige a `/login`. Además `canMatch` evita descargar el módulo. |
| **Solo tráfico HTTPS** | En producción el interceptor bloquea peticiones `http://` a hosts remotos. En Android, Capacitor sirve la app como `https://localhost`. |
| **Payload no secreto** | El JWT solo lleva `sub`, `iat` y `exp` (ni email, ni contraseña, ni roles). |
| **Validación backend** | El backend (simulado) repite todas las validaciones del registro y responde 400 si algo no cumple; el cliente nunca tiene la última palabra. |

## Requisitos de seguridad (OWASP / ASVS) → implementación

| # | Requisito | Implementación |
|---|---|---|
| 1 | **Validación de entradas** | Lista blanca de formato, longitudes máximas y rechazo de caracteres de control e invisibles (`security.validators.ts`). Regex acotadas para evitar ReDoS. |
| 2 | **Normalización** | `normalizeIdentifier()`: NFKC, quita caracteres invisibles, `trim` y minúsculas. La contraseña **nunca** se modifica. |
| 3 | **Prevención de XSS** | Solo interpolación `{{ }}`, sin `innerHTML`. `innerHTMLTemplatesEnabled: false` en Ionic. Mensajes de listas blancas. |
| 4 | **Content-Security-Policy** | `<meta http-equiv="Content-Security-Policy">` en `index.html`: sin scripts inline ni `eval`, `object-src 'none'`, `base-uri` y `form-action` restringidos. |
| 5 | **Token** | Se guarda en Capacitor Preferences, se valida su formato al leerlo, viaja como `Authorization: Bearer` **solo** a `environment.apiUrl` y se borra en logout o ante un 401. Al usar cabecera (no cookie), la API no es vulnerable a CSRF. |
| 6 | **Fuerza bruta** | 5 intentos y bloqueo de 30 s que se duplica (tope 15 min) con cuenta atrás. Se respeta `Retry-After` (429/423). |
| 7 | **Anti-bots** | Campo honeypot invisible en login y registro. |
| 8 | **No enumerar usuarios** | Login: siempre «Incorrect username or password.», latencia y comparación en tiempo constante. |
| 9 | **Gestión de sesión** | Cierre al expirar (`expiresAt`) y tras 15 min de inactividad. La sesión se revalida con el servidor al reabrir la app. |
| 10 | **Open redirect** | `sanitizeReturnUrl()` solo admite rutas internas de una lista blanca. |
| 11 | **Validar respuestas del servidor** | `isAuthResponse()` / `isLoginResponse()` y copia defensiva con solo los campos esperados. |
| 12 | **Errores sin datos sensibles** | `GlobalErrorHandler` y `main.ts` no vuelcan trazas en producción. |
| 13 | **Contraseñas (NIST 800-63B)** | Se permite pegar, `autocomplete` correcto, mostrar/ocultar, aviso de Bloq Mayús, 8–128 caracteres; fortaleza exigida en el registro. |
| 14 | **Sin secretos en el frontend** | Los `environment` son públicos. Mientras no exista backend real, el backend simulado y las credenciales demo van en el build; al conectar la API real: `useMockBackend: false` y `demoHint: null`. |

## Limitaciones del backend simulado

- Las cuentas creadas en `/register` viven **solo en memoria**: se pierden al recargar la página (así la demo nunca escribe contraseñas en el dispositivo). El usuario `demo` siempre existe.
- La firma del JWT es aleatoria (simulación). Un servidor real firma con HMAC/RSA y una clave que nunca sale del backend.

## Requisitos que dependen del servidor real

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Content-Security-Policy: ...misma política...; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Cache-Control: no-store            (en respuestas de /api/auth/*)
```

El backend debe repetir **toda** la validación, aplicar rate limiting por IP y cuenta, guardar las contraseñas con Argon2id o bcrypt y firmar los JWT con una clave secreta.

## Probar en local

```bash
npm ci
npm start          # http://localhost:4200  → redirige a /login
```

Credenciales demo: **`demo`** o **`demo@spotifyhybrid.dev`**, con la contraseña **`Demo1234!`**. También puedes crear una cuenta en **SIGN UP**.
