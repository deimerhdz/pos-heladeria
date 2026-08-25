import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DiningCartService } from '../../services/dining-cart.service';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { MoneyPipe } from '../../../../shared/money.pipe';
import { CheckoutStepIndicatorComponent } from './checkout-step-indicator.component';

/**
 * Paso 1 — resumen del pedido (spec 034, US2, FR-001). Sustituye al primer
 * medio del modal retirado (`reviewStep() === 'method'` en la versión vieja,
 * que mezclaba resumen y selección de método en la misma pantalla): aquí solo
 * se revisa el carrito; elegir método vive en su propio paso.
 */
@Component({
  selector: 'app-review-step',
  standalone: true,
  imports: [IconComponent, MoneyPipe, CheckoutStepIndicatorComponent],
  template: `
    <div class="min-h-screen bg-gray-50 flex flex-col">
      <div class="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div class="max-w-lg mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <span class="w-7"></span>
          <app-checkout-step-indicator [step]="1" [total]="3" label="Revisa tu pedido" />
          <button (click)="exit()" aria-label="Salir sin enviar" class="p-1 -mr-1 text-gray-400 hover:text-red-600 transition-colors">
            <span class="w-5 h-5 block"><app-icon name="close" /></span>
          </button>
        </div>
      </div>

      <div class="flex-1 max-w-lg w-full mx-auto px-4 py-6">
        <h1 class="text-lg font-bold text-gray-900 mb-4">Tu pedido</h1>

        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
          @for (line of cart.lines(); track line.id) {
            <div class="flex items-start justify-between gap-2 text-sm">
              <div class="min-w-0">
                <p class="text-gray-800 truncate">
                  <span class="font-medium">{{ line.quantity }}×</span>
                  {{ line.productName }} · {{ line.variantName }}
                </p>
                @if (line.optionNames.length > 0) {
                  <p class="text-xs text-gray-400 truncate">{{ line.optionNames.join(', ') }}</p>
                }
                @if (line.notes) {
                  <p class="text-xs text-gray-400 italic truncate">"{{ line.notes }}"</p>
                }
              </div>
              <span class="text-gray-700 font-medium shrink-0">{{ line.lineTotal | money }}</span>
            </div>
          }
          <div class="flex justify-between items-center border-t border-gray-100 pt-3 mt-1">
            <span class="text-sm font-semibold text-gray-700">Total</span>
            <span class="text-base font-bold text-gray-900">{{ cart.total() | money }}</span>
          </div>
        </div>

        <button
          (click)="continue()"
          [disabled]="cart.isEmpty()"
          class="mt-6 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
        >
          Elegir método de pago
        </button>
      </div>
    </div>
  `,
})
export class ReviewStepComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly cart = inject(DiningCartService);

  private readonly token = this.route.snapshot.paramMap.get('token') ?? '';

  continue(): void {
    if (this.cart.isEmpty()) return;
    this.router.navigate(['/menu/t', this.token, 'checkout', 'method']);
  }

  /** Salir sin enviar (FR-004): no crea ningún pedido, el carrito no se toca. */
  exit(): void {
    this.router.navigate(['/menu/t', this.token]);
  }
}
