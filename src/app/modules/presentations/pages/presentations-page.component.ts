import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Presentation } from '../interfaces/presentation.interface';
import { PresentationService } from '../services/presentation.service';
import { PaginationBarComponent } from '../../../shared/pagination/pagination-bar.component';

@Component({
  selector: 'app-presentations-page',
  standalone: true,
  imports: [FormsModule, PaginationBarComponent],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Presentaciones</h1>
          <p class="text-gray-500 text-sm mt-1">
            Catálogo global de nombres de presentación (Pequeño, Mediano, Grande...) para
            estandarizar las variantes de tus categorías y productos.
          </p>
        </div>
        <button
          (click)="openCreate()"
          class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
        >
          <span>+</span> Nueva Presentación
        </button>
      </div>

      <!-- Filters -->
      <div class="flex gap-3 flex-wrap">
        <input
          type="text"
          [ngModel]="searchSignal()"
          (ngModelChange)="onSearchInput($event)"
          placeholder="Buscar por nombre..."
          class="flex-1 min-w-48 px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <select
          [ngModel]="statusFilterValue"
          (ngModelChange)="onStatusFilterChange($event)"
          class="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
        >
          <option value="all">Todas</option>
          <option value="active">Activas</option>
          <option value="inactive">Inactivas</option>
        </select>
      </div>

      <!-- Error banner -->
      @if (presentationService.error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {{ presentationService.error() }}
        </div>
      }

      <!-- Loading -->
      @if (presentationService.loading() && presentationService.presentations().length === 0) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      } @else {
        <!-- Table -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          @if (presentationService.presentations().length === 0) {
            <!-- Empty state -->
            <div class="flex flex-col items-center justify-center py-16 text-center px-4">
              <div class="text-5xl mb-4">📏</div>
              @if (searchSignal() || statusFilterValue !== 'all') {
                <p class="text-gray-600 font-medium">No hay presentaciones que coincidan</p>
                <p class="text-gray-400 text-sm mt-1">Intenta cambiar los filtros</p>
              } @else {
                <p class="text-gray-600 font-medium">Aún no hay presentaciones</p>
                <p class="text-gray-400 text-sm mt-1">Crea la primera presentación para comenzar</p>
                <button
                  (click)="openCreate()"
                  class="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  Crear presentación
                </button>
              }
            </div>
          } @else {
            <table class="w-full">
              <thead>
                <tr class="border-b border-gray-100 bg-gray-50">
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Nombre</th>
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Estado</th>
                  <th class="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                @for (p of presentationService.presentations(); track p.id) {
                  <tr [class.opacity-50]="!p.active" class="hover:bg-gray-50 transition-colors">
                    <td class="px-5 py-4">
                      <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-lg shrink-0">📏</div>
                        <span class="text-sm font-medium" [class.text-gray-400]="!p.active" [class.text-gray-900]="p.active">
                          {{ p.name }}
                        </span>
                      </div>
                    </td>
                    <td class="px-5 py-4">
                      @if (p.active) {
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
                          (click)="openEdit(p)"
                          title="Editar"
                          class="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        >
                          ✏️
                        </button>
                        <button
                          (click)="onToggle(p)"
                          [title]="p.active ? 'Desactivar' : 'Activar'"
                          class="p-2 rounded-lg transition-colors"
                          [class]="p.active
                            ? 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                            : 'text-gray-400 hover:text-green-600 hover:bg-green-50'"
                        >
                          {{ p.active ? '🔴' : '🟢' }}
                        </button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
          <app-pagination-bar
            [page]="presentationService.page()" [size]="presentationService.size()"
            [total]="presentationService.total()" [totalPages]="presentationService.totalPages()"
            [loading]="presentationService.loading()"
            (pageChange)="presentationService.loadPresentations($event, presentationService.size())"
            (sizeChange)="presentationService.loadPresentations(1, $event)" />
        </div>
      }
    </div>

    <!-- Modal -->
    @if (showForm()) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 class="text-lg font-semibold text-gray-900">
              {{ editingPresentation() ? 'Editar presentación' : 'Nueva presentación' }}
            </h2>
            <button
              type="button"
              (click)="onCancel()"
              class="text-gray-400 hover:text-gray-600 transition-colors"
            >
              ✕
            </button>
          </div>

          <form (ngSubmit)="onSubmit()" novalidate class="px-6 py-5 space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Nombre <span class="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                [(ngModel)]="formName"
                (ngModelChange)="nameTouched = true"
                placeholder="Ej: Pequeño"
                class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                [class.border-red-400]="nameTouched && nameError()"
                [class.border-gray-200]="!(nameTouched && nameError())"
              />
              @if (nameTouched && nameError() === 'required') {
                <p class="text-red-500 text-xs mt-1">El nombre es requerido</p>
              }
              @if (nameTouched && nameError() === 'duplicate') {
                <p class="text-red-500 text-xs mt-1">Ya existe una presentación con ese nombre</p>
              }
            </div>

            <!-- Service error -->
            @if (presentationService.error()) {
              <p class="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">
                {{ presentationService.error() }}
              </p>
            }

            <div class="flex gap-3 pt-2">
              <button
                type="button"
                (click)="onCancel()"
                class="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                [disabled]="presentationService.isSubmitting()"
                class="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {{ presentationService.isSubmitting() ? 'Guardando...' : 'Guardar' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PresentationsPageComponent implements OnInit, OnDestroy {
  readonly presentationService = inject(PresentationService);

  readonly showForm = signal(false);
  readonly editingPresentation = signal<Presentation | null>(null);

  /** Local echo of the search box; the actual query to the service is debounced. */
  readonly searchSignal = signal('');
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  statusFilterValue: 'all' | 'active' | 'inactive' = 'all';

  formName = '';
  nameTouched = false;

  ngOnInit(): void {
    this.presentationService.loadPresentations();
    if (this.presentationService.allPresentations().length === 0) {
      this.presentationService.loadAllPresentations();
    }
  }

  ngOnDestroy(): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
  }

  onSearchInput(value: string): void {
    this.searchSignal.set(value);
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.presentationService.setSearch(value), 300);
  }

  onStatusFilterChange(value: 'all' | 'active' | 'inactive'): void {
    this.statusFilterValue = value;
    this.presentationService.setActiveFilter(value === 'all' ? '' : value);
  }

  openCreate(): void {
    this.editingPresentation.set(null);
    this.formName = '';
    this.nameTouched = false;
    this.presentationService.otherError.set(null);
    this.showForm.set(true);
  }

  openEdit(presentation: Presentation): void {
    this.editingPresentation.set(presentation);
    this.formName = presentation.name;
    this.nameTouched = false;
    this.presentationService.otherError.set(null);
    this.showForm.set(true);
  }

  async onToggle(presentation: Presentation): Promise<void> {
    await this.presentationService.toggleActive(presentation.id, presentation.active);
  }

  nameError(): 'required' | 'duplicate' | null {
    const value = this.formName.trim();
    if (!value) return 'required';
    const editingId = this.editingPresentation()?.id;
    const exists = this.presentationService
      .allPresentations()
      .some((p) => p.name.toLowerCase() === value.toLowerCase() && p.id !== editingId);
    return exists ? 'duplicate' : null;
  }

  async onSubmit(): Promise<void> {
    this.nameTouched = true;
    if (this.nameError()) return;

    const editing = this.editingPresentation();
    if (editing) {
      await this.presentationService.updatePresentation(editing.id, { name: this.formName.trim() });
    } else {
      await this.presentationService.createPresentation({ name: this.formName.trim() });
    }

    if (!this.presentationService.error()) {
      this.onSaved();
    }
  }

  onSaved(): void {
    this.showForm.set(false);
    this.editingPresentation.set(null);
  }

  onCancel(): void {
    this.showForm.set(false);
    this.editingPresentation.set(null);
  }
}
