import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { OrderSummaryCardComponent } from './order-summary-card.component';

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
  imports: [OrderSummaryCardComponent],
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
              <app-order-summary-card
                [title]="'Mesa ' + t.number"
                [statusLabel]="t.statusLabel"
                [statusClass]="t.chipClass"
                [secondaryLabel]="t.itemsLabel"
                [elapsedLabel]="t.elapsedLabel"
                [totalLabel]="t.totalLabel"
                [ordersCount]="t.ordersCount"
                [selected]="t.selected"
                (select)="store.selectTable(t.id)"
              />
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
      } @else if (store.ordersByType(store.orderTypeTab()).length > 0) {
        <!-- Spec 059, Historia 2/3: pedidos Domicilio/Para llevar pendientes
             de cobro, mismo formato de tarjeta que las mesas — seleccionar
             una abre su detalle y su cobro (Historia 3). -->
        <div class="flex items-center gap-2 min-w-0 px-2 py-4">
          <div class="flex-1 min-w-0 flex flex-wrap gap-3 overflow-x-auto scroll-smooth">
            @for (o of store.ordersByType(store.orderTypeTab()); track o.id) {
              <app-order-summary-card
                [title]="o.title"
                [statusLabel]="o.statusLabel"
                [statusClass]="o.statusClass"
                [secondaryLabel]="o.secondaryLabel"
                [elapsedLabel]="o.elapsedLabel"
                [totalLabel]="o.totalLabel"
                [selected]="o.id === store.selectedOrderId() && !store.selectedTableId()"
                (select)="store.selectStandaloneOrder(o.id)"
              />
            }
          </div>
        </div>
      } @else {
        <!-- FR-003/FR-009: listado vacío con mensaje claro, no un error ni
             una grilla en blanco sin explicación. -->
        <div class="flex flex-col items-center justify-center text-center text-gray-400 p-8 gap-3">
          <div class="text-4xl">🧾</div>
          <p class="text-sm max-w-xs">
            Todavía no hay ningún pedido de
            {{ store.orderTypeTab() === 'domicilios' ? 'domicilio' : 'para llevar' }} pendiente de
            cobro.
          </p>
        </div>
      }
    </div>
  `,
})
export class PosTablesPanelComponent {
  readonly store = inject(PosTerminalStore);
  readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  readonly carousel = viewChild<ElementRef<HTMLDivElement>>('carousel');

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
