import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MOCK_ORDERS, MOCK_TABLES } from '../../../shared/data/mock-data';

@Component({
  selector: 'app-cashier-dashboard',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Hola, Carlos 👋</h1>
        <p class="text-gray-500 text-sm mt-1">Panel de caja — vista de cajero</p>
      </div>

      <!-- Cash register status + quick actions -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <!-- Register card -->
        <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 md:col-span-1">
          <div class="flex items-center justify-between mb-4">
            <div>
              <p class="text-xs text-gray-400 font-medium uppercase tracking-wide">Estado de Caja</p>
              <div class="flex items-center gap-2 mt-1">
                <span class="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
                <span class="text-sm font-semibold text-green-700">Abierta</span>
              </div>
            </div>
            <span class="text-3xl">💳</span>
          </div>
          <p class="text-2xl font-bold text-gray-900">S/ 850.00</p>
          <p class="text-xs text-gray-400 mt-1">Ventas del día</p>
          <div class="mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs text-gray-500">
            <span>Apertura: 09:00</span>
            <span>{{ activeOrdersCount }} órdenes</span>
          </div>
        </div>

        <!-- Quick action buttons -->
        <div class="md:col-span-2 grid grid-cols-3 gap-3">
          @for (action of quickActions; track action.label) {
            <a
              [routerLink]="action.route"
              class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:border-indigo-300 hover:shadow-md transition-all flex flex-col items-center justify-center gap-2 text-center group"
            >
              <span class="text-2xl">{{ action.icon }}</span>
              <span class="text-xs font-semibold text-gray-700 group-hover:text-indigo-700">{{ action.label }}</span>
            </a>
          }
        </div>
      </div>

      <!-- Tables status -->
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div class="px-5 py-4 border-b border-gray-100">
          <h2 class="text-sm font-semibold text-gray-800">Estado de mesas</h2>
        </div>
        <div class="p-4 grid grid-cols-4 md:grid-cols-8 gap-2">
          @for (table of tables; track table.id) {
            <div
              class="aspect-square rounded-xl flex flex-col items-center justify-center text-xs font-bold border-2 transition-colors"
              [class]="table.status === 'occupied'
                ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                : 'bg-gray-50 border-gray-200 text-gray-400'"
            >
              <span class="text-sm">{{ table.status === 'occupied' ? '🪑' : '⬜' }}</span>
              <span class="mt-0.5">{{ table.number }}</span>
            </div>
          }
        </div>
        <div class="px-5 py-3 border-t border-gray-100 flex gap-4 text-xs text-gray-500">
          <span><span class="text-indigo-600 font-semibold">{{ occupiedCount }}</span> ocupadas</span>
          <span><span class="text-gray-600 font-semibold">{{ availableCount }}</span> libres</span>
        </div>
      </div>

      <!-- Active orders list -->
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 class="text-sm font-semibold text-gray-800">Órdenes activas</h2>
          <span class="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-semibold">{{ activeOrdersCount }} activas</span>
        </div>
        <div class="divide-y divide-gray-50">
          @for (order of activeOrders; track order.id) {
            <div class="px-5 py-3 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-700">
                  {{ order.tableNumber }}
                </div>
                <div>
                  <p class="text-sm font-semibold text-gray-800">{{ order.id }}</p>
                  <p class="text-xs text-gray-400">{{ order.items.join(', ') }}</p>
                </div>
              </div>
              <div class="flex items-center gap-3 shrink-0">
                <span class="text-xs text-gray-400">{{ order.createdAt }}</span>
                <span class="text-sm font-bold text-gray-800">S/ {{ order.total.toFixed(2) }}</span>
                <span class="text-xs px-2 py-1 rounded-full font-medium" [class]="getStatusClass(order.status)">
                  {{ getStatusLabel(order.status) }}
                </span>
              </div>
            </div>
          }
          @empty {
            <p class="px-5 py-6 text-center text-sm text-gray-400">No hay órdenes activas</p>
          }
        </div>
      </div>
    </div>
  `,
})
export class CashierDashboardComponent {
  readonly quickActions = [
    { label: 'Nueva Orden',    icon: '➕', route: '/dashboard/orders' },
    { label: 'Ver Órdenes',    icon: '📋', route: '/dashboard/orders' },
    { label: 'Ver Productos',  icon: '🍦', route: '/dashboard/products' },
    { label: 'Ver Mesas',      icon: '🪑', route: '/dashboard/tables' },
    { label: 'Cobrar',         icon: '💵', route: '/dashboard/orders' },
    { label: 'Cerrar Caja',    icon: '🔒', route: '/dashboard/caja' },
  ];

  readonly tables = MOCK_TABLES;
  readonly activeOrders = MOCK_ORDERS.filter(o => o.status === 'pending' || o.status === 'preparing');

  get activeOrdersCount(): number { return this.activeOrders.length; }
  get occupiedCount(): number  { return MOCK_TABLES.filter(t => t.status === 'occupied').length; }
  get availableCount(): number { return MOCK_TABLES.filter(t => t.status === 'available').length; }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending:   'Pendiente',
      preparing: 'Preparando',
      ready:     'Listo',
    };
    return labels[status] ?? status;
  }

  getStatusClass(status: string): string {
    const classes: Record<string, string> = {
      pending:   'bg-amber-100 text-amber-700',
      preparing: 'bg-blue-100 text-blue-700',
      ready:     'bg-green-100 text-green-700',
    };
    return classes[status] ?? 'bg-gray-100 text-gray-500';
  }
}
