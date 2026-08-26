import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { AuthApiService } from '../../../core/auth/auth-api.service';
import { PasswordInputComponent } from '../../../shared/password-input/password-input.component';

/** Validator: `new_password` and `confirm_password` must match. */
function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const next = group.get('new_password')?.value;
  const confirm = group.get('confirm_password')?.value;
  return next && confirm && next !== confirm ? { mismatch: true } : null;
}

type ScreenState = 'checking' | 'form' | 'invalid' | 'done';

const REASON_MESSAGES: Record<string, string> = {
  expired: 'Este enlace caducó. Pide uno nuevo para continuar.',
  used: 'Este enlace ya fue usado. Pide uno nuevo si necesitas cambiar tu contraseña.',
  invalid: 'Este enlace no es válido. Pide uno nuevo para continuar.',
};

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PasswordInputComponent],
  template: `
    <div class="min-h-screen bg-white flex flex-col items-center justify-center px-6 py-8">
      <div class="w-full max-w-sm">
        <img src="/logo.svg" alt="SkeiloPOS" class="w-10 h-10 rounded-xl shrink-0 mb-6" />

        @switch (state()) {
          @case ('checking') {
            <p class="text-sm text-gray-500">Verificando el enlace...</p>
          }
          @case ('invalid') {
            <div class="text-center">
              <div
                class="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4 text-3xl"
              >
                ⚠️
              </div>
              <h1 class="text-xl font-bold text-gray-900">No pudimos usar este enlace</h1>
              <p class="text-sm text-gray-500 mt-2 leading-relaxed">{{ invalidReasonMessage() }}</p>
              <a
                routerLink="/forgot-password"
                class="inline-block mt-6 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors text-sm"
              >
                Pedir un enlace nuevo
              </a>
            </div>
          }
          @case ('done') {
            <div class="text-center">
              <div
                class="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-4 text-3xl"
              >
                ✅
              </div>
              <h1 class="text-xl font-bold text-gray-900">Contraseña actualizada</h1>
              <p class="text-sm text-gray-500 mt-2 leading-relaxed">
                Ya puedes iniciar sesión con tu nueva contraseña.
              </p>
              <a
                routerLink="/login"
                class="inline-block mt-6 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors text-sm"
              >
                Iniciar sesión
              </a>
            </div>
          }
          @case ('form') {
            <h1 class="text-2xl font-bold text-gray-900">Define una nueva contraseña</h1>
            <p class="text-sm text-gray-500 mt-2 leading-relaxed">
              Debe tener entre 8 y 12 caracteres.
            </p>

            <form [formGroup]="form" (ngSubmit)="submit()" class="mt-8 space-y-4" novalidate>
              @if (errorMessage()) {
                <div class="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                  {{ errorMessage() }}
                </div>
              }

              <div>
                <label class="block text-xs font-semibold text-gray-700 mb-1.5">
                  Nueva contraseña
                </label>
                <app-password-input
                  formControlName="new_password"
                  placeholder="Entre 8 y 12 caracteres"
                  autocomplete="new-password"
                  sizeClass="px-4 py-2.5 rounded-lg bg-gray-50 text-sm"
                  [invalid]="invalid('new_password')"
                />
                @if (invalid('new_password')) {
                  <p class="text-red-500 text-xs mt-1">Entre 8 y 12 caracteres</p>
                }
              </div>

              <div>
                <label class="block text-xs font-semibold text-gray-700 mb-1.5">
                  Confirmar nueva contraseña
                </label>
                <app-password-input
                  formControlName="confirm_password"
                  placeholder="Repite la nueva contraseña"
                  autocomplete="new-password"
                  sizeClass="px-4 py-2.5 rounded-lg bg-gray-50 text-sm"
                  [invalid]="confirmInvalid()"
                />
                @if (confirmInvalid()) {
                  <p class="text-red-500 text-xs mt-1">Las contraseñas no coinciden</p>
                }
              </div>

              <button
                type="submit"
                [disabled]="isLoading()"
                class="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold py-3 rounded-lg transition-colors text-sm mt-2"
              >
                {{ isLoading() ? 'Guardando...' : 'Cambiar contraseña' }}
              </button>
            </form>
          }
        }
      </div>
    </div>
  `,
})
export class ResetPasswordComponent implements OnInit {
  private readonly authApi = inject(AuthApiService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  private token = '';

  readonly state = signal<ScreenState>('checking');
  readonly invalidReason = signal<string | null>(null);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = new FormGroup(
    {
      new_password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(8), Validators.maxLength(12)],
      }),
      confirm_password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    },
    { validators: passwordsMatch },
  );

  async ngOnInit(): Promise<void> {
    // Cualquier sesión existente se limpia antes de mostrar el formulario
    // (FR-006) — el enlace de reset no depende de, ni preserva, una sesión.
    this.authService.clearSession();

    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) {
      this.invalidReason.set('invalid');
      this.state.set('invalid');
      return;
    }

    try {
      // El backend responde 200 solo cuando el enlace está vigente — los
      // casos "expired"/"used"/"invalid" llegan como 400/404 (ver contrato),
      // así que HttpClient los entrega como error, no como valid:false.
      await firstValueFrom(this.authApi.validateResetToken(this.token));
      this.state.set('form');
    } catch (err) {
      const reason =
        err instanceof HttpErrorResponse && typeof err.error?.reason === 'string'
          ? err.error.reason
          : 'invalid';
      this.invalidReason.set(reason);
      this.state.set('invalid');
    }
  }

  invalidReasonMessage(): string {
    return REASON_MESSAGES[this.invalidReason() ?? 'invalid'] ?? REASON_MESSAGES['invalid'];
  }

  invalid(name: 'new_password' | 'confirm_password'): boolean {
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

    const { new_password } = this.form.getRawValue();
    const { error } = await this.authService.resetPassword(this.token, new_password);

    this.isLoading.set(false);

    if (error) {
      this.errorMessage.set(error);
      return;
    }

    this.state.set('done');
  }
}
