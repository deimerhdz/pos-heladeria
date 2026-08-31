import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ReportsService } from '../services/reports.service';
import { ReportPeriod, TopProduct } from '../interfaces/reports.interface';
import { formatMoney } from '../../../shared/money';
import { BarsChartComponent } from '../../../shared/charts/bars-chart.component';
import { ChartCardComponent } from '../../../shared/charts/chart-card.component';
import { RankedBarsChartComponent } from '../../../shared/charts/ranked-bars-chart.component';
import {
  ShareBarChartComponent,
  ShareItem,
} from '../../../shared/charts/share-bar-chart.component';
import { StatTileComponent } from '../../../shared/charts/stat-tile.component';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

@Component({
  selector: 'app-reports-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ChartCardComponent,
    StatTileComponent,
    BarsChartComponent,
    RankedBarsChartComponent,
    ShareBarChartComponent,
  ],
  template: `
    <div class="space-y-6">
      <!-- Cabecera y rango -->
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p class="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1">Análisis</p>
          <h1 class="text-2xl font-bold text-gray-900">Informes</h1>
          <p class="text-gray-500 text-sm mt-1">Resumen de actividad del negocio</p>
        </div>

        <div class="flex items-center gap-3 flex-wrap">
          <div class="flex flex-wrap gap-1 bg-gray-100 rounded-xl p-1">
            @for (opt of periodOptions; track opt.value) {
              <button
                type="button"
                (click)="svc.setPeriod(opt.value)"
                class="px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors"
                [class]="
                  svc.period() === opt.value
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                "
              >
                {{ opt.label }}
              </button>
            }
          </div>
          @if (svc.period() === 'specific-date') {
            <input
              type="date"
              [value]="svc.selectedDate()"
              (change)="onDateChange($event)"
              class="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          }
        </div>
      </div>

      @if (svc.error(); as err) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
          {{ err }}
        </div>
      }

      <!-- KPIs -->
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <app-stat-tile
          label="Total cobrado"
          [value]="money(svc.salesSummary()?.total ?? 0)"
          [loading]="svc.isLoading()"
        />
        <app-stat-tile
          label="Cobros"
          [value]="(svc.salesSummary()?.count ?? 0).toString()"
          [hint]="periodLabel()"
          [loading]="svc.isLoading()"
        />
        @if (svc.inventarioIncluido()) {
          <app-stat-tile
            label="Margen"
            tone="positive"
            [value]="money(svc.profitability()?.margin ?? 0)"
            [hint]="marginHint()"
            [loading]="svc.isLoading()"
          />
        }
        <app-stat-tile
          label="Ticket promedio"
          [value]="money(svc.salesSummary()?.average ?? 0)"
          [loading]="svc.isLoading()"
        />
      </div>

      <!-- Ventas por día / mes -->
      <app-chart-card
        [title]="svc.groupBy() === 'month' ? 'Ventas por mes' : 'Ventas por día'"
        [subtitle]="periodLabel()"
        [loading]="svc.isLoading()"
        [empty]="svc.dailySales().length === 0"
        [height]="240"
      >
        <svg
          card-icon
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="text-indigo-600"
        >
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M3 9h18" />
          <path d="M8 2v4" />
          <path d="M16 2v4" />
        </svg>
        <app-bars-chart
          [labels]="salesLabels()"
          [values]="salesValues()"
          kind="money"
          [height]="240"
        />
      </app-chart-card>

      <!-- Productos y cajeros -->
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <app-chart-card
          title="Productos más vendidos"
          [loading]="svc.isLoading()"
          [empty]="sortedProducts().length === 0"
          [height]="260"
        >
          <svg
            card-icon
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="text-indigo-600"
          >
            <path d="M8 21h8" />
            <path d="M12 17v4" />
            <path d="M6 3h12v4a6 6 0 0 1-12 0z" />
          </svg>

          <div card-actions class="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button
              type="button"
              (click)="productView.set('units')"
              class="px-3 py-1.5 rounded-md text-xs font-bold transition-colors"
              [class]="
                productView() === 'units'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              "
            >
              Por unidades
            </button>
            <button
              type="button"
              (click)="productView.set('revenue')"
              class="px-3 py-1.5 rounded-md text-xs font-bold transition-colors"
              [class]="
                productView() === 'revenue'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              "
            >
              Por ingresos
            </button>
          </div>

          <app-ranked-bars-chart
            [labels]="productLabels()"
            [values]="productValues()"
            [kind]="productView() === 'units' ? 'units' : 'money'"
          />
        </app-chart-card>

        <app-chart-card
          title="Ventas por cajero"
          [loading]="svc.isLoading()"
          [empty]="svc.cashiersReport().length === 0"
          [height]="260"
        >
          <svg
            card-icon
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="text-indigo-600"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20a8 8 0 0 1 16 0" />
          </svg>
          <app-ranked-bars-chart
            [labels]="cashierLabels()"
            [values]="cashierValues()"
            kind="money"
          />
        </app-chart-card>
      </div>

      <!-- Categorías -->
      <app-chart-card
        title="Ventas por categoría"
        subtitle="Participación sobre el total del período"
        [loading]="svc.isLoading()"
        [empty]="categoryShares().length === 0"
        [height]="140"
      >
        <svg
          card-icon
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="text-indigo-600"
        >
          <path d="M20.5 12.5l-8 8-9-9 8-8h6a3 3 0 0 1 3 3z" />
          <circle cx="14.5" cy="8.5" r="1.2" />
        </svg>
        <app-share-bar-chart [items]="categoryShares()" kind="money" />
      </app-chart-card>

      <!-- Stock bajo: alerta operativa, no un informe del período. Oculta
           por completo sin el módulo Inventario (spec 062, FR-005) — el
           dato depende de /reports/inventory, que ReportsService ya deja de
           pedir en ese caso (inventarioIncluido()). -->
      @if (svc.inventarioIncluido()) {
      <app-chart-card
        title="Insumos con stock bajo"
        subtitle="Independiente del período seleccionado"
        [loading]="svc.isLoading()"
        [height]="120"
      >
        <svg
          card-icon
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="text-amber-600"
        >
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </svg>
        <a
          card-actions
          routerLink="/dashboard/insumos"
          class="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
        >
          Gestionar insumos →
        </a>

        @if (svc.lowStockIngredients().length === 0) {
          <div class="text-center py-8">
            <p class="text-emerald-600 font-semibold text-sm">No hay insumos con stock bajo</p>
            <p class="text-xs text-gray-400 mt-1">Todos los insumos tienen stock suficiente</p>
          </div>
        } @else {
          <div class="flex gap-3 flex-wrap mb-4">
            <span class="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-bold">
              {{ lowStockCount() }} por reponer
            </span>
            @if (outOfStockCount() > 0) {
              <span class="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-bold">
                {{ outOfStockCount() }} agotados
              </span>
            }
          </div>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[420px]">
              <thead>
                <tr class="border-b border-gray-100">
                  <th
                    class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide py-2"
                  >
                    Insumo
                  </th>
                  <th
                    class="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide py-2"
                  >
                    Stock actual
                  </th>
                  <th
                    class="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide py-2"
                  >
                    Mínimo
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                @for (i of svc.lowStockIngredients(); track i.id) {
                  <tr>
                    <td class="py-2.5 text-sm font-medium text-gray-800">{{ i.name }}</td>
                    <td class="py-2.5 text-sm font-bold text-right"
                        [class]="i.current_stock <= 0 ? 'text-red-600' : 'text-amber-600'">
                      {{ i.current_stock }}
                    </td>
                    <td class="py-2.5 text-sm text-gray-500 text-right">{{ i.min_stock }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </app-chart-card>
      }
    </div>
  `,
})
export class ReportsPageComponent {
  readonly svc = inject(ReportsService);

