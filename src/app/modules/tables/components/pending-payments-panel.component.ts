import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { DiningOrder } from '../interfaces/dining.interface';
import { PaymentAttemptReviewPanelComponent } from './payment-attempt-review-panel.component';

/**
 * Sección "Pagos por confirmar" (spec 036, FR-004): agrupa en un listado
 * aparte **todos** los pagos pendientes de revisión
 * (`store.pendingPaymentsView()`), sin acotarse a la mesa seleccionada.
 * Cada tarjeta delega la confirmación/aprobación/rechazo al mismo
 * `app-payment-attempt-review-panel` que ya usa el panel de la mesa
 * seleccionada (`payment-validation-block.component.ts`) — cero lógica de
 * negocio duplicada, solo un segundo lugar donde se renderiza (research.md
 * §2). Seleccionar la tarjeta (fuera del panel de revisión embebido) invoca
 * `store.selectTable()`, igual que hacerlo desde la grilla (FR-005).
 *
 * Vive dentro de la misma sección del detalle del pedido
 * (`pos-order-panel.component.ts`, cuando no hay mesa seleccionada) — no
 * debajo de la grilla de mesas, para no competir por espacio vertical con
 * el carrusel de mesas ni duplicar scroll.
 */
@Component({
  selector: 'app-pending-payments-panel',
  standalone: true,
  imports: [PaymentAttemptReviewPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex-1 flex flex-col min-h-0">
      <div class="px-4 py-3 border-b border-gray-100 shrink-0">
        <h4 class="text-base font-bold text-gray-900">🔔 Pagos por confirmar</h4>
      </div>

      @if (store.pendingPaymentsView().length === 0) {
        <p class="text-center text-sm text-gray-400 py-6 px-4">No hay pagos esperando revisión.</p>
      } @else {
        <div class="flex-1 overflow-y-auto p-3 space-y-2.5">
          @for (p of store.pendingPaymentsView(); track p.orderId) {
            <div class="border border-violet-100 bg-violet-50/40 rounded-xl p-3 space-y-2">
              <button type="button" (click)="store.selectTable(p.tableId)" class="w-full text-left">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-base font-semibold text-violet-700">{{ p.tableLabel }}</span>
                  <span class="text-sm text-gray-400">🕐 {{ p.elapsedLabel }}</span>
                </div>
                <div class="flex items-center justify-between text-sm text-gray-600">
                  <span>{{ p.customerLabel }}</span>
                  <span class="text-base font-bold text-gray-900">{{ p.totalLabel }}</span>
                </div>
              </button>

              @if (orderFor(p.orderId); as order) {
                <app-payment-attempt-review-panel
                  [order]="order"
                  [cashShiftId]="store.cashShiftId()"
                  (resolved)="store.reload()"
                />
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class PendingPaymentsPanelComponent {
  readonly store = inject(PosTerminalStore);

  orderFor(orderId: string): DiningOrder | undefined {
    return this.store.orders().find((o) => o.id === orderId);
  }
}
