import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { DiningOrder, SessionBill, getSidebarMode } from '../interfaces/dining.interface';
import { SessionBillPanelComponent } from './session-bill-panel.component';
import { SplitBillPanelComponent } from './split-bill-panel.component';
import { PaymentInputComponent } from './payment-input.component';
import { PaymentDraft, emptyPaymentDraft, paymentIssue, paymentLines } from '../services/payment-draft.util';

/**
 * Columna derecha: cuenta de la mesa y cobro.
 *
 * Feature 028 ("terminal híbrida por origen"): la barra lateral ya no muestra
 * siempre el mismo panel de cobro — se decide por el **origen** del pedido
 * activo (`getSidebarMode`, `dining.interface.ts`, T002/T004):
 *
 * - `'resumen'` (canal `qr`): el comensal ya pagó a distancia. Panel de solo
 *   lectura — `app-session-bill-panel` en modo `readOnly` (T009): desglose,
 *   sin selector de método ni botón de cobro. Ahí vivía el bug de origen de
 *   esta pantalla (cobrar de nuevo una mesa ya pagada por QR reventaba con un
 *   error que el cajero no sabía interpretar).
 * - `'terminal-pos'` (canal `counter`/`waiter`, o mesa libre sin pedido
 *   todavía): panel editable — carrito + método de pago + nombre de
 *   facturación + un único botón "Cobrar, Facturar y Enviar a Cocina"
 *   (`POST /orders/{id}/checkout-and-send`, T024/T025). Es un pedido, no una
 *   sesión: no pasa por `TableSessionService.close()`.
 *
 * "Imprimir Pre-cuenta" (T032) y "Liberar Mesa" (T035) se ven en ambos modos.
 */
