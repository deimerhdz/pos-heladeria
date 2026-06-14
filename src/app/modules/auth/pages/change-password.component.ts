import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { UserRole } from '../../../core/interfaces/user.interface';

const ROLE_HOME: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: '/dashboard/admin',
  [UserRole.ADMIN]: '/dashboard/admin',
  [UserRole.CASHIER]: '/dashboard/caja',
  [UserRole.STAFF]: '/dashboard/cocina',
};

/** Validator: `new_password` and `confirm_password` must match. */
function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const next = group.get('new_password')?.value;
  const confirm = group.get('confirm_password')?.value;
  return next && confirm && next !== confirm ? { mismatch: true } : null;
}

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div
      class="min-h-screen bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 flex items-center justify-center p-4"
    >
      <div class="w-full max-w-sm">
        <!-- Header -->
        <div class="text-center mb-8">
          <div
            class="w-20 h-20 rounded-3xl bg-white/20 backdrop-blur flex items-center justify-center mx-auto mb-4 shadow-xl"
          >
            <span class="text-4xl">🔒</span>
          </div>
          <h1 class="text-3xl font-bold text-white">Cambia tu contraseña</h1>
          <p class="text-indigo-300 mt-1 text-sm">
            Por seguridad, define una nueva contraseña para continuar
          </p>
        </div>

        <!-- Card -->
        <div class="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <form [formGroup]="form" (ngSubmit)="submit()" class="px-6 py-6 space-y-4" novalidate>
            <!-- Error message -->
            @if (errorMessage()) {
              <div class="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                {{ errorMessage() }}
              </div>
            }

            <!-- Current password -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">
                Contraseña actual
              </label>
              <input
                type="password"
                formControlName="current_password"
                placeholder="Contraseña temporal"
                class="w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                [class.border-red-400]="invalid('current_password')"
                [class.border-gray-200]="!invalid('current_password')"
              />
              @if (invalid('current_password')) {
                <p class="text-red-500 text-xs mt-1">La contraseña actual es requerida</p>
              }
            </div>

            <!-- New password -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">
                Nueva contraseña
              </label>
              <input
                type="password"
                formControlName="new_password"
                placeholder="Mínimo 6 caracteres"
                class="w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                [class.border-red-400]="invalid('new_password')"
                [class.border-gray-200]="!invalid('new_password')"
              />
              @if (invalid('new_password')) {
                <p class="text-red-500 text-xs mt-1">Entre 6 y 128 caracteres</p>
              }
            </div>

            <!-- Confirm password -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">
                Confirmar nueva contraseña
              </label>
              <input
                type="password"
                formControlName="confirm_password"
                placeholder="Repite la nueva contraseña"
                class="w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                [class.border-red-400]="confirmInvalid()"
                [class.border-gray-200]="!confirmInvalid()"
              />
              @if (confirmInvalid()) {
                <p class="text-red-500 text-xs mt-1">Las contraseñas no coinciden</p>
              }
            </div>

            <button
              type="submit"
              [disabled]="isLoading()"
              class="w-full px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {{ isLoading() ? 'Guardando...' : 'Cambiar contraseña' }}
            </button>
          </form>
        </div>
      </div>
    </div>
  `,
})
export class ChangePasswordComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = new FormGroup(
    {
      current_password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      new_password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(6), Validators.maxLength(128)],
      }),
      confirm_password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    },
    { validators: passwordsMatch },
  );

  invalid(name: 'current_password' | 'new_password' | 'confirm_password'): boolean {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }

  confirmInvalid(): boolean {
    const control = this.form.controls.confirm_password;
    return (control.invalid || this.form.hasError('mismatch')) && control.touched;
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { current_password, new_password } = this.form.getRawValue();
    const { error } = await this.authService.changePassword(current_password, new_password);

    if (error) {
      this.errorMessage.set(error);
      this.isLoading.set(false);
      return;
    }

    const role = this.authService.currentUser()?.role ?? UserRole.ADMIN;
    this.router.navigate([ROLE_HOME[role]]);
  }
}
