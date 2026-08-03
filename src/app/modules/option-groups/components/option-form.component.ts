import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { InventoryService } from '../../inventory/services/inventory.service';
import { buildUnitLookup } from '../../inventory/services/unit-lookup';
import { UnitMeasureService } from '../../../core/services/unit-measure.service';
import { Option, OptionForm, OptionGroup } from '../../products/interfaces/product.interface';
import { OptionGroupService } from '../services/option-group.service';
import { SearchableSelectComponent } from '../../../shared/searchable-select/searchable-select.component';

@Component({
  selector: 'app-option-form',
  standalone: true,
  imports: [ReactiveFormsModule, SearchableSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 class="text-base font-bold text-gray-900">
            {{ option ? 'Editar opción' : 'Nueva opción' }} @if (group) { · {{ group.name }} }
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
            <!-- Buscador y no un select plano: el catálogo real pasa de 70 insumos. -->
            <app-searchable-select formControlName="inventory_item_id"
              [options]="inventoryOptions()" placeholder="Ninguno" />
          </div>

          @if (form.value.inventory_item_id) {
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Cantidad consumida
                @if (selectedUnit(); as u) { <span class="text-gray-400 font-normal">(en {{ u }})</span> }
              </label>
              <input formControlName="item_quantity" type="number" min="0" step="0.001" placeholder="0"
                class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <p class="text-xs text-gray-400 mt-1">
                <strong>Solo se usa si ningún tamaño define una cantidad</strong> para este
                grupo. Si un tamaño la define, manda la suya y esta se ignora — nunca se suman.
              </p>
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
              {{ service.isSubmitting() ? 'Guardando...' : option ? 'Guardar cambios' : 'Agregar opción' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class OptionFormComponent implements OnInit {
  /** Grupo al que pertenece la opción (siempre presente). */
  @Input() group: OptionGroup | null = null;
  /** Opción a editar; `null` crea una nueva dentro de `group`. */
  @Input() option: Option | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  readonly service = inject(OptionGroupService);
  readonly inventoryService = inject(InventoryService);
  private readonly unitMeasureService = inject(UnitMeasureService);
  private readonly fb = inject(FormBuilder);

  readonly inventoryOptions = computed(() =>
    this.inventoryService.allItems().map((i) => ({ id: i.id, label: i.name })),
  );

  /** Insumo elegido en el formulario, para poder rotular la cantidad con su unidad. */
  private readonly selectedItemId = signal<string | null>(null);

  readonly selectedUnit = computed(() =>
    buildUnitLookup(
      this.inventoryService.allItems(),
      this.unitMeasureService.unitMeasures(),
    ).abbrOf(this.selectedItemId()),
  );

  form: FormGroup = this.fb.group({
    name: ['', Validators.required],
    extra_price: [0, [Validators.required, Validators.min(0)]],
    inventory_item_id: [null as string | null],
    item_quantity: [0, [Validators.min(0)]],
  });

  ngOnInit(): void {
    // `allItems()`, no `items()`: este último es la página actual (20), así que un
    // insumo fuera de la primera página era inseleccionable — y sin poder ligar el
    // insumo, la opción no descuenta nada.
    if (this.inventoryService.allItems().length === 0) this.inventoryService.loadAllItems();
    if (this.unitMeasureService.unitMeasures().length === 0) {
      this.unitMeasureService.loadUnitMeasures();
    }
    this.service.error.set(null);
    if (this.option) {
      this.form.setValue({
        name: this.option.name,
        extra_price: this.option.extra_price,
        inventory_item_id: this.option.inventory_item_id,
        item_quantity: this.option.item_quantity,
      });
    }
    this.selectedItemId.set(this.form.value.inventory_item_id ?? null);
    this.form.controls['inventory_item_id'].valueChanges.subscribe((id) =>
      this.selectedItemId.set((id as string | null) ?? null),
    );
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || (!this.option && !this.group)) {
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
    const ok = this.option
      ? await this.service.updateOption(this.option.id, formData)
      : await this.service.addOption(this.group!.id, formData);
    if (ok) {
      this.saved.emit();
      this.close.emit();
    }
  }
}
