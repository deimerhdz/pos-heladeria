import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductService } from '../../products/services/product.service';
import { UsersService } from '../../users/services/users.service';
import { SalesService } from '../../sales/services/sales.service';
import { DiningSessionService } from '../../tables/services/dining-session.service';
import { TableService } from '../../tables/services/table.service';
import { DiningOrder } from '../../tables/interfaces/dining.interface';
import { orderStatusClass, orderStatusLabel } from '../../orders/order-status.util';

interface QuickAction {
  label: string;
  icon: string;
  route: string;
  description: string;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink, DatePipe, DecimalPipe],
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
              <p class="text-2xl font-bold text-gray-900 mt-1">{{ usersService.error() ? '–' : usersService.totalCount() }}</p>
              <p class="text-xs text-green-600 mt-1">en el sistema</p>
            </div>
            <div class="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-xl">👥</div>
          </div>
        </div>
        <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs text-gray-400 font-medium uppercase tracking-wide">Productos</p>
              <p class="text-2xl font-bold text-gray-900 mt-1">{{ activeProductsCount() }}</p>
              <p class="text-xs text-green-600 mt-1">activos</p>
            </div>
            <div class="w-10 h-10 rounded-xl bg-pink-50 flex items-center justify-center text-xl">🍦</div>
          </div>
        </div>
        <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs text-gray-400 font-medium uppercase tracking-wide">Órdenes activas</p>
              <p class="text-2xl font-bold text-gray-900 mt-1">{{ activeOrdersCount() }}</p>
              <p class="text-xs text-green-600 mt-1">en cocina</p>
            </div>
            <div class="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-xl">📋</div>
          </div>
        </div>
        <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs text-gray-400 font-medium uppercase tracking-wide">Ingresos hoy</p>
              @if (salesService.loading()) {
                <p class="text-2xl font-bold text-gray-300 mt-1 animate-pulse">–</p>
              } @else {
                <p class="text-2xl font-bold text-gray-900 mt-1">$ {{ todayRevenue() | number: '1.2-2' }}</p>
                <p class="text-xs text-green-600 mt-1">{{ todayCount() }} ventas hoy</p>
              }
            </div>
            <div class="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-xl">💰</div>
          </div>
        </div>
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
          <a routerLink="/dashboard/orders" class="text-xs text-indigo-600 font-medium hover:underline">Ver todas →</a>
        </div>
        @if (ordersError()) {
          <div class="px-5 py-4 text-sm text-red-600">No se pudieron cargar las órdenes</div>
        } @else if (loadingOrders()) {
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
                  <div class="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-sm">🍽️</div>
                  <div>
                    <p class="text-sm font-medium text-gray-800">{{ tableLabel(order) }}</p>
                    <p class="text-xs text-gray-400">
                      {{ order.created_at | date: 'HH:mm' }} · {{ itemCount(order) }} ítem(s)
                    </p>
                  </div>
                </div>
                <span class="text-xs px-2 py-1 rounded-full font-medium" [class]="statusClass(order.status)">
                  {{ statusLabel(order.status) }}
                </span>
              </a>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class AdminDashboardComponent implements OnInit {
  readonly usersService = inject(UsersService);
  readonly salesService = inject(SalesService);
  private readonly productService = inject(ProductService);
  private readonly api = inject(DiningSessionService);
  private readonly tableService = inject(TableService);

  readonly orders = signal<DiningOrder[]>([]);
  readonly loadingOrders = signal(false);
  readonly ordersError = signal(false);

  readonly activeProductsCount = computed(() => this.productService.products().filter((p) => p.active).length);

  readonly activeOrdersCount = computed(
    () => this.orders().filter((o) => o.status === 'pending' || o.status === 'preparing').length,
  );

  readonly recentOrders = computed(() =>
    [...this.orders()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5),
  );

  private readonly todaySales = computed(() => {
    const today = new Date().toDateString();
    return this.salesService.sales().filter((s) => new Date(s.sold_at).toDateString() === today);
  });
  readonly todayRevenue = computed(() => this.todaySales().reduce((s, sale) => s + Number(sale.total), 0));
  readonly todayCount = computed(() => this.todaySales().length);

  private readonly tableLabels = computed(() => {
    const map = new Map<string, string>();
    for (const t of this.tableService.tables()) {
      map.set(t.id, t.name ? `Mesa ${t.number} · ${t.name}` : `Mesa ${t.number}`);
    }
    return map;
  });

  readonly quickActions: QuickAction[] = [
    { label: 'Sesiones de mesa', icon: '🍽️', route: '/dashboard/mesas-sesiones', description: 'Cobrar y cerrar' },
    { label: 'Cocina', icon: '🍳', route: '/dashboard/cocina', description: 'Comandas en curso' },
    { label: 'Ventas', icon: '🧾', route: '/dashboard/ventas', description: 'Historial de cobros' },
    { label: 'Gestión de Caja', icon: '💰', route: '/dashboard/caja', description: 'Turnos y arqueo' },
    { label: 'Productos', icon: '🍦', route: '/dashboard/products', description: 'Catálogo y precios' },
    { label: 'Mesas', icon: '🪑', route: '/dashboard/tables', description: 'Estado y QR' },
  ];

  ngOnInit(): void {
    this.usersService.loadUsers();
    this.salesService.list();
    this.tableService.loadTables();
    if (this.productService.products().length === 0) {
      this.productService.loadProducts();
    }
    this.loadOrders();
  }

  private async loadOrders(): Promise<void> {
    this.loadingOrders.set(true);
    this.ordersError.set(false);
    try {
      this.orders.set(await this.api.listOrders());
    } catch {
      this.ordersError.set(true);
    } finally {
      this.loadingOrders.set(false);
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
}
