import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { SessionBillPanelComponent } from './session-bill-panel.component';

/**
 * Columna derecha: cuenta de la mesa y cobro.
 *
 * La unidad de cobro es la **sesión de mesa**, no el pedido: cerrarla cobra
 * todos sus pedidos de una vez, cierra a los comensales y libera la mesa. El
 * antiguo ciclo `block` → `pay` → `release` por orden no permitía dividir la
 * cuenta por comensal.
 */
@Component({
  selector: 'app-pos-checkout-panel',
  standalone: true,
  imports: [SessionBillPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="w-full sm:w-[320px] shrink-0 flex flex-col border-l border-gray-200 min-h-0 bg-white">
      <div class="flex-1 overflow-y-auto p-4">
        @if (store.billLoading()) {
          <p class="text-xs text-gray-400 py-8 text-center">Cargando cuenta…</p>
        } @else {
          <app-session-bill-panel
            [bill]="store.sessionBill()"
            [methods]="store.paymentMethods()"
            [cashShiftId]="store.cashShiftId()"
            [customerName]="store.customerName()"
            [orphan]="store.billOrphan()"
            (charged)="store.onCharged($event)"
          />
        }
      </div>
    </div>
  `,
})
export class PosCheckoutPanelComponent {
  readonly store = inject(PosTerminalStore);
}
