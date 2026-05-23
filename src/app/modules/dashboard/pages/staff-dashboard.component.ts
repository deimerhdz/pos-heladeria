import { SlicePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { OrderStatus } from '../../orders/interfaces/order.interface';
import { OrdersService } from '../../orders/services/orders.service';

@Component({
  selector: 'app-staff-dashboard',
  standalone: true,
  imports: [SlicePipe],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Hola, María 👋</h1>
          <p class="text-gray-500 text-sm mt-1 flex items-center gap-2">
            Cola de cocina — vista de personal
            <span class="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse" title="Realtime activo"></span>
          </p>
        </div>
      </div>

      <!-- Stats row -->
      <div class="grid grid-cols-3 gap-4">
        <div class="bg-amber-50 rounded-2xl p-4 border border-amber-100">
          <p class="text-2xl font-bold text-amber-700">{{ ordersService.pendingOrders().length }}</p>
          <p class="text-xs text-amber-600 font-medium mt-1">Pendientes</p>
        </div>
        <div class="bg-blue-50 rounded-2xl p-4 border border-blue-100">
          <p class="text-2xl font-bold text-blue-700">{{ ordersService.preparingOrders().length }}</p>
          <p class="text-xs text-blue-600 font-medium mt-1">Preparando</p>
        </div>
        <div class="bg-green-50 rounded-2xl p-4 border border-green-100">
          <p class="text-2xl font-bold text-green-700">{{ ordersService.readyOrders().length }}</p>
          <p class="text-xs text-green-600 font-medium mt-1">Listos</p>
        </div>
      </div>

      <!-- Pending orders -->
      @if (ordersService.pendingOrders().length > 0) {
        <div>
          <h2 class="text-sm font-semibold text-amber-600 uppercase tracking-wide mb-3 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-amber-400 inline-block animate-pulse"></span>
            Pendientes ({{ ordersService.pendingOrders().length }})
          </h2>
          <div class="space-y-3">
            @for (order of ordersService.pendingOrders(); track order.id) {
              <div class="bg-white rounded-2xl p-4 shadow-sm border border-amber-100 flex items-center justify-between gap-4">
                <div class="flex items-center gap-4">
                  <div class="w-12 h-12 rounded-xl bg-amber-100 flex flex-col items-center justify-center shrink-0">
                    <span class="text-xs text-amber-500 font-medium">Mesa</span>
                    <span class="text-sm font-bold text-amber-700 truncate px-1">{{ order.table_name }}</span>
                  </div>
                  <div>
                    <p class="font-semibold text-gray-800">{{ order.id | slice:0:8 }}...</p>
                    <p class="text-xs text-gray-400 mt-0.5">S/ {{ order.total.toFixed(2) }}</p>
                    @if (order.notes) {
                      <p class="text-xs text-gray-500 mt-0.5 italic">{{ order.notes }}</p>
                    }
                  </div>
                </div>
                <button
                  (click)="advance(order.id, 'preparing')"
                  class="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shrink-0"
                >
                  Preparar
                </button>
              </div>
            }
          </div>
        </div>
      }

      <!-- Preparing orders -->
      @if (ordersService.preparingOrders().length > 0) {
        <div>
          <h2 class="text-sm font-semibold text-blue-600 uppercase tracking-wide mb-3 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-blue-400 inline-block"></span>
            En preparación ({{ ordersService.preparingOrders().length }})
          </h2>
          <div class="space-y-3">
            @for (order of ordersService.preparingOrders(); track order.id) {
              <div class="bg-white rounded-2xl p-4 shadow-sm border border-blue-100 flex items-center justify-between gap-4">
                <div class="flex items-center gap-4">
                  <div class="w-12 h-12 rounded-xl bg-blue-100 flex flex-col items-center justify-center shrink-0">
                    <span class="text-xs text-blue-500 font-medium">Mesa</span>
                    <span class="text-sm font-bold text-blue-700 truncate px-1">{{ order.table_name }}</span>
                  </div>
                  <div>
                    <p class="font-semibold text-gray-800">{{ order.id | slice:0:8 }}...</p>
                    <p class="text-xs text-gray-400 mt-0.5">S/ {{ order.total.toFixed(2) }}</p>
                  </div>
                </div>
                <button
                  (click)="advance(order.id, 'ready')"
                  class="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors shrink-0"
                >
                  Listo ✓
                </button>
              </div>
            }
          </div>
        </div>
      }

      <!-- Ready orders -->
      @if (ordersService.readyOrders().length > 0) {
        <div>
          <h2 class="text-sm font-semibold text-green-600 uppercase tracking-wide mb-3 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-green-400 inline-block"></span>
            Listos para entregar ({{ ordersService.readyOrders().length }})
          </h2>
          <div class="space-y-2">
            @for (order of ordersService.readyOrders(); track order.id) {
              <div class="bg-green-50 rounded-xl px-4 py-3 border border-green-100 flex items-center justify-between opacity-75">
                <div>
                  <span class="text-sm font-semibold text-green-800">{{ order.id | slice:0:8 }}...</span>
                  <span class="text-sm text-green-600 ml-2">{{ order.table_name }}</span>
                </div>
                <span class="text-xs bg-green-200 text-green-800 px-2 py-1 rounded-full font-semibold">✓ Listo</span>
              </div>
            }
          </div>
        </div>
      }

      @if (activeOrdersCount() === 0) {
        <div class="bg-white rounded-2xl p-12 shadow-sm border border-gray-100 text-center">
          <span class="text-4xl block mb-3">🍦</span>
          <p class="text-gray-500">No hay órdenes activas</p>
          <p class="text-gray-400 text-sm mt-1">Las nuevas órdenes aparecerán aquí automáticamente</p>
        </div>
      }
    </div>
  `,
})
export class StaffDashboardComponent implements OnInit, OnDestroy {
  readonly ordersService = inject(OrdersService);

  readonly activeOrdersCount = computed(() =>
    this.ordersService.pendingOrders().length +
    this.ordersService.preparingOrders().length +
    this.ordersService.readyOrders().length
  );

  private realtimeChannel: RealtimeChannel | null = null;

  ngOnInit(): void {
    this.ordersService.loadOrders();
    this.realtimeChannel = this.ordersService.subscribeToOrders(() => {
      this.ordersService.loadOrders();
    });
  }

  ngOnDestroy(): void {
    this.realtimeChannel?.unsubscribe();
  }

  async advance(orderId: string, newStatus: OrderStatus): Promise<void> {
    await this.ordersService.updateStatus(orderId, newStatus);
  }
}
