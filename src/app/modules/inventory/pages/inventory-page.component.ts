import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CategoryService } from '../../categories/services/category.service';
import { ReplenishData, ReplenishModalComponent } from '../components/replenish-modal.component';
import { MovementsPanelComponent } from '../components/movements-panel.component';
import { ProductStock } from '../interfaces/inventory.interface';
import { InventoryService } from '../services/inventory.service';

@Component({
  selector: 'app-inventory-page',
  standalone: true,
  imports: [FormsModule, ReplenishModalComponent, MovementsPanelComponent],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Inventario</h1>
          <p class="text-gray-500 text-sm mt-1">Control de stock y movimientos de productos</p>
        </div>
      </div>

      <!-- Summary cards -->
      <div class="grid grid-cols-3 gap-4">
        <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p class="text-xs text-gray-400 uppercase tracking-wide font-medium">Total productos</p>
          <p class="text-2xl font-bold text-gray-900 mt-1">{{ inventoryService.products().length }}</p>
        </div>
        <div class="bg-white rounded-2xl p-4 shadow-sm border border-yellow-100">
          <p class="text-xs text-yellow-600 uppercase tracking-wide font-medium">Stock bajo</p>
          <p class="text-2xl font-bold text-yellow-700 mt-1">{{ inventoryService.lowStockProducts().length }}</p>
        </div>
        <div class="bg-white rounded-2xl p-4 shadow-sm border border-red-100">
          <p class="text-xs text-red-500 uppercase tracking-wide font-medium">Agotados</p>
          <p class="text-2xl font-bold text-red-600 mt-1">{{ inventoryService.outOfStockProducts().length }}</p>
        </div>
      </div>

      <!-- Filters -->
      <div class="flex gap-3 flex-wrap">
        <input
          type="text"
          [(ngModel)]="searchTermRaw"
          (ngModelChange)="searchTerm.set($event)"
          placeholder="Buscar producto..."
          class="flex-1 min-w-48 px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <label class="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm cursor-pointer hover:border-indigo-300 transition-colors">
          <input type="checkbox" [(ngModel)]="showLowOnly" class="accent-indigo-600" />
          <span class="text-gray-700">Solo stock bajo</span>
        </label>
      </div>

      <!-- Error -->
      @if (inventoryService.error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
          {{ inventoryService.error() }}
        </div>
      }

      <!-- Table -->
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        @if (inventoryService.isLoading()) {
          <div class="py-12 text-center">
            <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        } @else if (filteredProducts().length === 0) {
          <div class="py-16 text-center">
            <p class="text-4xl mb-3">📦</p>
            <p class="text-sm text-gray-400">No hay productos que coincidan</p>
          </div>
        } @else {
          <table class="w-full">
            <thead>
              <tr class="border-b border-gray-100 bg-gray-50">
                <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Producto</th>
                <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell">Categoría</th>
                <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Stock</th>
                <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Estado</th>
                <th class="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              @for (product of filteredProducts(); track product.id) {
                <tr class="hover:bg-gray-50 transition-colors" [class.opacity-60]="product.stock === 0">
                  <td class="px-5 py-4">
                    <div class="flex items-center gap-3">
                      @if (product.image_url) {
                        <img [src]="product.image_url" [alt]="product.name" class="w-9 h-9 rounded-lg object-cover shrink-0" />
                      } @else {
                        <div class="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-lg shrink-0">🍦</div>
                      }
                      <span class="text-sm font-medium text-gray-900">{{ product.name }}</span>
                    </div>
                  </td>
                  <td class="px-5 py-4 hidden md:table-cell">
                    <span class="text-sm text-gray-500">{{ categoryName(product.category_id) }}</span>
                  </td>
                  <td class="px-5 py-4">
                    <span class="text-sm font-bold" [class]="stockClass(product.stock)">{{ product.stock }}</span>
                  </td>
                  <td class="px-5 py-4">
                    <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold" [class]="stockBadgeClass(product.stock)">
                      {{ stockLabel(product.stock) }}
                    </span>
                  </td>
                  <td class="px-5 py-4">
                    <div class="flex items-center justify-end gap-2">
                      <button
                        (click)="openReplenish(product)"
                        class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                      >
                        + Reponer
                      </button>
                      <button
                        (click)="openMovements(product)"
                        [disabled]="loadingMovementsId() === product.id"
                        class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
                      >
                        {{ loadingMovementsId() === product.id ? '...' : 'Movimientos' }}
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>

    <!-- Replenish Modal -->
    @if (replenishingProduct()) {
      <app-replenish-modal
        [product]="replenishingProduct()!"
        (confirmed)="onReplenishConfirmed($event)"
        (cancelled)="replenishingProduct.set(null)"
      />
    }

    <!-- Movements Panel -->
    @if (viewingMovementsProduct()) {
      <app-movements-panel
        [movements]="inventoryService.movements()"
        [productName]="viewingMovementsProduct()!.name"
        (closed)="viewingMovementsProduct.set(null)"
      />
    }
  `,
})
export class InventoryPageComponent implements OnInit {
  readonly inventoryService = inject(InventoryService);
  private readonly categoryService = inject(CategoryService);

  readonly searchTerm = signal('');
  readonly replenishingProduct = signal<ProductStock | null>(null);
  readonly viewingMovementsProduct = signal<ProductStock | null>(null);
  readonly loadingMovementsId = signal<string | null>(null);

  searchTermRaw = '';
  showLowOnly = false;

  private readonly categoryMap = computed(() => {
    const map = new Map<string, string>();
    for (const cat of this.categoryService.categories()) {
      map.set(cat.id, cat.name);
    }
    return map;
  });

  readonly filteredProducts = computed(() => {
    const term = this.searchTerm().toLowerCase();
    return this.inventoryService.products().filter(p => {
      const matchesSearch = !term || p.name.toLowerCase().includes(term);
      const matchesLow = !this.showLowOnly || p.stock <= 5;
      return matchesSearch && matchesLow;
    });
  });

  ngOnInit(): void {
    this.inventoryService.loadProducts();
    if (this.categoryService.categories().length === 0) {
      this.categoryService.loadCategories();
    }
  }

  categoryName(categoryId: string): string {
    return this.categoryMap().get(categoryId) ?? '—';
  }

  stockClass(stock: number): string {
    if (stock === 0) return 'text-red-600';
    if (stock <= 5) return 'text-yellow-600';
    return 'text-green-700';
  }

  stockBadgeClass(stock: number): string {
    if (stock === 0) return 'bg-red-100 text-red-600';
    if (stock <= 5) return 'bg-yellow-100 text-yellow-700';
    return 'bg-green-100 text-green-700';
  }

  stockLabel(stock: number): string {
    if (stock === 0) return 'Agotado';
    if (stock <= 5) return 'Stock bajo';
    return 'OK';
  }

  openReplenish(product: ProductStock): void {
    this.replenishingProduct.set(product);
  }

  async openMovements(product: ProductStock): Promise<void> {
    this.loadingMovementsId.set(product.id);
    await this.inventoryService.loadMovements(product.id);
    this.loadingMovementsId.set(null);
    this.viewingMovementsProduct.set(product);
  }

  async onReplenishConfirmed(data: ReplenishData): Promise<void> {
    const product = this.replenishingProduct();
    if (!product) return;
    await this.inventoryService.replenishStock(product.id, data.quantity, data.reason);
    if (!this.inventoryService.error()) {
      this.replenishingProduct.set(null);
    }
  }
}
