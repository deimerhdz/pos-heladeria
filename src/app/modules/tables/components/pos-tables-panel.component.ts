import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { PosTerminalStore } from '../services/pos-terminal.store';

/**
 * Franja superior de la terminal: pestañas de tipo de orden, buscador y
 * filtro de ocupación en una sola fila horizontal, con un carrusel de
 * tarjetas de mesa (una sola fila, con flechas de desplazamiento) debajo —
 * según el prototipo de referencia (spec 036).
 */
@Component({
  selector: 'app-pos-tables-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="w-full min-w-0 flex flex-col bg-white">
      <div class="flex flex-wrap items-center gap-3 p-4 border-b border-gray-100">
        <!-- Pestañas de tipo de orden (spec 036, FR-001): eje independiente
             del filtro de ocupación. "Domicilios"/"Para llevar" no tienen
             todavía ninguna vía de creación de orden (FR-003). -->
        <div class="flex gap-1.5 shrink-0">
          @for (t of orderTypeTabs; track t.key) {
            <button
              (click)="store.setOrderTypeTab(t.key)"
              class="min-h-11 px-3 py-2 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap"
              [class]="store.orderTypeTab() === t.key ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'"
            >
              {{ t.label }}
            </button>
          }
        </div>

        @if (store.orderTypeTab() === 'mesas') {
          <input
            #searchInput
            type="text"
            [value]="store.search()"
            (input)="store.search.set($any($event.target).value)"
            placeholder="Buscar mesa… (F2)"
            class="flex-1 min-w-[180px] px-3 py-2.5 border border-gray-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <div class="flex gap-1.5 shrink-0">
            @for (f of filters; track f.key) {
              <button
                (click)="store.filter.set(f.key)"
                class="min-h-11 px-3 py-2 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap"
                [class]="store.filter() === f.key ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'"
              >
                {{ f.label }}
              </button>
            }
          </div>
        }
      </div>

      @if (store.orderTypeTab() === 'mesas') {
        <!-- Carrusel horizontal (una sola fila) con botones de
             desplazamiento, en vez de una grilla que envuelve en varias
             filas — según el prototipo de referencia (spec 036). Cada
             tarjeta ocupa 1/4 del ancho visible (no un px fijo) para que se
             vean exactamente 4 por defecto y el carrusel sea responsive: al
             cambiar el ancho de pantalla, las 4 tarjetas visibles se
             reajustan en vez de quedar recortadas o dejar espacio muerto. -->
        <div class="flex items-center gap-2 min-w-0 px-2 py-4">
          <button
            type="button"
            (click)="scrollCarousel(-1)"
            [disabled]="store.tablesView().length === 0"
            title="Ver mesas anteriores"
            aria-label="Ver mesas anteriores"
            class="shrink-0 w-8 h-8 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
          >‹</button>

          <div #carousel class="flex-1 min-w-0 flex gap-3 overflow-x-auto scroll-smooth">
            @for (t of store.tablesView(); track t.id) {
              <button
                (click)="t.statusLabel === 'Libre' ? goToManualOrder(t.id) : store.selectTable(t.id)"
                class="shrink-0 w-[calc((100%-2.25rem)/4)] text-left bg-white rounded-xl border p-3 space-y-2 min-h-11 transition-colors hover:border-indigo-300"
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
              <p class="shrink-0 text-base text-gray-400 py-8 px-4">Sin resultados</p>
            }
          </div>

          <button
            type="button"
            (click)="scrollCarousel(1)"
            [disabled]="store.tablesView().length === 0"
            title="Ver más mesas"
            aria-label="Ver más mesas"
            class="shrink-0 w-8 h-8 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
          >›</button>
        </div>
      } @else {
        <!-- FR-003: listado vacío con mensaje claro, no un error ni una
             grilla en blanco sin explicación. -->
        <div class="flex flex-col items-center justify-center text-center text-gray-400 p-8 gap-3">
          <div class="text-4xl">🧾</div>
          <p class="text-sm max-w-xs">
            Todavía no hay una forma de crear órdenes de
            {{ store.orderTypeTab() === 'domicilios' ? 'domicilio' : 'para llevar' }}.
          </p>
        </div>
      }
    </div>
  `,
})
export class PosTablesPanelComponent {
  readonly store = inject(PosTerminalStore);
  private readonly router = inject(Router);
  readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  readonly carousel = viewChild<ElementRef<HTMLDivElement>>('carousel');

  /** Mesa libre: en vez de seleccionarla y mostrar el CTA embebido de
   *  siempre, va directo a la vista dedicada de armado de pedido nuevo
   *  (`manual-order-page.component.ts`, reemplaza `manual-order-panel`). */
  goToManualOrder(tableId: string): void {
    this.router.navigate(['/dashboard/mesas-sesiones', tableId, 'orden-manual']);
  }

  readonly orderTypeTabs = [
    { key: 'mesas' as const, label: 'Mesas' },
    { key: 'domicilios' as const, label: 'Domicilios' },
    { key: 'para-llevar' as const, label: 'Para llevar' },
  ];

  readonly filters = [
    { key: 'todas' as const, label: 'Todas' },
    { key: 'libres' as const, label: 'Libres' },
    { key: 'ocupadas' as const, label: 'Ocupadas' },
    { key: 'pendientes' as const, label: 'Pendientes' },
  ];

  focusSearch(): void {
    this.searchInput()?.nativeElement.focus();
  }

  scrollCarousel(direction: -1 | 1): void {
    const el = this.carousel()?.nativeElement;
    if (!el) return;
    // Las tarjetas miden 1/4 del ancho visible (responsive, no un px
    // fijo) — se recalcula en cada clic para desplazar una tarjeta
    // completa sin importar el tamaño de pantalla.
    const step = el.clientWidth / 4;
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  }
}
