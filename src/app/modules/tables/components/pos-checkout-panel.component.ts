import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { DiningOrder, SessionBill } from '../interfaces/dining.interface';
import { SessionBillPanelComponent } from './session-bill-panel.component';
import { SplitBillPanelComponent } from './split-bill-panel.component';

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
  imports: [SessionBillPanelComponent, SplitBillPanelComponent],
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
          @if (store.sessionBill(); as bill) {
            <!-- Sin esto, una mesa donde pidió una sola persona no se puede dividir:
                 el desglose tendría una única línea y el modo split queda bloqueado. -->
            <button
              (click)="splitOpen.set(true)"
              class="w-full mb-3 py-2 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-sm font-medium transition-colors"
            >
              Dividir la cuenta entre varias personas
            </button>
          }
          <app-session-bill-panel
            [bill]="store.sessionBill()"
            [methods]="store.paymentMethods()"
            [cashShiftId]="store.cashShiftId()"
            [customerName]="store.customerName()"
            [orphan]="store.billOrphan()"
            [beforeCharge]="store.ensureReadyToCharge"
            (charged)="store.onCharged($event)"
          />
        }
      </div>
    </div>

    @if (splitOpen() && store.sessionBill(); as bill) {
      <app-split-bill-panel
        [sessionId]="bill.table_session_id"
        [tableLabel]="tableLabel()"
        [orders]="sessionOrders(bill)"
        [categories]="store.categories()"
        (saved)="onSplitSaved($event)"
        (close)="splitOpen.set(false)"
      />
    }
  `,
})
export class PosCheckoutPanelComponent {
  readonly store = inject(PosTerminalStore);
  readonly splitOpen = signal(false);

  /**
   * Los pedidos de ESTA sesión.
   *
   * `store.orders()` trae los de todas las mesas (`listOrders()` no filtra), así que
   * pasarlo crudo hacía que el reparto listara productos de otras mesas y dejara sus
   * selectores en blanco. `bill.order_ids` sale de la misma `compute_bill` que produce
   * el desglose, así que lo que se reparte y lo que se cobra no pueden discrepar.
   */
  sessionOrders(bill: SessionBill): DiningOrder[] {
    const ids = new Set(bill.order_ids);
    return this.store.orders().filter((o) => ids.has(o.id));
  }

  /** "Mesa 1", para que se vea de qué mesa es la lista sin tener que deducirlo. */
  tableLabel(): string {
    const t = this.store.selectedTable();
    return t ? `Mesa ${t.number}` : '';
  }

  /** El reparto devuelve la cuenta ya recalculada: se aprovecha en vez de repedirla. */
  onSplitSaved(bill: SessionBill): void {
    this.store.sessionBill.set(bill);
    this.store.billStale.set(false);
  }
}
