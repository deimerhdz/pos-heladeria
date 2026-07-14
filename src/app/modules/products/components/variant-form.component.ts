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
import { Variant, VariantForm } from '../interfaces/product.interface';
import { ProductService } from '../services/product.service';

@Component({
  selector: 'app-variant-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 class="text-base font-bold text-gray-900">
            {{ variant ? 'Editar variante' : 'Nueva variante' }}
          </h2>
          <button type="button" (click)="close.emit()" class="text-gray-400 hover:text-gray-600 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate class="p-6 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input formControlName="name" type="text" placeholder="Ej. Pequeño"
              class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Precio *</label>
              <input formControlName="price" type="number" min="0" step="0.01" placeholder="0"
                class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">SKU</label>
              <input formControlName="sku" type="text" placeholder="Opcional"
                class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            </div>
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
              {{ service.isSubmitting() ? 'Guardando...' : (variant ? 'Guardar cambios' : 'Crear variante') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class VariantFormComponent implements OnChanges {
  @Input({ required: true }) productId!: string;
  @Input() variant: Variant | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  readonly service = inject(ProductService);
  private readonly fb = inject(FormBuilder);

  form: FormGroup = this.buildForm();

  ngOnChanges(): void {
    this.form = this.buildForm();
  }

  private buildForm(): FormGroup {
    return this.fb.group({
      name: [this.variant?.name ?? '', Validators.required],
      price: [this.variant?.price ?? 0, [Validators.required, Validators.min(0)]],
      sku: [this.variant?.sku ?? ''],
    });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const val = this.form.value;
    const sku: string | null = val.sku?.trim() || null;

    let ok: boolean;
    if (this.variant) {
      ok = await this.service.updateVariant(this.variant.id, {
        name: val.name.trim(),
        price: Number(val.price),
        sku,
      });
    } else {
      const formData: VariantForm = {
        name: val.name.trim(),
        price: Number(val.price),
        sku,
      };
      ok = await this.service.createVariant(this.productId, formData);
    }

    if (ok) {
      this.saved.emit();
      this.close.emit();
    }
  }
}
