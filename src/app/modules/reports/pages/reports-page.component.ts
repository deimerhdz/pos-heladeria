import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CategoryService } from '../../categories/services/category.service';
import { ReportPeriod, TopProduct } from '../interfaces/reports.interface';
import { ReportsService } from '../services/reports.service';

@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [DatePipe, RouterLink],
  template: `
    <div class="space-y-8">
      <!-- Header + período selector -->
      <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Informes</h1>
          <p class="text-gray-500 text-sm mt-1">Resumen de actividad del negocio</p>
        </div>
        <div class="flex flex-col items-start sm:items-end gap-2 self-start">
          <div class="flex flex-wrap gap-2 bg-gray-100 rounded-xl p-1">
            @for (opt of periodOptions; track opt.value) {
              <button
                (click)="reportsService.setPeriod(opt.value)"
                class="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                [class]="
                  reportsService.period() === opt.value
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                "
              >
                {{ opt.label }}
              </button>
            }
          </div>
          @if (reportsService.period() === 'specific-date') {
            <input
              type="date"
              [value]="reportsService.selectedDate()"
              (change)="onDateChange($event)"
              class="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-full sm:w-auto"
            />
          }
        </div>
      </div>

      <!-- Loading -->
      @if (reportsService.isLoading()) {
        <div class="flex justify-center py-16">
          <div
            class="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"
          ></div>
        </div>
      }

      <!-- Error -->
      @if (reportsService.error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
          {{ reportsService.error() }}
        </div>
      }

      @if (!reportsService.isLoading()) {
        <!-- ═══════════════════════════════════ -->
        <!-- SECCIÓN 1: RESUMEN DE INGRESOS      -->
        <!-- ═══════════════════════════════════ -->
        <section class="space-y-4">
          <h2 class="text-base font-bold text-gray-800 flex items-center gap-2">
            <span class="text-lg">💰</span> Resumen de ingresos
          </h2>

          @if (reportsService.salesSummary(); as s) {
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <p class="text-xs text-gray-400 uppercase tracking-wide font-medium">
                  Total cobrado
                </p>
                <p class="text-2xl font-bold text-gray-900 mt-1">S/ {{ s.total.toFixed(2) }}</p>
              </div>
              <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <p class="text-xs text-gray-400 uppercase tracking-wide font-medium">Cobros</p>
                <p class="text-2xl font-bold text-gray-900 mt-1">{{ s.count }}</p>
              </div>
              <div class="bg-white rounded-2xl p-4 shadow-sm border border-green-100">
                <p class="text-xs text-green-600 uppercase tracking-wide font-medium">Efectivo</p>
                <p class="text-2xl font-bold text-green-700 mt-1">
                  S/ {{ s.cashTotal.toFixed(2) }}
                </p>
              </div>
              <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <p class="text-xs text-gray-400 uppercase tracking-wide font-medium">
                  Ticket prom.
                </p>
                <p class="text-2xl font-bold text-gray-900 mt-1">S/ {{ s.average.toFixed(2) }}</p>
              </div>
            </div>
          }
        </section>

        <!-- ═══════════════════════════════════ -->
        <!-- SECCIÓN 2: VENTAS POR DÍA          -->
        <!-- ═══════════════════════════════════ -->
        <section class="space-y-4">
          <h2 class="text-base font-bold text-gray-800 flex items-center gap-2">
            <span class="text-lg">📅</span>
            {{ reportsService.period() === 'year' ? 'Ventas por mes' : 'Ventas por día' }}
          </h2>
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            @if (reportsService.dailySales().length === 0) {
              <p class="px-5 py-8 text-center text-sm text-gray-400">Sin ventas en este período</p>
            } @else {
              <table class="w-full">
                <thead>
                  <tr class="border-b border-gray-100 bg-gray-50">
                    <th
                      class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                    >
                      {{ reportsService.period() === 'year' ? 'Mes' : 'Fecha' }}
                    </th>
                    <th
                      class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                    >
                      Cobros
                    </th>
                    <th
                      class="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                    >
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                  @for (day of reportsService.dailySales(); track day.date) {
                    <tr class="hover:bg-gray-50 transition-colors">
                      <td class="px-5 py-3 text-sm font-medium text-gray-700">
                        @if (reportsService.period() === 'year') {
                          {{ day.date }}
                        } @else {
                          {{ day.date | date: 'EEEE dd/MM/yyyy' : '' : 'es' }}
                        }
                      </td>
                      <td class="px-5 py-3 text-sm text-gray-500">{{ day.count }}</td>
                      <td class="px-5 py-3 text-sm font-bold text-gray-900 text-right">
                        S/ {{ day.total.toFixed(2) }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </div>
        </section>

        <!-- ═══════════════════════════════════ -->
        <!-- SECCIÓN 3: PRODUCTOS MÁS VENDIDOS  -->
        <!-- ═══════════════════════════════════ -->
        <section class="space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-base font-bold text-gray-800 flex items-center gap-2">
              <span class="text-lg">🏆</span> Productos más vendidos
            </h2>
            <div class="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button
                (click)="productView.set('units')"
                class="px-3 py-1 rounded-md text-xs font-semibold transition-all"
                [class]="
                  productView() === 'units' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500'
                "
              >
                Por unidades
              </button>
              <button
                (click)="productView.set('revenue')"
                class="px-3 py-1 rounded-md text-xs font-semibold transition-all"
                [class]="
                  productView() === 'revenue'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-gray-500'
                "
              >
                Por ingresos
              </button>
            </div>
          </div>

          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            @if (sortedProducts().length === 0) {
              <p class="px-5 py-8 text-center text-sm text-gray-400">Sin ventas en este período</p>
            } @else {
              <div class="divide-y divide-gray-50">
                @for (p of sortedProducts(); track p.name; let i = $index) {
                  <div class="px-5 py-3 flex items-center gap-4">
                    <span class="w-6 text-xs font-bold text-gray-400 shrink-0">{{ i + 1 }}</span>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-semibold text-gray-800 truncate">{{ p.name }}</p>
                      <div class="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          class="h-full bg-indigo-500 rounded-full transition-all"
                          [style.width.%]="barWidth(p)"
                        ></div>
                      </div>
                    </div>
                    <div class="text-right shrink-0">
                      @if (productView() === 'units') {
                        <p class="text-sm font-bold text-gray-900">{{ p.totalQty }} uds.</p>
                        <p class="text-xs text-gray-400">S/ {{ p.totalRevenue.toFixed(2) }}</p>
                      } @else {
                        <p class="text-sm font-bold text-gray-900">
                          S/ {{ p.totalRevenue.toFixed(2) }}
                        </p>
                        <p class="text-xs text-gray-400">{{ p.totalQty }} uds.</p>
                      }
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        </section>

        <!-- ═══════════════════════════════════ -->
        <!-- SECCIÓN 4: SESIONES DE CAJA        -->
        <!-- ═══════════════════════════════════ -->
        <section class="space-y-4">
          <h2 class="text-base font-bold text-gray-800 flex items-center gap-2">
            <span class="text-lg">🗄️</span> Sesiones de caja
          </h2>
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            @if (reportsService.cashSessions().length === 0) {
              <p class="px-5 py-8 text-center text-sm text-gray-400">
                Sin sesiones de caja en este período
              </p>
            } @else {
              <table class="w-full">
                <thead>
                  <tr class="border-b border-gray-100 bg-gray-50">
                    <th
                      class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                    >
                      Fecha
                    </th>
                    <th
                      class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell"
                    >
                      Apertura
                    </th>
                    <th
                      class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell"
                    >
                      Cierre
                    </th>
                    <th
                      class="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell"
                    >
                      Monto apertura
                    </th>
                    <th
                      class="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                    >
                      Total cobrado
                    </th>
                    <th
                      class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                    >
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                  @for (session of reportsService.cashSessions(); track session.id) {
                    <tr class="hover:bg-gray-50 transition-colors">
                      <td class="px-5 py-3 text-sm text-gray-700">
                        {{ session.openedAt | date: 'dd/MM/yyyy' }}
                      </td>
                      <td class="px-5 py-3 text-sm text-gray-500 hidden md:table-cell">
                        {{ session.openedAt | date: 'HH:mm' }}
                      </td>
                      <td class="px-5 py-3 text-sm text-gray-500 hidden md:table-cell">
                        {{ session.closedAt ? (session.closedAt | date: 'HH:mm') : '—' }}
                      </td>
                      <td class="px-5 py-3 text-sm text-gray-700 text-right hidden md:table-cell">
                        S/ {{ session.openingAmount.toFixed(2) }}
                      </td>
                      <td class="px-5 py-3 text-sm font-bold text-gray-900 text-right">
                        S/ {{ session.totalCollected.toFixed(2) }}
                      </td>
                      <td class="px-5 py-3">
                        <span
                          class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                          [class]="
                            session.status === 'open'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          "
                        >
                          {{ session.status === 'open' ? 'Abierta' : 'Cerrada' }}
                        </span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </div>
        </section>

        <!-- ═══════════════════════════════════ -->
        <!-- SECCIÓN 5: INVENTARIO BAJO         -->
        <!-- ═══════════════════════════════════ -->
        <section class="space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-base font-bold text-gray-800 flex items-center gap-2">
              <span class="text-lg">📦</span> Inventario bajo
            </h2>
            <a
              routerLink="/dashboard/insumos"
              class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              Gestionar insumos →
            </a>
          </div>

          <!-- Resumen cards -->
          <div class="grid grid-cols-3 gap-4">
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <p class="text-xs text-gray-400 uppercase tracking-wide font-medium">
                Con stock bajo
              </p>
              <p class="text-2xl font-bold text-yellow-600 mt-1">{{ lowStockCount() }}</p>
            </div>
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-red-100">
              <p class="text-xs text-red-400 uppercase tracking-wide font-medium">Agotados</p>
              <p class="text-2xl font-bold text-red-600 mt-1">{{ outOfStockCount() }}</p>
            </div>
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <p class="text-xs text-gray-400 uppercase tracking-wide font-medium">
                Total críticos
              </p>
              <p class="text-2xl font-bold text-gray-900 mt-1">
                {{ reportsService.lowStockIngredients().length }}
              </p>
            </div>
          </div>

          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            @if (reportsService.lowStockIngredients().length === 0) {
              <div class="px-5 py-8 text-center">
                <p class="text-green-600 font-semibold text-sm">No hay insumos con stock bajo</p>
                <p class="text-xs text-gray-400 mt-1">Todos los insumos tienen stock suficiente</p>
              </div>
            } @else {
              <table class="w-full">
                <thead>
                  <tr class="border-b border-gray-100 bg-gray-50">
                    <th
                      class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                    >
                      Insumo
                    </th>
                    <th
                      class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell"
                    >
                      Unidad
                    </th>
                    <th
                      class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                    >
                      Stock actual
                    </th>
                    <th
                      class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell"
                    >
                      Pto. reorden
                    </th>
                    <th
                      class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden lg:table-cell"
                    >
                      Categoría
                    </th>
                    <th
                      class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                    >
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                  @for (i of reportsService.lowStockIngredients(); track i.id) {
                    <tr class="hover:bg-gray-50 transition-colors">
                      <td class="px-5 py-3 text-sm font-medium text-gray-800">{{ i.name }}</td>
                      <td class="px-5 py-3 text-sm text-gray-500 hidden md:table-cell">
                        {{ i.unit }}
                      </td>
                      <td class="px-5 py-3">
                        <span
                          class="text-sm font-bold"
                          [class]="
                            i.current_stock <= 0
                              ? 'text-red-600'
                              : i.current_stock <= i.min_stock
                                ? 'text-orange-600'
                                : 'text-yellow-600'
                          "
                        >
                          {{ i.current_stock }}
                        </span>
                      </td>
                      <td class="px-5 py-3 text-sm text-gray-500 hidden md:table-cell">
                        {{ i.reorder_point }}
                      </td>
                      <td class="px-5 py-3 text-sm text-gray-500 hidden lg:table-cell">
                        {{ i.category || '—' }}
                      </td>
                      <td class="px-5 py-3">
                        <span
                          class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
                          [class]="
                            i.current_stock <= 0
                              ? 'bg-red-100 text-red-600'
                              : i.current_stock <= i.min_stock
                                ? 'bg-orange-100 text-orange-700'
                                : 'bg-yellow-100 text-yellow-700'
                          "
                        >
                          {{
                            i.current_stock <= 0
                              ? 'Agotado'
                              : i.current_stock <= i.min_stock
                                ? 'Crítico'
                                : 'Stock bajo'
                          }}
                        </span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </div>
        </section>
      }
    </div>
  `,
})
export class ReportsPageComponent implements OnInit {
  readonly reportsService = inject(ReportsService);
  private readonly categoryService = inject(CategoryService);

