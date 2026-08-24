import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-white flex flex-col items-center justify-center px-6 py-8">
      <div class="w-full max-w-sm">
        <img src="/logo.svg" alt="SkeiloPOS" class="w-10 h-10 rounded-xl shrink-0 mb-6" />

        @if (sent()) {
          <div class="text-center">
            <div
              class="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4 text-3xl"
            >
              📧
            </div>
            <h1 class="text-xl font-bold text-gray-900">Revisa tu correo</h1>
            <p class="text-sm text-gray-500 mt-2 leading-relaxed">{{ message() }}</p>
            <a
              routerLink="/login"
              class="inline-block mt-6 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Volver a iniciar sesión
            </a>
          </div>
        } @else {
          <h1 class="text-2xl font-bold text-gray-900">¿Olvidaste tu contraseña?</h1>
          <p class="text-sm text-gray-500 mt-2 leading-relaxed">
            Ingresa tu correo electrónico y te enviaremos un enlace para restablecerla.
          </p>

          <form [formGroup]="form" (ngSubmit)="submit()" class="mt-8 space-y-4">
            @if (errorMessage()) {
              <div class="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                {{ errorMessage() }}
              </div>
            }

            <div>
              <label for="email" class="block text-xs font-semibold text-gray-700 mb-1.5">
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                formControlName="email"
                placeholder="tu@correo.com"
                autocomplete="email"
                class="w-full px-4 py-2.5 rounded-lg bg-gray-50 border focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent text-gray-900 placeholder-gray-400 text-sm transition"
                [class.border-red-400]="emailInvalid"
                [class.border-gray-200]="!emailInvalid"
              />
              @if (emailInvalid) {
                <p class="text-red-500 text-xs mt-1">Ingresa un correo válido</p>
              }
            </div>

            <button
              type="submit"
              [disabled]="isLoading()"
              class="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold py-3 rounded-lg transition-colors text-sm mt-2"
            >
              {{ isLoading() ? 'Enviando...' : 'Enviar enlace' }}
            </button>

            <a
              routerLink="/login"
              class="block text-center text-sm font-medium text-gray-500 hover:text-gray-700 mt-2"
            >
              Volver a iniciar sesión
            </a>
          </form>
        }
      </div>
    </div>
  `,
})
export class ForgotPasswordComponent {
  private readonly authService = inject(AuthService);

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly sent = signal(false);
  readonly message = signal(
    'Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña. Revisa tu bandeja de entrada y la carpeta de spam.',
  );

  readonly form = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
  });

  get emailInvalid(): boolean {
    const ctrl = this.form.get('email')!;
    return ctrl.invalid && ctrl.touched;
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { email } = this.form.value;
    const { error } = await this.authService.forgotPassword(email!);

    this.isLoading.set(false);

    if (error) {
      this.errorMessage.set(error);
      return;
    }

    this.sent.set(true);
  }
}
