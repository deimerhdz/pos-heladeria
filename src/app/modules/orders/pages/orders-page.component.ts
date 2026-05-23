import { DatePipe, SlicePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OrderStatus } from '../interfaces/order.interface';
import { OrdersService } from '../services/orders.service';

type FilterOption = OrderStatus | 'all';

interface FilterButton {
  value: FilterOption;
  label: string;
}

@Component({
  selector: 'app-orders-page',
  standalone: true,
  imports: [RouterLink, DatePipe, SlicePipe],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Órdenes</h1>
          <p class="text-gray-500 text-sm mt-1">Gestión de pedidos activos e historial</p>
        </div>
        <button
          (click)="ordersService.loadOrders()"
          class="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-700 shadow-sm transition-all"
        >
          <span>↺</span> Actualizar
        </button>
      </div>

      <!-- Filtros por estado -->
      <div class="flex gap-2 flex-wrap">
        @for (filter of filters; track filter.value) {
          <button
            (click)="activeFilter.set(filter.value)"
            class="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
            [class]="
              activeFilter() === filter.value
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
            "
          >
            {{ filter.label }}
            @if (filter.value !== 'all') {
              <span class="ml-1 opacity-70">({{ countByStatus(filter.value) }})</span>
            }
          </button>
        }
      </div>

      <!-- Estado de carga -->
      @if (ordersService.isLoading()) {
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
      } @else if (ordersService.error()) {
        <div class="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">
          Error al cargar órdenes: {{ ordersService.error() }}
        </div>
      } @else if (filteredOrders().length === 0) {
        <div
          class="bg-white rounded-2xl p-10 shadow-sm border border-gray-100 text-center text-gray-400"
        >
          <p class="text-4xl mb-3">📋</p>
          <p class="font-medium">No hay órdenes</p>
          @if (activeFilter() !== 'all') {
            <p class="text-sm mt-1">Prueba cambiando el filtro</p>
          }
        </div>
      } @else {
        <div class="space-y-2">
          @for (order of filteredOrders(); track order.id) {
            <div
              class="bg-white rounded-2xl shadow-sm border border-gray-100 hover:border-indigo-100 transition-all"
            >
              <div class="px-4 py-3 flex items-center justify-between gap-3">
                <!-- Mesa e info -->
                <a
                  [routerLink]="['/dashboard/orders', order.id]"
                  class="flex items-center gap-3 flex-1 min-w-0"
                >
                  <div
                    class="w-20 h-20 rounded-xl bg-indigo-50 flex flex-col items-center justify-center shrink-0"
                  >
                    <span class="text-xs text-indigo-400 font-medium leading-none">Mesa</span>
                    <span class="text-sm font-bold text-indigo-700 leading-none">{{
                      order.table_name
                    }}</span>
                  </div>
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-gray-800 truncate">
                      {{ order.id | slice: 0 : 8 }}...
                    </p>
                    <p class="text-xs text-gray-400">
                      {{ order.created_at | date: 'HH:mm' }} · S/ {{ order.total.toFixed(2) }}
                    </p>
                    @if (order.customer_name) {
                      <p class="text-xs text-indigo-500 font-medium mt-0.5">👤 {{ order.customer_name }}</p>
                    }
                  </div>
                </a>

                <!-- Badge y acción -->
                <div class="flex items-center gap-2 shrink-0">
                  <span
                    class="text-xs px-2.5 py-1 rounded-full font-semibold"
                    [class]="statusClass(order.status)"
                  >
                    {{ statusLabel(order.status) }}
                  </span>
                  @if (ordersService.getNextStatus(order.status); as next) {
                    <button
                      (click)="updateStatus(order.id, next)"
                      class="text-xs px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors"
                    >
                      {{ ordersService.getNextStatusLabel(order.status) }}
                    </button>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class OrdersPageComponent implements OnInit {
  readonly ordersService = inject(OrdersService);

  readonly activeFilter = signal<FilterOption>('all');

  readonly filteredOrders = computed(() => {
    const filter = this.activeFilter();
    if (filter === 'all') return this.ordersService.orders();
    return this.ordersService.orders().filter((o) => o.status === filter);
  });

  readonly filters: FilterButton[] = [
    { value: 'all', label: 'Todos' },
    { value: 'pending', label: 'Pendiente' },
    { value: 'preparing', label: 'Preparando' },
    { value: 'ready', label: 'Listo' },
    { value: 'bill_requested', label: 'Cuenta Solicitada' },
    { value: 'paid', label: 'Pagado' },
  ];

  ngOnInit(): void {
    this.ordersService.loadOrders();
  }

  countByStatus(status: OrderStatus): number {
    return this.ordersService.orders().filter((o) => o.status === status).length;
  }

  async updateStatus(orderId: string, newStatus: OrderStatus): Promise<void> {
    await this.ordersService.updateStatus(orderId, newStatus);
  }

  statusLabel(status: OrderStatus): string {
    const labels: Record<OrderStatus, string> = {
      pending: 'Pendiente',
      preparing: 'Preparando',
      ready: 'Listo',
      bill_requested: 'Cuenta solicitada',
      paid: 'Pagado',
    };
    return labels[status];
  }

  statusClass(status: OrderStatus): string {
    const classes: Record<OrderStatus, string> = {
      pending: 'bg-amber-100 text-amber-700',
      preparing: 'bg-blue-100 text-blue-700',
      ready: 'bg-green-100 text-green-700',
      bill_requested: 'bg-orange-100 text-orange-700',
      paid: 'bg-gray-100 text-gray-500',
    };
    return classes[status];
  }
}
