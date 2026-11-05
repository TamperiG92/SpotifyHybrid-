import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';

import { LoginPageRoutingModule } from './login-routing.module';
import { LoginPage } from './login.page';

/**
 * Módulo lazy de la página de login.
 * Se usa ReactiveFormsModule (y no FormsModule/ngModel) porque los formularios
 * reactivos permiten validación declarativa, tipada y testeable.
 */
@NgModule({
  imports: [CommonModule, ReactiveFormsModule, IonicModule, LoginPageRoutingModule],
  declarations: [LoginPage],
})
export class LoginPageModule {}
