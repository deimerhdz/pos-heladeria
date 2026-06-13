import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UnitMeasure } from '../../../core/interfaces/unit-measure.interface';
import { UnitMeasureService } from '../../../core/services/unit-measure.service';
import { UnitMeasureFormComponent } from '../components/unit-measure-form.component';

@Component({
  selector: 'app-unit-measures-page',
  standalone: true,
  imports: [FormsModule, UnitMeasureFormComponent],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Unidades de medida</h1>
          <p class="text-gray-500 text-sm mt-1">Gestiona las unidades de medida del inventario</p>
        </div>
        <button
          (click)="openCreate()"
          class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
        >
          <span>+</span> Nueva unidad
        </button>
      </div>

      <!-- Filters -->
      <div class="flex gap-3 flex-wrap">
        <input
          type="text"
          [(ngModel)]="searchTermValue"
          (ngModelChange)="searchTerm.set($event)"
          placeholder="Buscar por nombre o abreviatura..."
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
      @if (unitMeasureService.error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {{ unitMeasureService.error() }}
        </div>
      }

      <!-- Loading -->
      @if (unitMeasureService.loading() && unitMeasureService.unitMeasures().length === 0) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      } @else {
        <!-- Table -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          @if (filteredUnitMeasures().length === 0) {
            <!-- Empty state -->
            <div class="flex flex-col items-center justify-center py-16 text-center px-4">
              <div class="text-5xl mb-4">📏</div>
              @if (searchTerm() || statusFilter() !== 'all') {
                <p class="text-gray-600 font-medium">No hay unidades que coincidan</p>
                <p class="text-gray-400 text-sm mt-1">Intenta cambiar los filtros</p>
              } @else {
                <p class="text-gray-600 font-medium">Aún no hay unidades de medida</p>
                <p class="text-gray-400 text-sm mt-1">Crea la primera unidad para comenzar</p>
                <button
                  (click)="openCreate()"
                  class="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  Crear unidad
                </button>
              }
            </div>
          } @else {
            <table class="w-full">
              <thead>
                <tr class="border-b border-gray-100 bg-gray-50">
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Nombre</th>
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Abreviatura</th>
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Estado</th>
                  <th class="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                @for (unit of filteredUnitMeasures(); track unit.id) {
                  <tr [class.opacity-50]="!unit.active" class="hover:bg-gray-50 transition-colors">
                    <td class="px-5 py-4">
                      <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-lg shrink-0">📏</div>
                        <span class="text-sm font-medium" [class.text-gray-400]="!unit.active" [class.text-gray-900]="unit.active">
                          {{ unit.name }}
                        </span>
                      </div>
                    </td>
                    <td class="px-5 py-4">
                      <span class="text-sm text-gray-500">{{ unit.abbreviation }}</span>
                    </td>
                    <td class="px-5 py-4">
                      @if (unit.active) {
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
                          (click)="openEdit(unit)"
                          title="Editar"
                          class="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        >
                          ✏️
                        </button>
                        <button
                          (click)="onToggle(unit)"
                          [title]="unit.active ? 'Desactivar' : 'Activar'"
                          class="p-2 rounded-lg transition-colors"
                          [class]="unit.active
                            ? 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                            : 'text-gray-400 hover:text-green-600 hover:bg-green-50'"
                        >
                          {{ unit.active ? '🔴' : '🟢' }}
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
      <app-unit-measure-form
        [unitMeasure]="editingUnitMeasure()"
        (saved)="onSaved()"
        (cancelled)="onCancelled()"
      />
    }
  `,
})
export class UnitMeasuresPageComponent implements OnInit {
  readonly unitMeasureService = inject(UnitMeasureService);

  readonly searchTerm = signal('');
  readonly statusFilter = signal<'all' | 'active' | 'inactive'>('all');
  readonly showForm = signal(false);
  readonly editingUnitMeasure = signal<UnitMeasure | null>(null);

  searchTermValue = '';
  statusFilterValue: 'all' | 'active' | 'inactive' = 'all';

  readonly filteredUnitMeasures = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const status = this.statusFilter();

    return this.unitMeasureService.unitMeasures().filter((unit) => {
      const matchesSearch =
        !term ||
        unit.name.toLowerCase().includes(term) ||
        unit.abbreviation.toLowerCase().includes(term);
      const matchesStatus =
        status === 'all' ||
        (status === 'active' && unit.active) ||
        (status === 'inactive' && !unit.active);
      return matchesSearch && matchesStatus;
    });
  });

  ngOnInit(): void {
    this.unitMeasureService.loadUnitMeasures();
  }

  openCreate(): void {
    this.editingUnitMeasure.set(null);
    this.showForm.set(true);
  }

  openEdit(unit: UnitMeasure): void {
    this.editingUnitMeasure.set(unit);
    this.showForm.set(true);
  }

  async onToggle(unit: UnitMeasure): Promise<void> {
    await this.unitMeasureService.toggleActive(unit.id, unit.active);
  }

  onSaved(): void {
    this.showForm.set(false);
    this.editingUnitMeasure.set(null);
  }

  onCancelled(): void {
    this.showForm.set(false);
    this.editingUnitMeasure.set(null);
  }
}
