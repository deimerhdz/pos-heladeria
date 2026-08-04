import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PosTerminalStore } from '../services/pos-terminal.store';

/** Columna central: armado y edición del pedido de la mesa seleccionada. */
@Component({
  selector: 'app-pos-order-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // El host es `inline` por defecto: sin esto no ocupa el alto de la columna y
  // el carrito no puede tener su propio scroll (la página entera se estiraba).
  host: { class: 'flex-1 flex flex-col min-h-0' },
  template: `
    @if (!store.hasActiveOrder()) {
      <div class="flex-1 flex flex-col items-center justify-center text-center text-gray-400 p-8 gap-3">
        <div class="text-5xl">🍽️</div>
        <p class="text-sm max-w-xs">Selecciona una mesa ocupada para cobrar, o una mesa libre para crear un pedido nuevo.</p>
      </div>
    } @else {
      <div class="flex-1 flex flex-col min-h-0">
        <!-- Header -->
        <div class="p-4 border-b border-gray-100 space-y-2 shrink-0">
          <div class="flex items-start justify-between">
            <div>
              <h3 class="text-lg font-bold text-gray-900">Mesa {{ store.selectedTable()?.number }}</h3>
              <p class="text-xs text-gray-400 mt-0.5">
                {{ store.selectedOrder() ? ('Pedido · ' + (store.kitchenReady() ? 'listo para cobrar' : 'en cocina')) : 'Pedido nuevo sin guardar' }}
              </p>
            </div>
            <button (click)="store.cancelSelection()" class="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">← Volver</button>
          </div>

          @if (store.pendingOfSelectedTable().length; as pendientes) {
            <!--
              Sin esto la pantalla se contradice: la tarjeta de la mesa avisa de
              un pedido por confirmar y aquí pone "Pedido nuevo sin guardar".
            -->
            <div class="flex items-center justify-between gap-3 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
              <p class="text-xs text-violet-800">
                Esta mesa tiene {{ pendientes }}
                {{ pendientes === 1 ? 'pedido' : 'pedidos' }} por confirmar.
              </p>
              <button
                (click)="store.centerTab.set('pendientes')"
                class="text-xs font-semibold text-violet-700 hover:text-violet-900 shrink-0"
              >
                Ver
              </button>
            </div>
          }

          <div>
            <label class="block text-[11px] font-medium text-gray-500 mb-1">Cliente</label>
            <input
              type="text"
              [value]="store.customerName()"
              [placeholder]="store.customerPlaceholder()"
              (input)="store.customerName.set($any($event.target).value)"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          @if (store.orderTabs().length > 0) {
            <div class="flex gap-2 flex-wrap">
              @for (ot of store.orderTabs(); track ot.id) {
                <button
                  (click)="store.selectOrder(ot.id)"
                  class="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors"
                  [class]="store.selectedOrderId() === ot.id ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'"
                >{{ ot.label }}</button>
              }
              <button (click)="store.newOrderOnTable()" class="px-3 py-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700">+ Nuevo pedido</button>
            </div>
          }
        </div>

        <!-- Cart -->
        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          @for (it of store.cartView(); track it.key) {
            <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-1.5">
              <div class="flex items-start justify-between gap-2">
                <span class="font-semibold text-gray-900 text-sm">{{ it.qty }}x {{ it.name }}</span>
                <span class="font-bold text-gray-900 text-sm">{{ store.fmt(it.subtotal) }}</span>
              </div>
              @for (b of it.bullets; track $index) {
                <div class="text-xs text-gray-500 pl-1">• {{ b }}</div>
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
                    <span class="px-2 py-0.5 rounded-full" [class]="it.ready ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'">
                      {{ it.ready ? 'Listo' : 'En cocina' }}
                    </span>
                  </div>
                  <button
                    (click)="it.comboId ? store.voidPersistedCombo(it.comboId) : store.voidPersistedItem(it.key)"
                    class="text-xs font-medium text-red-600 hover:text-red-700"
                  >Anular</button>
                }
              </div>
            </div>
          }
          @if (store.cartEmpty()) {
            <div class="text-center text-gray-400 py-10 text-sm">Aún no hay productos en este pedido.</div>
          }
          <button
            (click)="store.openCatalog()"
            class="w-full py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1"
          >＋ Agregar producto</button>
        </div>

        <!-- Totales -->
        <div class="border-t border-gray-100 p-4 space-y-2 bg-gray-50 shrink-0 relative">
          @let tot = store.totals();
          <div class="flex justify-between text-sm"><span>Subtotal</span><span>{{ store.fmt(tot.subtotal) }}</span></div>
          <div class="flex justify-between text-sm">
            <button (click)="store.toggleDiscountPanel()" class="text-indigo-600 hover:text-indigo-700 font-medium">Aplicar descuento (F4)</button>
            <span>{{ tot.discount > 0 ? '- ' + store.fmt(tot.discount) : store.fmt(0) }}</span>
          </div>
          <div class="border-t border-gray-200 my-1"></div>
          <div class="flex justify-between font-bold text-xl"><span>Total</span><span>{{ store.fmt(tot.total) }}</span></div>

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

          <!-- Popover de descuento -->
          @if (store.discountPanelOpen()) {
            <div class="absolute left-4 right-4 bottom-full mb-2 bg-white rounded-xl border border-gray-100 shadow-xl p-4 space-y-3 z-10">
              <div class="font-bold text-gray-900 text-sm">Aplicar descuento</div>
              <div class="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
                <button (click)="store.setDiscountType('percent')" class="flex-1 py-1.5" [class]="store.discountType() === 'percent' ? 'bg-indigo-600 text-white' : 'text-gray-600'">Porcentaje</button>
                <button (click)="store.setDiscountType('fixed')" class="flex-1 py-1.5 border-l border-gray-200" [class]="store.discountType() === 'fixed' ? 'bg-indigo-600 text-white' : 'text-gray-600'">Valor fijo</button>
              </div>
              <input type="number" min="0" [value]="store.discountValue()" (input)="store.discountValue.set($any($event.target).value)"
                [placeholder]="store.discountType() === 'percent' ? '% descuento' : '$ descuento'"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <input type="text" [value]="store.discountReason()" (input)="store.discountReason.set($any($event.target).value)" placeholder="Motivo"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <div class="flex justify-end gap-2">
                <button (click)="store.cancelDiscount()" class="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
                <button (click)="store.applyDiscount()" class="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700">Aplicar</button>
              </div>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class PosOrderPanelComponent {
  readonly store = inject(PosTerminalStore);
}
