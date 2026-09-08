import { Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DiningOrder } from '../../tables/interfaces/dining.interface';
import { TableService } from '../../tables/services/table.service';
import { OrdersListService } from '../services/orders-list.service';
import {
  displayOrderStatus,
  orderStatusClass,
  orderStatusLabel,
  orderTypeClass,
  orderTypeLabel,
} from '../order-status.util';
import { PaginationBarComponent } from '../../../shared/pagination/pagination-bar.component';
import { TenantDatePipe } from '../../../shared/pipes/tenant-date.pipe';

@Component({
  selector: 'app-orders-page',
  standalone: true,
  imports: [RouterLink, TenantDatePipe, PaginationBarComponent],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Órdenes</h1>
          <p class="text-gray-500 text-sm mt-1">Comandas de la operación</p>
        </div>
        <button
          (click)="reload()"
          class="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-700 shadow-sm transition-all"
        >
          <span>↺</span> Actualizar
        </button>
      </div>

      <!-- Filtros server-side: estado y tipo, selección única, combinables (spec 079) -->
      <div class="flex gap-3 flex-wrap">
        <label class="flex items-center gap-2 text-xs font-medium text-gray-500">
          Estado
          <select
            [value]="svc.status()"
            (change)="svc.setStatus($any($event.target).value)"
            class="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="">Todos</option>
            <option value="recibida">Por confirmar</option>
            <option value="abierta">Abierta</option>
            <option value="bloqueada">Bloqueada</option>
            <option value="pagada">Pagada</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </label>
        <label class="flex items-center gap-2 text-xs font-medium text-gray-500">
          Tipo
          <select
            [value]="svc.orderType()"
            (change)="svc.setOrderType($any($event.target).value)"
            class="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="">Todos</option>
            <option value="DINE_IN">En mesa</option>
            <option value="TAKEAWAY">Para llevar</option>
            <option value="DELIVERY">Domicilio</option>
          </select>
        </label>
      </div>

      @if (svc.loading() && svc.orders().length === 0) {
        <div class="space-y-3">
          @for (i of [1, 2, 3]; track i) {
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 animate-pulse">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl bg-gray-200"></div>
                  <div class="space-y-2">
                    <div class="h-3 bg-gray-200 rounded w-24"></div>
                    <div class="h-3 bg-gray-200 rounded w-16"></div>
                  </div>
                </div>
                <div class="h-6 bg-gray-200 rounded-full w-20"></div>
              </div>
            </div>
          }
        </div>
      } @else if (svc.error()) {
        <div class="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">{{ svc.error() }}</div>
      } @else if (svc.orders().length === 0) {
        <div class="bg-white rounded-2xl p-10 shadow-sm border border-gray-100 text-center text-gray-400">
          <p class="text-4xl mb-3">📋</p>
          <p class="font-medium">{{ hasFilters() ? 'No hay órdenes con estos filtros' : 'No hay órdenes' }}</p>
        </div>
      } @else {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="divide-y divide-gray-50">
            @for (order of svc.orders(); track order.id) {
              <a
                [routerLink]="['/dashboard/orders', order.id]"
                class="block hover:bg-gray-50 transition-colors"
              >
                <div class="px-4 py-3 flex items-center justify-between gap-3">
                  <div class="flex items-center gap-3 flex-1 min-w-0">
                    <div class="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-xl shrink-0">🍽️</div>
                    <div class="min-w-0">
                      <p class="text-sm font-semibold text-gray-800 truncate">{{ tableLabel(order) }}</p>
                      <p class="text-xs text-gray-400">
                        {{ order.created_at | tenantDate: 'HH:mm' }} · {{ itemCount(order) }} ítem(s)
                      </p>
                      @if (order.customer_name) {
                        <p class="text-xs text-indigo-500 font-medium mt-0.5">👤 {{ order.customer_name }}</p>
                      }
                    </div>
                  </div>

                  <div class="flex items-center gap-2 shrink-0">
                    <span class="text-xs px-2.5 py-1 rounded-full font-medium" [class]="typeClass(order.order_type)">
                      {{ typeLabel(order.order_type) }}
                    </span>
                    <span class="text-xs px-2.5 py-1 rounded-full font-semibold" [class]="statusClass(displayStatus(order))">
                      {{ statusLabel(displayStatus(order)) }}
                    </span>
                  </div>
                </div>
              </a>
            }
          </div>

          <app-pagination-bar
            [page]="svc.page()"
            [size]="svc.size()"
            [total]="svc.total()"
            [totalPages]="svc.totalPages()"
            [loading]="svc.loading()"
            (pageChange)="svc.list($event, svc.size())"
            (sizeChange)="svc.list(1, $event)"
          />
        </div>
      }
    </div>
  `,
})
export class OrdersPageComponent implements OnInit {
  readonly svc = inject(OrdersListService);
  private readonly tableService = inject(TableService);

  /** ¿Hay algún filtro server-side activo? (cambia el texto del estado vacío). */
  readonly hasFilters = computed(() => !!this.svc.status() || !!this.svc.orderType());

  private readonly tableLabels = computed(() => {
    const map = new Map<string, string>();
    for (const t of this.tableService.tables()) {
      map.set(t.id, t.name ? `Mesa ${t.number} · ${t.name}` : `Mesa ${t.number}`);
    }
    return map;
  });

  ngOnInit(): void {
    // La etiqueta de mesa se resuelve contra el listado completo de mesas (FR-025),
    // que no se pagina desde aquí.
    this.tableService.loadTables();
    this.svc.list();
  }

  reload(): void {
    this.svc.list(this.svc.page(), this.svc.size());
  }

  tableLabel(order: DiningOrder): string {
    return (order.dining_table_id && this.tableLabels().get(order.dining_table_id)) || 'Mostrador';
  }

  itemCount(order: DiningOrder): number {
    return (order.items ?? []).reduce((n, i) => n + i.quantity, 0);
  }

  statusLabel = orderStatusLabel;
  statusClass = orderStatusClass;
  displayStatus = displayOrderStatus;
  typeLabel = orderTypeLabel;
  typeClass = orderTypeClass;
}
