import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CashSessionStore } from '../services/cash-session.store';

/**
 * Histórico de cierres (solo admin): tabla paginada de turnos cerrados con su
 * arqueo (base, contado, diferencia, nota) y acceso al reporte de cada turno.
 */
@Component({
  selector: 'app-cash-history',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex-1 w-full max-w-[1100px] mx-auto p-6">
      <div class="flex items-end justify-between flex-wrap gap-3 mb-4">
        <div>
          <p class="text-xs uppercase tracking-wide text-indigo-600 font-semibold">Gestión</p>
          <h2 class="text-2xl font-bold text-gray-900">Historial de cierres</h2>
          <p class="text-sm text-gray-500 mt-1">Turnos cerrados con su arqueo y diferencia.</p>
        </div>
        <div>
          <label class="block text-[11px] text-gray-500 mb-1">Filtrar por caja</label>
          <select [value]="store.historyRegisterFilter()" (change)="store.setHistoryFilter($any($event.target).value)"
            class="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
            <option value="">Todas las cajas</option>
            @for (r of store.registers(); track r.id) {
              <option [value]="r.id">{{ r.name }}</option>
            }
          </select>
        </div>
      </div>

      @if (store.error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4">{{ store.error() }}</div>
      }

      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        @if (rows().length === 0) {
          <div class="py-12 text-center text-sm text-gray-400">No hay cierres registrados todavía.</div>
        } @else {
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-100 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th class="px-4 py-3 font-semibold">Caja</th>
                <th class="px-4 py-3 font-semibold">Cajero</th>
                <th class="px-4 py-3 font-semibold">Cierre</th>
                <th class="px-4 py-3 font-semibold text-right">Base</th>
                <th class="px-4 py-3 font-semibold text-right">Contado</th>
                <th class="px-4 py-3 font-semibold text-right">Diferencia</th>
                <th class="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              @for (s of rows(); track s.id) {
                <tr class="hover:bg-gray-50/60">
                  <td class="px-4 py-3 font-medium text-gray-900">{{ s.register_name }}</td>
                  <td class="px-4 py-3 text-gray-600">{{ s.user_name || '—' }}</td>
                  <td class="px-4 py-3 text-gray-600">{{ store.formatDate(s.closed_at) }}</td>
                  <td class="px-4 py-3 text-right text-gray-700">{{ store.fmt(store.num(s.opening_amount)) }}</td>
                  <td class="px-4 py-3 text-right text-gray-700">{{ s.counted_amount != null ? store.fmt(store.num(s.counted_amount)) : '—' }}</td>
                  <td class="px-4 py-3 text-right font-semibold" [class]="store.diffClass(store.num(s.difference))">
                    {{ store.fmt(store.num(s.difference)) }}
                    <span class="block text-[10px] font-normal opacity-80">{{ store.diffLabel(store.num(s.difference)) }}</span>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center justify-end">
                      <button (click)="store.viewShiftReport(s.id)"
                        class="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors">
                        Ver reporte
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>

      @if (page(); as p) {
        @if (p.pages > 1) {
          <div class="flex items-center justify-between mt-3 text-sm">
            <span class="text-gray-400">{{ p.total }} cierre(s) · página {{ p.page }} de {{ p.pages }}</span>
            <div class="flex gap-2">
              <button (click)="store.loadHistory(p.page - 1)" [disabled]="p.page <= 1"
                class="px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40">Anterior</button>
              <button (click)="store.loadHistory(p.page + 1)" [disabled]="p.page >= p.pages"
                class="px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40">Siguiente</button>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class CashHistoryComponent {
  readonly store = inject(CashSessionStore);
  readonly page = computed(() => this.store.history());
  readonly rows = computed(() => this.store.history()?.items ?? []);
}
