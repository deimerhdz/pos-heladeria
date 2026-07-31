import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CashSessionStore } from '../services/cash-session.store';
import { CashService } from '../services/cash.service';
import { ToastService } from '../../../shared/feedback/toast.service';

/**
 * Dashboard del turno en curso: acciones, banner de efectivo esperado, KPIs y la
 * línea de tiempo de movimientos (tabla / timeline).
 *
 * Las tarjetas de ventas salen **una por método de pago del negocio**, tal cual
 * los devuelve el arqueo. Antes eran tres cubos fijos (efectivo/tarjeta/
 * transferencia) y cualquier método que no encajara en ellos no se veía.
 */
@Component({
  selector: 'app-cash-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="flex-1 w-full max-w-[1240px] mx-auto p-6">
      @if (store.error() && !store.modal()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4">{{ store.error() }}</div>
      }
      <!-- Cabecera + acciones -->
      <div class="flex items-end justify-between flex-wrap gap-3 mb-4">
        <div>
          <p class="text-xs uppercase tracking-wide text-indigo-600 font-semibold">Turno en curso</p>
          <h2 class="text-2xl font-bold text-gray-900">Resumen de caja</h2>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <button (click)="store.openMovimiento('ingreso')" class="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">+ Ingreso</button>
          <button (click)="store.openMovimiento('egreso')" class="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">− Egreso</button>
          <button (click)="store.openMovimiento('retiro')" class="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">↓ Retiro</button>
          <button (click)="openPartial()" class="px-3 py-2 border border-indigo-200 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-50 transition-colors">Arqueo parcial</button>
          <button (click)="store.openArqueo()" class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors">Cerrar turno</button>
        </div>
      </div>

      <!-- Banner efectivo esperado -->
      <div class="bg-indigo-600 text-white rounded-2xl p-6 mb-4 flex items-center justify-between gap-4">
        <div>
          <div class="text-[11px] uppercase tracking-wider opacity-85">Efectivo esperado en caja</div>
          <div class="text-4xl font-extrabold leading-tight mt-1">{{ store.fmt(store.efectivoEsperado()) }}</div>
        </div>
        <div class="text-right text-xs opacity-90 max-w-[280px]">
          Fondo inicial + ventas en efectivo − cambio entregado + ingresos − egresos − retiros
        </div>
      </div>

      <!-- KPIs -->
      @let ind = store.indicadores();
      <div class="grid gap-3 mb-6" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">
        <div class="bg-white rounded-xl border border-gray-100 p-4">
          <div class="text-[10px] uppercase tracking-wide text-indigo-600 font-semibold">Fondo inicial</div>
          <div class="text-lg font-bold text-gray-900 mt-1">{{ store.fmt(store.num(store.shift()?.opening_amount)) }}</div>
        </div>
        @for (v of ind.ventas; track v.id) {
          <div class="bg-white rounded-xl border border-gray-100 p-4">
            <div class="text-[10px] uppercase tracking-wide text-indigo-600 font-semibold truncate" [title]="v.name">
              Ventas {{ v.name }}
            </div>
            <div class="text-lg font-bold text-gray-900 mt-1">{{ store.fmt(v.total) }}</div>
            <div class="text-[11px] text-gray-400 mt-1">{{ v.count }} venta(s)</div>
          </div>
        }
        @if (ind.cambioEntregado > 0) {
          <!-- Salió del cajón: sin esta tarjeta el efectivo esperado no cuadra a la vista. -->
          <div class="bg-white rounded-xl border border-gray-100 p-4">
            <div class="text-[10px] uppercase tracking-wide text-indigo-600 font-semibold">Cambio entregado</div>
            <div class="text-lg font-bold text-gray-900 mt-1">− {{ store.fmt(ind.cambioEntregado) }}</div>
            <div class="text-[11px] text-gray-400 mt-1">vuelto a clientes</div>
          </div>
        }
        <div class="bg-white rounded-xl border border-gray-100 p-4">
          <div class="text-[10px] uppercase tracking-wide text-indigo-600 font-semibold">Ingresos</div>
          <div class="text-lg font-bold text-gray-900 mt-1">{{ store.fmt(ind.ingresos) }}</div>
          <div class="text-[11px] text-gray-400 mt-1">{{ ind.countIngresos }} movimiento(s)</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-4">
          <div class="text-[10px] uppercase tracking-wide text-indigo-600 font-semibold">Egresos</div>
          <div class="text-lg font-bold text-gray-900 mt-1">{{ store.fmt(ind.egresos) }}</div>
          <div class="text-[11px] text-gray-400 mt-1">{{ ind.countEgresos }} movimiento(s)</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-4">
          <div class="text-[10px] uppercase tracking-wide text-indigo-600 font-semibold">Retiros</div>
          <div class="text-lg font-bold text-gray-900 mt-1">{{ store.fmt(ind.retiros) }}</div>
          <div class="text-[11px] text-gray-400 mt-1">{{ ind.countRetiros }} movimiento(s)</div>
        </div>
      </div>

      <div class="border-t border-gray-100"></div>

      <!-- Línea de tiempo -->
      <div class="flex items-center justify-between my-4">
        <h3 class="text-lg font-bold text-gray-900">Línea de tiempo de movimientos</h3>
        <div class="inline-flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          <button
            (click)="store.setVista('tabla')"
            class="px-3 py-1.5 transition-colors"
            [class]="store.vista() === 'tabla' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'"
          >Tabla</button>
          <button
            (click)="store.setVista('timeline')"
            class="px-3 py-1.5 border-l border-gray-200 transition-colors"
            [class]="store.vista() === 'timeline' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'"
          >Línea de tiempo</button>
        </div>
      </div>

      @if (store.sinMovimientos()) {
        <p class="text-sm text-gray-400 py-4">Aún no hay movimientos en este turno.</p>
      } @else if (store.vista() === 'tabla') {
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="text-left text-[11px] uppercase tracking-wide text-gray-400">
              <th class="py-2 border-b-2 border-gray-100 font-medium">Hora</th>
              <th class="py-2 border-b-2 border-gray-100 font-medium">Tipo</th>
              <th class="py-2 border-b-2 border-gray-100 font-medium">Valor</th>
              <th class="py-2 border-b-2 border-gray-100 font-medium">Usuario</th>
              <th class="py-2 border-b-2 border-gray-100 font-medium">Observación</th>
            </tr>
          </thead>
          <tbody>
            @for (m of store.movimientosView(); track m.id) {
              <tr class="hover:bg-gray-50/60">
                <td class="py-2 border-b border-gray-100">{{ m.hora }}</td>
                <td class="py-2 border-b border-gray-100">
                  <span class="inline-flex items-center text-[11px] px-2.5 py-0.5 rounded-md" [class]="store.tagClass(m.tagVariant)">{{ m.label }}</span>
                </td>
                <td class="py-2 border-b border-gray-100 font-semibold">{{ m.montoFmt }}</td>
                <td class="py-2 border-b border-gray-100">{{ m.usuario }}</td>
                <td class="py-2 border-b border-gray-100 text-gray-500">{{ m.nota }}</td>
              </tr>
            }
          </tbody>
        </table>
      } @else {
        <div class="flex flex-col">
          @for (m of store.movimientosView(); track m.id) {
            <div class="flex gap-3 py-2 pl-4 ml-1.5 border-l-2 border-gray-100 relative">
              <div class="absolute -left-[5px] top-4 w-2.5 h-2.5 rounded-full bg-indigo-600"></div>
              <div class="w-[70px] text-xs text-gray-400 flex-none">{{ m.hora }}</div>
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <span class="inline-flex items-center text-[11px] px-2.5 py-0.5 rounded-md" [class]="store.tagClass(m.tagVariant)">{{ m.label }}</span>
                  <span class="font-semibold text-sm">{{ m.montoFmt }}</span>
                </div>
                <div class="text-xs text-gray-400 mt-0.5">{{ m.usuario }} · {{ m.nota }}</div>
              </div>
            </div>
          }
        </div>
      }
    </div>

    <!-- Modal arqueo parcial (RF-046) -->
    @if (showPartial()) {
      <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col">
          <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-base font-bold text-gray-900">Arqueo parcial</h2>
            <button type="button" (click)="showPartial.set(false)" class="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <div class="p-6 space-y-3">
            <p class="text-sm text-gray-500">
              Conteo intermedio del efectivo sin cerrar el turno. Se compara con el
              efectivo esperado ({{ store.fmt(store.efectivoEsperado()) }}).
            </p>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Efectivo contado</label>
              <input [(ngModel)]="partialCounted" type="number" min="0"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Observación (opcional)</label>
              <input [(ngModel)]="partialNote" type="text" maxlength="500"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div class="bg-white rounded-xl border border-gray-100 p-3 flex justify-between items-center">
              <span class="text-[10px] uppercase tracking-wide text-indigo-600 font-semibold">Diferencia</span>
              <span class="font-bold" [class]="diffClass()">{{ store.fmt(partialDiff()) }}</span>
            </div>
          </div>
          <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
            <button type="button" (click)="showPartial.set(false)" class="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
            <button type="button" (click)="submitPartial()" [disabled]="partialSubmitting()"
              class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold">
              {{ partialSubmitting() ? 'Registrando…' : 'Registrar' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class CashDashboardComponent {
  readonly store = inject(CashSessionStore);
  private readonly cash = inject(CashService);
  private readonly toast = inject(ToastService);

  readonly showPartial = signal(false);
  partialCounted = 0;
  partialNote = '';
  readonly partialSubmitting = signal(false);

  readonly partialDiff = computed(() => Number(this.partialCounted || 0) - this.store.efectivoEsperado());

  diffClass(): string {
    const d = this.partialDiff();
    return d === 0 ? 'text-gray-700' : d > 0 ? 'text-emerald-600' : 'text-red-600';
  }

  openPartial(): void {
    this.partialCounted = 0;
    this.partialNote = '';
    this.showPartial.set(true);
  }

  async submitPartial(): Promise<void> {
    const shiftId = this.store.shift()?.id;
    if (!shiftId) return;
    this.partialSubmitting.set(true);
    try {
      const res = await this.cash.partialCount(shiftId, Number(this.partialCounted || 0), this.partialNote || null);
      const diff = Number(res.difference);
      const label = diff === 0 ? 'cuadra' : diff > 0 ? `sobrante ${this.store.fmt(diff)}` : `faltante ${this.store.fmt(-diff)}`;
      this.toast.success(`Arqueo parcial registrado (${label})`);
      this.showPartial.set(false);
    } catch (e) {
      this.toast.error(this.cash.extractError(e, 'No se pudo registrar el arqueo parcial'));
    } finally {
      this.partialSubmitting.set(false);
    }
  }
}
