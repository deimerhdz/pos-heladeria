import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CashSessionStore } from '../services/cash-session.store';

/**
 * Modal para registrar un movimiento manual (ingreso / egreso / retiro).
 * Cierra solo con ✕ o Cancelar, no al hacer clic en el fondo.
 */
@Component({
  selector: 'app-cash-movement-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 class="text-base font-bold text-gray-900">{{ store.modalTitulo() }}</h2>
          <button type="button" (click)="store.closeModal()" class="text-gray-400 hover:text-gray-600 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="p-6 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
            <select
              [value]="store.formCategoria()"
              (change)="store.formCategoria.set($any($event.target).value)"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              @for (c of store.categoriasModal(); track c) {
                <option [value]="c">{{ c }}</option>
              }
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Valor</label>
            <input
              type="number"
              min="0"
              step="1000"
              [value]="store.formMonto()"
              (input)="store.formMonto.set($any($event.target).value)"
              placeholder="0"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Observación (opcional)</label>
            <input
              type="text"
              [value]="store.formNota()"
              (input)="store.formNota.set($any($event.target).value)"
              placeholder="Detalle del movimiento"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          @if (store.error()) {
            <p class="text-sm text-red-600">{{ store.error() }}</p>
          }

          <div class="flex gap-3 pt-2">
            <button type="button" (click)="store.closeModal()" [disabled]="store.isSubmitting()"
              class="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors">
              Cancelar
            </button>
            <button type="button" (click)="store.confirmarMovimiento()" [disabled]="store.movimientoDisabled() || store.isSubmitting()"
              class="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors">
              {{ store.isSubmitting() ? 'Registrando…' : 'Registrar' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class CashMovementModalComponent {
  readonly store = inject(CashSessionStore);
}
