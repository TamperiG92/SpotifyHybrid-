import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

import { authGuard, authMatchGuard, guestGuard, guestMatchGuard } from './core/auth/auth.guards';

/**
 * Rutas de la aplicación.
 * - /login    → solo visitantes sin sesión (guestGuard).
 * - /register → solo visitantes sin sesión (guestGuard).
 * - /home     → PROTEGIDA con canActivate: [authGuard] (+ canMatch para que el
 *               módulo ni se descargue sin sesión).
 * - Cualquier ruta desconocida → /login (no se exponen rutas internas).
 */
const routes: Routes = [
  {
    path: 'login',
    canMatch: [guestMatchGuard],
    canActivate: [guestGuard],
    loadChildren: () => import('./login/login.module').then((m) => m.LoginPageModule),
  },
  {
    path: 'register',
    canMatch: [guestMatchGuard],
    canActivate: [guestGuard],
    loadChildren: () => import('./register/register.module').then((m) => m.RegisterPageModule),
  },
  {
    path: 'home',
    canMatch: [authMatchGuard],
    canActivate: [authGuard],
    loadChildren: () => import('./home/home.module').then((m) => m.HomePageModule),
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];

@NgModule({
  imports: [
    // PreloadAllModules no precarga rutas con canMatch que no coinciden,
    // así que el código protegido no se descarga para usuarios anónimos.
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules }),
  ],
  exports: [RouterModule],
})
export class AppRoutingModule {}
