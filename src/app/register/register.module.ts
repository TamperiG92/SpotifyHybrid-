import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular/lazy';

import { RegisterPageRoutingModule } from './register-routing.module';
import { RegisterPage } from './register.page';

/** Módulo lazy de la pantalla de registro (Reactive Forms, igual que el login). */
@NgModule({
  imports: [CommonModule, ReactiveFormsModule, IonicModule, RegisterPageRoutingModule],
  declarations: [RegisterPage],
})
export class RegisterPageModule {}
