import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  inject,
} from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Supplier, SupplierForm } from '../interfaces/supplier.interface';
import { SuppliersService } from '../services/suppliers.service';

@Component({
  selector: 'app-supplier-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 class="text-base font-bold text-gray-900">
            {{ supplier ? 'Editar proveedor' : 'Nuevo proveedor' }}
          </h2>
          <button type="button" (click)="close.emit()" class="text-gray-400 hover:text-gray-600 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate class="p-6 space-y-4">
          <!-- Nombre -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input formControlName="name" type="text" placeholder="Ej. Distribuidora Láctea"
              class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          </div>

          <!-- NIT / Tax id -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">NIT / Documento</label>
            <input formControlName="tax_id" type="text" placeholder="Ej. 900123456-7"
              class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          </div>

          <!-- Teléfono -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
            <input formControlName="phone" type="text" placeholder="Ej. 300 123 4567"
              class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          </div>

          <!-- Email -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input formControlName="email" type="email" placeholder="Ej. ventas@proveedor.com"
              class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            @if (form.get('email')?.touched && form.get('email')?.hasError('email')) {
              <p class="text-xs text-red-500 mt-1">Email inválido.</p>
            }
          </div>

          @if (service.error()) {
            <p class="text-red-600 text-sm">{{ service.error() }}</p>
          }

          <div class="flex gap-3 pt-2">
            <button type="button" (click)="close.emit()"
              class="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" [disabled]="form.invalid || service.isSubmitting()"
              class="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors">
              {{ service.isSubmitting() ? 'Guardando...' : (supplier ? 'Guardar cambios' : 'Crear proveedor') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class SupplierFormComponent implements OnChanges {
  @Input() supplier: Supplier | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  readonly service = inject(SuppliersService);
  private readonly fb = inject(FormBuilder);

  form: FormGroup = this.buildForm();

  ngOnChanges(): void {
    this.form = this.buildForm();
  }

  private buildForm(): FormGroup {
    return this.fb.group({
      name: [this.supplier?.name ?? '', Validators.required],
      tax_id: [this.supplier?.tax_id ?? ''],
      phone: [this.supplier?.phone ?? ''],
      email: [this.supplier?.email ?? '', Validators.email],
    });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const val = this.form.value;
    const formData: SupplierForm = {
      name: val.name.trim(),
      tax_id: val.tax_id?.trim() || null,
      phone: val.phone?.trim() || null,
      email: val.email?.trim() || null,
    };

    const ok = this.supplier
      ? await this.service.updateSupplier(this.supplier.id, formData)
      : await this.service.createSupplier(formData);

    if (ok) {
      this.saved.emit();
      this.close.emit();
    }
  }
}
