import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { InventoryService } from '../../inventory/services/inventory.service';
import { OptionForm, OptionGroup } from '../../products/interfaces/product.interface';
import { OptionGroupService } from '../services/option-group.service';

@Component({
  selector: 'app-option-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 class="text-base font-bold text-gray-900">
            Nueva opción @if (group) { · {{ group.name }} }
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
            <input formControlName="name" type="text" placeholder="Ej. Chocolate"
              class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Precio extra</label>
            <input formControlName="extra_price" type="number" min="0" step="0.01" placeholder="0"
              class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Insumo que consume (opcional)</label>
            <select formControlName="inventory_item_id"
              class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option [ngValue]="null">Ninguno</option>
              @for (i of inventoryService.items(); track i.id) {
                <option [ngValue]="i.id">{{ i.name }}</option>
              }
            </select>
          </div>

          @if (form.value.inventory_item_id) {
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Cantidad consumida</label>
              <input formControlName="item_quantity" type="number" min="0" step="0.001" placeholder="0"
                class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <p class="text-xs text-gray-400 mt-1">En la unidad del insumo. Se descuenta al vender esta opción.</p>
            </div>
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
              {{ service.isSubmitting() ? 'Guardando...' : 'Agregar opción' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class OptionFormComponent implements OnInit {
  @Input() group: OptionGroup | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  readonly service = inject(OptionGroupService);
  readonly inventoryService = inject(InventoryService);
  private readonly fb = inject(FormBuilder);

  form: FormGroup = this.fb.group({
    name: ['', Validators.required],
    extra_price: [0, [Validators.required, Validators.min(0)]],
    inventory_item_id: [null as string | null],
    item_quantity: [0, [Validators.min(0)]],
  });

  ngOnInit(): void {
    if (this.inventoryService.items().length === 0) this.inventoryService.loadItems();
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || !this.group) {
      this.form.markAllAsTouched();
      return;
    }
    const val = this.form.value;
    const inventoryItemId: string | null = val.inventory_item_id || null;
    const formData: OptionForm = {
      name: val.name.trim(),
      extra_price: Number(val.extra_price),
      inventory_item_id: inventoryItemId,
      item_quantity: inventoryItemId ? Number(val.item_quantity) : 0,
    };
    const ok = await this.service.addOption(this.group.id, formData);
    if (ok) {
      this.saved.emit();
      this.close.emit();
    }
  }
}
