import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  // En producción no se vuelca la traza completa (puede revelar detalles internos).
  .catch((err) => console.error(environment.production ? 'Bootstrap failed.' : err));
