import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { OrderResponse } from '../../tables/interfaces/table.interface';
import { OrdersApiService } from '../services/orders-api.service';
import { orderStatusClass, orderStatusLabel } from '../order-status.util';

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, DecimalPipe],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center gap-3">
        <a
          routerLink="/dashboard/orders"
          class="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:border-indigo-300 hover:text-indigo-700 shadow-sm transition-all"
        >
          ←
        </a>
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Detalle de Orden</h1>
          <p class="text-gray-500 text-sm mt-0.5">Vista completa del pedido</p>
        </div>
      </div>

      @if (isLoading()) {
        <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 animate-pulse space-y-4">
          <div class="h-4 bg-gray-200 rounded w-1/3"></div>
          <div class="h-4 bg-gray-200 rounded w-1/2"></div>
          <div class="h-20 bg-gray-200 rounded"></div>
        </div>
      } @else if (!order()) {
        <div class="bg-white rounded-2xl p-10 shadow-sm border border-gray-100 text-center text-gray-400">
          <p class="text-4xl mb-3">🔍</p>
          <p class="font-medium text-gray-600">Orden no encontrada</p>
          <a routerLink="/dashboard/orders" class="mt-3 inline-block text-sm text-indigo-600 hover:underline">
            Volver a la lista
          </a>
        </div>
      } @else {
        <!-- Info de la orden -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="text-xs text-gray-400 uppercase tracking-wide font-medium">Mesa</p>
              <p class="text-base font-bold text-gray-900 font-mono truncate">{{ order()!.table_id }}</p>
              <p class="text-xs text-gray-400 mt-0.5">{{ order()!.scope === 'table' ? 'Orden de mesa' : 'Orden individual' }}</p>
            </div>
            <span
              class="text-sm px-3 py-1.5 rounded-full font-semibold shrink-0"
              [class]="statusClass(order()!.status)"
            >
              {{ statusLabel(order()!.status) }}
            </span>
          </div>

          <div class="px-5 py-3 grid grid-cols-2 gap-4 border-b border-gray-100 text-sm">
            <div>
              <p class="text-xs text-gray-400">Comensal</p>
              <p class="font-medium text-gray-700">{{ order()!.customer_name ?? '—' }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-400">Creada</p>
              <p class="font-medium text-gray-700">{{ order()!.created_at | date: 'dd/MM/yyyy HH:mm' }}</p>
            </div>
          </div>

          <!-- Items -->
          <div class="px-5 py-4">
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Ítems del pedido</p>
            <div class="space-y-2">
              @for (item of order()!.items ?? []; track item.id) {
                <div class="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div class="flex items-center gap-3">
                    <span class="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center text-xs font-bold text-indigo-700">
                      {{ item.quantity }}
                    </span>
                    <div>
                      <p class="text-sm font-medium text-gray-800">{{ item.product_name }}</p>
                      <p class="text-xs text-gray-400">$ {{ +item.unit_price | number: '1.2-2' }} c/u</p>
                    </div>
                  </div>
                  <p class="text-sm font-semibold text-gray-700">$ {{ +item.subtotal | number: '1.2-2' }}</p>
                </div>
              } @empty {
                <p class="text-sm text-gray-400">Sin ítems</p>
              }
            </div>

            <!-- Total -->
            <div class="mt-4 pt-3 border-t border-gray-200 flex justify-between items-center">
              <p class="text-sm font-semibold text-gray-600">Total</p>
              <p class="text-xl font-bold text-gray-900">$ {{ +order()!.total | number: '1.2-2' }}</p>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class OrderDetailComponent implements OnInit {
  private readonly ordersApi = inject(OrdersApiService);
  private readonly route = inject(ActivatedRoute);

  readonly order = signal<OrderResponse | null>(null);
  readonly isLoading = signal(true);

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.isLoading.set(false);
      return;
    }
    try {
      this.order.set(await this.ordersApi.getOrder(id));
    } catch {
      this.order.set(null);
    } finally {
      this.isLoading.set(false);
    }
  }

  statusLabel = orderStatusLabel;
  statusClass = orderStatusClass;
}
