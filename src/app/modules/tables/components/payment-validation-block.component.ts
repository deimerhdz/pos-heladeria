import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { DiningOrder, DiningOrderItem } from '../interfaces/dining.interface';
import { buildMenuLookup } from '../services/menu-lookup';
import { MenuCategory } from '../../products/interfaces/product.interface';
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
  imports: [PaymentAttemptReviewPanelComponent],
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

                spec 073, US7 (FR-022, research.md D14): el total autoritativo y
                su desglose (Subtotal / Descuento / Domicilio / Total) los
                muestra ahora el panel de revisión embebido, calculado por el
                backend. Se retiró la fila de pie con el total local, que sumaba
                el total de línea congelado del carrito — el que "disimulaba el
                fallo".
              -->
              <div class="mb-1">
                <app-payment-attempt-review-panel
                  [order]="order"
                  [cashShiftId]="cashShiftId"
                  (resolved)="refresh.emit()"
                />
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

  variantLabel(variantId: string): string {
    return buildMenuLookup(this.categories).variantLabel(variantId);
  }

  optionLabels(item: DiningOrderItem): string | null {
    const lookup = buildMenuLookup(this.categories);
    const names = (item.options ?? [])
      .map((o) => lookup.optionLabelWithQuantity(o.option_id, o.quantity ?? 1))
      .filter(Boolean);
    return names.length ? names.join(', ') : null;
  }

  time(order: DiningOrder): string {
    return new Date(order.created_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
