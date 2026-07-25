import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CashSessionStore } from '../services/cash-session.store';

/**
 * Gestión de cajas (solo admin): listado de todas las cajas con su estado en vivo
 * (turno abierto, cajero, apertura, efectivo esperado) y acciones para abrir u
 * operar cada una. Permite crear nuevas cajas.
 */
@Component({
  selector: 'app-cash-overview',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex-1 w-full max-w-[1100px] mx-auto p-6">
      <div class="flex items-end justify-between flex-wrap gap-3 mb-4">
        <div>
          <p class="text-xs uppercase tracking-wide text-indigo-600 font-semibold">Gestión</p>
          <h2 class="text-2xl font-bold text-gray-900">Cajas</h2>
          <p class="text-sm text-gray-500 mt-1">Estado de cada caja y operaciones del turno.</p>
        </div>
        <div class="flex items-end gap-2">
          <button
            (click)="store.openHistory()"
            class="px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Historial de cierres
          </button>
          <div>
            <label class="block text-[11px] text-gray-500 mb-1">Nueva caja</label>
            <input
              type="text"
              [value]="store.newRegisterName()"
              (input)="store.newRegisterName.set($any($event.target).value)"
              placeholder="Nombre (ej. Caja 2)"
              class="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <button
            (click)="store.createRegister()"
            [disabled]="store.isSubmitting() || !store.newRegisterName().trim()"
            class="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            + Crear caja
          </button>
        </div>
      </div>

      @if (store.error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4">{{ store.error() }}</div>
      }

      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        @if (store.overview().length === 0) {
          <div class="py-12 text-center text-sm text-gray-400">
            No hay cajas registradas. Crea la primera para comenzar.
          </div>
        } @else {
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-100 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th class="px-4 py-3 font-semibold">Caja</th>
                <th class="px-4 py-3 font-semibold">Estado</th>
                <th class="px-4 py-3 font-semibold">Cajero</th>
                <th class="px-4 py-3 font-semibold">Apertura</th>
                <th class="px-4 py-3 font-semibold text-right">Efectivo esperado</th>
                <th class="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              @for (row of store.overview(); track row.register.id) {
                <tr class="hover:bg-gray-50/60">
                  <td class="px-4 py-3 font-medium text-gray-900">{{ row.register.name }}</td>
                  <td class="px-4 py-3">
                    @if (row.shift) {
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Turno abierto</span>
                    } @else {
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Sin turno</span>
                    }
                  </td>
                  <td class="px-4 py-3 text-gray-600">{{ row.shift?.user_name || '—' }}</td>
                  <td class="px-4 py-3 text-gray-600">{{ row.shift ? store.formatDate(row.shift.opened_at) : '—' }}</td>
                  <td class="px-4 py-3 text-right font-semibold text-gray-900">
                    {{ row.expected != null ? store.fmt(row.expected) : '—' }}
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center justify-end gap-2">
                      @if (row.shift) {
                        <button (click)="store.operateRegister(row.register.id)"
                          class="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors">
                          Operar
                        </button>
                      } @else {
                        <button (click)="store.abrirCajaDesdeOverview(row.register.id)"
                          class="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors">
                          Abrir turno
                        </button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  `,
})
export class CashOverviewComponent {
  readonly store = inject(CashSessionStore);
}
