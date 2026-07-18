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
import { DiningOrder, DiningOrderItem, KitchenStatus } from '../interfaces/dining.interface';

interface Column {
  status: KitchenStatus;
  title: string;
  accent: string;
}

/** A kitchen ticket = one order item with its parent order's context. */
interface Ticket {
  itemId: string;
  item: DiningOrderItem;
  tableLabel: string;
  customerName: string;
  createdAt: string;
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
          <p class="text-gray-500 text-sm mt-1">Ítems en preparación · se actualiza solo</p>
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

      @if (loading() && tickets().length === 0) {
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
                  {{ ticketsFor(col.status).length }}
                </span>
              </div>

              <div class="p-3 space-y-3 overflow-y-auto">
                @for (t of ticketsFor(col.status); track t.itemId) {
                  <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                    <div class="flex items-center justify-between gap-2 mb-1.5">
                      <p class="text-sm font-semibold text-gray-900 truncate">{{ t.tableLabel }}</p>
                      <span class="text-xs text-gray-400 shrink-0">{{ elapsed(t.createdAt) }}</span>
                    </div>

                    <p class="text-sm text-gray-800">
                      <span class="font-medium">{{ t.item.quantity }}×</span>
                      {{ variantLabel(t.item.product_variant_id) }}
                    </p>
                    @if (optionLabels(t.item)) {
                      <p class="text-xs text-gray-400 pl-5">{{ optionLabels(t.item) }}</p>
                    }
                    @if (t.item.notes) {
                      <p class="text-xs text-amber-600 italic pl-5">“{{ t.item.notes }}”</p>
                    }
                    <p class="text-xs text-gray-400 mt-0.5">{{ t.customerName }}</p>

                    <div class="flex items-center gap-2 mt-2.5">
                      @if (nextFor(col.status); as next) {
                        <button
                          (click)="advance(t.itemId, next.status)"
                          [disabled]="isBusy(t.itemId)"
                          class="flex-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                        >
                          {{ next.label }}
                        </button>
                      }
                      @if (col.status !== 'listo') {
                        <button
                          (click)="advance(t.itemId, 'anulado')"
                          [disabled]="isBusy(t.itemId)"
                          title="Anular ítem"
                          class="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200 text-xs transition-colors disabled:opacity-50"
                        >
                          ✕
                        </button>
                      }
                    </div>
                  </div>
                } @empty {
                  <p class="text-center text-xs text-gray-300 py-8">Sin ítems</p>
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
  readonly busy = signal<Set<string>>(new Set());
  readonly error = signal<string | null>(null);

  private timer?: ReturnType<typeof setInterval>;

  readonly columns: Column[] = [
    { status: 'pendiente', title: 'Pendiente', accent: 'bg-amber-100 text-amber-700' },
    { status: 'en_preparacion', title: 'En preparación', accent: 'bg-blue-100 text-blue-700' },
    { status: 'listo', title: 'Listo', accent: 'bg-green-100 text-green-700' },
  ];

  private readonly lookup = computed(() => buildMenuLookup(this.menuService.categories()));

  private readonly tableLabels = computed(() => {
    const map = new Map<string, string>();
    for (const t of this.tableService.tables()) {
      map.set(t.id, t.name ? `Mesa ${t.number} · ${t.name}` : `Mesa ${t.number}`);
    }
    return map;
  });

  /** All active kitchen tickets (items), flattened from every open order. */
  readonly tickets = computed<Ticket[]>(() => {
    const labels = this.tableLabels();
    const out: Ticket[] = [];
    for (const order of this.orders()) {
      const tableLabel = (order.dining_table_id && labels.get(order.dining_table_id)) || 'Mostrador';
      for (const item of order.items ?? []) {
        out.push({
          itemId: item.id,
          item,
          tableLabel,
          customerName: order.customer_name ?? 'Cliente',
          createdAt: order.created_at,
        });
      }
    }
    return out;
  });

  async ngOnInit(): Promise<void> {
    // Orders first so the board never depends on menu/tables; those load labels.
    await this.reload(true);
    this.menuService.loadMenu();
    this.tableService.loadTables();
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

  ticketsFor(status: KitchenStatus): Ticket[] {
    const list = this.tickets().filter((t) => t.item.estado_cocina === status);
    // Oldest first for active work; newest first (capped) for the "listo" column.
    return status === 'listo'
      ? list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20)
      : list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  nextFor(status: KitchenStatus): { status: KitchenStatus; label: string } | null {
    if (status === 'pendiente') return { status: 'en_preparacion', label: 'Preparar →' };
    if (status === 'en_preparacion') return { status: 'listo', label: 'Marcar listo →' };
    if (status === 'listo') return { status: 'entregado', label: 'Entregar ✓' };
    return null;
  }

  isBusy(itemId: string): boolean {
    return this.busy().has(itemId);
  }

  async advance(itemId: string, next: KitchenStatus): Promise<void> {
    this.busy.update((s) => new Set(s).add(itemId));
    this.error.set(null);
    try {
      await this.api.updateItemKitchen(itemId, next);
      // Optimistically update the nested item's kitchen status.
      this.orders.update((orders) =>
        orders.map((o) => ({
          ...o,
          items: o.items?.map((it) => (it.id === itemId ? { ...it, estado_cocina: next } : it)),
        })),
      );
    } catch (err) {
      this.error.set(this.api.extractError(err, 'No se pudo actualizar el ítem.'));
    } finally {
      this.busy.update((s) => {
        const n = new Set(s);
        n.delete(itemId);
        return n;
      });
    }
  }

  variantLabel(variantId: string): string {
    return this.lookup().variantLabel(variantId);
  }

  optionLabels(item: DiningOrderItem): string {
    return (item.options ?? []).map((o) => this.lookup().optionLabel(o.option_id)).filter(Boolean).join(', ');
  }

  elapsed(createdAt: string): string {
    const mins = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
    if (mins < 1) return 'ahora';
    if (mins < 60) return `hace ${mins} min`;
    const h = Math.floor(mins / 60);
    return `hace ${h} h`;
  }
}
