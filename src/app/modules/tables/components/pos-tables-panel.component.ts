import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { PosTerminalStore } from '../services/pos-terminal.store';

/** Columna izquierda de la terminal: búsqueda, filtros y tarjetas de mesa. */
@Component({
  selector: 'app-pos-tables-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="w-full sm:w-[300px] shrink-0 flex flex-col border-r border-gray-200 min-h-0 bg-white">
      <div class="p-4 border-b border-gray-100 space-y-3 shrink-0">
        <h4 class="text-base font-bold text-gray-900">Mesas</h4>
        <input
          #searchInput
          type="text"
          [value]="store.search()"
          (input)="store.search.set($any($event.target).value)"
          placeholder="Buscar mesa… (F2)"
          class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <div class="grid grid-cols-2 gap-1.5">
          @for (f of filters; track f.key) {
            <button
              (click)="store.filter.set(f.key)"
              class="min-h-11 px-2 py-2 text-sm font-medium rounded-lg border transition-colors"
              [class]="store.filter() === f.key ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'"
            >
              {{ f.label }}
            </button>
          }
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-3 space-y-2.5">
        @for (t of store.tablesView(); track t.id) {
          <button
            (click)="store.selectTable(t.id)"
            class="w-full text-left bg-white rounded-xl border p-3 space-y-2 min-h-11 transition-colors hover:border-indigo-300"
            [class]="t.selected ? 'border-indigo-500 ring-1 ring-indigo-200' : 'border-gray-200'"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-lg font-bold text-gray-900">Mesa {{ t.number }}</span>
              <span class="text-sm font-semibold px-2 py-1 rounded-full" [class]="t.chipClass">{{ t.statusLabel }}</span>
            </div>
            <div class="flex items-center justify-between text-base text-gray-600">
              <span>{{ t.itemsLabel }}</span>
              <span>🕐 {{ t.elapsedLabel }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-lg font-bold text-gray-900">{{ t.totalLabel }}</span>
              @if (t.ordersCount > 1) {
                <span class="text-sm px-2 py-1 rounded-full bg-gray-100 text-gray-600">{{ t.ordersCount }} pedidos</span>
              }
            </div>
          </button>
        }
        @if (store.noTablesFound()) {
          <p class="text-center text-base text-gray-400 py-8">Sin resultados</p>
        }
      </div>
    </div>
  `,
})
export class PosTablesPanelComponent {
  readonly store = inject(PosTerminalStore);
  readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly filters = [
    { key: 'todas' as const, label: 'Todas' },
    { key: 'libres' as const, label: 'Libres' },
    { key: 'ocupadas' as const, label: 'Ocupadas' },
    { key: 'pendientes' as const, label: 'Pendientes' },
  ];

  focusSearch(): void {
    this.searchInput()?.nativeElement.focus();
  }
}
