import { Component, inject } from '@angular/core';

import { AuthService } from '../core/auth/auth.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage {
  private readonly auth = inject(AuthService);

  /** Cierra la sesión del usuario (servidor + estado local) y vuelve al login. */
  logout(): void {
    this.auth.logout('user');
  }
}
