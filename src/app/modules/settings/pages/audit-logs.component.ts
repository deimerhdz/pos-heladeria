import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuditService } from '../services/audit.service';

@Component({
  selector: 'app-audit-logs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="space-y-4">
      <div class="flex items-center gap-3">
        <p class="text-sm text-gray-500 flex-1">Historial de operaciones críticas del sistema.</p>
        <select
          [ngModel]="svc.entity()"
          (ngModelChange)="svc.setEntity($event)"
          class="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600"
        >
          <option value="">Todas las entidades</option>
          <option value="promotion">Promociones</option>
          <option value="sale">Ventas</option>
          <option value="cash_shift">Turnos de caja</option>
          <option value="product">Productos</option>
          <option value="user">Usuarios</option>
        </select>
      </div>

      @if (svc.loading()) {
        <div class="flex justify-center py-10">
          <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      } @else if (svc.logs().length === 0) {
        <div class="bg-white rounded-2xl border border-gray-100 px-5 py-12 text-center text-sm text-gray-400">
          Sin registros de auditoría.
        </div>
      } @else {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-gray-100 bg-gray-50">
                <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Fecha</th>
                <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Acción</th>
                <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Entidad</th>
                <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Usuario</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              @for (log of svc.logs(); track log.id) {
                <tr class="hover:bg-gray-50 transition-colors">
                  <td class="px-5 py-3 text-sm text-gray-600 whitespace-nowrap">{{ log.at | date: 'dd/MM/yy HH:mm' }}</td>
                  <td class="px-5 py-3 text-sm">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" [class]="actionChip(log.action)">
                      {{ log.action }}
                    </span>
                  </td>
                  <td class="px-5 py-3 text-sm text-gray-700">{{ log.entity }}</td>
                  <td class="px-5 py-3 text-sm text-gray-500">{{ log.user_name || '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (svc.pages() > 1) {
          <div class="flex items-center justify-between text-sm">
            <span class="text-gray-400">Página {{ svc.page() }} de {{ svc.pages() }} · {{ svc.total() }} registros</span>
            <div class="flex gap-2">
              <button type="button" (click)="svc.load(svc.page() - 1)" [disabled]="svc.page() <= 1"
                class="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Anterior</button>
              <button type="button" (click)="svc.load(svc.page() + 1)" [disabled]="svc.page() >= svc.pages()"
                class="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Siguiente</button>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class AuditLogsComponent implements OnInit {
  readonly svc = inject(AuditService);

  ngOnInit(): void {
    this.svc.load(1);
  }

  actionChip(action: string): string {
    if (action === 'create') return 'bg-emerald-100 text-emerald-700';
    if (action === 'delete') return 'bg-red-100 text-red-700';
    if (action === 'update') return 'bg-amber-100 text-amber-700';
    return 'bg-gray-100 text-gray-600';
  }
}
