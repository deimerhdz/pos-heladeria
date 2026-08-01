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
        <!--
          El aviso va AQUÍ y no dentro de <app-session-bill-panel> a propósito:
          ese componente resetea el método de pago y el efectivo recibido en su
          ngOnChanges, así que pasarle un @Input nuevo le borraría al cajero lo
          que está tecleando justo cuando llega el evento. La recarga es un acto
          deliberado suyo.
        -->
        @if (store.billStale() && !store.billLoading()) {
          <div class="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <span class="text-sm text-amber-800 flex-1">La cuenta cambió</span>
            <button
              (click)="store.refreshBill()"
              class="px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors"
            >
              Actualizar
            </button>
          </div>
        }
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