  readonly productView = signal<'units' | 'revenue'>('units');

  readonly periodOptions: { label: string; value: ReportPeriod }[] = [
    { label: 'Hoy', value: 'today' },
    { label: '7 días', value: 'week' },
    { label: '30 días', value: 'month' },
    { label: 'Fecha exacta', value: 'specific-date' },
    { label: 'Año actual', value: 'year' },
  ];

  readonly periodLabel = computed(
    () => this.periodOptions.find((o) => o.value === this.svc.period())?.label ?? '',
  );

  /** Qué parte de los ingresos se queda el negocio, para dar contexto al margen. */
  readonly marginHint = computed(() => {
    const p = this.svc.profitability();
    if (!p || p.revenue <= 0) return '';
    return `${Math.round((p.margin / p.revenue) * 100)}% de los ingresos`;
  });

  // ── Ventas por día / mes ─────────────────────────────────────────────

  readonly salesLabels = computed(() =>
    this.svc.dailySales().map((d) => this.bucketLabel(d.date)),
  );
  readonly salesValues = computed(() => this.svc.dailySales().map((d) => d.total));

  /**
   * `2026-08-04` → `mar 4` por día, `ago` por mes. El backend devuelve siempre
   * una fecha; la granularidad la dice `groupBy`.
   */
  private bucketLabel(iso: string): string {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    if (this.svc.groupBy() === 'month') return MESES[m - 1] ?? iso;
    const fecha = new Date(y, m - 1, d);
    return `${DIAS[fecha.getDay()]} ${d}`;
  }

