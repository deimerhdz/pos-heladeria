import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Product } from '../interfaces/product.interface';
import { ProductService } from '../services/product.service';
import { CategoryService } from '../../categories/services/category.service';
import { ProductFormComponent } from '../components/product-form.component';

@Component({
  selector: 'app-products-page',
  standalone: true,
  imports: [FormsModule, DecimalPipe, ProductFormComponent],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Productos</h1>
          <p class="text-gray-500 text-sm mt-1">Gestiona el catálogo de productos</p>
        </div>
        <button
          (click)="openCreate()"
          class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
        >
          <span>+</span> Nuevo producto
        </button>
      </div>

      <!-- Filters -->
      <div class="flex gap-3 flex-wrap">
        <input
          type="text"
          [(ngModel)]="searchTermValue"
          (ngModelChange)="searchTerm.set($event)"
          placeholder="Buscar por nombre..."
          class="flex-1 min-w-48 px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <select
          [(ngModel)]="statusFilterValue"
          (ngModelChange)="statusFilter.set($event)"
          class="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
        >
          <option value="all">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
      </div>

      <!-- Error banner -->
      @if (productService.error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {{ productService.error() }}
        </div>
      }

      <!-- Loading -->
      @if (productService.loading() && productService.products().length === 0) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      } @else {
        <!-- Table -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          @if (filteredProducts().length === 0) {
            <!-- Empty state -->
            <div class="flex flex-col items-center justify-center py-16 text-center px-4">
              <div class="text-5xl mb-4">🍦</div>
              @if (searchTerm() || statusFilter() !== 'all') {
                <p class="text-gray-600 font-medium">No hay productos que coincidan</p>
                <p class="text-gray-400 text-sm mt-1">Intenta cambiar los filtros</p>
              } @else {
                <p class="text-gray-600 font-medium">Aún no hay productos</p>
                <p class="text-gray-400 text-sm mt-1">Crea el primer producto para comenzar</p>
                <button
                  (click)="openCreate()"
                  class="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  Crear producto
                </button>
              }
            </div>
          } @else {
            <table class="w-full">
              <thead>
                <tr class="border-b border-gray-100 bg-gray-50">
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Nombre</th>
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell">Categoría</th>
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Precio</th>
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Estado</th>
                  <th class="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                @for (product of filteredProducts(); track product.id) {
                  <tr [class.opacity-50]="!product.is_active" class="hover:bg-gray-50 transition-colors">
                    <td class="px-5 py-4">
                      <div class="flex items-center gap-3">
                        @if (product.image_url) {
                          <img [src]="product.image_url" [alt]="product.name" class="w-9 h-9 rounded-lg object-cover shrink-0" />
                        } @else {
                          <div class="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-lg shrink-0">🍦</div>
                        }
                        <div>
                          <span class="text-sm font-medium" [class.text-gray-400]="!product.is_active" [class.text-gray-900]="product.is_active">
                            {{ product.name }}
                          </span>
                          @if (product.description) {
                            <p class="text-xs text-gray-400 line-clamp-1">{{ product.description }}</p>
                          }
                        </div>
                      </div>
                    </td>
                    <td class="px-5 py-4 hidden md:table-cell">
                      <span class="text-sm text-gray-500">{{ categoryName(product.category_id) }}</span>
                    </td>
                    <td class="px-5 py-4">
                      <span class="text-sm font-medium text-gray-900">
                        {{ product.price | number:'1.2-2' }}
                      </span>
                    </td>
                    <td class="px-5 py-4">
                      @if (product.is_active) {
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          Activo
                        </span>
                      } @else {
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                          Inactivo
                        </span>
                      }
                    </td>
                    <td class="px-5 py-4">
                      <div class="flex items-center justify-end gap-2">
                        <button
                          (click)="openEdit(product)"
                          title="Editar"
                          class="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        >
                          ✏️
                        </button>
                        <button
                          (click)="onToggle(product)"
                          [title]="product.is_active ? 'Desactivar' : 'Activar'"
                          class="p-2 rounded-lg transition-colors"
                          [class]="product.is_active
                            ? 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                            : 'text-gray-400 hover:text-green-600 hover:bg-green-50'"
                        >
                          {{ product.is_active ? '🔴' : '🟢' }}
                        </button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
      }
    </div>

    <!-- Modal -->
    @if (showForm()) {
      <app-product-form
        [product]="editingProduct()"
        (saved)="onSaved()"
        (cancelled)="onCancelled()"
      />
    }
  `,
})
export class ProductsPageComponent implements OnInit {
  readonly productService = inject(ProductService);
  private readonly categoryService = inject(CategoryService);

  readonly searchTerm = signal('');
  readonly statusFilter = signal<'all' | 'active' | 'inactive'>('all');
  readonly showForm = signal(false);
  readonly editingProduct = signal<Product | null>(null);

  searchTermValue = '';
  statusFilterValue: 'all' | 'active' | 'inactive' = 'all';

  private readonly categoryMap = computed(() => {
    const map = new Map<string, string>();
    for (const cat of this.categoryService.categories()) {
      map.set(cat.id, cat.name);
    }
    return map;
  });

  readonly filteredProducts = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const status = this.statusFilter();

    return this.productService.products().filter(p => {
      const matchesSearch = !term || p.name.toLowerCase().includes(term);
      const matchesStatus =
        status === 'all' ||
        (status === 'active' && p.is_active) ||
        (status === 'inactive' && !p.is_active);
      return matchesSearch && matchesStatus;
    });
  });

  ngOnInit(): void {
    this.productService.loadProducts();
    if (this.categoryService.categories().length === 0) {
      this.categoryService.loadCategories();
    }
  }

  categoryName(categoryId: string): string {
    return this.categoryMap().get(categoryId) ?? '—';
  }

  openCreate(): void {
    this.editingProduct.set(null);
    this.showForm.set(true);
  }

  openEdit(product: Product): void {
    this.editingProduct.set(product);
    this.showForm.set(true);
  }

  async onToggle(product: Product): Promise<void> {
    await this.productService.toggleActive(product.id, product.is_active);
  }

  onSaved(): void {
    this.showForm.set(false);
    this.editingProduct.set(null);
  }

  onCancelled(): void {
    this.showForm.set(false);
    this.editingProduct.set(null);
  }
}