  readonly productView = signal<'units' | 'revenue'>('units');

  readonly periodOptions: { label: string; value: ReportPeriod }[] = [
    { label: 'Hoy', value: 'today' },
    { label: '7 días', value: 'week' },
    { label: '30 días', value: 'month' },
    { label: 'Fecha exacta', value: 'specific-date' },
    { label: 'Año actual', value: 'year' },
  ];

  readonly sortedProducts = computed<TopProduct[]>(() => {
    const products = [...this.reportsService.topProducts()];
    if (this.productView() === 'revenue') {
      return products.sort((a, b) => b.totalRevenue - a.totalRevenue);
    }
    return products.sort((a, b) => b.totalQty - a.totalQty);
  });

  readonly lowStockCount = computed(
    () =>
      this.reportsService
        .lowStockIngredients()
        .filter((i) => i.current_stock > 0 && i.current_stock <= i.reorder_point).length,
  );

  readonly outOfStockCount = computed(
    () => this.reportsService.lowStockIngredients().filter((i) => i.current_stock <= 0).length,
  );

  ngOnInit(): void {
    this.reportsService.loadAll();
    if (this.categoryService.categories().length === 0) {
      this.categoryService.loadCategories();
    }
  }

  onDateChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (value) {
      this.reportsService.setSelectedDate(value);
    }
  }

  barWidth(product: TopProduct): number {
    const products = this.sortedProducts();
    if (products.length === 0) return 0;
    const maxVal =
      this.productView() === 'units'
        ? Math.max(...products.map((p) => p.totalQty))
        : Math.max(...products.map((p) => p.totalRevenue));
    if (maxVal === 0) return 0;
    const val = this.productView() === 'units' ? product.totalQty : product.totalRevenue;
    return Math.round((val / maxVal) * 100);
  }
}
