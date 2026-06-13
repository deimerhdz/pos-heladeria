import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Category } from '../interfaces/category.interface';
import { CategoryService } from '../services/category.service';
import { CategoryFormComponent } from '../components/category-form.component';

@Component({
  selector: 'app-categories-page',
  standalone: true,
  imports: [FormsModule, CategoryFormComponent],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Categorías</h1>
          <p class="text-gray-500 text-sm mt-1">Gestiona las categorías del menú</p>
        </div>
        <button
          (click)="openCreate()"
          class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
        >
          <span>+</span> Nueva Categoría
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
          <option value="all">Todas</option>
          <option value="active">Activas</option>
          <option value="inactive">Inactivas</option>
        </select>
      </div>

      <!-- Error banner -->
      @if (categoryService.error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {{ categoryService.error() }}
        </div>
      }

      <!-- Loading -->
      @if (categoryService.loading() && categoryService.categories().length === 0) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      } @else {
        <!-- Table -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          @if (filteredCategories().length === 0) {
            <!-- Empty state -->
            <div class="flex flex-col items-center justify-center py-16 text-center px-4">
              <div class="text-5xl mb-4">📂</div>
              @if (searchTerm() || statusFilter() !== 'all') {
                <p class="text-gray-600 font-medium">No hay categorías que coincidan</p>
                <p class="text-gray-400 text-sm mt-1">Intenta cambiar los filtros</p>
              } @else {
                <p class="text-gray-600 font-medium">Aún no hay categorías</p>
                <p class="text-gray-400 text-sm mt-1">Crea la primera categoría para comenzar</p>
                <button
                  (click)="openCreate()"
                  class="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  Crear categoría
                </button>
              }
            </div>
          } @else {
            <table class="w-full">
              <thead>
                <tr class="border-b border-gray-100 bg-gray-50">
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Nombre</th>
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell">Descripción</th>
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Estado</th>
                  <th class="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                @for (cat of filteredCategories(); track cat.id) {
                  <tr [class.opacity-50]="!cat.active" class="hover:bg-gray-50 transition-colors">
                    <td class="px-5 py-4">
                      <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-lg shrink-0">📂</div>
                        <span class="text-sm font-medium" [class.text-gray-400]="!cat.active" [class.text-gray-900]="cat.active">
                          {{ cat.name }}
                        </span>
                      </div>
                    </td>
                    <td class="px-5 py-4 hidden md:table-cell">
                      <span class="text-sm text-gray-500 line-clamp-1">{{ cat.description || '—' }}</span>
                    </td>
                    <td class="px-5 py-4">
                      @if (cat.active) {
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          Activa
                        </span>
                      } @else {
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                          Inactiva
                        </span>
                      }
                    </td>
                    <td class="px-5 py-4">
                      <div class="flex items-center justify-end gap-2">
                        <button
                          (click)="openEdit(cat)"
                          title="Editar"
                          class="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        >
                          ✏️
                        </button>
                        <button
                          (click)="onToggle(cat)"
                          [title]="cat.active ? 'Desactivar' : 'Activar'"
                          class="p-2 rounded-lg transition-colors"
                          [class]="cat.active
                            ? 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                            : 'text-gray-400 hover:text-green-600 hover:bg-green-50'"
                        >
                          {{ cat.active ? '🔴' : '🟢' }}
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
      <app-category-form
        [category]="editingCategory()"
        (saved)="onSaved()"
        (cancelled)="onCancelled()"
      />
    }
  `,
})
export class CategoriesPageComponent implements OnInit {
  readonly categoryService = inject(CategoryService);

  readonly searchTerm = signal('');
  readonly statusFilter = signal<'all' | 'active' | 'inactive'>('all');
  readonly showForm = signal(false);
  readonly editingCategory = signal<Category | null>(null);

  searchTermValue = '';
  statusFilterValue: 'all' | 'active' | 'inactive' = 'all';

  readonly filteredCategories = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const status = this.statusFilter();

    return this.categoryService.categories().filter(cat => {
      const matchesSearch = !term || cat.name.toLowerCase().includes(term);
      const matchesStatus =
        status === 'all' ||
        (status === 'active' && cat.active) ||
        (status === 'inactive' && !cat.active);
      return matchesSearch && matchesStatus;
    });
  });

  ngOnInit(): void {
    this.categoryService.loadCategories();
  }

  openCreate(): void {
    this.editingCategory.set(null);
    this.showForm.set(true);
  }

  openEdit(category: Category): void {
    this.editingCategory.set(category);
    this.showForm.set(true);
  }

  async onToggle(category: Category): Promise<void> {
    await this.categoryService.toggleActive(category.id, category.active);
  }

  onSaved(): void {
    this.showForm.set(false);
    this.editingCategory.set(null);
  }

  onCancelled(): void {
    this.showForm.set(false);
    this.editingCategory.set(null);
  }
}
