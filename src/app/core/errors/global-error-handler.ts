import { ErrorHandler, Injectable } from '@angular/core';

import { environment } from '../../../environments/environment';

/**
 * ============================================================================
 * MANEJADOR GLOBAL DE ERRORES
 * ============================================================================
 * Requisito: "No exponer información sensible en errores ni en consola".
 *
 * - En desarrollo se muestra el error completo para depurar.
 * - En producción NO se vuelcan trazas (pueden revelar rutas internas,
 *   versiones de librerías, datos del formulario, etc.). Aquí es donde se
 *   enviaría un resumen saneado a un servicio de monitorización (Sentry…),
 *   sin cuerpo de peticiones ni credenciales.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    if (!environment.production) {
      console.error(error);
      return;
    }
    const name = error instanceof Error ? error.name : 'UnknownError';
    console.error(`[app] Unexpected error (${name}).`);
  }
}
