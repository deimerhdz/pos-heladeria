import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PosTerminalStore } from '../services/pos-terminal.store';

/**
 * Estado vacío de una mesa libre (feature 028, T021): se ve solo en el caso
 * borde de una mesa que queda libre mientras seguía seleccionada (spec 036,
 * ajuste posterior — el flujo normal ya no pasa por aquí: seleccionar una
 * mesa libre desde la grilla va directo a `manual-order-page.component.ts`,
 * la vista dedicada de armado de pedido). El CTA lleva a esa misma vista en
 * vez de abrir el catálogo embebido de antes (`store.startManualOrder()`
 * queda sin uso, se deja intacto por si algún flujo futuro lo necesita).
 */
@Component({
  selector: 'app-manual-order-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex-1 flex flex-col min-h-0' },
  template: `
    <div class="flex-1 flex flex-col items-center justify-center text-center p-8 gap-4">
      <div class="text-5xl">🧾</div>
      <div class="space-y-1">
        <h3 class="text-lg font-bold text-gray-900">Mesa {{ store.selectedTable()?.number }} libre</h3>
        <p class="text-sm text-gray-400 max-w-xs">
          Crea un pedido de mostrador para esta mesa: se cobra directamente desde el panel de la
          derecha, sin pasar por el QR.
        </p>
      </div>
      <button
        (click)="goToManualOrder()"
        class="min-h-11 px-5 py-2.5 bg-indigo-600 text-white text-base font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
      >
        ＋ Crear Orden Manual
      </button>
      <p class="text-xs text-gray-400">Atajo: F3</p>
    </div>
  `,
})
export class ManualOrderPanelComponent {
  readonly store = inject(PosTerminalStore);
  private readonly router = inject(Router);

  goToManualOrder(): void {
    const tableId = this.store.selectedTableId();
    if (!tableId) return;
    this.router.navigate(['/dashboard/mesas-sesiones', tableId, 'orden-manual']);
  }
}
