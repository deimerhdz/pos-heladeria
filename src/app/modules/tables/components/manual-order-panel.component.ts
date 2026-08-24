import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PosTerminalStore } from '../services/pos-terminal.store';

/**
 * Estado vacío de una mesa libre (feature 028, T021): antes esa mesa solo
 * mostraba "Selecciona una mesa ocupada…", sin ninguna forma de arrancar un
 * pedido de mostrador desde ahí. El CTA abre el catálogo (mismas piezas que
 * ya arma pedidos de mesero: `pos-catalog-drawer`/`product-select`/
 * `combo-select`, vía `store.startManualOrder()`) — una vez que hay algo en
 * el draft, la columna central cambia sola a `app-pos-order-panel`
 * (`PosTerminalStore.centralState`, T003).
 */
@Component({
  selector: 'app-manual-order-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex-1 flex flex-col min-h-0' },
  template: `
    <div class="flex-1 flex flex-col items-center justify-center text-center p-8 gap-4">
      <div class="text-5xl">🧾</div>
      <div class="space-y-1">
        <h3 class="text-lg font-bold text-gray-900">Mesa {{ store.selectedTable()?.number }} libre</h3>
        <p class="text-sm text-gray-400 max-w-xs">
          Crea un pedido de mostrador para esta mesa: se cobra directamente desde el panel de la
          derecha, sin pasar por el QR.
        </p>
      </div>
      <button
        (click)="store.startManualOrder()"
        class="min-h-11 px-5 py-2.5 bg-indigo-600 text-white text-base font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
      >
        ＋ Crear Orden Manual
      </button>
      <p class="text-xs text-gray-400">Atajo: F3</p>
    </div>
  `,
})
export class ManualOrderPanelComponent {
  readonly store = inject(PosTerminalStore);
}
