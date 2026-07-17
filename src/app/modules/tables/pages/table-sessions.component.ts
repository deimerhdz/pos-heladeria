import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DiningSessionService } from '../services/dining-session.service';
import { TableService } from '../services/table.service';
import { DiningOrder, DiningOrderStatus } from '../interfaces/dining.interface';
import { CheckoutComponent } from '../../sales/components/checkout.component';

interface SessionGroup {
  sessionId: string;
  tableLabel: string;
  customerName: string;
  diningTableId: string | null;
  orders: DiningOrder[];
}

const STATUS_META: Record<DiningOrderStatus, { label: string; classes: string }> = {
  pending: { label: 'En espera', classes: 'bg-amber-100 text-amber-700' },
  preparing: { label: 'En preparación', classes: 'bg-blue-100 text-blue-700' },
  served: { label: 'Servida', classes: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelada', classes: 'bg-gray-100 text-gray-500' },
};

const NEXT_STATUS: Partial<Record<DiningOrderStatus, DiningOrderStatus>> = {
  pending: 'preparing',
  preparing: 'served',
};

@Component({
  selector: 'app-table-sessions',
  standalone: true,
  imports: [CheckoutComponent],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Sesiones de mesa</h1>
          <p class="text-gray-500 text-sm mt-1">Comandas activas por mesa. Avanza su estado o cierra la sesión.</p>
        </div>
        <button
          (click)="reload()"
          [disabled]="loading()"
          class="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          ↻ Refrescar
        </button>
      </div>

      @if (error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{{ error() }}</div>
      }

      <p class="text-xs text-gray-400">
        Solo se muestran mesas con comandas activas (la API no expone un listado de sesiones abiertas).
      </p>

      @if (loading() && groups().length === 0) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      } @else if (groups().length === 0) {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center py-16 text-center px-4">
          <div class="text-5xl mb-4">🍽️</div>
          <p class="text-gray-600 font-medium">No hay sesiones con comandas activas</p>
          <p class="text-gray-400 text-sm mt-1">Cuando un cliente pida desde el QR, aparecerá aquí</p>
        </div>
      } @else {
        <div class="grid gap-4 md:grid-cols-2">
          @for (group of groups(); track group.sessionId) {
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <!-- Session header -->
              <div class="flex items-center justify-between gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50">
                <div class="min-w-0">
                  <p class="font-semibold text-gray-900 truncate">{{ group.tableLabel }}</p>
                  <p class="text-xs text-gray-500 truncate">{{ group.customerName }}</p>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <button
                    (click)="openCheckout(group)"
                    [disabled]="submitting()"
                    class="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    💵 Cobrar
                  </button>
                  <button
                    (click)="closeSession(group.sessionId)"
                    [disabled]="submitting()"
                    class="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    Cerrar
                  </button>
                </div>
              </div>

              <!-- Orders -->
              <div class="divide-y divide-gray-50">
                @for (order of group.orders; track order.id) {
                  <div class="px-5 py-3">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-xs font-semibold px-2 py-0.5 rounded-full" [class]="statusClass(order.status)">
                        {{ statusLabel(order.status) }}
                      </span>
                      <div class="flex items-center gap-2">
                        <span class="text-xs text-gray-400">{{ itemCount(order) }} ítem(s)</span>
                        @if (nextStatus(order.status); as next) {
                          <button
                            (click)="advance(order, next)"
                            [disabled]="submitting()"
                            class="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
                          >
                            {{ statusLabel(next) }} →
                          </button>
                        }
                      </div>
                    </div>
                    @if (order.notes) {
                      <p class="text-xs text-gray-400 italic mt-1 truncate">“{{ order.notes }}”</p>
                    }
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>

    @if (checkoutGroup(); as g) {
      <app-checkout
        [sessionId]="g.sessionId"
        [diningTableId]="g.diningTableId"
        [customerName]="g.customerName"
        [tableLabel]="g.tableLabel"
        [orders]="g.orders"
        (paid)="onPaid()"
        (cancelled)="checkoutGroup.set(null)"
      />
    }
  `,
})
export class TableSessionsComponent implements OnInit {
  private readonly api = inject(DiningSessionService);
  private readonly tableService = inject(TableService);

  readonly orders = signal<DiningOrder[]>([]);
  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly checkoutGroup = signal<SessionGroup | null>(null);

  /** table id → "Mesa N · Nombre" label. */
  private readonly tableLabels = computed(() => {
    const map = new Map<string, string>();
    for (const t of this.tableService.tables()) {
      map.set(t.id, t.name ? `Mesa ${t.number} · ${t.name}` : `Mesa ${t.number}`);
    }
    return map;
  });

  /** Active orders grouped by session. */
  readonly groups = computed<SessionGroup[]>(() => {
    const labels = this.tableLabels();
    const bySession = new Map<string, SessionGroup>();
    for (const order of this.orders()) {
      if (order.status === 'served' || order.status === 'cancelled') continue;
      const sessionId = order.dining_session_id;
      if (!sessionId) continue;
      let group = bySession.get(sessionId);
      if (!group) {
        group = {
          sessionId,
          tableLabel: (order.dining_table_id && labels.get(order.dining_table_id)) || 'Mesa',
          customerName: order.customer_name ?? 'Cliente',
          diningTableId: order.dining_table_id ?? null,
          orders: [],
        };
        bySession.set(sessionId, group);
      }
      group.orders.push(order);
    }
    return [...bySession.values()];
  });

  ngOnInit(): void {
    this.reload();
  }

  openCheckout(group: SessionGroup): void {
    this.checkoutGroup.set(group);
  }

  /** Sale emitted + session closed inside the checkout → refresh the board. */
  onPaid(): void {
    this.checkoutGroup.set(null);
    this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      // Tables give us readable labels; orders drive the active sessions.
      await this.tableService.loadTables();
      this.orders.set(await this.api.listOrders());
    } catch (err) {
      this.error.set(this.api.extractError(err, 'No se pudieron cargar las sesiones.'));
    } finally {
      this.loading.set(false);
    }
  }

  async advance(order: DiningOrder, next: DiningOrderStatus): Promise<void> {
    this.submitting.set(true);
    this.error.set(null);
    try {
      await this.api.updateOrderStatus(order.id, next);
      this.orders.set(await this.api.listOrders());
    } catch (err) {
      this.error.set(this.api.extractError(err, 'No se pudo actualizar la comanda.'));
    } finally {
      this.submitting.set(false);
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    this.submitting.set(true);
    this.error.set(null);
    try {
      await this.api.closeSession(sessionId);
      this.orders.set(await this.api.listOrders());
    } catch (err) {
      this.error.set(this.api.extractError(err, 'No se pudo cerrar la sesión.'));
    } finally {
      this.submitting.set(false);
    }
  }

  itemCount(order: DiningOrder): number {
    return (order.items ?? []).reduce((n, i) => n + i.quantity, 0);
  }

  nextStatus(status: DiningOrderStatus): DiningOrderStatus | null {
    return NEXT_STATUS[status] ?? null;
  }

  statusLabel(status: DiningOrderStatus): string {
    return STATUS_META[status]?.label ?? status;
  }

  statusClass(status: DiningOrderStatus): string {
    return STATUS_META[status]?.classes ?? 'bg-gray-100 text-gray-500';
  }
}
