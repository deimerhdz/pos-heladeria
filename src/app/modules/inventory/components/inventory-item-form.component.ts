import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { UnitMeasureService } from '../../../core/services/unit-measure.service';
import { InventoryItem, InventoryItemForm } from '../interfaces/inventory.interface';
import { InventoryService } from '../services/inventory.service';
import { MoneyInputComponent } from '../../../shared/money-input/money-input.component';

@Component({
  selector: 'app-inventory-item-form',
  standalone: true,
  imports: [ReactiveFormsModule, MoneyInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 class="text-base font-bold text-gray-900">
            {{ item ? 'Editar insumo' : 'Nuevo insumo' }}
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
            <input formControlName="name" type="text" placeholder="Ej. Leche entera"
              class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          </div>

          <!-- Unidad de medida -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Unidad de medida *</label>
            <select formControlName="unit_measure_id"
              class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Seleccionar unidad...</option>
              @for (u of unitMeasureService.unitMeasures(); track u.id) {
                <option [value]="u.id">{{ u.name }} ({{ u.abbreviation }})</option>
              }
            </select>
          </div>

          <!-- Tipo -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
            <select formControlName="type"
              class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="raw_material">Materia prima</option>
              <option value="packaged">Empacado</option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <!-- Stock inicial (solo en creación) -->
            @if (!item) {
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Stock inicial</label>
                <input formControlName="current_stock" type="number" min="0" step="0.001" placeholder="0"
                  class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
            }
            <!-- Stock mínimo -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Stock mínimo *</label>
              <input formControlName="min_stock" type="number" min="0" step="0.001" placeholder="0"
                class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            </div>
            <!-- Costo unitario -->
            <div [class.col-span-2]="!!item">
              <label class="block text-sm font-medium text-gray-700 mb-1">Costo unitario</label>
              <app-money-input formControlName="unit_cost" [decimals]="2" placeholder="0"
                sizeClass="px-3 py-2 rounded-xl text-sm" />
            </div>
          </div>

          @if (!item) {
            <p class="text-xs text-gray-400">
              Tras crearlo, el stock cambia con ajustes y compras; no se edita directamente.
            </p>
          }

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
              {{ service.isSubmitting() ? 'Guardando...' : (item ? 'Guardar cambios' : 'Crear insumo') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class InventoryItemFormComponent implements OnChanges, OnInit {
  @Input() item: InventoryItem | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  readonly service = inject(InventoryService);
  readonly unitMeasureService = inject(UnitMeasureService);
  private readonly fb = inject(FormBuilder);

  form: FormGroup = this.buildForm();

  ngOnInit(): void {
    if (this.unitMeasureService.unitMeasures().length === 0) {
      this.unitMeasureService.loadUnitMeasures();
    }
  }

  ngOnChanges(): void {
    this.form = this.buildForm();
  }

  private buildForm(): FormGroup {
    return this.fb.group({
      name: [this.item?.name ?? '', Validators.required],
      unit_measure_id: [this.item?.unit_measure_id ?? '', Validators.required],
      type: [this.item?.type ?? 'raw_material', Validators.required],
      current_stock: [this.item?.current_stock ?? 0, [Validators.min(0)]],
      min_stock: [this.item?.min_stock ?? 0, [Validators.required, Validators.min(0)]],
      unit_cost: [this.item?.unit_cost ?? 0, [Validators.min(0)]],
    });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const val = this.form.value;
    const formData: InventoryItemForm = {
      name: val.name.trim(),
      unit_measure_id: val.unit_measure_id,
      type: val.type,
      current_stock: Number(val.current_stock),
      min_stock: Number(val.min_stock),
      unit_cost: Number(val.unit_cost),
    };

    const ok = this.item
      ? await this.service.updateItem(this.item.id, formData)
      : await this.service.createItem(formData);

    if (ok) {
      this.saved.emit();
      this.close.emit();
    }
  }
}
