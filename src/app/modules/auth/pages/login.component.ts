import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { UserRole } from '../../../core/interfaces/user.interface';

const ROLE_HOME: Record<UserRole, string> = {
  [UserRole.ADMIN]:   '/dashboard/admin',
  [UserRole.CASHIER]: '/dashboard/caja',
  [UserRole.STAFF]:   '/dashboard/cocina',
};

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 flex items-center justify-center p-4">
      <div class="w-full max-w-sm">
        <!-- Logo -->
        <div class="text-center mb-8">
          <div class="w-20 h-20 rounded-3xl bg-white/20 backdrop-blur flex items-center justify-center mx-auto mb-4 shadow-xl">
            <span class="text-4xl">🍦</span>
          </div>
          <h1 class="text-3xl font-bold text-white">Heladería</h1>
          <p class="text-indigo-300 mt-1 text-sm">Sistema de Gestión</p>
        </div>

        <!-- Login card -->
        <div class="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div class="px-6 pt-6 pb-2">
            <h2 class="text-lg font-bold text-gray-900">Iniciar sesión</h2>
            <p class="text-gray-400 text-sm mt-1">Ingresa tus credenciales para acceder</p>
          </div>

          <form [formGroup]="form" (ngSubmit)="submit()" class="px-6 pb-6 pt-4 space-y-4">
            <!-- Error message -->
            @if (errorMessage()) {
              <div class="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                {{ errorMessage() }}
              </div>
            }

            <!-- Email -->
            <div>
              <label for="email" class="block text-sm font-medium text-gray-700 mb-1.5">
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                formControlName="email"
                placeholder="tu@correo.com"
                autocomplete="email"
                class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent text-gray-900 placeholder-gray-400 text-sm transition"
                [class.border-red-300]="emailInvalid"
              />
              @if (emailInvalid) {
                <p class="text-red-500 text-xs mt-1">Ingresa un correo válido</p>
              }
            </div>

            <!-- Password -->
            <div>
              <label for="password" class="block text-sm font-medium text-gray-700 mb-1.5">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                formControlName="password"
                placeholder="••••••••"
                autocomplete="current-password"
                class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent text-gray-900 placeholder-gray-400 text-sm transition"
                [class.border-red-300]="passwordInvalid"
              />
              @if (passwordInvalid) {
                <p class="text-red-500 text-xs mt-1">La contraseña es requerida</p>
              }
            </div>

            <!-- Submit -->
            <button
              type="submit"
              [disabled]="isLoading()"
              class="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
            >
              @if (isLoading()) {
                <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Ingresando...
              } @else {
                Iniciar sesión
              }
            </button>
          </form>
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required]),
  });

  get emailInvalid(): boolean {
    const ctrl = this.form.get('email')!;
    return ctrl.invalid && ctrl.touched;
  }

  get passwordInvalid(): boolean {
    const ctrl = this.form.get('password')!;
    return ctrl.invalid && ctrl.touched;
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { email, password } = this.form.value;
    const { error } = await this.authService.login(email!, password!);

    if (error) {
      this.errorMessage.set(error);
      this.isLoading.set(false);
      return;
    }

    const user = this.authService.currentUser();
    if (user) {
      this.router.navigate([ROLE_HOME[user.role]]);
    }
  }
}
