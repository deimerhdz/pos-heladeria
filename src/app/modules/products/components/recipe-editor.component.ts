import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InventoryService } from '../../inventory/services/inventory.service';
import { UnitMeasureService } from '../../../core/services/unit-measure.service';
import { RecipeItem } from '../interfaces/product.interface';
import { ProductService } from '../services/product.service';

@Component({
  selector: 'app-recipe-editor',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="border border-gray-200 rounded-xl p-4">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-sm font-semibold text-gray-800">Receta · {{ label }}</h4>
        @if (savedOk()) {
          <span class="text-xs text-green-600 font-medium">Guardada ✓</span>
        }
      </div>

      @if (loading()) {
        <p class="text-sm text-gray-400">Cargando...</p>
      } @else {
        @if (rows().length === 0) {
          <p class="text-sm text-gray-400 mb-2">Sin insumos. Agrega los que consume esta variante.</p>
        }
        @for (row of rows(); track $index) {
          <div class="flex items-center gap-2 mb-2">
            <select [ngModel]="row.inventory_item_id" (ngModelChange)="updateRow($index, 'inventory_item_id', $event)"
              class="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500">
              <option value="">Insumo...</option>
              @for (i of inventoryService.items(); track i.id) {
                <option [value]="i.id">{{ i.name }}</option>
              }
            </select>
            <input [ngModel]="row.quantity" (ngModelChange)="updateRow($index, 'quantity', $event)"
              type="number" min="0" step="0.001" placeholder="Cant."
              class="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500">
            <span class="w-14 text-xs text-gray-400">{{ unitAbbr(row.inventory_item_id) }}</span>
            <button type="button" (click)="removeRow($index)"
              class="px-2 py-1.5 text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg">✕</button>
          </div>
        }

        <div class="flex items-center gap-3 mt-2">
          <button type="button" (click)="addRow()"
            class="text-sm font-medium text-indigo-600 hover:text-indigo-700">+ Agregar insumo</button>
          <button type="button" (click)="save()" [disabled]="service.isSubmitting()"
            class="ml-auto px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {{ service.isSubmitting() ? 'Guardando...' : 'Guardar receta' }}
          </button>
        </div>

        @if (service.error()) {
          <p class="text-red-600 text-sm mt-2">{{ service.error() }}</p>
        }
      }
    </div>
  `,
})
export class RecipeEditorComponent implements OnChanges {
  @Input({ required: true }) variantId!: string;
  @Input() label = '';

  readonly service = inject(ProductService);
  readonly inventoryService = inject(InventoryService);
  readonly unitMeasureService = inject(UnitMeasureService);

  readonly rows = signal<RecipeItem[]>([]);
  readonly loading = signal(false);
  readonly savedOk = signal(false);

  private readonly unitByItem = computed(() => {
    const units = new Map(this.unitMeasureService.unitMeasures().map((u) => [u.id, u.abbreviation]));
    const map = new Map<string, string>();
    for (const item of this.inventoryService.items()) {
      map.set(item.id, units.get(item.unit_measure_id) ?? '');
    }
    return map;
  });

  async ngOnChanges(): Promise<void> {
    this.savedOk.set(false);
    if (this.inventoryService.items().length === 0) this.inventoryService.loadItems();
    if (this.unitMeasureService.unitMeasures().length === 0) this.unitMeasureService.loadUnitMeasures();
    await this.loadRecipe();
  }

  private async loadRecipe(): Promise<void> {
    if (!this.variantId) {
      this.rows.set([]);
      return;
    }
    this.loading.set(true);
    const items = await this.service.getVariantRecipe(this.variantId);
    this.rows.set(items.map((i) => ({ ...i })));
    this.loading.set(false);
  }

  unitAbbr(itemId: string): string {
    return this.unitByItem().get(itemId) ?? '';
  }

  updateRow(index: number, key: keyof RecipeItem, value: unknown): void {
    this.savedOk.set(false);
    this.rows.update((rows) =>
      rows.map((r, i) =>
        i === index
          ? { ...r, [key]: key === 'inventory_item_id' ? String(value) : Number(value) }
          : r,
      ),
    );
  }

  addRow(): void {
    this.rows.update((rows) => [...rows, { inventory_item_id: '', quantity: 1 }]);
  }

  removeRow(index: number): void {
    this.rows.update((rows) => rows.filter((_, i) => i !== index));
  }

  async save(): Promise<void> {
    const items = this.rows().filter((r) => r.inventory_item_id && Number(r.quantity) > 0);
    const ok = await this.service.putVariantRecipe(this.variantId, items);
    if (ok) this.savedOk.set(true);
  }
}
