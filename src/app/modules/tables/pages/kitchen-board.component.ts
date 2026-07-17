import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DiningSessionService } from '../services/dining-session.service';
import { TableService } from '../services/table.service';
import { MenuService } from '../../menu/services/menu.service';
import { buildMenuLookup } from '../services/menu-lookup';
import { DiningOrder, DiningOrderItem, DiningOrderStatus } from '../interfaces/dining.interface';

interface Column {
  status: DiningOrderStatus;
  title: string;
  accent: string;
}

const REFRESH_MS = 10_000;

@Component({
  selector: 'app-kitchen-board',
  standalone: true,
  template: `
    <div class="space-y-5">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Cocina</h1>
          <p class="text-gray-500 text-sm mt-1">Comandas en tiempo real · se actualiza solo</p>
        </div>
        <button
          (click)="reload(true)"
          [disabled]="loading()"
          class="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          ↻ Actualizar
        </button>
      </div>

      @if (error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{{ error() }}</div>
      }

      @if (loading() && orders().length === 0) {
        <div class="flex justify-center py-16">
          <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      } @else {
        <div class="grid gap-4 md:grid-cols-3">
          @for (col of columns; track col.status) {
            <div class="bg-gray-50 rounded-2xl border border-gray-100 flex flex-col min-h-[60vh]">
              <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span class="font-semibold text-gray-800">{{ col.title }}</span>
                <span class="text-xs font-bold px-2 py-0.5 rounded-full" [class]="col.accent">
                  {{ ordersByStatus(col.status).length }}
                </span>
              </div>

              <div class="p-3 space-y-3 overflow-y-auto">
                @for (order of ordersByStatus(col.status); track order.id) {
                  <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                    <div class="flex items-center justify-between gap-2 mb-2">
                      <div class="min-w-0">
                        <p class="text-sm font-semibold text-gray-900 truncate">{{ tableLabel(order) }}</p>
                        <p class="text-xs text-gray-400 truncate">
                          {{ order.customer_name || 'Cliente' }} · {{ elapsed(order.created_at) }}
                        </p>
                      </div>
                    </div>

                    <ul class="space-y-1.5 mb-3">
                      @for (item of order.items ?? []; track item.id) {
                        <li class="text-sm text-gray-700">
                          <span class="font-medium">{{ item.quantity }}×</span>
                          {{ variantLabel(item.product_variant_id) }}
                          @if (item.options && item.options.length > 0) {
                            <span class="block text-xs text-gray-400 pl-5">{{ optionLabels(item) }}</span>
                          }
                          @if (item.notes) {
                            <span class="block text-xs text-amber-600 italic pl-5">“{{ item.notes }}”</span>
                          }
                        </li>
                      } @empty {
                        <li class="text-xs text-gray-400">Sin ítems</li>
                      }
                    </ul>

                    <div class="flex items-center gap-2">
                      @if (nextStatus(order.status); as next) {
                        <button
                          (click)="advance(order, next)"
                          [disabled]="submitting()"
                          class="flex-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                        >
                          {{ actionLabel(order.status) }}
                        </button>
                      }
                      @if (order.status !== 'cancelled' && order.status !== 'served') {
                        <button
                          (click)="advance(order, 'cancelled')"
                          [disabled]="submitting()"
                          title="Cancelar"
                          class="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200 text-xs transition-colors disabled:opacity-50"
                        >
                          ✕
                        </button>
                      }
                    </div>
                  </div>
                } @empty {
                  <p class="text-center text-xs text-gray-300 py-8">Sin comandas</p>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class KitchenBoardComponent implements OnInit, OnDestroy {
  private readonly api = inject(DiningSessionService);
  private readonly tableService = inject(TableService);
  private readonly menuService = inject(MenuService);

  readonly orders = signal<DiningOrder[]>([]);
  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  private timer?: ReturnType<typeof setInterval>;

  readonly columns: Column[] = [
    { status: 'pending', title: 'Pendiente', accent: 'bg-amber-100 text-amber-700' },
    { status: 'preparing', title: 'En preparación', accent: 'bg-blue-100 text-blue-700' },
    { status: 'served', title: 'Servida', accent: 'bg-green-100 text-green-700' },
  ];

  private readonly lookup = computed(() => buildMenuLookup(this.menuService.categories()));

  private readonly tableLabels = computed(() => {
    const map = new Map<string, string>();
    for (const t of this.tableService.tables()) {
      map.set(t.id, t.name ? `Mesa ${t.number} · ${t.name}` : `Mesa ${t.number}`);
    }
    return map;
  });

  async ngOnInit(): Promise<void> {
    // Menu + tables are loaded once for label resolution; orders poll on an interval.
    await Promise.all([this.menuService.loadMenu(), this.tableService.loadTables()]);
    await this.reload(true);
    this.timer = setInterval(() => this.reload(false), REFRESH_MS);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async reload(showSpinner: boolean): Promise<void> {
    if (showSpinner) this.loading.set(true);
    this.error.set(null);
    try {
      this.orders.set(await this.api.listOrders());
    } catch (err) {
      this.error.set(this.api.extractError(err, 'No se pudieron cargar las comandas.'));
    } finally {
      this.loading.set(false);
    }
  }

  ordersByStatus(status: DiningOrderStatus): DiningOrder[] {
    const list = this.orders().filter((o) => o.status === status);
    // Oldest first for active work; newest first for the served column.
    return status === 'served'
      ? list.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 15)
      : list.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async advance(order: DiningOrder, next: DiningOrderStatus): Promise<void> {
    this.submitting.set(true);
    this.error.set(null);
    try {
      await this.api.updateOrderStatus(order.id, next);
      this.orders.update((list) => list.map((o) => (o.id === order.id ? { ...o, status: next } : o)));
    } catch (err) {
      this.error.set(this.api.extractError(err, 'No se pudo actualizar la comanda.'));
    } finally {
      this.submitting.set(false);
    }
  }

  tableLabel(order: DiningOrder): string {
    return (order.dining_table_id && this.tableLabels().get(order.dining_table_id)) || 'Mostrador';
  }

  variantLabel(variantId: string): string {
    return this.lookup().variantLabel(variantId);
  }

  optionLabels(item: DiningOrderItem): string {
    return (item.options ?? []).map((o) => this.lookup().optionLabel(o.option_id)).filter(Boolean).join(', ');
  }

  nextStatus(status: DiningOrderStatus): DiningOrderStatus | null {
    if (status === 'pending') return 'preparing';
    if (status === 'preparing') return 'served';
    return null;
  }

  actionLabel(status: DiningOrderStatus): string {
    if (status === 'pending') return 'Preparar →';
    if (status === 'preparing') return 'Marcar servida →';
    return '';
  }

  elapsed(createdAt: string): string {
    const mins = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
    if (mins < 1) return 'ahora';
    if (mins < 60) return `hace ${mins} min`;
    const h = Math.floor(mins / 60);
    return `hace ${h} h`;
  }
}
