// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

/**
 * ENTORNO DE DESARROLLO
 * ---------------------------------------------------------------------------
 * ⚠️ Seguridad: este archivo se empaqueta en el JavaScript que descarga el
 * navegador, así que es PÚBLICO. Nunca coloques aquí secretos (API keys
 * privadas, client secrets de OAuth, contraseñas…).
 */
export const environment = {
  production: false,

  /**
   * URL base de la API. Relativa ("/api") para que las peticiones sean del
   * mismo origen: así funcionan las cookies SameSite=Strict y la protección
   * XSRF automática de Angular (que solo actúa en peticiones same-origin).
   */
  apiUrl: '/api',

  /**
   * Backend simulado (solo desarrollo). Permite probar la pantalla de login
   * sin servidor real. Credenciales de prueba:
   *   usuario: demo@spotifyhybrid.dev  (o "demo")
   *   contraseña: Demo1234!
   */
  useMockBackend: true,

  /** Texto de ayuda visible solo en desarrollo (en producción es null y no se empaqueta). */
  demoHint: 'Demo: demo / Demo1234!' as string | null,
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
