import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { CartService } from '../services/cart.service';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col h-full">
      <h2 class="text-base font-bold text-gray-900 mb-3">Tu consumo</h2>

      <!-- Ítems ya confirmados en la sesión -->
      @if (cart.myConfirmedItems().length > 0) {
        <div class="mb-3">
          <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Ya pediste</p>
          <div class="space-y-1.5 mb-2">
            @for (item of cart.myConfirmedItems(); track $index) {
              <div class="flex items-center gap-2 opacity-70">
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-gray-700 truncate">{{ item.product_name }}</p>
                  <p class="text-xs text-gray-400">× {{ item.quantity }}</p>
                </div>
                <span class="text-sm text-gray-600 shrink-0">$ {{ item.subtotal | number:'1.2-2' }}</span>
              </div>
            }
          </div>
          <div class="border-t border-dashed border-gray-200 pt-2">
            <div class="flex justify-between items-center text-xs text-gray-500">
              <span>Tu subtotal confirmado</span>
              <span class="font-semibold">$ {{ confirmedSubtotal() | number:'1.2-2' }}</span>
            </div>
          </div>
        </div>

        @if (cart.items().length > 0) {
          <div class="border-t border-gray-100 my-2"></div>
          <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Agregar ahora</p>
        }
      }

      <!-- Carrito local vacío y sin ítems confirmados -->
      @if (cart.items().length === 0 && cart.myConfirmedItems().length === 0 && !cart.orderConfirmed()) {
        <div class="flex-1 flex flex-col items-center justify-center text-center py-6">
          <div class="text-4xl mb-2">🛒</div>
          <p class="text-sm text-gray-400">Aún no has agregado ítems</p>
        </div>
      }

      <!-- Confirmación de pedido -->
      @if (cart.orderConfirmed() && cart.items().length === 0) {
        <div class="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-3 text-center">
          <p class="text-green-700 font-medium text-sm">¡Pedido enviado!</p>
          <p class="text-green-600 text-xs mt-0.5">El personal lo atenderá pronto</p>
        </div>
      }

      <!-- Lista ítems del carrito local (pendientes) -->
      @if (cart.items().length > 0) {
        <div class="flex-1 overflow-y-auto space-y-2 mb-3">
          @for (item of cart.items(); track item.product.id) {
            <div class="flex items-center gap-2">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-800 truncate">{{ item.product.name }}</p>
                <p class="text-xs text-gray-400">$ {{ item.product.price | number:'1.2-2' }} c/u</p>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button
                  (click)="cart.removeItem(item.product.id)"
                  class="w-7 h-7 rounded-full bg-gray-100 hover:bg-red-100 text-gray-600 hover:text-red-600 text-sm font-bold flex items-center justify-center transition-colors"
                >
                  −
                </button>
                <span class="w-6 text-center text-sm font-semibold text-gray-900">{{ item.quantity }}</span>
                <button
                  (click)="cart.addItem(item.product)"
                  class="w-7 h-7 rounded-full bg-gray-100 hover:bg-indigo-100 text-gray-600 hover:text-indigo-600 text-sm font-bold flex items-center justify-center transition-colors"
                >
                  +
                </button>
              </div>
              <span class="text-sm font-semibold text-indigo-600 w-16 text-right shrink-0">
                $ {{ item.product.price * item.quantity | number:'1.2-2' }}
              </span>
            </div>
          }
        </div>

        <!-- Subtotal personal -->
        <div class="border-t border-gray-100 pt-3 mb-3">
          <div class="flex justify-between items-center">
            <span class="text-sm font-semibold text-gray-700">Mi subtotal</span>
            <span class="text-base font-bold text-gray-900">$ {{ cart.personalTotal() | number:'1.2-2' }}</span>
          </div>
        </div>
      }

      <!-- Error -->
      @if (cart.error()) {
        <div class="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          <p class="text-red-600 text-xs">{{ cart.error() }}</p>
        </div>
      }

      <!-- Botones de acción -->
      <div class="space-y-2 mt-auto">
        <!-- Solicitar orden -->
        <button
          (click)="cart.placeOrder()"
          [disabled]="cart.items().length === 0 || cart.isSubmitting() || billRequested()"
          class="w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          @if (cart.isSubmitting()) {
            Enviando...
          } @else if (billRequested()) {
            Cuenta solicitada — sin más pedidos
          } @else {
            Solicitar orden
          }
        </button>

        <!-- Pedir la cuenta -->
        @if (cart.lastOrderId() && !billRequested()) {
          <button
            (click)="cart.requestBill()"
            [disabled]="cart.isSubmitting()"
            class="w-full py-2.5 border-2 border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50 text-sm font-semibold rounded-xl transition-colors"
          >
            Pedir la cuenta
          </button>
        }

        @if (cart.lastOrderId() && billRequested()) {
          <div class="w-full py-2.5 text-center border-2 border-green-300 text-green-600 bg-green-50 text-sm font-semibold rounded-xl">
            Cuenta solicitada ✓
          </div>
        }
      </div>
    </div>
  `,
})
export class CartComponent {
  readonly cart = inject(CartService);

  readonly confirmedSubtotal = () =>
    this.cart.myConfirmedItems().reduce((sum, item) => sum + item.subtotal, 0);

  readonly billRequested = () =>
    this.cart.billRequested() || this.cart.activeSession()?.orderStatus === 'bill_requested';
}
