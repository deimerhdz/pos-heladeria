import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PosTablesPanelComponent } from '../components/pos-tables-panel.component';
import { PosOrderPanelComponent } from '../components/pos-order-panel.component';
import { PosCheckoutPanelComponent } from '../components/pos-checkout-panel.component';
import { PosCatalogDrawerComponent } from '../components/pos-catalog-drawer.component';
import { PendingOrdersPanelComponent } from '../components/pending-orders-panel.component';

/**
 * Terminal POS de mesas (staff): 3 columnas — mesas · pedido · cobro — con
 * catálogo en drawer, diálogo de éxito y atajos de teclado (F2/F4/F8/ESC/Ctrl+P).
 * Reemplaza el antiguo tablero de sesiones. Cobra por el ciclo de comedor
 * (block → pay) del backend.
 */
@Component({
  selector: 'app-table-sessions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PosTerminalStore],
  imports: [
    PosTablesPanelComponent,
    PosOrderPanelComponent,
    PosCheckoutPanelComponent,
    PosCatalogDrawerComponent,
    PendingOrdersPanelComponent,
  ],
  template: `
    <div class="flex flex-col -m-4 md:-m-6 bg-gray-50 h-[calc(100dvh-57px)]">
      <!-- Barra superior -->
      <div class="flex items-center justify-between gap-4 px-4 py-2.5 border-b border-gray-200 bg-white shrink-0">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-lg">🪑</span>
          <span class="font-bold text-gray-900 truncate">Terminal de mesas</span>
        </div>
        <div class="flex items-center gap-3">
          @if (store.pendingOrders().length > 0) {
            <button
              (click)="pendingOpen.set(!pendingOpen())"
              class="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors"
            >
              🔔 Por confirmar
              <span class="ml-1 px-1.5 py-0.5 rounded-full bg-white text-violet-700 text-xs font-bold">
                {{ store.pendingOrders().length }}
              </span>
            </button>
          }
          <div class="hidden lg:flex gap-3 text-[11px] text-gray-400">
            <span>F2 Buscar</span><span>F4 Descuento</span><span>ESC Cancelar</span>
          </div>
        </div>
      </div>

      @if (store.loading()) {
        <div class="flex-1 flex items-center justify-center text-sm text-gray-400">Cargando terminal…</div>
      } @else {
        @if (store.error()) {
          <div class="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-700">{{ store.error() }}</div>
        }
        <div class="flex-1 flex min-h-0">
          <app-pos-tables-panel />
          <div class="flex-1 flex flex-col min-h-0 border-r border-gray-200 bg-white">
            <app-pos-order-panel />
          </div>
          <app-pos-checkout-panel />
        </div>
      }
    </div>

    @if (store.catalogOpen()) {
      <app-pos-catalog-drawer />
    }

    <!-- Pedidos enviados por comensales, a la espera de que el personal los acepte -->
    @if (pendingOpen()) {
      <div class="fixed inset-0 bg-black/40 z-40" (click)="pendingOpen.set(false)"></div>
      <div class="fixed inset-y-0 right-0 w-full max-w-md bg-gray-50 shadow-xl z-50 overflow-y-auto p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-base font-bold text-gray-900">Pedidos de los comensales</h2>
          <button (click)="pendingOpen.set(false)" class="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>
        <p class="text-xs text-gray-500 mb-3">
          Confirmar descuenta el inventario y manda el pedido a cocina.
        </p>
        <app-pending-orders-panel
          [orders]="store.pendingOrders()"
          [categories]="store.categories()"
          (refresh)="store.reload()"
        />
      </div>
    }

    <!-- Diálogo de éxito -->
    @if (store.successOpen()) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4 text-center">
          <div class="text-4xl">✅</div>
          <h2 class="text-lg font-bold text-gray-900">Pago registrado</h2>
          @if (store.lastSale(); as s) {
            <p class="text-sm text-gray-500">Venta de {{ store.fmt(s.total) }} ({{ s.customer }}) registrada. El inventario se actualizó.</p>
          }
          <div class="flex gap-2 justify-center pt-1">
            <button (click)="store.printReceipt()" class="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">Imprimir</button>
            <button (click)="store.closeSuccess()" class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700">Cerrar</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class TableSessionsComponent implements OnInit, OnDestroy {
  readonly store = inject(PosTerminalStore);
  private readonly tablesPanel = viewChild(PosTablesPanelComponent);

  /** Drawer de pedidos enviados por comensales pendientes de confirmar. */
  readonly pendingOpen = signal(false);

  ngOnInit(): void {
    void this.store.init();
  }

  ngOnDestroy(): void {
    this.store.stop();
  }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const tag = (document.activeElement?.tagName ?? '').toUpperCase();
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === 'F2') {
      e.preventDefault();
      this.tablesPanel()?.focusSearch();
    } else if (e.key === 'F4') {
      e.preventDefault();
      if (this.store.hasActiveOrder()) this.store.toggleDiscountPanel();
    } else if (e.key === 'Escape') {
      if (this.store.catalogOpen()) this.store.closeCatalog();
      else if (this.store.discountPanelOpen()) this.store.toggleDiscountPanel();
      else this.store.cancelSelection();
    } else if (!typing && e.key.toLowerCase() === 'p' && (e.ctrlKey || e.metaKey)) {
      if (this.store.successOpen()) {
        e.preventDefault();
        this.store.printReceipt();
      }
    }
  }
}
