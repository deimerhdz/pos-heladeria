import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Output,
  inject,
} from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { environment } from '../../../../environments/environment';
import { TenantCreateWithUser } from '../interfaces/tenant.interface';
import { TenantService } from '../services/tenant.service';

/** Normalize a name into a slug usable as schema / host label. */
function toSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ''); // keep only [a-z0-9]
}

@Component({
  selector: 'app-tenant-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 class="text-lg font-semibold text-gray-900">Nuevo tenant</h2>
          <button
            type="button"
            (click)="onCancel()"
            class="text-gray-400 hover:text-gray-600 transition-colors"
          >
            ✕
          </button>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate class="px-6 py-5 space-y-5">
          <!-- Tenant data -->
          <div class="space-y-4">
            <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Datos del tenant</h3>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Nombre <span class="text-red-500">*</span>
              </label>
              <input
                type="text"
                formControlName="tenant_name"
                (input)="onTenantNameInput()"
                placeholder="Ej: Heladería Central"
                class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                [class.border-red-400]="invalid('tenant_name')"
                [class.border-gray-200]="!invalid('tenant_name')"
              />
              @if (invalid('tenant_name')) {
                <p class="text-red-500 text-xs mt-1">Mínimo 3 caracteres</p>
              }
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Schema <span class="text-red-500">*</span>
              </label>
              <input
                type="text"
                formControlName="schema_name"
                (input)="markTouchedManually('schema_name')"
                placeholder="Ej: heladeriacentral"
                class="w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
                [class.border-red-400]="invalid('schema_name')"
                [class.border-gray-200]="!invalid('schema_name')"
              />
              @if (invalid('schema_name')) {
                <p class="text-red-500 text-xs mt-1">Mínimo 3 caracteres</p>
              }
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Host <span class="text-red-500">*</span>
              </label>
              <input
                type="text"
                formControlName="host"
                (input)="markTouchedManually('host')"
                placeholder="Ej: heladeriacentral.pos-sistem.com"
                class="w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
                [class.border-red-400]="invalid('host')"
                [class.border-gray-200]="!invalid('host')"
              />
              @if (invalid('host')) {
                <p class="text-red-500 text-xs mt-1">Mínimo 3 caracteres</p>
              }
            </div>
          </div>

          <!-- Admin user data -->
          <div class="space-y-4 pt-2 border-t border-gray-100">
            <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Usuario administrador</h3>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Nombre <span class="text-red-500">*</span>
              </label>
              <input
                type="text"
                formControlName="name"
                placeholder="Nombre del administrador"
                class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                [class.border-red-400]="invalid('name')"
                [class.border-gray-200]="!invalid('name')"
              />
              @if (invalid('name')) {
                <p class="text-red-500 text-xs mt-1">Mínimo 3 caracteres</p>
              }
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Email <span class="text-red-500">*</span>
              </label>
              <input
                type="email"
                formControlName="email"
                placeholder="admin@negocio.com"
                class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                [class.border-red-400]="invalid('email')"
                [class.border-gray-200]="!invalid('email')"
              />
              @if (invalid('email')) {
                <p class="text-red-500 text-xs mt-1">Email inválido (mínimo 5 caracteres)</p>
              }
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Contraseña <span class="text-red-500">*</span>
              </label>
              <input
                type="password"
                formControlName="password"
                placeholder="Mínimo 6 caracteres"
                class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                [class.border-red-400]="invalid('password')"
                [class.border-gray-200]="!invalid('password')"
              />
              @if (invalid('password')) {
                <p class="text-red-500 text-xs mt-1">Mínimo 6 caracteres</p>
              }
            </div>
          </div>

          <!-- Service error -->
          @if (tenantService.error()) {
            <p class="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">
              {{ tenantService.error() }}
            </p>
          }

          <!-- Actions -->
          <div class="flex gap-3 pt-2">
            <button
              type="button"
              (click)="onCancel()"
              class="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              [disabled]="tenantService.isSubmitting()"
              class="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {{ tenantService.isSubmitting() ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class TenantFormComponent {
  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  readonly tenantService = inject(TenantService);

  /** Tracks whether the user edited schema/host directly (stops auto-suggestion). */
  private schemaTouchedManually = false;
  private hostTouchedManually = false;

  readonly form = new FormGroup({
    tenant_name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3)],
    }),
    schema_name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3)],
    }),
    host: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3)],
    }),
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3)],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.minLength(5)],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(6)],
    }),
  });

  invalid(name: keyof typeof this.form.controls): boolean {
    const control: AbstractControl = this.form.controls[name];
    return control.invalid && control.touched;
  }

  /** Auto-suggest schema/host from the tenant name until the user edits them. */
  onTenantNameInput(): void {
    const slug = toSlug(this.form.controls.tenant_name.value);
    if (!this.schemaTouchedManually) {
      this.form.controls.schema_name.setValue(slug);
    }
    if (!this.hostTouchedManually) {
      this.form.controls.host.setValue(slug ? `${slug}.${environment.rootDomain}` : '');
    }
  }

  markTouchedManually(field: 'schema_name' | 'host'): void {
    if (field === 'schema_name') this.schemaTouchedManually = true;
    else this.hostTouchedManually = true;
  }

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const raw = this.form.getRawValue();
    const payload: TenantCreateWithUser = {
      tenant_name: raw.tenant_name.trim(),
      schema_name: raw.schema_name.trim(),
      host: raw.host.trim(),
      name: raw.name.trim(),
      email: raw.email.trim(),
      password: raw.password,
    };

    await this.tenantService.createTenant(payload);

    if (!this.tenantService.error()) {
      this.saved.emit();
    }
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
