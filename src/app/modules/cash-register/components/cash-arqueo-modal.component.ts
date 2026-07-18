import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CashSessionStore } from '../services/cash-session.store';

/**
 * Modal de arqueo: conteo de efectivo por denominación, diferencia en vivo
 * frente al efectivo esperado y cierre del turno. Cierra solo con ✕ o Cancelar.
 */
@Component({
  selector: 'app-cash-arqueo-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-none">
          <h2 class="text-base font-bold text-gray-900">Arqueo de caja</h2>
          <button type="button" (click)="store.closeModal()" class="text-gray-400 hover:text-gray-600 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="p-6 space-y-3 overflow-y-auto">
          <p class="text-sm text-gray-500">
            Cuenta el efectivo físico e indica cuántos billetes/monedas hay de cada denominación.
            El sistema suma el total y calcula la diferencia frente al efectivo esperado
            ({{ store.fmt(store.efectivoEsperado()) }}).
          </p>

          <!-- Total contado -->
          <div class="bg-gray-900 text-white px-3 py-2 flex items-center justify-between rounded-lg">
            <span class="text-[10px] uppercase tracking-wider opacity-70">Total contado</span>
            <span class="text-2xl font-extrabold leading-none">{{ store.fmt(store.totalContado()) }}</span>
          </div>

          <!-- Grid de denominaciones -->
          <div class="grid grid-cols-3 gap-px bg-gray-100 border-2 border-gray-100 rounded-lg overflow-hidden">
            @for (d of store.denominaciones(); track d.value) {
              <div class="bg-white p-2 flex flex-col gap-1">
                <div class="flex justify-between items-baseline">
                  <span class="font-bold text-xs text-gray-900">{{ d.label }}</span>
                  <span class="text-[10px] text-gray-400">{{ d.subtotalFmt }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <button type="button" (click)="store.stepDenom(d.value, -1)"
                    class="w-[26px] h-[26px] flex-none flex items-center justify-center border border-gray-200 rounded text-sm font-bold text-gray-700 hover:bg-gray-50">−</button>
                  <input
                    type="number" min="0" step="1"
                    [value]="d.cantidad || ''"
                    (input)="store.setDenom(d.value, $any($event.target).value)"
                    placeholder="0"
                    class="flex-1 w-full text-center h-[26px] px-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <button type="button" (click)="store.stepDenom(d.value, 1)"
                    class="w-[26px] h-[26px] flex-none flex items-center justify-center border border-gray-200 rounded text-sm font-bold text-gray-700 hover:bg-gray-50">+</button>
                </div>
              </div>
            }
          </div>

          <!-- Diferencia en vivo -->
          @if (store.contadoIngresado()) {
            <div class="bg-white rounded-xl border border-gray-100 p-3 flex justify-between items-center">
              <span class="text-[10px] uppercase tracking-wide text-indigo-600 font-semibold">Diferencia</span>
              <span class="font-bold" [class]="store.diffClass(store.diferenciaLive())">
                {{ store.fmt(store.diferenciaLive()) }} · {{ store.diffLabel(store.diferenciaLive()) }}
              </span>
            </div>
          }

          @if (store.requiereObservacion()) {
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Observación (requerida por diferencia)</label>
              <textarea
                [value]="store.arqueoObservacion()"
                (input)="store.arqueoObservacion.set($any($event.target).value)"
                placeholder="Explica el sobrante o faltante"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm min-h-[72px] focus:outline-none focus:ring-2 focus:ring-indigo-400"
              ></textarea>
            </div>
          }

          @if (store.error()) {
            <p class="text-sm text-red-600">{{ store.error() }}</p>
          }
        </div>

        <div class="px-6 py-4 border-t border-gray-100 flex gap-3 flex-none">
          <button type="button" (click)="store.closeModal()" [disabled]="store.isSubmitting()"
            class="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors">
            Cancelar
          </button>
          <button type="button" (click)="store.confirmarArqueoYCerrar()" [disabled]="store.arqueoDisabled()"
            class="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {{ store.isSubmitting() ? 'Cerrando…' : 'Confirmar arqueo y cerrar caja' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class CashArqueoModalComponent {
  readonly store = inject(CashSessionStore);
}
