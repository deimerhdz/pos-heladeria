import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { formatMoney } from '../../../shared/money';

/**
 * Desglose de cuenta reutilizable (Subtotal/Descuento/Domicilio/Total):
 * mismas filas, mismo formato de dinero (`formatMoney`, "$ 17.000") en las
 * 4+ pantallas que antes lo duplicaban con formatos distintos (store.fmt(),
 * toFixed(2) manual, DecimalPipe) -- pos-checkout-panel,
 * payment-attempt-review-panel, manual-order-page y session-bill-panel.
 *
 * Puramente presentacional: no conoce el store ni de dónde salen los
 * números, solo pinta filas. El contenedor (caja/borde/fondo) lo sigue
 * poniendo cada pantalla, porque varía bastante entre ellas.
 */
@Component({
  selector: 'app-bill-summary',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (subtotal !== undefined) {
      <div class="flex justify-between items-center text-[13px] text-[#6b7280]">
        <span>{{ subtotalLabel }}</span>
        <span class="font-mono font-medium text-[#111827] tabular-nums">{{ money(subtotal) }}</span>
      </div>
    }
    @if (discount > 0) {
      <div class="flex justify-between items-center text-[13px] text-[#15803d]">
        <span>Descuento</span>
        <span class="font-mono font-medium tabular-nums">− {{ money(discount) }}</span>
      </div>
    }
    @if (deliveryFee > 0) {
      <div class="flex justify-between items-center text-[13px] text-[#6b7280] pt-0.5">
        <span class="flex items-center gap-1" [class]="showDeliveryIcon ? 'text-[#111827] font-medium' : ''">
          @if (showDeliveryIcon) {
            <svg class="w-[15px] h-[15px] text-[#4f46e5]" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" viewBox="0 0 24 24">
              <circle cx="5.5" cy="17.5" r="3.5"></circle>
              <circle cx="18.5" cy="17.5" r="3.5"></circle>
              <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm-3 11.5V14l-3-3 4-3 2 3h2"></path>
            </svg>
          }
          {{ deliveryFeeLabel }}
        </span>
        <span
          class="font-mono font-semibold tabular-nums"
          [class]="showDeliveryIcon ? 'text-[#4f46e5]' : 'text-[#111827]'"
          >{{ showDeliveryIcon ? '+' : '' }}{{ money(deliveryFee) }}</span
        >
      </div>
    }
    <div
      class="flex justify-between items-baseline"
      [class]="totalBorder && (subtotal !== undefined || discount > 0 || deliveryFee > 0) ? 'border-t border-[#e5e7eb] mt-0.5 pt-1.5' : ''"
    >
      <span
        class="font-bold tracking-tight text-[#111827]"
        [class]="size === 'lg' ? 'text-[14px]' : size === 'md' ? 'text-[14px]' : 'text-[13px]'"
        >{{ totalLabel }}</span
      >
      <span
        class="font-mono font-bold tabular-nums tracking-tight leading-none text-[#111827]"
        [class]="size === 'lg' ? 'text-[30px]' : size === 'md' ? 'text-[26px] font-extrabold' : 'text-[19px]'"
        >{{ money(total) }}</span
      >
    </div>
  `,
})
export class BillSummaryComponent {
  @Input() subtotal?: number;
  @Input() subtotalLabel = 'Subtotal';
  @Input() discount = 0;
  @Input() deliveryFee = 0;
  @Input() deliveryFeeLabel = 'Domicilio';
  @Input() showDeliveryIcon = false;
  @Input({ required: true }) total!: number;
  @Input() totalLabel = 'Total';
  @Input() size: 'sm' | 'md' | 'lg' = 'sm';
  @Input() totalBorder = true;

  money(n: number): string {
    return formatMoney(n);
  }
}