@Component({
  selector: 'app-pos-checkout-panel',
  standalone: true,
  imports: [SessionBillPanelComponent, SplitBillPanelComponent, PaymentInputComponent],
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
        } @else if (sidebarMode() === 'resumen') {
          <!-- Origen QR: solo lectura (T004/T009). -->
          <app-session-bill-panel
            [bill]="store.sessionBill()"
            [methods]="store.paymentMethods()"
            [cashShiftId]="store.cashShiftId()"
            [customerName]="store.customerName()"
            [orphan]="store.billOrphan()"
            [readOnly]="true"
          />
        } @else if (showSessionCharge()) {
          <!--
            Pedido de mesero ya enviado a cocina (status distinto de
            'recibida'): se cobra cerrando la sesión de mesa completa — el
            mismo mecanismo que el modo resumen usa en solo lectura arriba —,
            no con checkout-and-send (que exige 'recibida' y por eso
            rechazaba siempre con 409 sobre un pedido así, dejándolo abierto
            para siempre sin factura). Hotfix spec 029 #3: esta vía ya
            existía en el backend y en session-bill-panel, solo nunca se
            conectaba aquí. ensureReadyToCharge resuelve de una vez los
            productos que sigan sin marcar como listos antes de cobrar.
          -->
          <div class="flex flex-col h-full">
            @if (store.sessionBill(); as bill) {
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
            <!--
              Spec 029, hotfix #4: hasta ahora la única acción sobre este
              pedido era cobrar. cancel_order ya existía en el backend
              (sin venta ni movimiento de caja) pero no estaba conectado.
            -->
            <button
              (click)="store.rejectOrder()"
              [disabled]="store.submitting()"
              class="w-full min-h-11 py-2 mt-2 border border-red-200 text-red-700 rounded-xl text-sm font-medium hover:bg-red-50 disabled:opacity-40 transition-colors"
            >
              Rechazar pedido
            </button>
          </div>
        } @else {
          <!-- Origen mostrador (o mesa sin pedido todavía): cobro editable (T024). -->
          <div class="flex flex-col h-full">
            <h2 class="text-base font-bold text-gray-900 mb-3">
              {{ store.selectedOrder() ? 'Cobrar pedido' : 'Pedido de mostrador' }}
            </h2>

            @if (store.cartEmpty()) {
              <p class="text-sm text-gray-400 py-6 text-center">
                Agrega productos desde el catálogo para armar el pedido.
              </p>
            } @else {
              <div class="space-y-1 mb-3">
                @for (it of store.cartView(); track it.key) {
                  <div class="flex items-center justify-between text-sm gap-2">
                    <span class="text-gray-700 truncate">{{ it.qty }}× {{ it.name }}</span>
                    <span class="text-gray-900 font-medium shrink-0">{{ store.fmt(it.subtotal) }}</span>
                  </div>
                }
              </div>
              <div class="flex items-center justify-between pt-2 border-t border-gray-100 mb-3">
                <span class="text-base font-semibold text-gray-800">Total</span>
                <span class="text-lg font-bold text-gray-900">{{ store.fmt(store.totals().total) }}</span>
              </div>
            }

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

            @if (!store.selectedOrder()) {
              <p class="text-sm text-gray-400">
                Crea el pedido (botón "Crear pedido" en el panel central) para poder cobrarlo.
              </p>
            } @else {
              <div class="mb-2">
                <label class="block text-sm font-medium text-gray-600 mb-1">Facturar a nombre de</label>
                <input
                  type="text"
                  [value]="store.billingCustomerName()"
                  (input)="store.billingCustomerName.set($any($event.target).value)"
                  placeholder="Consumidor Final"
                  class="w-full min-h-11 px-3 py-2 border border-gray-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <app-payment-input
                [total]="store.totals().total"
                [methods]="store.paymentMethods()"
                (changed)="paymentDraft.set($event)"
              />

              @if (store.error()) {
                <div class="bg-red-50 border border-red-200 rounded-lg px-3 py-2 my-3">
                  <p class="text-sm text-red-700">{{ store.error() }}</p>
                </div>
              }

              <button
                (click)="checkout()"
                [disabled]="store.checkoutSubmitting() || issue() !== null"
                class="w-full min-h-11 py-2.5 mt-3 bg-indigo-600 text-white text-base font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {{ store.checkoutSubmitting() ? 'Cobrando…' : 'Cobrar, Facturar y Enviar a Cocina' }}
              </button>

              <!-- Spec 029, hotfix #4: alternativa a cobrar, sin venta ni movimiento de caja. -->
              <button
                (click)="store.rejectOrder()"
                [disabled]="store.submitting() || store.checkoutSubmitting()"
                class="w-full min-h-11 py-2 mt-2 border border-red-200 text-red-700 rounded-xl text-sm font-medium hover:bg-red-50 disabled:opacity-40 transition-colors"
              >
                Rechazar pedido
              </button>
            }
          </div>
        }
      </div>

      @if (store.sessionBill(); as bill) {
        <div class="p-3 border-t border-gray-100 space-y-2 shrink-0">
          <button
            (click)="store.printPreBill()"
            class="w-full min-h-11 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            🧾 Imprimir Pre-cuenta
          </button>
          @if (store.selectedOrder(); as order) {
            <!--
              FR-001/FR-002 (spec 029, Historia 4): única acción de impresión
              tras el pago — reimprime la factura de CUALQUIER pedido ya
              facturado, sea QR o de mostrador, sin importar quién lo cobró
              ni en qué pestaña (con lookup al backend — ver
              PosTerminalStore.printOrderInvoice). Reemplaza el botón del
              diálogo de éxito para el caso de un solo comprobante, que
              duplicaba esta misma acción.
            -->
            <button
              (click)="store.printOrderInvoice(order.id)"
              class="w-full min-h-11 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              🧾 Imprimir Factura
            </button>
          }
          <button
            (click)="store.releaseTable()"
            [disabled]="store.submitting()"
            class="w-full min-h-11 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            🔓 Liberar Mesa
          </button>
        </div>
      }
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

  /** T004: qué panel de cobro va según el origen del pedido activo. */
  readonly sidebarMode = computed(() => getSidebarMode(this.store.selectedOrder()));

  /**
   * Spec 029, hotfix #3: dentro de `terminal-pos`, un pedido que ya se envió
   * a cocina (`status !== 'recibida'`) no se puede cobrar con
   * `checkout-and-send` (el backend lo rechaza con 409) — necesita el cierre
   * de sesión de mesa (`app-session-bill-panel`, mismo componente que
   * `resumen` usa en solo lectura arriba).
   */
  readonly showSessionCharge = computed(() => {
    const order = this.store.selectedOrder();
    return !!order && order.status !== 'recibida';
  });

  /** Cómo paga el cajero el pedido de mostrador que se está cobrando (T024/T025). */
  readonly paymentDraft = signal<PaymentDraft>(emptyPaymentDraft());

  readonly issue = computed(() =>
    paymentIssue(this.paymentDraft(), this.store.totals().total, this.store.paymentMethods()),
  );

  constructor() {
    // El pago anterior no vale para otro pedido: se reinicia al cambiar de
    // selección, igual que hace `SessionBillPanelComponent` con `bill`.
    effect(() => {
      this.store.selectedOrderId();
      this.paymentDraft.set(emptyPaymentDraft());
    });
  }

  async checkout(): Promise<void> {
    if (this.issue()) return;
    await this.store.checkoutAndSend(paymentLines(this.paymentDraft()));
  }

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
