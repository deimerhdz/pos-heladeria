import { DatePipe, DecimalPipe, SlicePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OrderStatus } from '../../tables/interfaces/table.interface';
import { OrdersApiService } from '../services/orders-api.service';
import { orderStatusClass, orderStatusLabel } from '../order-status.util';

type FilterOption = OrderStatus | 'all';

interface FilterButton {
  value: FilterOption;
  label: string;
}

@Component({
  selector: 'app-orders-page',
  standalone: true,
  imports: [RouterLink, DatePipe, DecimalPipe, SlicePipe],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Órdenes</h1>
          <p class="text-gray-500 text-sm mt-1">Listado de pedidos de la operación</p>
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

      <!-- Estado de carga -->
      @if (ordersApi.loading() && ordersApi.orders().length === 0) {
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
      } @else if (ordersApi.error()) {
        <div class="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">
          {{ ordersApi.error() }}
        </div>
      } @else if (ordersApi.orders().length === 0) {
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
          @for (order of ordersApi.orders(); track order.id) {
            <a
              [routerLink]="['/dashboard/orders', order.id]"
              class="block bg-white rounded-2xl shadow-sm border border-gray-100 hover:border-indigo-100 transition-all"
            >
              <div class="px-4 py-3 flex items-center justify-between gap-3">
                <div class="flex items-center gap-3 flex-1 min-w-0">
                  <div
                    class="w-16 h-16 rounded-xl bg-indigo-50 flex flex-col items-center justify-center shrink-0"
                  >
                    <span class="text-[10px] text-indigo-400 font-medium leading-none">Mesa</span>
                    <span class="text-xs font-bold text-indigo-700 leading-tight text-center px-1 truncate w-full">
                      {{ order.table_id | slice: 0 : 6 }}
                    </span>
                  </div>
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-gray-800 truncate">
                      {{ order.id | slice: 0 : 8 }}…
                      <span class="text-xs text-gray-400 font-normal">· {{ order.scope === 'table' ? 'Mesa' : 'Individual' }}</span>
                    </p>
                    <p class="text-xs text-gray-400">
                      {{ order.created_at | date: 'HH:mm' }} · $ {{ +order.total | number: '1.2-2' }}
                    </p>
                    @if (order.customer_name) {
                      <p class="text-xs text-indigo-500 font-medium mt-0.5">👤 {{ order.customer_name }}</p>
                    }
                  </div>
                </div>

                <span
                  class="text-xs px-2.5 py-1 rounded-full font-semibold shrink-0"
                  [class]="statusClass(order.status)"
                >
                  {{ statusLabel(order.status) }}
                </span>
              </div>
            </a>
          }
        </div>

        <!-- Paginación -->
        @if (ordersApi.pageInfo().pages > 1) {
          <div class="flex items-center justify-center gap-3 pt-2">
            <button
              (click)="goToPage(ordersApi.pageInfo().page - 1)"
              [disabled]="ordersApi.pageInfo().page <= 1 || ordersApi.loading()"
              class="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Anterior
            </button>
            <span class="text-sm text-gray-500">
              Página {{ ordersApi.pageInfo().page }} de {{ ordersApi.pageInfo().pages }}
            </span>
            <button
              (click)="goToPage(ordersApi.pageInfo().page + 1)"
              [disabled]="ordersApi.pageInfo().page >= ordersApi.pageInfo().pages || ordersApi.loading()"
              class="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Siguiente →
            </button>
          </div>
        }
      }
    </div>
  `,
})
export class OrdersPageComponent implements OnInit {
  readonly ordersApi = inject(OrdersApiService);

  readonly activeFilter = signal<FilterOption>('all');

  readonly filters: FilterButton[] = [
    { value: 'all', label: 'Todas' },
    { value: 'pending', label: 'En espera' },
    { value: 'in_progress', label: 'En preparación' },
    { value: 'completed', label: 'Completadas' },
    { value: 'cancelled', label: 'Canceladas' },
  ];

  ngOnInit(): void {
    this.load(1);
  }

  setFilter(filter: FilterOption): void {
    this.activeFilter.set(filter);
    this.load(1);
  }

  goToPage(page: number): void {
    this.load(page);
  }

  reload(): void {
    this.load(this.ordersApi.pageInfo().page);
  }

  private load(page: number): void {
    const filter = this.activeFilter();
    this.ordersApi.listOrders({
      status: filter === 'all' ? null : filter,
      page,
    });
  }

  statusLabel = orderStatusLabel;
  statusClass = orderStatusClass;
}
