import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { MoneyPipe } from '../../../shared/money.pipe';
import { DiningCartService } from '../services/dining-cart.service';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col h-full">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-base font-bold text-gray-900">Mi pedido</h2>
      </div>

      <!-- Empty -->
      @if (cart.isEmpty()) {
        <div class="flex-1 flex flex-col items-center justify-center text-center py-6">
          <div class="text-4xl mb-2">🛒</div>
          <p class="text-sm text-gray-400">Aún no has agregado nada</p>
        </div>
      } @else {
        <div class="flex-1 overflow-y-auto space-y-3 mb-3">
          @for (line of cart.lines(); track line.id) {
            <div class="flex items-start gap-2">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-800 truncate">
                  {{ line.productName }} · {{ line.variantName }}
                </p>
                @if (line.optionNames.length > 0) {
                  <p class="text-xs text-gray-400 truncate">
                    {{ line.optionNames.join(', ') }}
                  </p>
                }
                @if (line.notes) {
                  <p class="text-xs text-gray-400 italic truncate">“{{ line.notes }}”</p>
                }
                <p class="text-xs text-gray-400">{{ line.unitPrice | money }} c/u</p>
              </div>
              <!-- 44 px: el objetivo táctil mínimo cómodo con el pulgar. -->
              <div class="flex items-center gap-1 shrink-0">
                <button
                  (click)="quantityChanged.emit({ itemId: line.id, quantity: line.quantity - 1 })"
                  [disabled]="cart.busy()"
                  [attr.aria-label]="line.quantity === 1 ? 'Quitar del pedido' : 'Quitar uno'"
                  class="w-11 h-11 rounded-full bg-gray-100 hover:bg-red-100 text-gray-600 hover:text-red-600 text-xl font-bold leading-none flex items-center justify-center transition-colors disabled:opacity-40"
                >
                  −
                </button>
                <span class="w-8 text-center text-base font-semibold text-gray-900">{{ line.quantity }}</span>
                <button
                  (click)="quantityChanged.emit({ itemId: line.id, quantity: line.quantity + 1 })"
                  [disabled]="cart.busy()"
                  aria-label="Añadir uno"
                  class="w-11 h-11 rounded-full bg-gray-100 hover:bg-indigo-100 text-gray-600 hover:text-indigo-600 text-xl font-bold leading-none flex items-center justify-center transition-colors disabled:opacity-40"
                >
                  +
                </button>
              </div>
              <span class="text-sm font-semibold text-indigo-600 w-16 text-right shrink-0">
                {{ line.lineTotal | money }}
              </span>
            </div>
          }
        </div>

        <!-- Total -->
        <div class="border-t border-gray-100 pt-3 mb-3">
          <div class="flex justify-between items-center">
            <span class="text-sm font-semibold text-gray-700">Total</span>
            <span class="text-base font-bold text-gray-900">{{ cart.total() | money }}</span>
          </div>
        </div>
      }

      <!-- Error -->
      @if (error) {
        <div class="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          <p class="text-red-600 text-xs">{{ error }}</p>
        </div>
      }

      <button
        (click)="submitOrder.emit()"
        [disabled]="cart.isEmpty() || submitting"
        class="w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors mt-auto"
      >
        {{ submitting ? 'Enviando...' : 'Enviar pedido' }}
      </button>
    </div>
  `,
})
export class CartComponent {
  @Input() submitting = false;
  @Input() error: string | null = null;
  @Output() submitOrder = new EventEmitter<void>();
  /** El carrito vive en el backend: la mutación la hace el padre y puede fallar. */
  @Output() quantityChanged = new EventEmitter<{ itemId: string; quantity: number }>();

  readonly cart = inject(DiningCartService);
}
