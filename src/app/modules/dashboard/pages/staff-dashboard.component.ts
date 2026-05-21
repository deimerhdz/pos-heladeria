import { Component, computed, signal } from '@angular/core';
import { MOCK_ORDERS, Order, OrderStatus } from '../../../shared/data/mock-data';

@Component({
  selector: 'app-staff-dashboard',
  standalone: true,
  imports: [],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Hola, María 👋</h1>
        <p class="text-gray-500 text-sm mt-1">Cola de cocina — vista de personal</p>
      </div>

      <!-- Stats row -->
      <div class="grid grid-cols-3 gap-4">
        <div class="bg-amber-50 rounded-2xl p-4 border border-amber-100">
          <p class="text-2xl font-bold text-amber-700">{{ pendingCount() }}</p>
          <p class="text-xs text-amber-600 font-medium mt-1">Pendientes</p>
        </div>
        <div class="bg-blue-50 rounded-2xl p-4 border border-blue-100">
          <p class="text-2xl font-bold text-blue-700">{{ preparingCount() }}</p>
          <p class="text-xs text-blue-600 font-medium mt-1">Preparando</p>
        </div>
        <div class="bg-green-50 rounded-2xl p-4 border border-green-100">
          <p class="text-2xl font-bold text-green-700">{{ readyCount() }}</p>
          <p class="text-xs text-green-600 font-medium mt-1">Listos</p>
        </div>
      </div>

      <!-- Pending orders -->
      @if (pendingOrders().length > 0) {
        <div>
          <h2 class="text-sm font-semibold text-amber-600 uppercase tracking-wide mb-3 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-amber-400 inline-block animate-pulse"></span>
            Pendientes ({{ pendingOrders().length }})
          </h2>
          <div class="space-y-3">
            @for (order of pendingOrders(); track order.id) {
              <div class="bg-white rounded-2xl p-4 shadow-sm border border-amber-100 flex items-center justify-between gap-4">
                <div class="flex items-center gap-4">
                  <div class="w-12 h-12 rounded-xl bg-amber-100 flex flex-col items-center justify-center shrink-0">
                    <span class="text-xs text-amber-500 font-medium">Mesa</span>
                    <span class="text-lg font-bold text-amber-700">{{ order.tableNumber }}</span>
                  </div>
                  <div>
                    <p class="font-semibold text-gray-800">{{ order.id }}</p>
                    <p class="text-sm text-gray-500">{{ order.items.join(' · ') }}</p>
                    <p class="text-xs text-gray-400 mt-0.5">Solicitado a las {{ order.createdAt }}</p>
                  </div>
                </div>
                <button
                  (click)="advanceStatus(order.id)"
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
      @if (preparingOrders().length > 0) {
        <div>
          <h2 class="text-sm font-semibold text-blue-600 uppercase tracking-wide mb-3 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-blue-400 inline-block"></span>
            En preparación ({{ preparingOrders().length }})
          </h2>
          <div class="space-y-3">
            @for (order of preparingOrders(); track order.id) {
              <div class="bg-white rounded-2xl p-4 shadow-sm border border-blue-100 flex items-center justify-between gap-4">
                <div class="flex items-center gap-4">
                  <div class="w-12 h-12 rounded-xl bg-blue-100 flex flex-col items-center justify-center shrink-0">
                    <span class="text-xs text-blue-500 font-medium">Mesa</span>
                    <span class="text-lg font-bold text-blue-700">{{ order.tableNumber }}</span>
                  </div>
                  <div>
                    <p class="font-semibold text-gray-800">{{ order.id }}</p>
                    <p class="text-sm text-gray-500">{{ order.items.join(' · ') }}</p>
                    <p class="text-xs text-gray-400 mt-0.5">Desde las {{ order.createdAt }}</p>
                  </div>
                </div>
                <button
                  (click)="advanceStatus(order.id)"
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
      @if (readyOrders().length > 0) {
        <div>
          <h2 class="text-sm font-semibold text-green-600 uppercase tracking-wide mb-3 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-green-400 inline-block"></span>
            Listos para entregar ({{ readyOrders().length }})
          </h2>
          <div class="space-y-2">
            @for (order of readyOrders(); track order.id) {
              <div class="bg-green-50 rounded-xl px-4 py-3 border border-green-100 flex items-center justify-between opacity-75">
                <div>
                  <span class="text-sm font-semibold text-green-800">{{ order.id }}</span>
                  <span class="text-sm text-green-600 ml-2">Mesa {{ order.tableNumber }}</span>
                </div>
                <span class="text-xs bg-green-200 text-green-800 px-2 py-1 rounded-full font-semibold">✓ Listo</span>
              </div>
            }
          </div>
        </div>
      }

      @if (activeOrders().length === 0) {
        <div class="bg-white rounded-2xl p-12 shadow-sm border border-gray-100 text-center">
          <span class="text-4xl block mb-3">🍦</span>
          <p class="text-gray-500">No hay órdenes activas</p>
          <p class="text-gray-400 text-sm mt-1">Las nuevas órdenes aparecerán aquí</p>
        </div>
      }
    </div>
  `,
})
export class StaffDashboardComponent {
  private orders = signal<Order[]>([...MOCK_ORDERS]);

  pendingOrders   = computed(() => this.orders().filter(o => o.status === 'pending'));
  preparingOrders = computed(() => this.orders().filter(o => o.status === 'preparing'));
  readyOrders     = computed(() => this.orders().filter(o => o.status === 'ready'));
  activeOrders    = computed(() => this.orders().filter(o => o.status !== 'delivered' && o.status !== 'cancelled'));

  pendingCount   = computed(() => this.pendingOrders().length);
  preparingCount = computed(() => this.preparingOrders().length);
  readyCount     = computed(() => this.readyOrders().length);

  advanceStatus(orderId: string): void {
    const transitions: Partial<Record<OrderStatus, OrderStatus>> = {
      pending:   'preparing',
      preparing: 'ready',
    };
    this.orders.update(orders =>
      orders.map(order => {
        if (order.id !== orderId) return order;
        const next = transitions[order.status];
        return next ? { ...order, status: next } : order;
      })
    );
  }
}
