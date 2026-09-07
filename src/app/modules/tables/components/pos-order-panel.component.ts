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
    @if (!store.hasActiveSelection()) {
      <div
        class="flex-1 flex flex-col items-center justify-center text-center text-[#9ca3af] p-6 gap-2"
      >
        <div class="text-4xl">🍽️</div>
        <p class="text-[13px] max-w-xs">
          Selecciona una mesa para ver su pedido, o usa el filtro "Pendientes" de arriba para
          encontrar pagos por confirmar.
        </p>
      </div>
    } @else {
      <div class="flex-1 flex flex-col min-h-0">
        <!-- Header: mesa + estado + cliente en una sola fila, siempre de solo
             lectura (spec 049, FR-006/FR-008) — el nombre ya no se edita
             desde aquí. -->
        <div class="p-4 border-b border-[#e5e7eb] space-y-2 shrink-0">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2.5 min-w-0">
              <!-- Insignia numerada: solo tiene sentido con una mesa real
                   (Domicilio/Para llevar no tienen un número que mostrar). -->
              @if (store.selectedTable(); as t) {
                <span
                  class="w-8 h-8 rounded-[6px] bg-[#4f46e5] text-white flex items-center justify-center text-[13px] font-bold shrink-0"
                  >{{ t.number }}</span
                >
              }
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="text-[16px] font-bold text-[#111827] truncate">{{ headerTitle() }}</h3>
                  @if (store.selectedTableStatusMeta(); as meta) {
                    <span
                      class="px-2 py-0.5 rounded-[6px] text-[11px] font-medium"
                      [class]="meta.chip"
                      >{{ meta.label }}</span
                    >
                  }
                </div>
                <span class="text-[12px] text-[#6b7280]">{{
                  store.customerName() || store.customerPlaceholder()
                }}</span>
              </div>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <!-- Mismo dato que ya calculaba headerStatusText() ("pago
                   pendiente"), ahora también como insignia visible de un
                   vistazo -- no se inventa ningún estado nuevo. -->
              @if (headerStatusText() === 'pago pendiente') {
                <span
                  class="px-2.5 py-1 rounded-[6px] bg-[#4f46e5] text-white text-[11px] font-semibold whitespace-nowrap"
                  >Cobro pendiente</span
                >
              }
              <!-- Oculto por debajo del breakpoint lg: en móvil/tablet ese
                   mismo cancelSelection() ya lo ofrece el botón de volver a
                   nivel de página (table-sessions.component.ts), único para
                   los 3 estados del panel central -- mostrar los dos apilados
                   sería redundante. -->
              <button
                (click)="store.cancelSelection()"
                title="Cerrar"
                class="hidden lg:flex w-8 h-8 rounded-[6px] border border-[#e5e7eb] text-[#6b7280] hover:bg-[#f9fafb] items-center justify-center transition-colors shrink-0"
              >
                <svg
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M18 6 6 18M6 6l12 12"></path>
                </svg>
              </button>
            </div>
          </div>

          <!-- Spec 059, Historia 3 (FR-012): datos propios de un pedido de
               Domicilio, capturados al crearlo (spec 056) — solo aplica sin
               mesa y con order_type DELIVERY. -->
          @if (!store.selectedTable() && store.selectedOrder()?.order_type === 'DELIVERY') {
            <div class="text-[12px] flex gap-2 text-[#6b7280] space-y-0.5">
              <p>📍 {{ store.selectedOrder()?.delivery_address }}</p>
              @if (store.selectedOrder()?.delivery_phone; as phone) {
                <p>📞 {{ phone }}</p>
              }
              <p>🛵 Domicilio: {{ store.fmt(store.selectedOrder()?.delivery_fee ?? 0) }}</p>
            </div>
          }

          <p class="text-[12px] text-[#9ca3af]">
            {{
              store.selectedOrder() ? 'Pedido · ' + headerStatusText() : 'Pedido nuevo sin guardar'
            }}
          </p>

          @if (store.orderTabs().length > 0) {
            <!-- Spec 049, FR-009: cada "Pedido N" enfoca una sola orden de la
                 mesa. Sin "+ Nuevo pedido" (FR-001, spec 049 — retirado sin
                 reemplazo en este panel). -->
            <div class="flex gap-2 flex-wrap">
              @for (ot of store.orderTabs(); track ot.id) {
                <button
                  (click)="selectOrderTab(ot.id)"
                  class="px-3 py-1.5 text-[12px] font-medium rounded-[6px] border transition-colors"
                  [class]="
                    store.selectedOrderId() === ot.id
                      ? 'border-[#4f46e5] bg-[#4f46e5] text-white'
                      : 'border-[#e5e7eb] text-[#4b5563] hover:bg-[#f9fafb]'
                  "
                >
                  {{ ot.label }}
                </button>
              }
            </div>
          }
        </div>

        @if (showCatalog()) {
          <!-- Catálogo embebido (spec 036, FR-006/FR-007): reemplaza la lista
               de ítems mientras se agrega un producto, sin overlay de
               pantalla completa — "← Volver" del catálogo regresa aquí sin
               perder lo ya agregado (store.closeCatalog()). -->
          <app-pos-catalog-drawer />
        } @else {
          <!-- Cart -->
          <div class="flex-1 overflow-y-auto p-4 space-y-3">
            @for (it of store.cartView(); track it.key) {
              <div class="bg-white rounded-[6px] border border-[#e5e7eb] p-3 space-y-1.5">
                <div class="flex items-start justify-between gap-2">
                  <span class="flex items-center gap-1.5">
                    <span class="font-semibold text-[#111827] text-[13px]"
                      >{{ it.qty }}x {{ it.name }}</span
                    >
                    @if (it.promo; as promo) {
                      <span
                        class="bg-[#fffbeb] text-[#b45309] border border-[#fef3c7] text-[10px] font-bold px-1 py-0.2 rounded-[6px]"
                        >{{ promo.badge }}</span
                      >
                    }
                  </span>
                  @if (it.promo; as promo) {
                    <span class="font-bold text-[#dc2626] text-[13px]">{{
                      store.fmt(promo.discountedAmount)
                    }}</span>
                  } @else {
                    <span class="font-bold text-[#111827] text-[13px]">{{
                      store.fmt(it.subtotal)
                    }}</span>
                  }
                </div>
                @if (it.promo; as promo) {
                  <div class="flex items-center gap-1.5">
                    <span class="line-through text-[11px] text-[#6b7280] font-mono">{{
                      store.fmt(promo.originalAmount)
                    }}</span>
                    <span class="text-[11px] text-[#15803d] font-semibold font-mono"
                      >Ahorras {{ store.fmt(promo.savings) }}</span
                    >
                  </div>
                }
                @for (b of it.bullets; track $index) {
                  <div class="text-[13px] font-medium text-[#4b5563] pl-1">• {{ b }}</div>
                }
                <div class="flex items-center justify-between pt-1">
                  @if (it.kind === 'draft') {
                    <div class="flex items-center gap-2">
                      <button
                        (click)="store.decDraft(it.key)"
                        class="w-7 h-7 rounded-[6px] border border-[#e5e7eb] text-[#4b5563] hover:bg-[#f9fafb] font-bold"
                      >
                        −
                      </button>
                      <span class="w-5 text-center font-bold text-[13px]">{{ it.qty }}</span>
                      <button
                        (click)="store.incDraft(it.key)"
                        class="w-7 h-7 rounded-[6px] border border-[#e5e7eb] text-[#4b5563] hover:bg-[#f9fafb] font-bold"
                      >
                        +
                      </button>
                    </div>
                    <button
                      (click)="store.removeDraft(it.key)"
                      class="text-[11px] font-medium text-[#dc2626] hover:text-[#b91c1c]"
                    >
                      Eliminar
                    </button>
                  } @else {
                    <div class="flex items-center gap-2 text-[11px]">
                      @if (it.kitchenStatus; as estado) {
                        <span class="px-2 py-0.5 rounded-[6px]" [class]="statusClass(estado)">
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
                          class="text-[11px] font-semibold text-[#15803d] hover:text-[#166534] disabled:opacity-50"
                        >
                          ✓ Listo
                        </button>
                      }
                      <!-- Un pedido ya pagado se asume entregado: no se anula
                         (spec 029, FR-007). -->
                      @if (!store.selectedOrder()?.paid) {
                        <button
                          (click)="
                            it.comboId
                              ? store.voidPersistedCombo(it.comboId)
                              : store.voidPersistedItem(it.key)
                          "
                          class="text-[11px] font-medium text-[#dc2626] hover:text-[#b91c1c]"
                        >
                          Anular
                        </button>
                      }
                    </div>
                  }
                </div>
              </div>
            }
            @if (store.cartEmpty()) {
              <div class="text-center text-[#9ca3af] py-10 text-[13px]">
                Aún no hay productos en este pedido.
              </div>
            }
            @if (!readOnly()) {
              <button
                (click)="store.openCatalog()"
                class="w-full py-2.5 border border-[#e5e7eb] rounded-[6px] text-[13px] font-medium text-[#4b5563] hover:bg-[#f9fafb] flex items-center justify-center gap-1"
              >
                ＋ Agregar producto
              </button>
            }

            <!-- Spec 049, FR-002: el resumen Subtotal/Descuento/Total se retiró
               de este panel — vive ahora en session-bill-panel.component.ts
               ("Cuenta de la mesa"). Estas dos acciones no son de cobro, así
               que se quedan aquí, solo sin el contenedor de totales alrededor. -->
            <div class="flex gap-2 pt-1">
              @if (store.hasDraft()) {
                <button
                  (click)="store.saveOrder()"
                  [disabled]="store.submitting()"
                  class="flex-1 py-2.5 bg-[#4f46e5] text-white rounded-[6px] text-[13px] font-semibold hover:bg-[#4338ca] disabled:opacity-50 transition-colors"
                >
                  {{ store.submitting() ? 'Guardando…' : 'Guardar pedido' }}
                </button>
              }
              @if (store.selectedOrder() && !store.kitchenReady()) {
                <button
                  (click)="store.marcarListo()"
                  [disabled]="store.submitting()"
                  class="flex-1 py-2.5 border border-[#e5e7eb] rounded-[6px] text-[13px] font-medium text-[#4b5563] hover:bg-[#f9fafb] disabled:opacity-50 transition-colors"
                >
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

  /**
   * Spec 059, Historia 3: título de la cabecera — "Mesa N" con mesa
   * seleccionada (sin cambios), o el tipo de pedido sin mesa
   * ("Domicilio"/"Para llevar") cuando se seleccionó desde su tarjeta.
   */
  headerTitle(): string {
    const table = this.store.selectedTable();
    if (table) return 'Mesa ' + table.number;
    return this.store.selectedOrder()?.order_type === 'DELIVERY' ? 'Domicilio' : 'Para llevar';
  }

  /** Las mismas etiquetas que ve el comensal en el menú del QR. */
  statusLabel(status: KitchenStatus): string {
    return kitchenStatusLabel(status);
  }

  statusClass(status: KitchenStatus): string {
    return kitchenStatusClass(status);
  }
}
