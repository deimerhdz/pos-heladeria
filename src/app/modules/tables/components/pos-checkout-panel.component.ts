import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PosTerminalStore } from '../services/pos-terminal.store';

/** Columna derecha: total, método de pago y cobro (block → pay). */
@Component({
  selector: 'app-pos-checkout-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="w-full sm:w-[320px] shrink-0 flex flex-col border-l border-gray-200 min-h-0 bg-white">
      <div class="flex-1 overflow-y-auto p-4 space-y-3">
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <div class="text-[11px] uppercase tracking-wide text-indigo-600 font-semibold">Total a pagar</div>
          <div class="text-3xl font-extrabold text-gray-900">{{ store.fmt(store.totals().total) }}</div>

          @if (!store.selectedOrder()) {
            <p class="text-xs text-gray-400">Guarda el pedido para poder cobrarlo.</p>
          }

          <div class="border-t border-gray-100 my-1"></div>
          <div class="text-sm font-semibold text-gray-800">Método de pago</div>
          <div class="space-y-1.5">
            @for (m of store.paymentMethods(); track m.id) {
              <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="payMethod" [checked]="store.paymentMethod() === m.id" (change)="store.setPaymentMethod(m.id)" class="accent-indigo-600" />
                <span>{{ m.name }}</span>
              </label>
            }
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="payMethod" [checked]="store.paymentMethod() === 'mixto'" (change)="store.setPaymentMethod('mixto')" class="accent-indigo-600" />
              <span>Pago mixto</span>
            </label>
          </div>

          @if (store.selectedMethodIsCash() && store.paymentMethod() !== 'mixto') {
            <div class="pt-1">
              <label class="block text-[11px] font-medium text-gray-500 mb-1">Cliente entrega</label>
              <input type="number" min="0" [value]="store.cashReceived()" (input)="store.cashReceived.set($any($event.target).value)" placeholder="0"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <div class="flex justify-between text-sm mt-1.5">
                <span>Cambio</span><span class="font-bold">{{ store.fmt(store.change()) }}</span>
              </div>
            </div>
          }

          @if (store.paymentMethod() === 'mixto') {
            <div class="space-y-2 pt-1">
              @for (l of store.mixedLines(); track $index) {
                <div class="flex gap-2 items-center">
                  <select [value]="l.payment_method_id" (change)="store.updateMixedLine($index, { payment_method_id: $any($event.target).value })"
                    class="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm">
                    @for (m of store.paymentMethods(); track m.id) {
                      <option [value]="m.id">{{ m.name }}</option>
                    }
                  </select>
                  <input type="number" min="0" [value]="l.amount" (input)="store.updateMixedLine($index, { amount: $any($event.target).value })" placeholder="0"
                    class="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right" />
                  <button (click)="store.removeMixedLine($index)" class="text-gray-400 hover:text-red-500">✕</button>
                </div>
              }
              <button (click)="store.addMixedLine()" class="w-full py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">+ Agregar línea</button>
              <div class="flex justify-between text-sm"><span>Total recibido</span><span class="font-bold">{{ store.fmt(store.mixedReceived()) }}</span></div>
              <div class="text-xs text-gray-500">
                {{ store.mixedReceived() >= store.totals().total ? ('Cambio: ' + store.fmt(store.mixedReceived() - store.totals().total)) : ('Faltan: ' + store.fmt(store.totals().total - store.mixedReceived())) }}
              </div>
            </div>
          }
        </div>
      </div>

      <div class="p-4 border-t border-gray-200 bg-gray-50 shrink-0">
        <button
          (click)="store.cobrar()"
          [disabled]="store.chargeDisabled()"
          class="w-full py-3 bg-indigo-600 text-white rounded-xl text-base font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors"
        >
          {{ store.submitting() ? 'Cobrando…' : 'Cobrar pedido (F8)' }}
        </button>
      </div>
    </div>
  `,
})
export class PosCheckoutPanelComponent {
  readonly store = inject(PosTerminalStore);
}
