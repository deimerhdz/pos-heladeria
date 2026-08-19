import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { DiningOrder, DiningOrderItem } from '../interfaces/dining.interface';
import { DiningSessionService } from '../services/dining-session.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { buildMenuLookup } from '../services/menu-lookup';
import { MenuCategory } from '../../products/interfaces/product.interface';
import { PromotionService } from '../../promotions/services/promotion.service';
import { discountedUnitPrice } from '../../promotions/services/promotion-pricing.util';
import { PaymentAttemptReviewPanelComponent } from './payment-attempt-review-panel.component';

/**
 * Pedidos que el comensal envió y esperan que el personal los acepte.
 *
 * Es el paso que compromete el inventario: hasta que alguien confirma, el
 * pedido no ha descontado stock. Por eso no salen en el
 * KDS y hay que pedirlos aparte con `GET /orders?status=recibida`.
 */
@Component({
  selector: 'app-pending-orders-panel',
  standalone: true,
  imports: [DecimalPipe, PaymentAttemptReviewPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      <div class="flex items-center justify-between gap-3 mb-3">
        <p class="text-xs text-gray-500">
          Confirmar descuenta el inventario y manda el pedido a cocina.
        </p>
        <button
          (click)="refresh.emit()"
          class="text-xs font-medium text-gray-400 hover:text-indigo-600 transition-colors shrink-0"
        >
          Actualizar
        </button>
      </div>

      @if (orders.length === 0) {
        <div class="flex flex-col items-center justify-center text-center text-gray-400 py-16 gap-3">
          <div class="text-5xl">🔔</div>
          <p class="text-sm max-w-xs">
            No hay pedidos esperando confirmación. Los que envíen los comensales desde el QR
            aparecerán aquí.
          </p>
        </div>
      } @else {
        <div class="space-y-3">
          @for (order of orders; track order.id) {
            <div class="border border-violet-100 bg-violet-50/40 rounded-xl p-3">
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-xs font-semibold text-violet-700">
                  {{ order.customer_name || 'Comensal' }}
                </span>
                <span class="text-xs text-gray-400">{{ time(order) }}</span>
              </div>

              <ul class="space-y-0.5 mb-2">
                @for (item of order.items ?? []; track item.id) {
                  <li class="text-sm text-gray-700">
                    <span class="font-medium">{{ item.quantity }}×</span>
                    {{ variantLabel(item.product_variant_id) }}
                    @if (optionLabels(item); as opts) {
                      <span class="block text-xs text-gray-500 pl-5">{{ opts }}</span>
                    }
                    @if (item.notes) {
                      <span class="block text-xs text-gray-400 pl-5 italic">“{{ item.notes }}”</span>
                    }
                  </li>
                }
              </ul>

              <!--
                spec 024: la orden solo avanza a comanda con un intento de
                pago confirmado — este panel es el paso de revisión del
                cajero que produce ese "confirmado" (aprobar comprobante o
                confirmar efectivo).
              -->
              <div class="mb-2">
                <app-payment-attempt-review-panel
                  [order]="order"
                  (resolved)="refresh.emit()"
                />
              </div>

              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-semibold text-gray-900">
                  $ {{ total(order) | number: '1.2-2' }}
                </span>
                <div class="flex items-center gap-2">
                  <button
                    (click)="reject(order)"
                    [disabled]="busy() === order.id"
                    class="px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors"
                  >
                    Rechazar
                  </button>
                  <button
                    (click)="confirm(order)"
                    [disabled]="busy() === order.id || !isPaymentConfirmed(order)"
                    [title]="
                      isPaymentConfirmed(order)
                        ? ''
                        : 'La orden necesita un pago confirmado antes de enviarse a comanda'
                    "
                    class="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                  >
                    {{ busy() === order.id ? 'Confirmando...' : 'Confirmar' }}
                  </button>
                </div>
              </div>

              @if (stockError() === order.id) {
                <p class="text-xs text-red-600 mt-2">
                  {{ errorMessage() }} El pedido sigue pendiente: repón el insumo y reintenta, o
                  recházalo.
                </p>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class PendingOrdersPanelComponent {
  @Input() orders: DiningOrder[] = [];
  @Input() categories: MenuCategory[] = [];
  @Output() refresh = new EventEmitter<void>();

  private readonly api = inject(DiningSessionService);
  private readonly toast = inject(ToastService);
  private readonly promotionService = inject(PromotionService);

  readonly busy = signal<string | null>(null);
  /** Id del pedido cuyo intento de confirmación falló por stock. */
  readonly stockError = signal<string | null>(null);
  readonly errorMessage = signal<string>('');

  constructor() {
    // El total mostrado aplica los descuentos vigentes; sin esto el panel
    // dependía de que otra pantalla hubiera cargado las promociones primero.
    this.promotionService.loadActive();
  }

  variantLabel(variantId: string): string {
    return buildMenuLookup(this.categories).variantLabel(variantId);
  }

  /**
   * Sabores elegidos por el comensal. Confirmar es lo que descuenta el inventario, y
   * la cantidad depende de qué opción se eligió, así que el mesero tiene que verlo
   * antes de aceptar. Devuelve `null` (no cadena vacía) para que el `@if` no pinte
   * una línea en blanco.
   */
  optionLabels(item: DiningOrderItem): string | null {
    const lookup = buildMenuLookup(this.categories);
    const names = (item.options ?? [])
      .map((o) => lookup.optionLabel(o.option_id))
      .filter(Boolean);
    return names.length ? names.join(', ') : null;
  }

  total(order: DiningOrder): number {
    const lk = buildMenuLookup(this.categories);
    const now = new Date();
    const promos = this.promotionService.activePromotions();
    return (order.items ?? []).reduce((s, i) => {
      if (i.combo_id) return s + Number(i.unit_price) * i.quantity;
      const unitPrice = discountedUnitPrice(
        promos,
        now,
        lk.productId(i.product_variant_id),
        lk.categoryId(i.product_variant_id),
        Number(i.unit_price),
        i.quantity,
      );
      return s + unitPrice * i.quantity;
    }, 0);
  }

  /** spec 024, FR-017: gate visual — el backend ya lo exige, esto solo evita
   *  un 409 predecible deshabilitando el botón de antemano. */
  isPaymentConfirmed(order: DiningOrder): boolean {
    return order.current_payment_attempt?.status === 'confirmado';
  }

  time(order: DiningOrder): string {
    return new Date(order.created_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /** Acepta el pedido: descuenta inventario y lo manda a cocina. */
  async confirm(order: DiningOrder): Promise<void> {
    this.busy.set(order.id);
    this.stockError.set(null);
    try {
      await this.api.confirmOrder(order.id);
      this.toast.success('Pedido confirmado y enviado a cocina');
      this.refresh.emit();
    } catch (err) {
      // Un 400 aquí es falta de stock. El pedido **no** cambia de estado, así
      // que se puede reintentar tras reponer: no es un fallo terminal.
      this.errorMessage.set(this.api.extractError(err, 'No se pudo confirmar el pedido.'));
      this.stockError.set(order.id);
    } finally {
      this.busy.set(null);
    }
  }

  async reject(order: DiningOrder): Promise<void> {
    this.busy.set(order.id);
    try {
      await this.api.cancelOrder(order.id, 'Rechazado por el personal');
      this.toast.info('Pedido rechazado');
      this.refresh.emit();
    } catch (err) {
      this.toast.error(this.api.extractError(err, 'No se pudo rechazar el pedido.'));
    } finally {
      this.busy.set(null);
    }
  }
}
