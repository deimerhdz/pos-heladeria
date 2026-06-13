import { DecimalPipe, SlicePipe } from '@angular/common';
import { Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OrderStatus } from '../../orders/interfaces/order.interface';
import { OrdersService } from '../../orders/services/orders.service';
import { ProductService } from '../../products/services/product.service';
import { ReportsService } from '../../reports/services/reports.service';
import { UsersService } from '../../users/services/users.service';

interface QuickAction {
  label: string;
  icon: string;
  route: string;
  description: string;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink, SlicePipe, DecimalPipe],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Bienvenido👋</h1>
        <p class="text-gray-500 text-sm mt-1">Resumen del día — vista de administrador</p>
      </div>

      <!-- Stat cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs text-gray-400 font-medium uppercase tracking-wide">Usuarios</p>
              <p class="text-2xl font-bold text-gray-900 mt-1">
                {{ usersService.error() ? '–' : usersService.totalCount() }}
              </p>
              <p class="text-xs text-green-600 mt-1">en el sistema</p>
            </div>
            <div class="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-xl">
              👥
            </div>
          </div>
        </div>
        <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs text-gray-400 font-medium uppercase tracking-wide">Productos</p>
              <p class="text-2xl font-bold text-gray-900 mt-1">{{ activeProductsCount() }}</p>
              <p class="text-xs text-green-600 mt-1">activos en stock</p>
            </div>
            <div class="w-10 h-10 rounded-xl bg-pink-50 flex items-center justify-center text-xl">
              🍦
            </div>
          </div>
        </div>
        <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs text-gray-400 font-medium uppercase tracking-wide">
                Órdenes activas
              </p>
              <p class="text-2xl font-bold text-gray-900 mt-1">
                {{ ordersService.activeOrdersCount() }}
              </p>
              <p class="text-xs text-green-600 mt-1">en proceso</p>
            </div>
            <div class="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-xl">
              📋
            </div>
          </div>
        </div>
        <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs text-gray-400 font-medium uppercase tracking-wide">Ingresos hoy</p>
              @if (reportsService.isLoading()) {
                <p class="text-2xl font-bold text-gray-300 mt-1 animate-pulse">–</p>
              } @else if (reportsService.error() || !reportsService.salesSummary()) {
                <p class="text-2xl font-bold text-gray-900 mt-1">–</p>
              } @else {
                <p class="text-2xl font-bold text-gray-900 mt-1">
                  S/ {{ reportsService.salesSummary()!.total | number: '1.2-2' }}
                </p>
                <p class="text-xs text-green-600 mt-1">
                  {{ reportsService.salesSummary()!.count }} cobros hoy
                </p>
              }
            </div>
            <div class="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-xl">
              💰
            </div>
          </div>
        </div>
      </div>

      <!-- Quick actions -->
      <div>
        <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Accesos rápidos
        </h2>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
          @for (action of quickActions; track action.route) {
            <a
              [routerLink]="action.route"
              class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:border-indigo-200 hover:shadow-md transition-all group flex items-center gap-4"
            >
              <div
                class="w-10 h-10 rounded-xl bg-indigo-50 group-hover:bg-indigo-100 flex items-center justify-center text-xl transition-colors shrink-0"
              >
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
          <a
            routerLink="/dashboard/orders"
            class="text-xs text-indigo-600 font-medium hover:underline"
          >
            Ver todas →
          </a>
        </div>
        @if (ordersService.error()) {
          <div class="px-5 py-4 text-sm text-red-600">No se pudieron cargar las órdenes</div>
        } @else if (ordersService.isLoading()) {
          <div class="px-5 py-4 text-sm text-gray-400 animate-pulse">Cargando órdenes...</div>
        } @else if (recentOrders().length === 0) {
          <div class="px-5 py-4 text-sm text-gray-400">No hay órdenes aún</div>
        } @else {
          <div class="divide-y divide-gray-50">
            @for (order of recentOrders(); track order.id) {
              <a
                [routerLink]="['/dashboard/orders', order.id]"
                class="px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div class="flex items-center gap-3">
                  <div
                    class="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500"
                  >
                    {{ order.table_name.charAt(0) }}
                  </div>
                  <div>
                    <p class="text-sm font-medium text-gray-800">
                      {{ order.id | slice: 0 : 8 }}...
                    </p>
                    <p class="text-xs text-gray-400">{{ order.table_name }}</p>
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-sm font-semibold text-gray-700"
                    >S/ {{ order.total.toFixed(2) }}</span
                  >
                  <span
                    class="text-xs px-2 py-1 rounded-full font-medium"
                    [class]="getStatusClass(order.status)"
                  >
                    {{ getStatusLabel(order.status) }}
                  </span>
                </div>
              </a>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class AdminDashboardComponent implements OnInit {
  readonly ordersService = inject(OrdersService);
  readonly usersService = inject(UsersService);
  readonly reportsService = inject(ReportsService);
  private readonly productService = inject(ProductService);

  readonly recentOrders = computed(() => this.ordersService.orders().slice(0, 5));

  readonly activeProductsCount = computed(
    () => this.productService.products().filter((p) => p.is_active).length,
  );

  readonly quickActions: QuickAction[] = [
    {
      label: 'Gestionar Usuarios',
      icon: '👥',
      route: '/dashboard/users',
      description: 'Roles y accesos',
    },
    {
      label: 'Gestionar Productos',
      icon: '🍦',
      route: '/dashboard/products',
      description: 'Inventario y precios',
    },
    {
      label: 'Ver Órdenes',
      icon: '📋',
      route: '/dashboard/orders',
      description: 'Activas e historial',
    },
    {
      label: 'Gestión de Caja',
      icon: '💰',
      route: '/dashboard/caja',
      description: 'Apertura y cierre',
    },
    {
      label: 'Ver Reportes',
      icon: '📊',
      route: '/dashboard/reports',
      description: 'Estadísticas del día',
    },
    {
      label: 'Gestionar Mesas',
      icon: '🪑',
      route: '/dashboard/tables',
      description: 'Estado y QR',
    },
  ];

  ngOnInit(): void {
    this.ordersService.loadOrders();
    this.usersService.loadUsers();
    this.reportsService.loadTodayRevenue();
    if (this.productService.products().length === 0) {
      this.productService.loadProducts();
    }
  }

  getStatusLabel(status: OrderStatus): string {
    const labels: Record<OrderStatus, string> = {
      pending: 'Pendiente',
      preparing: 'Preparando',
      ready: 'Listo',
      bill_requested: 'Cuenta solicitada',
      paid: 'Pagado',
    };
    return labels[status] ?? status;
  }

  getStatusClass(status: OrderStatus): string {
    const classes: Record<OrderStatus, string> = {
      pending: 'bg-amber-100 text-amber-700',
      preparing: 'bg-blue-100 text-blue-700',
      ready: 'bg-green-100 text-green-700',
      bill_requested: 'bg-orange-100 text-orange-700',
      paid: 'bg-gray-100 text-gray-500',
    };
    return classes[status] ?? 'bg-gray-100 text-gray-500';
  }
}
