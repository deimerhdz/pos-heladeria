import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { KitchenStatus, getSidebarMode } from '../interfaces/dining.interface';
import { kitchenStatusClass, kitchenStatusLabel } from '../../orders/order-status.util';
import { PosCatalogDrawerComponent } from './pos-catalog-drawer.component';

/**
 * Columna central: armado y edición del pedido de la mesa seleccionada.
 *
 * Spec 045: sin mesa seleccionada, esta es la única responsabilidad de este
 * panel — un placeholder informativo, nada más. Ya no muestra aquí "Pagos
 * por confirmar" (spec 036 FR-004, retirada) — ese listado global se
 * reemplaza por el filtro "Pendientes" de la grilla de mesas más el flujo
 * ya existente por mesa (`payment-validation-block.component.ts`, spec 044).
 */
@Component({
  selector: 'app-pos-order-panel',
  standalone: true,
  imports: [PosCatalogDrawerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // El host es `inline` por defecto: sin esto no ocupa el alto de la columna y
  // el carrito no puede tener su propio scroll (la página entera se estiraba).
  host: { class: 'flex-1 flex flex-col min-h-0' },
  template: `
    @if (!store.hasActiveOrder()) {
      <div class="flex-1 flex flex-col items-center justify-center text-center text-gray-400 p-6 gap-2">
        <div class="text-4xl">🍽️</div>
        <p class="text-sm max-w-xs">
          Selecciona una mesa para ver su pedido, o usa el filtro "Pendientes" de arriba para
          encontrar pagos por confirmar.
        </p>
      </div>
    } @else {
      <div class="flex-1 flex flex-col min-h-0">
        <!-- Header: mesa + estado + cliente en una sola fila, siempre de solo
             lectura (spec 049, FR-006/FR-008) — el nombre ya no se edita
             desde aquí. -->
        <div class="p-4 border-b border-gray-100 space-y-2 shrink-0">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="text-lg font-bold text-gray-900">Mesa {{ store.selectedTable()?.number }}</h3>
              @if (store.selectedTableStatusMeta(); as meta) {
                <span class="px-2 py-0.5 rounded-full text-xs font-medium" [class]="meta.chip">{{ meta.label }}</span>
              }
              <span class="text-sm font-semibold text-gray-700">{{ store.customerName() || store.customerPlaceholder() }}</span>
            </div>
            <button (click)="store.cancelSelection()" class="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 shrink-0">← Volver</button>
          </div>

          @if (!store.showAllOrders()) {
            <p class="text-xs text-gray-400">
              {{ store.selectedOrder() ? ('Pedido · ' + headerStatusText()) : 'Pedido nuevo sin guardar' }}
            </p>
          }

          @if (store.orderTabs().length > 0) {
            <!-- Spec 049, FR-009: "Todos los pedidos" agrupa las tarjetas de
                 todos los pedidos de la mesa; cada "Pedido N" enfoca una sola.
                 Sin "+ Nuevo pedido" (FR-001, spec 049 — retirado sin
                 reemplazo en este panel). -->
            <div class="flex gap-2 flex-wrap">
              <button
                (click)="store.showAllOrders.set(true)"
                class="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors"
                [class]="store.showAllOrders() ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'"
              >Todos los pedidos ({{ store.orderTabs().length }})</button>
              @for (ot of store.orderTabs(); track ot.id) {
                <button
                  (click)="selectOrderTab(ot.id)"
                  class="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors"
                  [class]="!store.showAllOrders() && store.selectedOrderId() === ot.id ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'"
                >{{ ot.label }}</button>
              }
            </div>
          }
        </div>

        @if (store.showAllOrders() && store.orderTabs().length > 0) {
          <!-- Vista agregada: una tarjeta por pedido, sin edición (spec 049,
               D5) — agregar productos exige elegir antes una pestaña
               individual, sin ambigüedad de a cuál pedido se le agrega. -->
          <div class="flex-1 overflow-y-auto p-4 space-y-4">
            @for (card of store.ordersView(); track card.order.id) {
              <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-xs text-gray-400">{{ card.createdAtLabel }}</span>
                  <span
                    class="px-2 py-0.5 rounded-full text-xs font-medium"
                    [class]="card.pending ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'"
                  >{{ card.pending ? 'Pendiente' : 'Listo' }}</span>
                </div>
                @for (it of card.items; track it.key) {
                  <div class="flex items-start justify-between gap-2 pt-1 border-t border-gray-50 first:border-t-0 first:pt-0">
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="font-semibold text-gray-900 text-sm">{{ it.qty }}x {{ it.name }}</span>
                        @if (it.kitchenStatus; as estado) {
                          <span class="px-2 py-0.5 rounded-full text-xs" [class]="statusClass(estado)">{{ statusLabel(estado) }}</span>
                        }
                      </div>
                      @for (b of it.bullets; track $index) {
                        <div class="text-sm font-medium text-gray-700 pl-1">• {{ b }}</div>
                      }
                      <span class="text-xs text-gray-400">{{ store.fmt(it.unitPrice) }} c/u</span>
                    </div>
                    <div class="flex flex-col items-end gap-1 shrink-0">
                      <span class="font-bold text-gray-900 text-sm">{{ store.fmt(it.subtotal) }}</span>
                      @if (!it.ready) {
                        <button
                          (click)="store.avanzarItem(it.key)"
                          [disabled]="store.submitting()"
                          class="text-xs font-semibold text-green-700 hover:text-green-800 disabled:opacity-50"
                        >✓ Listo</button>
                      }
                    </div>
                  </div>
                }
                @if (card.pending) {
                  <button
                    (click)="store.marcarListo(card.order.id)"
                    [disabled]="store.submitting()"
                    class="w-full py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >Marcar pedido listo</button>
                }
              </div>
            }
          </div>
        } @else if (showCatalog()) {
          <!-- Catálogo embebido (spec 036, FR-006/FR-007): reemplaza la lista
               de ítems mientras se agrega un producto, sin overlay de
               pantalla completa — "← Volver" del catálogo regresa aquí sin
               perder lo ya agregado (store.closeCatalog()). -->
          <app-pos-catalog-drawer />
        } @else {
        <!-- Cart -->
        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          @for (it of store.cartView(); track it.key) {
            <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-1.5">
              <div class="flex items-start justify-between gap-2">
                <span class="font-semibold text-gray-900 text-sm">{{ it.qty }}x {{ it.name }}</span>
                <span class="font-bold text-gray-900 text-sm">{{ store.fmt(it.subtotal) }}</span>
              </div>
              @for (b of it.bullets; track $index) {
                <div class="text-sm font-medium text-gray-700 pl-1">• {{ b }}</div>
              }
              <div class="flex items-center justify-between pt-1">
                @if (it.kind === 'draft') {
                  <div class="flex items-center gap-2">
                    <button (click)="store.decDraft(it.key)" class="w-7 h-7 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 font-bold">−</button>
                    <span class="w-5 text-center font-bold text-sm">{{ it.qty }}</span>
                    <button (click)="store.incDraft(it.key)" class="w-7 h-7 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 font-bold">+</button>
                    <span class="text-xs text-gray-400 ml-1">{{ store.fmt(it.unitPrice) }} c/u</span>
                  </div>
                  <button (click)="store.removeDraft(it.key)" class="text-xs font-medium text-red-600 hover:text-red-700">Eliminar</button>
                } @else {
                  <div class="flex items-center gap-2 text-xs">
                    <span class="text-gray-400">{{ store.fmt(it.unitPrice) }} c/u</span>
                    @if (it.kitchenStatus; as estado) {
                      <span class="px-2 py-0.5 rounded-full" [class]="statusClass(estado)">
                        {{ statusLabel(estado) }}
                      </span>
                    }
                  </div>
                  <div class="flex items-center gap-3">
                    <!-- Marcar listo desde aquí es lo que sustituye al tablero de
                         cocina: quien toma el pedido lo prepara y lo marca sin
                         cambiar de pantalla. -->
                    @if (!it.ready) {
                      <button
                        (click)="store.avanzarItem(it.key)"
                        [disabled]="store.submitting()"
                        class="text-xs font-semibold text-green-700 hover:text-green-800 disabled:opacity-50"
                      >✓ Listo</button>
                    }
                    <!-- Un pedido ya pagado se asume entregado: no se anula
                         (spec 029, FR-007). -->
                    @if (!store.selectedOrder()?.paid) {
                      <button
                        (click)="it.comboId ? store.voidPersistedCombo(it.comboId) : store.voidPersistedItem(it.key)"
                        class="text-xs font-medium text-red-600 hover:text-red-700"
                      >Anular</button>
                    }
                  </div>
                }
              </div>
            </div>
          }
          @if (store.cartEmpty()) {
            <div class="text-center text-gray-400 py-10 text-sm">Aún no hay productos en este pedido.</div>
          }
          @if (!readOnly()) {
            <button
              (click)="store.openCatalog()"
              class="w-full py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1"
            >＋ Agregar producto</button>
          }

          <!-- Spec 049, FR-002: el resumen Subtotal/Descuento/Total se retiró
               de este panel — vive ahora en session-bill-panel.component.ts
               ("Cuenta de la mesa"). Estas dos acciones no son de cobro, así
               que se quedan aquí, solo sin el contenedor de totales alrededor. -->
          <div class="flex gap-2 pt-1">
            @if (store.hasDraft()) {
              <button (click)="store.saveOrder()" [disabled]="store.submitting()"
                class="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {{ store.submitting() ? 'Guardando…' : 'Guardar pedido' }}
              </button>
            }
            @if (store.selectedOrder() && !store.kitchenReady()) {
              <button (click)="store.marcarListo()" [disabled]="store.submitting()"
                class="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                Marcar pedido listo
              </button>
            }
          </div>
        </div>
        }
      </div>
    }
  `,
})
export class PosOrderPanelComponent {
  readonly store = inject(PosTerminalStore);

  /** Spec 036, US2, escenario 5: mismo criterio que ya usa
   *  `pos-checkout-panel.component.ts` para su propio modo de solo lectura
   *  (`getSidebarMode`, `dining.interface.ts`) — una orden QR o ya pagada no
   *  ofrece "+ Agregar producto". */
  readonly readOnly = computed(() => getSidebarMode(this.store.selectedOrder()) === 'resumen');

  /** Catálogo embebido visible (spec 036, FR-006/FR-007): nunca en modo de
   *  solo lectura, aunque `catalogOpen()` hubiera quedado en `true` de una
   *  orden distinta seleccionada antes en la misma mesa. */
  readonly showCatalog = computed(() => this.store.catalogOpen() && !this.readOnly());

  /** Elegir una pestaña "Pedido N" sale de la vista agregada y enfoca ese
   *  pedido (spec 049, D5) — reusa `selectOrder()` tal cual. */
  selectOrderTab(orderId: string): void {
    this.store.showAllOrders.set(false);
    this.store.selectOrder(orderId);
  }

  /**
   * Spec 029, Historia 3: "listo para cobrar" exige pago Y cocina, las dos a
   * la vez — antes solo miraba `kitchenReady()`. `kitchenReady()` en sí no
   * cambia: sigue controlando, sin relación con el pago, cuándo se oculta
   * el botón "Marcar pedido listo".
   */
  headerStatusText(): string {
    if (!this.store.kitchenReady()) return 'en preparación';
    return this.store.selectedOrder()?.paid ? 'listo para cobrar' : 'pago pendiente';
  }

  /** Las mismas etiquetas que ve el comensal en el menú del QR. */
  statusLabel(status: KitchenStatus): string {
    return kitchenStatusLabel(status);
  }

  statusClass(status: KitchenStatus): string {
    return kitchenStatusClass(status);
  }
}
