import { Component, EventEmitter, Output, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RoleName, TenantUserForm } from '../interfaces/user-profile.interface';
import { UsersService } from '../services/users.service';

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div class="px-5 py-4 border-b border-gray-100">
        <h2 class="text-sm font-semibold text-gray-800">Nuevo usuario</h2>
        <p class="text-xs text-gray-400 mt-0.5">Completa los datos del nuevo miembro del personal</p>
      </div>

      <form [formGroup]="form" (ngSubmit)="submit()" class="px-5 py-4 space-y-4">
        @if (usersService.error()) {
          <div class="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {{ usersService.error() }}
          </div>
        }

        <!-- Nombre -->
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1.5">Nombre completo</label>
          <input
            type="text"
            formControlName="name"
            placeholder="Ej: María García"
            class="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
            [class.border-red-300]="nameInvalid"
          />
          @if (nameInvalid) {
            <p class="text-red-500 text-xs mt-1">El nombre es requerido</p>
          }
        </div>

        <!-- Email -->
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1.5">Correo electrónico</label>
          <input
            type="email"
            formControlName="email"
            placeholder="usuario@heladeria.com"
            class="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
            [class.border-red-300]="emailInvalid"
          />
          @if (emailInvalid) {
            <p class="text-red-500 text-xs mt-1">Ingresa un correo válido</p>
          }
        </div>

        <!-- Teléfono (opcional) -->
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1.5">
            Teléfono <span class="text-gray-400 font-normal">(opcional)</span>
          </label>
          <input
            type="tel"
            formControlName="phone"
            placeholder="Ej: 3001234567"
            class="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
            [class.border-red-300]="phoneInvalid"
          />
          @if (phoneInvalid) {
            <p class="text-red-500 text-xs mt-1">Máximo 20 caracteres</p>
          }
        </div>

        <!-- Contraseña -->
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1.5">Contraseña temporal</label>
          <input
            type="password"
            formControlName="password"
            placeholder="Mínimo 6 caracteres"
            class="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
            [class.border-red-300]="passwordInvalid"
          />
          @if (passwordInvalid) {
            <p class="text-red-500 text-xs mt-1">Mínimo 6 caracteres</p>
          }
        </div>

        <!-- Rol -->
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1.5">Rol</label>
          <select
            formControlName="role"
            class="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition bg-white"
            [class.border-red-300]="roleInvalid"
          >
            <option value="" disabled>Selecciona un rol</option>
            <option value="ADMIN">Admin</option>
            <option value="CASHIER">Cajero</option>
          </select>
          @if (roleInvalid) {
            <p class="text-red-500 text-xs mt-1">Selecciona un rol</p>
          }
        </div>

        <!-- Botones -->
        <div class="flex gap-3 pt-2">
          <button
            type="submit"
            [disabled]="usersService.isSubmitting()"
            class="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {{ usersService.isSubmitting() ? 'Guardando...' : 'Guardar' }}
          </button>
          <button
            type="button"
            (click)="cancelled.emit()"
            [disabled]="usersService.isSubmitting()"
            class="flex-1 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  `,
})
export class UserFormComponent {
  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  readonly usersService = inject(UsersService);

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(150)] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(20)] }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(6), Validators.maxLength(128)],
    }),
    role: new FormControl<RoleName | ''>('', { nonNullable: true, validators: [Validators.required] }),
  });

  get nameInvalid(): boolean {
    const c = this.form.controls.name;
    return c.invalid && c.touched;
  }
  get emailInvalid(): boolean {
    const c = this.form.controls.email;
    return c.invalid && c.touched;
  }
  get phoneInvalid(): boolean {
    const c = this.form.controls.phone;
    return c.invalid && c.touched;
  }
  get passwordInvalid(): boolean {
    const c = this.form.controls.password;
    return c.invalid && c.touched;
  }
  get roleInvalid(): boolean {
    const c = this.form.controls.role;
    return c.invalid && c.touched;
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    await this.usersService.createUser(this.form.getRawValue() as TenantUserForm);

    if (!this.usersService.error()) {
      this.saved.emit();
    }
  }
}
