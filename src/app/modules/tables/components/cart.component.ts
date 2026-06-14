import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MenuCartService } from '../services/menu-cart.service';
import { CartItemResponse } from '../interfaces/table.interface';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col h-full">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-base font-bold text-gray-900">Carrito de la mesa</h2>
        <button
          (click)="cart.refresh()"
          [disabled]="cart.loading()"
          class="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50 transition-colors"
        >
          ↻ Actualizar
        </button>
      </div>

      <!-- Confirmación de orden -->
      @if (cart.lastOrderConfirmed()) {
        <div class="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-3 text-center">
          <p class="text-green-700 font-medium text-sm">¡Orden enviada!</p>
          <p class="text-green-600 text-xs mt-0.5">El personal la atenderá pronto</p>
        </div>
      }

      <!-- Vacío -->
      @if (!cart.hasItems()) {
        <div class="flex-1 flex flex-col items-center justify-center text-center py-6">
          <div class="text-4xl mb-2">🛒</div>
          <p class="text-sm text-gray-400">Aún no hay ítems en la mesa</p>
        </div>
      } @else {
        <div class="flex-1 overflow-y-auto space-y-4 mb-3">
          <!-- Mis ítems (editables) -->
          @if (cart.myItems().length > 0) {
            <div>
              <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Mis ítems</p>
              <div class="space-y-2">
                @for (item of cart.myItems(); track item.id) {
                  <div class="flex items-center gap-2">
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium text-gray-800 truncate">{{ item.product_name }}</p>
                      <p class="text-xs text-gray-400">$ {{ +item.unit_price | number:'1.2-2' }} c/u</p>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                      <button
                        (click)="cart.setQuantity(item.id, item.quantity - 1)"
                        [disabled]="cart.isSubmitting()"
                        class="w-7 h-7 rounded-full bg-gray-100 hover:bg-red-100 text-gray-600 hover:text-red-600 text-sm font-bold flex items-center justify-center transition-colors disabled:opacity-50"
                      >
                        −
                      </button>
                      <span class="w-6 text-center text-sm font-semibold text-gray-900">{{ item.quantity }}</span>
                      <button
                        (click)="cart.incrementProduct(item.product_id)"
                        [disabled]="cart.isSubmitting()"
                        class="w-7 h-7 rounded-full bg-gray-100 hover:bg-indigo-100 text-gray-600 hover:text-indigo-600 text-sm font-bold flex items-center justify-center transition-colors disabled:opacity-50"
                      >
                        +
                      </button>
                    </div>
                    <span class="text-sm font-semibold text-indigo-600 w-16 text-right shrink-0">
                      $ {{ +item.subtotal | number:'1.2-2' }}
                    </span>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Ítems de otros comensales (solo lectura) -->
          @if (cart.otherItems().length > 0) {
            <div>
              <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Otros comensales</p>
              <div class="space-y-1.5">
                @for (item of cart.otherItems(); track item.id) {
                  <div class="flex items-center gap-2 opacity-80">
                    <div class="flex-1 min-w-0">
                      <p class="text-sm text-gray-700 truncate">{{ item.product_name }}</p>
                      <p class="text-xs text-gray-400">{{ item.customer_name }} · × {{ item.quantity }}</p>
                    </div>
                    <span class="text-sm text-gray-600 shrink-0">$ {{ +item.subtotal | number:'1.2-2' }}</span>
                  </div>
                }
              </div>
            </div>
          }
        </div>

        <!-- Total de la mesa -->
        <div class="border-t border-gray-100 pt-3 mb-3">
          <div class="flex justify-between items-center">
            <span class="text-sm font-semibold text-gray-700">Total mesa</span>
            <span class="text-base font-bold text-gray-900">$ {{ +cart.total() | number:'1.2-2' }}</span>
          </div>
        </div>
      }

      <!-- Error -->
      @if (cart.error()) {
        <div class="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          <p class="text-red-600 text-xs">{{ cart.error() }}</p>
        </div>
      }

      <!-- Acciones de orden -->
      <div class="space-y-2 mt-auto">
        <button
          (click)="cart.createOrder('individual')"
          [disabled]="!cart.hasMyItems() || cart.isSubmitting()"
          class="w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {{ cart.isSubmitting() ? 'Enviando...' : 'Pedir mi orden' }}
        </button>
        <button
          (click)="cart.createOrder('table')"
          [disabled]="!cart.hasItems() || cart.isSubmitting()"
          class="w-full py-2.5 border-2 border-indigo-300 text-indigo-700 hover:bg-indigo-50 text-sm font-semibold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Pedir orden de la mesa
        </button>
      </div>
    </div>
  `,
})
export class CartComponent {
  readonly cart = inject(MenuCartService);

  readonly myTotal = computed(() =>
    this.cart.myItems().reduce((sum, i: CartItemResponse) => sum + Number(i.subtotal), 0),
  );
}
