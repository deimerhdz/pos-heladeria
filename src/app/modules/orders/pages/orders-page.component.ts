import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DiningOrder, DiningOrderStatus } from '../../tables/interfaces/dining.interface';
import { DiningSessionService } from '../../tables/services/dining-session.service';
import { TableService } from '../../tables/services/table.service';
import { displayOrderStatus, orderStatusClass, orderStatusLabel } from '../order-status.util';
import { TenantDatePipe } from '../../../shared/pipes/tenant-date.pipe';

type FilterOption = DiningOrderStatus | 'all';

interface FilterButton {
  value: FilterOption;
  label: string;
}

@Component({
  selector: 'app-orders-page',
  standalone: true,
  imports: [RouterLink, TenantDatePipe],
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

      <!-- Filtros por estado -->
      <div class="flex gap-2 flex-wrap">
        @for (filter of filters; track filter.value) {
          <button
            (click)="setFilter(filter.value)"
            class="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
            [class]="
              activeFilter() === filter.value
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
            "
          >
            {{ filter.label }}
          </button>
        }
      </div>

      @if (loading() && orders().length === 0) {
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
      } @else if (error()) {
        <div class="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">{{ error() }}</div>
      } @else if (visibleOrders().length === 0) {
        <div class="bg-white rounded-2xl p-10 shadow-sm border border-gray-100 text-center text-gray-400">
          <p class="text-4xl mb-3">📋</p>
          <p class="font-medium">No hay órdenes</p>
          @if (activeFilter() !== 'all') {
            <p class="text-sm mt-1">Prueba cambiando el filtro</p>
          }
        </div>
      } @else {
        <div class="space-y-2">
          @for (order of visibleOrders(); track order.id) {
            <a
              [routerLink]="['/dashboard/orders', order.id]"
              class="block bg-white rounded-2xl shadow-sm border border-gray-100 hover:border-indigo-100 transition-all"
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

                <span class="text-xs px-2.5 py-1 rounded-full font-semibold shrink-0" [class]="statusClass(displayStatus(order))">
                  {{ statusLabel(displayStatus(order)) }}
                </span>
              </div>
            </a>
          }
        </div>
      }
    </div>
  `,
})
export class OrdersPageComponent implements OnInit {
  private readonly api = inject(DiningSessionService);
  private readonly tableService = inject(TableService);

  readonly orders = signal<DiningOrder[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly activeFilter = signal<FilterOption>('all');

  readonly filters: FilterButton[] = [
    { value: 'all', label: 'Todas' },
    { value: 'abierta', label: 'Abiertas' },
    { value: 'bloqueada', label: 'Bloqueadas' },
    { value: 'pagada', label: 'Pagadas' },
    { value: 'cancelada', label: 'Canceladas' },
  ];

  readonly visibleOrders = computed(() => {
    const f = this.activeFilter();
    const list = f === 'all' ? this.orders() : this.orders().filter((o) => displayOrderStatus(o) === f);
    return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
  });

  private readonly tableLabels = computed(() => {
    const map = new Map<string, string>();
    for (const t of this.tableService.tables()) {
      map.set(t.id, t.name ? `Mesa ${t.number} · ${t.name}` : `Mesa ${t.number}`);
    }
    return map;
  });

  ngOnInit(): void {
    this.tableService.loadTables();
    this.reload();
  }

  setFilter(filter: FilterOption): void {
    this.activeFilter.set(filter);
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.orders.set(await this.api.listOrders());
    } catch (err) {
      this.error.set(this.api.extractError(err, 'No se pudieron cargar las órdenes.'));
    } finally {
      this.loading.set(false);
    }
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
}
