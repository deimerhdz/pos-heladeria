import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Ingredient, ProductType } from '../interfaces/ingredient.interface';
import { IngredientsService } from '../services/ingredients.service';
import { IngredientFormComponent } from '../components/ingredient-form.component';
import { IngredientMovementModalComponent } from '../components/ingredient-movement-modal.component';
import { CategoryService } from '../../categories/services/category.service';
import { UnitMeasureService } from '../../../core/services/unit-measure.service';

@Component({
  selector: 'app-ingredients-page',
  standalone: true,
  imports: [
    DecimalPipe,
    FormsModule,
    IngredientFormComponent,
    IngredientMovementModalComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-gray-900">Inventario</h1>
          <p class="text-sm text-gray-500 mt-0.5">Gestión de insumos, productos y recetas</p>
        </div>
        <button (click)="openCreate()"
          class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          Nuevo producto
        </button>
      </div>

      <!-- Summary cards -->
      <div class="grid grid-cols-2 gap-4 max-w-md">
        <div class="bg-white rounded-xl border border-gray-100 p-4">
          <p class="text-xs text-gray-500 font-medium uppercase tracking-wide">Total productos</p>
          <p class="text-2xl font-bold text-gray-900 mt-1">{{ service.ingredients().length }}</p>
        </div>
        <div class="bg-red-50 rounded-xl border border-red-100 p-4">
          <p class="text-xs text-red-700 font-medium uppercase tracking-wide">Sin stock</p>
          <p class="text-2xl font-bold text-red-800 mt-1">{{ service.outOfStockIngredients().length }}</p>
        </div>
      </div>

      <!-- Filters -->
      <div class="bg-white rounded-xl border border-gray-100 p-4 flex flex-wrap gap-3">
        <input
          [(ngModel)]="searchQuery"
          type="text"
          placeholder="Buscar por nombre..."
          class="flex-1 min-w-48 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">

        <select [(ngModel)]="typeFilter"
          class="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Todos los tipos</option>
          <option value="INGREDIENT">Insumo</option>
          <option value="PRODUCT">Producto</option>
          <option value="RECIPE">Receta</option>
        </select>

        <select [(ngModel)]="categoryFilter"
          class="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Todas las categorías</option>
          @for (cat of categoryService.categories(); track cat.id) {
            <option [value]="cat.id">{{ cat.name }}</option>
          }
        </select>

        <select [(ngModel)]="stockFilter"
          class="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Todos los estados</option>
          <option value="out">Sin stock</option>
          <option value="available">Disponible</option>
        </select>
      </div>

      <!-- Table -->
      <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
        @if (service.isLoading()) {
          <div class="flex items-center justify-center py-12">
            <p class="text-sm text-gray-400">Cargando insumos...</p>
          </div>
        } @else if (filtered().length === 0) {
          <div class="flex flex-col items-center justify-center py-12">
            <p class="text-sm text-gray-400">No se encontraron insumos</p>
          </div>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-100 bg-gray-50">
                  <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</th>
                  <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                  <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Categoría</th>
                  <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Unidad</th>
                  <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stock actual</th>
                  <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                  <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Costo unit.</th>
                  <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Precio</th>
                  <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                @for (ing of filtered(); track ing.id) {
                  <tr class="hover:bg-gray-50 transition-colors" [class.opacity-50]="!ing.active">
                    <td class="px-4 py-3">
                      <p class="font-medium text-gray-900">{{ ing.name }}</p>
                    </td>
                    <td class="px-4 py-3">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        [class]="typeBadgeClass(ing.product_type)">
                        {{ typeLabel(ing.product_type) }}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-gray-600">{{ categoryName(ing.category_id) }}</td>
                    <td class="px-4 py-3 text-gray-600">{{ unitAbbr(ing.unit_measure_id) }}</td>
                    <td class="px-4 py-3 text-right font-semibold"
                      [class]="ing.stock <= 0 ? 'text-red-600' : 'text-gray-900'">
                      {{ ing.stock | number:'1.0-0' }}
                    </td>
                    <td class="px-4 py-3">
                      @if (ing.stock <= 0) {
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Sin stock</span>
                      } @else {
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Disponible</span>
                      }
                    </td>
                    <td class="px-4 py-3 text-right text-gray-600">$ {{ ing.cost | number:'1.2-4' }}</td>
                    <td class="px-4 py-3 text-right text-gray-600">
                      {{ ing.product_type === 'INGREDIENT' ? '—' : '$ ' + (ing.price | number:'1.2-2') }}
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex items-center justify-end gap-1">
                        <button (click)="openMovement(ing)"
                          class="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors">
                          Movimiento
                        </button>
                        <button (click)="openEdit(ing)"
                          class="px-2 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors">
                          Editar
                        </button>
                        <button (click)="service.toggleActive(ing.id, ing.active)"
                          class="px-2 py-1 text-xs font-medium rounded-lg transition-colors"
                          [class]="ing.active
                            ? 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                            : 'text-green-700 bg-green-50 hover:bg-green-100'">
                          {{ ing.active ? 'Desactivar' : 'Activar' }}
                        </button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>

    <!-- Modals -->
    @if (showForm()) {
      <app-ingredient-form
        [ingredient]="selectedIngredient()"
        (close)="showForm.set(false)"
        (saved)="service.loadIngredients()">
      </app-ingredient-form>
    }

    @if (showMovementModal()) {
      <app-ingredient-movement-modal
        [ingredient]="selectedIngredient()"
        [defaultType]="movementType()"
        (close)="showMovementModal.set(false)"
        (saved)="service.loadIngredients()">
      </app-ingredient-movement-modal>
    }
  `,
})
export class IngredientsPageComponent implements OnInit {
  readonly service = inject(IngredientsService);
  readonly categoryService = inject(CategoryService);
  readonly unitMeasureService = inject(UnitMeasureService);

  searchQuery = '';
  typeFilter = '';
  categoryFilter = '';
  stockFilter = '';

  readonly showForm = signal(false);
  readonly showMovementModal = signal(false);
  readonly selectedIngredient = signal<Ingredient | null>(null);
  readonly movementType = signal<'income' | 'expense'>('income');

  private readonly categoryMap = computed(
    () => new Map(this.categoryService.categories().map(c => [c.id, c.name]))
  );
  private readonly unitMap = computed(
    () => new Map(this.unitMeasureService.unitMeasures().map(u => [u.id, u.abbreviation]))
  );

  readonly filtered = computed(() => {
    const q = this.searchQuery.toLowerCase();
    const type = this.typeFilter;
    const cat = this.categoryFilter;
    const stock = this.stockFilter;

    return this.service.ingredients().filter(i => {
      if (q && !i.name.toLowerCase().includes(q)) return false;
      if (type && i.product_type !== type) return false;
      if (cat && i.category_id !== cat) return false;
      if (stock === 'out' && i.stock > 0) return false;
      if (stock === 'available' && i.stock <= 0) return false;
      return true;
    });
  });

  private readonly typeLabels: Record<ProductType, string> = {
    INGREDIENT: 'Insumo',
    PRODUCT: 'Producto',
    RECIPE: 'Receta',
  };

  private readonly typeBadges: Record<ProductType, string> = {
    INGREDIENT: 'bg-amber-100 text-amber-700',
    PRODUCT: 'bg-blue-100 text-blue-700',
    RECIPE: 'bg-purple-100 text-purple-700',
  };

  typeLabel(type: ProductType): string {
    return this.typeLabels[type] ?? type;
  }

  typeBadgeClass(type: ProductType): string {
    return this.typeBadges[type] ?? 'bg-gray-100 text-gray-700';
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.service.loadIngredients(),
      this.categoryService.loadCategories(),
      this.unitMeasureService.loadUnitMeasures(),
    ]);
  }

  categoryName(id: string): string {
    return this.categoryMap().get(id) ?? '—';
  }

  unitAbbr(id: string): string {
    return this.unitMap().get(id) ?? '—';
  }

  openCreate(): void {
    this.selectedIngredient.set(null);
    this.showForm.set(true);
  }

  openEdit(ing: Ingredient): void {
    this.selectedIngredient.set(ing);
    this.showForm.set(true);
  }

  openMovement(ing: Ingredient): void {
    this.selectedIngredient.set(ing);
    this.movementType.set('income');
    this.showMovementModal.set(true);
  }
}
