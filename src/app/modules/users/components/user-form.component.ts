import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { UserRole } from '../../../core/interfaces/user.interface';
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
        @if (errorMessage()) {
          <div class="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {{ errorMessage() }}
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
            <option value="admin">Admin</option>
            <option value="cashier">Cajero</option>
            <option value="staff">Staff (Cocina)</option>
          </select>
          @if (roleInvalid) {
            <p class="text-red-500 text-xs mt-1">Selecciona un rol</p>
          }
        </div>

        <!-- Botones -->
        <div class="flex gap-3 pt-2">
          <button
            type="submit"
            [disabled]="isSubmitting()"
            class="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {{ isSubmitting() ? 'Guardando...' : 'Guardar' }}
          </button>
          <button
            type="button"
            (click)="cancelled.emit()"
            [disabled]="isSubmitting()"
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

  private readonly usersService = inject(UsersService);

  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(6)] }),
    role: new FormControl<UserRole>('' as UserRole, { nonNullable: true, validators: [Validators.required] }),
  });

  get nameInvalid(): boolean {
    const c = this.form.controls.name;
    return c.invalid && c.touched;
  }
  get emailInvalid(): boolean {
    const c = this.form.controls.email;
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
    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const { error } = await this.usersService.createUser(this.form.getRawValue());

    this.isSubmitting.set(false);
    if (error) {
      this.errorMessage.set(error);
      return;
    }
    this.saved.emit();
  }
}
