import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ErrorHandler, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular/lazy';

import { environment } from '../environments/environment';
import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { GlobalErrorHandler } from './core/errors/global-error-handler';
import { mockBackendInterceptor } from './core/interceptors/mock-backend.interceptor';
import { authErrorInterceptor, securityInterceptor } from './core/interceptors/security.interceptor';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    IonicModule.forRoot({
      // Ionic no interpretará HTML en textos de alertas/toasts/loadings
      // (desactiva una vía potencial de XSS en componentes overlay).
      innerHTMLTemplatesEnabled: false,
    }),
    AppRoutingModule,
  ],
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },

    // Manejo de errores sin filtrar información sensible en producción.
    { provide: ErrorHandler, useClass: GlobalErrorHandler },

    provideHttpClient(
      // Orden: seguridad (HTTPS + token) → manejo de 401 → backend simulado
      // (este último solo mientras no exista la API real).
      withInterceptors([
        securityInterceptor,
        authErrorInterceptor,
        ...(environment.useMockBackend ? [mockBackendInterceptor] : []),
      ]),
    ),
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
