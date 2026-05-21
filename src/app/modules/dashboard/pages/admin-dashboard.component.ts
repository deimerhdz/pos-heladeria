import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MOCK_ORDERS, MOCK_PRODUCTS, MOCK_USERS } from '../../../shared/data/mock-data';

interface StatCard {
  label: string;
  value: string | number;
  icon: string;
  bgClass: string;
  change: string;
}

interface QuickAction {
  label: string;
  icon: string;
  route: string;
  description: string;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Bienvenida, Ana 👋</h1>
        <p class="text-gray-500 text-sm mt-1">Resumen del día — vista de administrador</p>
      </div>

      <!-- Stat cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        @for (card of stats; track card.label) {
          <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div class="flex items-start justify-between">
              <div>
                <p class="text-xs text-gray-400 font-medium uppercase tracking-wide">{{ card.label }}</p>
                <p class="text-2xl font-bold text-gray-900 mt-1">{{ card.value }}</p>
                <p class="text-xs text-green-600 mt-1">{{ card.change }}</p>
              </div>
              <div class="w-10 h-10 rounded-xl flex items-center justify-center text-xl" [class]="card.bgClass">
                {{ card.icon }}
              </div>
            </div>
          </div>
        }
      </div>

      <!-- Quick actions -->
      <div>
        <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Accesos rápidos</h2>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
          @for (action of quickActions; track action.route) {
            <a
              [routerLink]="action.route"
              class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:border-indigo-200 hover:shadow-md transition-all group flex items-center gap-4"
            >
              <div class="w-10 h-10 rounded-xl bg-indigo-50 group-hover:bg-indigo-100 flex items-center justify-center text-xl transition-colors shrink-0">
                {{ action.icon }}
              </div>
              <div class="min-w-0">
                <p class="text-sm font-semibold text-gray-800">{{ action.label }}</p>
                <p class="text-xs text-gray-400 truncate">{{ action.description }}</p>
              </div>
            </a>
          }
        </div>
      </div>

      <!-- Recent orders -->
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 class="text-sm font-semibold text-gray-800">Órdenes recientes</h2>
          <span class="text-xs text-indigo-600 font-medium">Ver todas →</span>
        </div>
        <div class="divide-y divide-gray-50">
          @for (order of recentOrders; track order.id) {
            <div class="px-5 py-3 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
                  {{ order.tableNumber }}
                </div>
                <div>
                  <p class="text-sm font-medium text-gray-800">{{ order.id }}</p>
                  <p class="text-xs text-gray-400">Mesa {{ order.tableNumber }} · {{ order.items[0] }}</p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-sm font-semibold text-gray-700">S/ {{ order.total.toFixed(2) }}</span>
                <span class="text-xs px-2 py-1 rounded-full font-medium" [class]="getStatusClass(order.status)">
                  {{ getStatusLabel(order.status) }}
                </span>
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class AdminDashboardComponent {
  readonly stats: StatCard[] = [
    { label: 'Usuarios',          value: MOCK_USERS.length,                                               icon: '👥', bgClass: 'bg-purple-50', change: '+0 hoy' },
    { label: 'Productos',         value: MOCK_PRODUCTS.length,                                            icon: '🍦', bgClass: 'bg-pink-50',   change: 'en stock' },
    { label: 'Órdenes activas',   value: MOCK_ORDERS.filter(o => o.status !== 'delivered').length,        icon: '📋', bgClass: 'bg-amber-50',  change: 'en proceso' },
    { label: 'Ingresos hoy',      value: 'S/ 1,240',                                                      icon: '💰', bgClass: 'bg-green-50',  change: '+12% vs ayer' },
  ];

  readonly quickActions: QuickAction[] = [
    { label: 'Gestionar Usuarios',  icon: '👥', route: '/dashboard/users',      description: 'Roles y accesos' },
    { label: 'Gestionar Productos', icon: '🍦', route: '/dashboard/products',   description: 'Inventario y precios' },
    { label: 'Ver Órdenes',         icon: '📋', route: '/dashboard/orders',     description: 'Activas e historial' },
    { label: 'Gestión de Caja',     icon: '💰', route: '/dashboard/caja',       description: 'Apertura y cierre' },
    { label: 'Ver Reportes',        icon: '📊', route: '/dashboard/reports',    description: 'Estadísticas del día' },
    { label: 'Gestionar Mesas',     icon: '🪑', route: '/dashboard/tables',     description: 'Estado y QR' },
  ];

  readonly recentOrders = MOCK_ORDERS;

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending:   'Pendiente',
      preparing: 'Preparando',
      ready:     'Listo',
      delivered: 'Entregado',
      cancelled: 'Cancelado',
    };
    return labels[status] ?? status;
  }

  getStatusClass(status: string): string {
    const classes: Record<string, string> = {
      pending:   'bg-amber-100 text-amber-700',
      preparing: 'bg-blue-100 text-blue-700',
      ready:     'bg-green-100 text-green-700',
      delivered: 'bg-gray-100 text-gray-500',
      cancelled: 'bg-red-100 text-red-600',
    };
    return classes[status] ?? 'bg-gray-100 text-gray-500';
  }
}
