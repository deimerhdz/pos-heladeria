import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnInit, Output, computed, inject } from '@angular/core';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  FormArray,
  Validators,
} from '@angular/forms';
import {
  Ingredient,
  IngredientForm,
  ProductComponentForm,
  ProductType,
} from '../interfaces/ingredient.interface';
import { IngredientsService } from '../services/ingredients.service';
import { CategoryService } from '../../categories/services/category.service';
import { UnitMeasureService } from '../../../core/services/unit-measure.service';

@Component({
  selector: 'app-ingredient-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" (click)="onBackdrop($event)">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 class="text-lg font-bold text-gray-900">
            {{ ingredient ? 'Editar producto' : 'Nuevo producto' }}
          </h2>
          <button (click)="close.emit()" class="text-gray-400 hover:text-gray-600 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="p-6 space-y-4">
          <!-- Tipo de producto -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Tipo de producto *</label>
            <select formControlName="product_type"
              class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="INGREDIENT">Insumo</option>
              <option value="PRODUCT">Producto</option>
              <option value="RECIPE">Receta</option>
            </select>
          </div>

          <!-- Nombre -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input formControlName="name" type="text" placeholder="Ej. Leche entera"
              class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          </div>

          <!-- Categoría + Unidad -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Categoría *</label>
              <select formControlName="category_id"
                class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="" disabled>Selecciona...</option>
                @for (c of categoryService.categories(); track c.id) {
                  <option [value]="c.id">{{ c.name }}</option>
                }
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Unidad *</label>
              <select formControlName="unit_measure_id"
                class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="" disabled>Selecciona...</option>
                @for (u of unitMeasureService.unitMeasures(); track u.id) {
                  <option [value]="u.id">{{ u.name }} ({{ u.abbreviation }})</option>
                }
              </select>
            </div>
          </div>

          <!-- Costo + Precio de venta -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Costo por unidad *</label>
              <input formControlName="cost" type="number" min="0" step="0.01" placeholder="0.00"
                class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            </div>
            @if (!isIngredient()) {
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Precio de venta *</label>
                <input formControlName="price" type="number" min="0" step="0.01" placeholder="0.00"
                  class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
            }
          </div>

          <!-- Menú del restaurante -->
          @if (!isIngredient()) {
            <label class="flex items-center gap-2 text-sm text-gray-700">
              <input formControlName="is_menu" type="checkbox"
                class="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
              ¿Agregar este producto al menú del restaurante?
            </label>
          }

          <!-- Control de stock -->
          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input formControlName="control_stock" type="checkbox"
              class="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
            Controlar stock de este producto
          </label>

          @if (controlStock()) {
            <div class="grid grid-cols-2 gap-3">
              @if (!ingredient) {
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Stock inicial</label>
                  <input formControlName="current_stock" type="number" min="0" step="1" placeholder="0"
                    class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                </div>
              }
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Stock mínimo *</label>
                <input formControlName="stock_min" type="number" min="0" step="1" placeholder="0"
                  class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
            </div>
          }

          <!-- Componentes de la receta -->
          @if (isRecipe()) {
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label class="block text-sm font-medium text-gray-700">Componentes *</label>
                <button type="button" (click)="addComponent()"
                  class="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors">
                  + Agregar componente
                </button>
              </div>
              @if (loadingComponents) {
                <p class="text-xs text-gray-400">Cargando componentes...</p>
              }
              <div formArrayName="components" class="space-y-2">
                @for (row of components.controls; track $index; let i = $index) {
                  <div [formGroupName]="i" class="flex gap-2">
                    <select formControlName="component_id"
                      class="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="" disabled>Producto...</option>
                      @for (p of selectableComponents(); track p.id) {
                        <option [value]="p.id">{{ p.name }}</option>
                      }
                    </select>
                    <input formControlName="quantity" type="number" min="0.001" step="0.001" placeholder="Cant."
                      class="w-24 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <button type="button" (click)="removeComponent(i)"
                      class="px-2 text-gray-400 hover:text-red-600 transition-colors">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                }
              </div>
              @if (components.length === 0) {
                <p class="text-xs text-gray-400">Agrega al menos un componente.</p>
              }
            </div>
          }

          <!-- Descripción -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
            <textarea formControlName="description" rows="2" placeholder="Notas opcionales"
              class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"></textarea>
          </div>

          @if (service.error()) {
            <p class="text-red-600 text-sm">{{ service.error() }}</p>
          }

          <div class="flex gap-3 pt-2">
            <button type="button" (click)="close.emit()"
              class="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" [disabled]="form.invalid || !isRecipeValid() || service.isSubmitting()"
              class="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors">
              {{ service.isSubmitting() ? 'Guardando...' : (ingredient ? 'Guardar cambios' : 'Crear producto') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class IngredientFormComponent implements OnChanges, OnInit {
  @Input() ingredient: Ingredient | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  readonly service = inject(IngredientsService);
  readonly categoryService = inject(CategoryService);
  readonly unitMeasureService = inject(UnitMeasureService);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);

  form: FormGroup = this.buildForm();
  loadingComponents = false;

  /** Products available to use as recipe components (excludes the one being edited). */
  readonly selectableComponents = computed(() =>
    this.service.ingredients().filter(p => p.active && p.id !== this.ingredient?.id)
  );

  ngOnInit(): void {
    // Catalogs feed the category/unit selectors.
    if (this.categoryService.categories().length === 0) this.categoryService.loadCategories();
    if (this.unitMeasureService.unitMeasures().length === 0) this.unitMeasureService.loadUnitMeasures();
  }

  ngOnChanges(): void {
    this.form = this.buildForm();
    this.wireTypeChanges();

    if (this.ingredient) {
      this.form.patchValue({
        product_type: this.ingredient.product_type,
        name: this.ingredient.name,
        description: this.ingredient.description ?? '',
        cost: this.ingredient.cost,
        price: this.ingredient.price,
        is_menu: this.ingredient.is_menu,
        control_stock: this.ingredient.control_stock,
        stock_min: this.ingredient.stock_min,
        category_id: this.ingredient.category_id,
        unit_measure_id: this.ingredient.unit_measure_id,
      });
      if (this.ingredient.product_type === 'RECIPE') {
        void this.loadComponents(this.ingredient.id);
      }
    }

    this.applyTypeValidators();
  }

  get components(): FormArray {
    return this.form.get('components') as FormArray;
  }

  isIngredient(): boolean { return this.form.get('product_type')?.value === 'INGREDIENT'; }
  isRecipe(): boolean { return this.form.get('product_type')?.value === 'RECIPE'; }
  controlStock(): boolean { return !!this.form.get('control_stock')?.value; }

  /** Recipes need at least one component; other types are unconstrained here. */
  isRecipeValid(): boolean {
    return !this.isRecipe() || this.components.length > 0;
  }

  addComponent(component?: ProductComponentForm): void {
    this.components.push(
      this.fb.group({
        component_id: [component?.component_id ?? '', Validators.required],
        quantity: [component?.quantity ?? 1, [Validators.required, Validators.min(0.001)]],
      })
    );
  }

  removeComponent(index: number): void {
    this.components.removeAt(index);
  }

  onBackdrop(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.close.emit();
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || !this.isRecipeValid()) {
      this.form.markAllAsTouched();
      return;
    }

    const val = this.form.value;
    const type = val.product_type as ProductType;
    const formData: IngredientForm = {
      name: val.name.trim(),
      description: val.description?.trim() ?? '',
      product_type: type,
      cost: Number(val.cost),
      price: type === 'INGREDIENT' ? 0 : Number(val.price ?? 0),
      is_menu: type === 'INGREDIENT' ? false : !!val.is_menu,
      category_id: val.category_id,
      unit_measure_id: val.unit_measure_id,
      control_stock: !!val.control_stock,
      current_stock: Number(val.current_stock ?? 0),
      stock_min: Number(val.stock_min ?? 0),
      components: type === 'RECIPE'
        ? (val.components ?? []).map((c: ProductComponentForm) => ({
            component_id: c.component_id,
            quantity: Number(c.quantity),
          }))
        : [],
    };

    if (this.ingredient) {
      await this.service.updateIngredient(this.ingredient.id, formData);
    } else {
      await this.service.createIngredient(formData);
    }

    if (!this.service.error()) {
      this.saved.emit();
      this.close.emit();
    }
  }

  private buildForm(): FormGroup {
    return this.fb.group({
      product_type: ['INGREDIENT' as ProductType, Validators.required],
      name: ['', Validators.required],
      description: [''],
      category_id: ['', Validators.required],
      unit_measure_id: ['', Validators.required],
      cost: [0, [Validators.required, Validators.min(0)]],
      price: [0, Validators.min(0)],
      is_menu: [false],
      control_stock: [false],
      current_stock: [0, Validators.min(0)],
      stock_min: [0, Validators.min(0)],
      components: this.fb.array([]),
    });
  }

  /** Re-evaluate validators whenever type or stock control changes. */
  private wireTypeChanges(): void {
    this.form.get('product_type')!.valueChanges.subscribe(() => {
      this.normalizeForType();
      this.applyTypeValidators();
    });
    this.form.get('control_stock')!.valueChanges.subscribe(() => this.applyTypeValidators());
  }

  /** Clear fields that don't apply to the selected type. */
  private normalizeForType(): void {
    const type = this.form.get('product_type')!.value as ProductType;
    if (type === 'INGREDIENT') {
      this.form.patchValue({ price: 0, is_menu: false }, { emitEvent: false });
    }
    if (type !== 'RECIPE') {
      this.components.clear();
    }
  }

  private applyTypeValidators(): void {
    const type = this.form.get('product_type')!.value as ProductType;
    const sellable = type !== 'INGREDIENT';
    const tracksStock = !!this.form.get('control_stock')!.value;

    const price = this.form.get('price')!;
    price.setValidators(sellable ? [Validators.required, Validators.min(0.01)] : [Validators.min(0)]);
    price.updateValueAndValidity({ emitEvent: false });

    const stockMin = this.form.get('stock_min')!;
    stockMin.setValidators(tracksStock ? [Validators.required, Validators.min(0)] : [Validators.min(0)]);
    stockMin.updateValueAndValidity({ emitEvent: false });
  }

  private async loadComponents(id: string): Promise<void> {
    this.loadingComponents = true;
    const rows = await this.service.loadProductComponents(id);
    this.components.clear();
    for (const row of rows) this.addComponent(row);
    this.loadingComponents = false;
    this.cdr.markForCheck();
  }
}
