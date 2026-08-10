import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiErrorBody } from '../../../core/auth/auth.models';
import {
  CashierReportRow,
  CategoryReportRow,
  DailySale,
  LowStockIngredient,
  ProfitabilityReport,
  ReportPeriod,
  SalesSummary,
  TopProduct,
} from '../interfaces/reports.interface';

// ── Formas crudas del backend (`/api/v1/reports/*`) ──────────────────────────
interface SalesReportRes {
  total_sales: number | string;
  ticket_count: number;
  avg_ticket: number | string;
  by_day: { day: string; total: number | string; count: number }[];
}
interface ProductRowRes { product_variant_id: string; description: string; units: number; revenue: number | string; }
interface CategoryRowRes { category_id: string | null; category_name: string | null; units: number; revenue: number | string; }
interface CashierRowRes { user_id: string | null; user_name: string | null; ticket_count: number; total: number | string; }
interface InventoryRowRes {
  inventory_item_id: string; name: string; current_stock: number | string;
  min_stock: number | string; unit_cost: number | string; stock_value: number | string; below_min: boolean;
}
interface ProfitabilityRes {
  revenue: number | string; cogs: number | string; margin: number | string;
  by_category: { category_id: string | null; category_name: string | null; revenue: number | string; cogs: number | string; margin: number | string }[];
}

/** Granularidad del desglose temporal (`group_by` de `/reports/sales`). */
export type ReportGroupBy = 'day' | 'month';

/**
 * Informes servidos por `/api/v1/reports/*`, con **TanStack Query**: una query
 * por recurso, con el rango en la clave.
 *
 * Antes era un `loadAll()` imperativo con `Promise.all` que había que llamar a
 * mano y que volvía a pedir los seis endpoints en cada cambio de periodo, sin
 * caché. Ahora basta con mover `period`: las claves cambian, las queries se
 * relanzan solas, y volver a un rango ya visto se sirve de caché.
 */
