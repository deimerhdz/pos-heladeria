import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DinerService } from '../../services/diner.service';
import { DiningOrder } from '../../interfaces/dining.interface';
import { orderStatusClass, orderStatusLabel } from '../../../orders/order-status.util';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { CheckoutProgressStore } from './checkout-progress.store';

/**
 * Paso 4 — confirmación del pedido ya creado (spec 034, FR-008). Solo se
 * llega aquí con un pedido que **ya existe**: `checkoutHydrationGuard` es
 * quien decide entrar acá en vez de a la revisión.
 */
@Component({
  selector: 'app-confirmation-step',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 text-center">
      @if (order(); as o) {
        <span class="w-14 h-14 text-emerald-600 mb-4"><app-icon name="check-circle" /></span>
        <h1 class="text-xl font-bold text-gray-900 mb-1">¡Pedido enviado!</h1>
        <p class="text-sm text-gray-500 mb-4">El personal lo atenderá pronto.</p>

        <div class="w-full max-w-sm bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-left space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold px-2 py-0.5 rounded-full" [class]="orderStatusClass(o.status)">
              {{ orderStatusLabel(o.status) }}
            </span>
            @if (o.current_payment_attempt?.payment_method_name) {
              <span class="text-xs text-gray-400">{{ o.current_payment_attempt!.payment_method_name }}</span>
            }
          </div>
          @if (o.current_payment_attempt?.is_cash) {
            <p class="text-xs text-amber-700">Vas a pagar en efectivo — el personal confirmará al recibirlo.</p>
          } @else if (o.current_payment_attempt?.receipt_file_url) {
            <p class="text-xs text-amber-700">Comprobante enviado — esperando revisión del personal.</p>
          }
        </div>

        <button
          (click)="goToMenu()"
          class="mt-6 w-full max-w-sm py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors"
        >
          Volver al menú
        </button>
      } @else {
        <p class="text-sm text-gray-400">Buscando tu pedido…</p>
      }
    </div>
  `,
})
export class ConfirmationStepComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(DinerService);
  private readonly progress = inject(CheckoutProgressStore);

  private readonly token = this.route.snapshot.paramMap.get('token') ?? '';

  readonly order = signal<DiningOrder | null>(null);

  async ngOnInit(): Promise<void> {
    const fromGuard = this.progress.activeOrder();
    if (fromGuard) {
      this.order.set(fromGuard);
      return;
    }
    // Entrada directa a esta ruta sin pasar por el guard (recarga exacta en
    // esta URL): se resuelve el mismo pedido por su cuenta.
    try {
      const orders = await this.api.myOrders();
      const latest = orders.find((o) => o.status !== 'cancelada') ?? orders[0] ?? null;
      this.order.set(latest);
      if (!latest) this.router.navigate(['/menu/t', this.token]);
    } catch {
      this.router.navigate(['/menu/t', this.token]);
    }
  }

  goToMenu(): void {
    this.progress.activeOrder.set(null);
    this.router.navigate(['/menu/t', this.token]);
  }

  orderStatusLabel(status: string): string {
    return orderStatusLabel(status as DiningOrder['status']);
  }

  orderStatusClass(status: string): string {
    return orderStatusClass(status as DiningOrder['status']);
  }
}
