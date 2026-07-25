import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  inject,
  viewChild,
} from '@angular/core';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PosTablesPanelComponent } from '../components/pos-tables-panel.component';
import { PosOrderPanelComponent } from '../components/pos-order-panel.component';
import { PosCheckoutPanelComponent } from '../components/pos-checkout-panel.component';
import { PosCatalogDrawerComponent } from '../components/pos-catalog-drawer.component';

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
  ],
  template: `
    <div class="flex flex-col -m-4 md:-m-6 bg-gray-50 h-[calc(100dvh-57px)]">
      <!-- Barra superior -->
      <div class="flex items-center justify-between gap-4 px-4 py-2.5 border-b border-gray-200 bg-white shrink-0">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-lg">🪑</span>
          <span class="font-bold text-gray-900 truncate">Terminal de mesas</span>
        </div>
        <div class="hidden lg:flex gap-3 text-[11px] text-gray-400">
          <span>F2 Buscar</span><span>F4 Descuento</span><span>F8 Cobrar</span><span>ESC Cancelar</span>
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
    } else if (e.key === 'F8') {
      e.preventDefault();
      void this.store.cobrar();
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
