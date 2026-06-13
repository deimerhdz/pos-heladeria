import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Product, ProductForm, RecipeItemForm } from '../interfaces/product.interface';
import { ProductService } from '../services/product.service';
import { CategoryService } from '../../categories/services/category.service';
import { IngredientsService } from '../../ingredients/services/ingredients.service';

interface RecipeRow {
  ingredient_id: string;
  quantity: number;
  ingredient_name: string;
  ingredient_unit: string;
  ingredient_cost_per_unit: number;
}

type Tab = 'info' | 'recipe';

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 class="text-lg font-semibold text-gray-900">
            {{ product ? 'Editar producto' : 'Nuevo producto' }}
          </h2>
          <button type="button" (click)="onCancel()" class="text-gray-400 hover:text-gray-600 transition-colors">✕</button>
        </div>

        <!-- Tabs -->
        <div class="flex border-b border-gray-100 shrink-0">
          <button type="button"
            (click)="activeTab.set('info')"
            class="flex-1 py-2.5 text-sm font-medium transition-colors border-b-2"
            [class]="activeTab() === 'info'
              ? 'text-indigo-600 border-indigo-600'
              : 'text-gray-500 border-transparent hover:text-gray-700'">
            Información
          </button>
          <button type="button"
            (click)="onOpenRecipeTab()"
            class="flex-1 py-2.5 text-sm font-medium transition-colors border-b-2"
            [class]="activeTab() === 'recipe'
              ? 'text-indigo-600 border-indigo-600'
              : 'text-gray-500 border-transparent hover:text-gray-700'">
            Receta
            @if (recipeRows().length > 0) {
              <span class="ml-1 text-xs bg-indigo-100 text-indigo-700 rounded-full px-1.5 py-0.5">{{ recipeRows().length }}</span>
            }
          </button>
        </div>

        <!-- Scrollable body -->
        <div class="flex-1 overflow-y-auto">

          <!-- TAB: Información -->
          @if (activeTab() === 'info') {
            <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate class="px-6 py-5 space-y-4">
              <!-- Name -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Nombre <span class="text-red-500">*</span></label>
                <input type="text" formControlName="name" placeholder="Ej: Copa 2 bolas"
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  [class.border-red-400]="nameControl.invalid && nameControl.touched"
                  [class.border-gray-200]="!(nameControl.invalid && nameControl.touched)">
                @if (nameControl.touched && nameControl.errors?.['required']) {
                  <p class="text-red-500 text-xs mt-1">El nombre es requerido</p>
                }
              </div>

              <!-- Category -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Categoría <span class="text-red-500">*</span></label>
                <select formControlName="category_id"
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                  [class.border-red-400]="categoryControl.invalid && categoryControl.touched"
                  [class.border-gray-200]="!(categoryControl.invalid && categoryControl.touched)">
                  <option value="">Selecciona una categoría</option>
                  @for (cat of activeCategories(); track cat.id) {
                    <option [value]="cat.id">{{ cat.name }}</option>
                  }
                </select>
                @if (categoryControl.touched && categoryControl.errors?.['required']) {
                  <p class="text-red-500 text-xs mt-1">La categoría es requerida</p>
                }
              </div>

              <!-- Price -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Precio <span class="text-red-500">*</span></label>
                <input type="number" formControlName="price" placeholder="0.00" step="0.01" min="0.01"
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  [class.border-red-400]="priceControl.invalid && priceControl.touched"
                  [class.border-gray-200]="!(priceControl.invalid && priceControl.touched)">
                @if (priceControl.touched && priceControl.errors?.['required']) {
                  <p class="text-red-500 text-xs mt-1">El precio es requerido</p>
                }
                @if (priceControl.touched && priceControl.errors?.['min']) {
                  <p class="text-red-500 text-xs mt-1">El precio debe ser mayor a 0</p>
                }
              </div>

              <!-- Description -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Descripción <span class="text-gray-400 font-normal">(opcional)</span></label>
                <textarea formControlName="description" placeholder="Breve descripción del producto" rows="3"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"></textarea>
              </div>

              <!-- Image upload -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Imagen <span class="text-gray-400 font-normal">(opcional)</span></label>
                <div class="mb-2">
                  @if (previewUrl()) {
                    <img [src]="previewUrl()!" alt="Vista previa" class="w-24 h-24 object-cover rounded-xl border border-gray-200">
                  } @else if (product?.image_url) {
                    <img [src]="product!.image_url!" [alt]="product!.name" class="w-24 h-24 object-cover rounded-xl border border-gray-200">
                  } @else {
                    <div class="w-24 h-24 bg-gray-100 rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 text-3xl">🖼️</div>
                  }
                </div>
                <input type="file" accept="image/*" class="hidden" #fileInput (change)="onFileSelected($event)">
                <button type="button" (click)="fileInput.click()"
                  class="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                  {{ selectedFile() ? selectedFile()!.name : (product?.image_url ? 'Cambiar imagen' : 'Seleccionar imagen') }}
                </button>
                @if (fileSizeError()) {
                  <p class="text-red-500 text-xs mt-1">La imagen no debe superar 5 MB</p>
                }
              </div>

              @if (productService.error()) {
                <p class="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{{ productService.error() }}</p>
              }

              <!-- Actions -->
              <div class="flex gap-3 pt-2">
                <button type="button" (click)="onCancel()"
                  class="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" [disabled]="productService.isSubmitting()"
                  class="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {{ productService.isSubmitting() ? 'Guardando...' : 'Guardar' }}
                </button>
              </div>
            </form>
          }

          <!-- TAB: Receta -->
          @if (activeTab() === 'recipe') {
            <div class="px-6 py-5 space-y-4">
              @if (isLoadingRecipe()) {
                <p class="text-sm text-gray-400 text-center py-6">Cargando receta...</p>
              } @else {
                <!-- Cost summary -->
                @if (recipeRows().length > 0) {
                  <div class="bg-indigo-50 rounded-xl px-4 py-3 flex items-center justify-between">
                    <div class="text-sm text-indigo-700">
                      <span class="font-medium">Costo estimado:</span>
                      $ {{ calculatedCost() | number:'1.2-2' }}
                    </div>
                    <div class="text-sm" [class]="margin() >= 0 ? 'text-green-700' : 'text-red-600'">
                      <span class="font-medium">Margen:</span>
                      $ {{ margin() | number:'1.2-2' }}
                      ({{ marginPct() | number:'1.0-1' }}%)
                    </div>
                  </div>
                }

                <!-- Recipe rows -->
                <div class="space-y-2">
                  @for (row of recipeRows(); track $index; let i = $index) {
                    <div class="flex items-center gap-2 p-2 bg-gray-50 rounded-xl">
                      <select [(ngModel)]="row.ingredient_id"
                        (ngModelChange)="onIngredientSelect(i, $event)"
                        class="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                        <option value="">Seleccionar insumo...</option>
                        @for (ing of activeIngredients(); track ing.id) {
                          <option [value]="ing.id">{{ ing.name }}</option>
                        }
                      </select>
                      <input
                        [(ngModel)]="row.quantity"
                        type="number" min="0.001" step="0.001" placeholder="Cant."
                        class="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-400">
                      <span class="text-xs text-gray-400 w-10 shrink-0">{{ row.ingredient_unit || '' }}</span>
                      <button type="button" (click)="removeRow(i)"
                        class="text-red-400 hover:text-red-600 transition-colors shrink-0">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                  }
                </div>

                <!-- Add row -->
                <button type="button" (click)="addRow()"
                  class="w-full py-2 border-2 border-dashed border-indigo-200 text-indigo-600 rounded-xl text-sm font-medium hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
                  + Agregar ingrediente
                </button>

                @if (productService.error()) {
                  <p class="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{{ productService.error() }}</p>
                }

                <!-- Save recipe button (only in edit mode) -->
                @if (product) {
                  <button type="button" (click)="saveRecipeOnly()"
                    [disabled]="productService.isSubmitting()"
                    class="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                    {{ productService.isSubmitting() ? 'Guardando...' : 'Guardar receta' }}
                  </button>
                } @else {
                  <p class="text-xs text-gray-400 text-center">La receta se guardará al crear el producto desde la pestaña Información.</p>
                }
              }
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class ProductFormComponent implements OnChanges, OnInit, OnDestroy {
  @Input() product: Product | null = null;
  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  readonly productService = inject(ProductService);
  private readonly categoryService = inject(CategoryService);
  private readonly ingredientsService = inject(IngredientsService);

  readonly activeCategories = this.categoryService.categories;
  readonly activeIngredients = computed(() =>
    this.ingredientsService.ingredients().filter(i => i.active)
  );

  readonly selectedFile = signal<File | null>(null);
  readonly previewUrl = signal<string | null>(null);
  readonly fileSizeError = signal(false);
  readonly activeTab = signal<Tab>('info');
  readonly recipeRows = signal<RecipeRow[]>([]);
  readonly isLoadingRecipe = signal(false);

  readonly calculatedCost = computed(() =>
    this.recipeRows().reduce(
      (sum, r) => sum + (r.quantity || 0) * (r.ingredient_cost_per_unit || 0), 0
    )
  );

  readonly margin = computed(() => (this.form.controls.price.value ?? 0) - this.calculatedCost());
  readonly marginPct = computed(() => {
    const cost = this.calculatedCost();
    const price = this.form.controls.price.value ?? 0;
    return cost > 0 ? ((price - cost) / cost) * 100 : 0;
  });

  readonly form = new FormGroup({
    name:        new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    category_id: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    price:       new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(0.01)] }),
    description: new FormControl('', { nonNullable: true }),
    image_url:   new FormControl('', { nonNullable: true }),
  });

  get nameControl(): AbstractControl { return this.form.controls.name; }
  get categoryControl(): AbstractControl { return this.form.controls.category_id; }
  get priceControl(): AbstractControl { return this.form.controls.price; }

  ngOnInit(): void {
    if (this.categoryService.categories().length === 0) {
      this.categoryService.loadCategories();
    }
    if (this.ingredientsService.ingredients().length === 0) {
      this.ingredientsService.loadIngredients();
    }
  }

  ngOnChanges(): void {
    this.productService.error.set(null);
    this.selectedFile.set(null);
    this.fileSizeError.set(false);
    this.activeTab.set('info');
    this.recipeRows.set([]);
    this.revokePreview();

    if (this.product) {
      this.form.setValue({
        name:        this.product.name,
        category_id: this.product.category_id,
        price:       this.product.price,
        description: this.product.description ?? '',
        image_url:   this.product.image_url ?? '',
      });
    } else {
      this.form.reset();
    }
  }

  ngOnDestroy(): void {
    this.revokePreview();
  }

  async onOpenRecipeTab(): Promise<void> {
    this.activeTab.set('recipe');
    if (this.product && this.recipeRows().length === 0) {
      this.isLoadingRecipe.set(true);
      const items = await this.productService.loadRecipe(this.product.id);
      this.recipeRows.set(items.map(item => ({
        ingredient_id:           item.ingredient_id,
        quantity:                item.quantity,
        ingredient_name:         item.ingredient_name,
        ingredient_unit:         item.ingredient_unit,
        ingredient_cost_per_unit:item.ingredient_cost_per_unit,
      })));
      this.isLoadingRecipe.set(false);
    }
  }

  addRow(): void {
    this.recipeRows.update(rows => [
      ...rows,
      { ingredient_id: '', quantity: 1, ingredient_name: '', ingredient_unit: '', ingredient_cost_per_unit: 0 },
    ]);
  }

  removeRow(index: number): void {
    this.recipeRows.update(rows => rows.filter((_, i) => i !== index));
  }

  onIngredientSelect(index: number, ingredientId: string): void {
    const ing = this.ingredientsService.ingredients().find(i => i.id === ingredientId);
    this.recipeRows.update(rows =>
      rows.map((r, i) =>
        i === index
          ? {
              ...r,
              ingredient_id:            ingredientId,
              ingredient_name:          ing?.name ?? '',
              ingredient_unit:          'unidad',
              ingredient_cost_per_unit: ing?.cost ?? 0,
            }
          : r
      )
    );
  }

  async saveRecipeOnly(): Promise<void> {
    if (!this.product) return;
    const validRows: RecipeItemForm[] = this.recipeRows()
      .filter(r => r.ingredient_id && r.quantity > 0)
      .map(r => ({ ingredient_id: r.ingredient_id, quantity: r.quantity }));

    await this.productService.saveRecipe(this.product.id, validRows);

    if (!this.productService.error()) {
      this.saved.emit();
    }
  }

  onFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (!file) return;

    this.fileSizeError.set(false);
    if (file.size > 5 * 1024 * 1024) {
      this.fileSizeError.set(true);
      (event.target as HTMLInputElement).value = '';
      return;
    }

    this.revokePreview();
    this.selectedFile.set(file);
    this.previewUrl.set(URL.createObjectURL(file));
  }

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.fileSizeError()) return;

    const file = this.selectedFile();
    let imageUrl: string | null = this.product?.image_url ?? null;

    if (file) {
      this.productService.isSubmitting.set(true);
      this.productService.error.set(null);
      try {
        if (this.product?.image_url) {
          await this.productService.deleteProductImage(this.product.image_url);
        }
        imageUrl = await this.productService.uploadProductImage(file);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Error al subir la imagen';
        this.productService.error.set(msg);
        this.productService.isSubmitting.set(false);
        return;
      }
    }

    const data: ProductForm = {
      name:        this.form.controls.name.value.trim(),
      category_id: this.form.controls.category_id.value,
      price:       this.form.controls.price.value!,
      description: this.form.controls.description.value.trim(),
      image_url:   imageUrl ?? '',
    };

    let productId: string | null = null;

    if (this.product) {
      await this.productService.updateProduct(this.product.id, data);
      productId = this.product.id;
    } else {
      productId = await this.productService.createProduct(data);
    }

    if (this.productService.error() && file && imageUrl && !this.product) {
      await this.productService.deleteProductImage(imageUrl);
      return;
    }

    // Save recipe if there are rows
    if (productId && !this.productService.error() && this.recipeRows().length > 0) {
      const validRows: RecipeItemForm[] = this.recipeRows()
        .filter(r => r.ingredient_id && r.quantity > 0)
        .map(r => ({ ingredient_id: r.ingredient_id, quantity: r.quantity }));

      if (validRows.length > 0) {
        await this.productService.saveRecipe(productId, validRows);
      }
    }

    if (!this.productService.error()) {
      this.saved.emit();
    }
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  private revokePreview(): void {
    const url = this.previewUrl();
    if (url) {
      URL.revokeObjectURL(url);
      this.previewUrl.set(null);
    }
  }
}
