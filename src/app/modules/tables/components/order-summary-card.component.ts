import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Tarjeta reutilizable (spec 059, FR-005): mismo formato visual para una
 * mesa (`pos-tables-panel.component.ts`, extraído aquí sin cambios de
 * comportamiento) y para un pedido de Domicilio/Para llevar sin mesa. Es
 * puramente presentacional — no conoce `PosTerminalStore` ni de dónde viene
 * el dato, solo recibe props ya resueltos y emite `select` al hacer clic.
 */
@Component({
  selector: 'app-order-summary-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // `contents`: el host no debe tener caja propia — el <button> de adentro
  // necesita ser hijo directo del contenedor flex/scroll del padre (mismo
  // rol que tenía el <button> inline antes de extraerlo a este componente,
  // spec 059 Foundational). Sin esto, el host por defecto es `inline` y el
  // cálculo de ancho `w-[calc(...)]` del botón deja de dimensionarse contra
  // el carrusel, rompiendo el layout de las tarjetas.
  host: { class: 'contents' },
  template: `
    <button
      type="button"
      (click)="select.emit()"
      class="shrink-0 w-[calc((100%-2.25rem)/4)] text-left bg-white rounded-xl border p-3 space-y-2 min-h-11 transition-colors hover:border-indigo-300"
      [class]="selected ? 'border-indigo-500 ring-1 ring-indigo-200' : 'border-gray-200'"
    >
      <div class="flex items-center justify-between gap-2">
        <span class="text-lg font-bold text-gray-900">{{ title }}</span>
        <span class="text-sm font-semibold px-2 py-1 rounded-full" [class]="statusClass">{{ statusLabel }}</span>
      </div>
      <div class="flex items-center justify-between text-base text-gray-600">
        <span>{{ secondaryLabel }}</span>
        <span>🕐 {{ elapsedLabel }}</span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-lg font-bold text-gray-900">{{ totalLabel }}</span>
        @if (ordersCount && ordersCount > 1) {
          <span class="text-sm px-2 py-1 rounded-full bg-gray-100 text-gray-600">{{ ordersCount }} pedidos</span>
        }
      </div>
    </button>
  `,
})
export class OrderSummaryCardComponent {
  @Input({ required: true }) title!: string;
  @Input({ required: true }) statusLabel!: string;
  @Input({ required: true }) statusClass!: string;
  @Input({ required: true }) secondaryLabel!: string;
  @Input({ required: true }) elapsedLabel!: string;
  @Input({ required: true }) totalLabel!: string;
  @Input() ordersCount?: number;
  @Input() selected = false;

  @Output() select = new EventEmitter<void>();
}
