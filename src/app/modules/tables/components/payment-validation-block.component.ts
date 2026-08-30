import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { DiningOrder, DiningOrderItem } from '../interfaces/dining.interface';
import { buildMenuLookup } from '../services/menu-lookup';
import { MenuCategory } from '../../products/interfaces/product.interface';
import { PromotionService } from '../../promotions/services/promotion.service';
import { discountedUnitPrice } from '../../promotions/services/promotion-pricing.util';
import { PaymentAttemptReviewPanelComponent } from './payment-attempt-review-panel.component';

/**
 * Bloque de validación de pagos QR (feature 028, T005): reemplaza el
 * contenido combinado de las antiguas pestañas "Pedido de la mesa" /
 * "Pagos por confirmar" — una tarjeta **independiente** por pedido/comensal,
 * cada una con su propio `app-payment-attempt-review-panel` embebido.
 *
 * "Independiente" es literal: confirmar o rechazar el pago de una tarjeta no
 * debe tocar el estado de ninguna otra — cada `payment-attempt-review-panel`
 * carga y resuelve su propio intento de pago sin compartir estado con sus
 * hermanas (spec 026/024).
 *
 * Spec 044 revierte, para pago en efectivo y transferencia sin comprobante
 * aún, la Decisión D5 de spec 028 (que había retirado de aquí, a propósito,
 * el botón "Rechazar" a nivel de pedido completo del extinto
 * `pending-orders-panel`): esos dos casos ahora sí pueden rechazar el pedido
 * completo, con motivo obligatorio, desde el mismo panel embebido. La
 * transferencia con comprobante ya subido conserva su "Rechazar" de
 * siempre (rechaza el intento de pago, permite reintentar) — D5 sigue
 * vigente solo para ese caso.
 */
@Component({
  selector: 'app-payment-validation-block',
  standalone: true,
  imports: [DecimalPipe, PaymentAttemptReviewPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      <div class="flex items-center justify-between gap-3 mb-3">
        <p class="text-sm text-gray-500">
          Aprobar el comprobante o confirmar el efectivo envía el pedido a cocina de inmediato.
        </p>
        <button
          (click)="refresh.emit()"
          class="text-sm font-medium text-gray-400 hover:text-indigo-600 transition-colors shrink-0"
        >
          Actualizar
        </button>
      </div>

      @if (orders.length === 0) {
        <div class="flex flex-col items-center justify-center text-center text-gray-400 py-16 gap-3">
          <div class="text-5xl">🔔</div>
          <p class="text-sm max-w-xs">
            No hay pagos esperando revisión en esta mesa.
          </p>
        </div>
      } @else {
        <div class="space-y-3">
          @for (order of orders; track order.id) {
            <div class="border border-violet-100 bg-violet-50/40 rounded-xl p-3">
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-base font-semibold text-violet-700">
                  {{ order.customer_name || 'Comensal' }}
                </span>
                <span class="text-sm text-gray-400">{{ time(order) }}</span>
              </div>

              <ul class="space-y-0.5 mb-2">
                @for (item of order.items ?? []; track item.id) {
                  <li class="text-base text-gray-700">
                    <span class="font-medium">{{ item.quantity }}×</span>
                    {{ variantLabel(item.product_variant_id) }}
                    @if (optionLabels(item); as opts) {
                      <span class="block text-sm text-gray-500 pl-5">{{ opts }}</span>
                    }
                    @if (item.notes) {
                      <span class="block text-sm text-gray-400 pl-5 italic">“{{ item.notes }}”</span>
                    }
                  </li>
                }
              </ul>

              <!--
                spec 024: la orden solo avanza a comanda con un intento de
                pago confirmado — este panel es el paso de revisión del
                cajero que produce ese "confirmado" (aprobar comprobante o
                confirmar efectivo). Cada tarjeta es independiente: solo lee
                el pedido que le toca, no el estado de las demás.
              -->
              <div class="mb-2">
                <app-payment-attempt-review-panel
                  [order]="order"
                  [cashShiftId]="cashShiftId"
                  (resolved)="refresh.emit()"
                />
              </div>

              <div class="flex items-center justify-end gap-2">
                <span class="text-lg font-bold text-gray-900">
                  $ {{ total(order) | number: '1.2-2' }}
                </span>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class PaymentValidationBlockComponent {
  /** Pedidos `qr` en `recibida` de la mesa seleccionada — ya filtrados por el
   *  store (`pendingOfSelectedTable`, feature 028 T010: solo canal `qr`). */
  @Input() orders: DiningOrder[] = [];
  @Input() categories: MenuCategory[] = [];
  /** Turno de caja abierto (feature 028) — ver
   *  `PaymentAttemptReviewPanelComponent.cashShiftId`. */
  @Input() cashShiftId: string | null = null;
  @Output() refresh = new EventEmitter<void>();

  private readonly promotionService = inject(PromotionService);

  constructor() {
    // El total mostrado aplica los descuentos vigentes; sin esto el panel
    // dependía de que otra pantalla hubiera cargado las promociones primero.
    this.promotionService.loadActive();
  }

  variantLabel(variantId: string): string {
    return buildMenuLookup(this.categories).variantLabel(variantId);
  }

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

  time(order: DiningOrder): string {
    return new Date(order.created_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