@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/reports`;

  readonly period = signal<ReportPeriod>('today');
  readonly selectedDate = signal<string>(new Date().toLocaleDateString('en-CA'));

  /** Rango efectivo del periodo actual; entra en todas las claves de query. */
  readonly range = computed(() => this.getDateRange(this.period()));

  /**
   * Un año por día son 365 puntos, que ninguna gráfica dibuja: para ese periodo
   * se pide el desglose por mes (`group_by` del backend).
   */
  readonly groupBy = computed<ReportGroupBy>(() =>
    this.period() === 'year' ? 'month' : 'day',
  );

  private params(extra: Record<string, string> = {}): HttpParams {
    const { from, to } = this.range();
    let params = new HttpParams().set('date_from', from).set('date_to', to);
    for (const [k, v] of Object.entries(extra)) params = params.set(k, v);
    return params;
  }

  private readonly salesQuery = injectQuery(() => ({
    queryKey: ['reports', 'sales', this.range(), this.groupBy()],
    queryFn: () =>
      firstValueFrom(
        this.http.get<SalesReportRes>(`${this.base}/sales`, {
          params: this.params({ group_by: this.groupBy() }),
        }),
      ),
  }));

  private readonly topProductsQuery = injectQuery(() => ({
    queryKey: ['reports', 'top-products', this.range()],
    queryFn: () =>
      firstValueFrom(
        this.http.get<ProductRowRes[]>(`${this.base}/top-products`, {
          params: this.params({ limit: '10' }),
        }),
      ),
  }));

  private readonly categoriesQuery = injectQuery(() => ({
    queryKey: ['reports', 'categories', this.range()],
    queryFn: () =>
      firstValueFrom(
        this.http.get<CategoryRowRes[]>(`${this.base}/categories`, { params: this.params() }),
      ),
  }));

  private readonly cashiersQuery = injectQuery(() => ({
    queryKey: ['reports', 'cashiers', this.range()],
    queryFn: () =>
      firstValueFrom(
        this.http.get<CashierRowRes[]>(`${this.base}/cashiers`, { params: this.params() }),
      ),
  }));

  /** El inventario no depende del rango: su clave no lo lleva. */
  private readonly inventoryQuery = injectQuery(() => ({
    queryKey: ['reports', 'inventory'],
    queryFn: () => firstValueFrom(this.http.get<InventoryRowRes[]>(`${this.base}/inventory`)),
  }));

  private readonly profitabilityQuery = injectQuery(() => ({
    queryKey: ['reports', 'profitability', this.range()],
    queryFn: () =>
      firstValueFrom(
        this.http.get<ProfitabilityRes>(`${this.base}/profitability`, { params: this.params() }),
      ),
  }));

  // ── Datos de dominio ─────────────────────────────────────────────────
  // Los decimales llegan como string desde FastAPI; el `Number(...)` es el
  // único sitio donde se convierten.

  readonly salesSummary = computed<SalesSummary | null>(() => {
    const s = this.salesQuery.data();
    if (!s) return null;
    return {
      total: Number(s.total_sales),
      count: s.ticket_count,
      average: Number(s.avg_ticket),
      // El desglose efectivo/tarjeta se calcula en la reconciliación de caja;
      // no hay endpoint de reporte por método sobre un rango.
      cashTotal: 0,
      cardTotal: 0,
    };
  });

  readonly dailySales = computed<DailySale[]>(() =>
    (this.salesQuery.data()?.by_day ?? []).map((d) => ({
      date: d.day,
      count: d.count,
      total: Number(d.total),
    })),
  );

  readonly topProducts = computed<TopProduct[]>(() =>
    (this.topProductsQuery.data() ?? []).map((p) => ({
      name: p.description,
      totalQty: p.units,
      totalRevenue: Number(p.revenue),
    })),
  );

  readonly categoriesReport = computed<CategoryReportRow[]>(() =>
    (this.categoriesQuery.data() ?? []).map((c) => ({
      categoryId: c.category_id,
      categoryName: c.category_name,
      units: c.units,
      revenue: Number(c.revenue),
    })),
  );

  readonly cashiersReport = computed<CashierReportRow[]>(() =>
    (this.cashiersQuery.data() ?? []).map((c) => ({
      userId: c.user_id,
      userName: c.user_name,
      ticketCount: c.ticket_count,
      total: Number(c.total),
    })),
  );

  readonly lowStockIngredients = computed<LowStockIngredient[]>(() =>
    (this.inventoryQuery.data() ?? [])
      .filter((i) => i.below_min)
      .map((i) => ({
        id: i.inventory_item_id,
        name: i.name,
        unit: '',
        current_stock: Number(i.current_stock),
        min_stock: Number(i.min_stock),
        reorder_point: Number(i.min_stock),
        category: '',
      })),
  );

  readonly profitability = computed<ProfitabilityReport | null>(() => {
    const p = this.profitabilityQuery.data();
    if (!p) return null;
    return {
      revenue: Number(p.revenue),
      cogs: Number(p.cogs),
      margin: Number(p.margin),
      byCategory: p.by_category.map((r) => ({
        categoryId: r.category_id,
        categoryName: r.category_name,
        revenue: Number(r.revenue),
        cogs: Number(r.cogs),
        margin: Number(r.margin),
      })),
    };
  });

  // ── Estado agregado ──────────────────────────────────────────────────

  /** Solo las banderas: seis queries de tipos distintos no forman una unión
   *  llamable, y aquí no se lee el dato, solo el estado. */
  private readonly queries: {
    isPending: () => boolean;
    isFetching: () => boolean;
    isError: () => boolean;
    error: () => unknown;
  }[] = [
    this.salesQuery,
    this.topProductsQuery,
    this.categoriesQuery,
    this.cashiersQuery,
    this.inventoryQuery,
    this.profitabilityQuery,
  ];

  readonly isLoading = computed(() => this.queries.some((q) => q.isPending()));
  readonly isFetching = computed(() => this.queries.some((q) => q.isFetching()));
  readonly error = computed(() => {
    const fallida = this.queries.find((q) => q.isError());
    return fallida ? this.extractError(fallida.error()) : null;
  });

  setPeriod(period: ReportPeriod): void {
    this.period.set(period);
  }

  setSelectedDate(date: string): void {
    this.selectedDate.set(date);
  }

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as ApiErrorBody | null;
      const detail = body?.detail ?? body?.message;
      if (typeof detail === 'string') return detail;
    }
    return 'No se pudieron cargar los informes.';
  }

  /** Rango [from, to] en `YYYY-MM-DD` (los endpoints filtran por `sold_at`). */
  private getDateRange(period: ReportPeriod): { from: string; to: string } {
    const fmt = (d: Date) => d.toLocaleDateString('en-CA');
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let from = today;
    let to = today;
    switch (period) {
      case 'today':
        break;
      case 'week':
        from = new Date(today);
        from.setDate(from.getDate() - 6);
        break;
      case 'month':
        from = new Date(today);
        from.setDate(from.getDate() - 29);
        break;
      case 'specific-date': {
        const [y, m, d] = this.selectedDate().split('-').map(Number);
        from = to = new Date(y, m - 1, d);
        break;
      }
      case 'year':
        from = new Date(now.getFullYear(), 0, 1);
        to = new Date(now.getFullYear(), 11, 31);
        break;
    }
    return { from: fmt(from), to: fmt(to) };
  }
}