  // ── Productos ────────────────────────────────────────────────────────

  readonly sortedProducts = computed<TopProduct[]>(() => {
    const products = [...this.svc.topProducts()];
    return this.productView() === 'revenue'
      ? products.sort((a, b) => b.totalRevenue - a.totalRevenue)
      : products.sort((a, b) => b.totalQty - a.totalQty);
  });

  readonly productLabels = computed(() => this.sortedProducts().map((p) => p.name));
  readonly productValues = computed(() =>
    this.sortedProducts().map((p) =>
      this.productView() === 'units' ? p.totalQty : p.totalRevenue,
    ),
  );

  // ── Cajeros ──────────────────────────────────────────────────────────

  private readonly sortedCashiers = computed(() =>
    [...this.svc.cashiersReport()].sort((a, b) => b.total - a.total),
  );
  readonly cashierLabels = computed(() =>
    this.sortedCashiers().map((c) => c.userName ?? 'Sin asignar'),
  );
  readonly cashierValues = computed(() => this.sortedCashiers().map((c) => c.total));

  // ── Categorías ───────────────────────────────────────────────────────

  /**
   * Las categorías van ordenadas de mayor a menor y las que se salen del orden
   * fijo de color se agrupan en «Otras»: la guía prohíbe inventar un tono para
   * la sexta serie.
   */
  readonly categoryShares = computed<ShareItem[]>(() => {
    const rows = [...this.svc.categoriesReport()]
      .filter((c) => c.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);
    const visibles = rows.slice(0, 4).map((c) => ({
      label: c.categoryName ?? 'Sin categoría',
      value: c.revenue,
    }));
    const resto = rows.slice(4);
    if (resto.length) {
      visibles.push({
        label: `Otras (${resto.length})`,
        value: resto.reduce((sum, c) => sum + c.revenue, 0),
      });
    }
    return visibles;
  });

  // ── Inventario ───────────────────────────────────────────────────────

  readonly lowStockCount = computed(
    () =>
      this.svc
        .lowStockIngredients()
        .filter((i) => i.current_stock > 0 && i.current_stock <= i.reorder_point).length,
  );
  readonly outOfStockCount = computed(
    () => this.svc.lowStockIngredients().filter((i) => i.current_stock <= 0).length,
  );

  onDateChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (value) this.svc.setSelectedDate(value);
  }

  money(n: number): string {
    return formatMoney(n);
  }
}
