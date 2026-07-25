import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
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

/**
 * Informes servidos por la API real (`/api/v1/reports/*`): la agregación ocurre
 * en el backend. Mantiene la API pública previa (period/selectedDate/summary/
 * dailySales/topProducts/lowStockIngredients) y añade categorías, cajeros y
 * rentabilidad.
 */
@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/reports`;

  readonly period = signal<ReportPeriod>('today');
  readonly selectedDate = signal<string>(new Date().toLocaleDateString('en-CA'));
  readonly salesSummary = signal<SalesSummary | null>(null);
  readonly dailySales = signal<DailySale[]>([]);
  readonly topProducts = signal<TopProduct[]>([]);
  readonly lowStockIngredients = signal<LowStockIngredient[]>([]);
  readonly categoriesReport = signal<CategoryReportRow[]>([]);
  readonly cashiersReport = signal<CashierReportRow[]>([]);
  readonly profitability = signal<ProfitabilityReport | null>(null);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  async loadAll(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    const { from, to } = this.getDateRange(this.period());
    const range = { date_from: from, date_to: to };
    try {
      const [sales, top, categories, cashiers, inventory, profitability] = await Promise.all([
        firstValueFrom(this.http.get<SalesReportRes>(`${this.base}/sales`, { params: range })),
        firstValueFrom(this.http.get<ProductRowRes[]>(`${this.base}/top-products`, { params: { ...range, limit: '10' } })),
        firstValueFrom(this.http.get<CategoryRowRes[]>(`${this.base}/categories`, { params: range })),
        firstValueFrom(this.http.get<CashierRowRes[]>(`${this.base}/cashiers`, { params: range })),
        firstValueFrom(this.http.get<InventoryRowRes[]>(`${this.base}/inventory`)),
        firstValueFrom(this.http.get<ProfitabilityRes>(`${this.base}/profitability`, { params: range })),
      ]);

      const total = Number(sales.total_sales);
      const count = sales.ticket_count;
      this.salesSummary.set({
        total,
        count,
        average: Number(sales.avg_ticket),
        // El desglose efectivo/tarjeta se calcula en la reconciliación de caja
        // (no hay endpoint de reporte por método sobre un rango); se omite aquí.
        cashTotal: 0,
        cardTotal: 0,
      });
      this.dailySales.set(
        sales.by_day.map(d => ({ date: d.day, count: d.count, total: Number(d.total) })),
      );
      this.topProducts.set(
        top.map(p => ({ name: p.description, totalQty: p.units, totalRevenue: Number(p.revenue) })),
      );
      this.categoriesReport.set(
        categories.map(c => ({
          categoryId: c.category_id, categoryName: c.category_name,
          units: c.units, revenue: Number(c.revenue),
        })),
      );
      this.cashiersReport.set(
        cashiers.map(c => ({
          userId: c.user_id, userName: c.user_name,
          ticketCount: c.ticket_count, total: Number(c.total),
        })),
      );
      this.lowStockIngredients.set(
        inventory.filter(i => i.below_min).map(i => ({
          id: i.inventory_item_id, name: i.name, unit: '',
          current_stock: Number(i.current_stock), min_stock: Number(i.min_stock),
          reorder_point: Number(i.min_stock), category: '',
        })),
      );
      this.profitability.set({
        revenue: Number(profitability.revenue),
        cogs: Number(profitability.cogs),
        margin: Number(profitability.margin),
        byCategory: profitability.by_category.map(r => ({
          categoryId: r.category_id, categoryName: r.category_name,
          revenue: Number(r.revenue), cogs: Number(r.cogs), margin: Number(r.margin),
        })),
      });
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : 'Error al cargar los informes');
    } finally {
      this.isLoading.set(false);
    }
  }

  async setPeriod(period: ReportPeriod): Promise<void> {
    this.period.set(period);
    await this.loadAll();
  }

  async setSelectedDate(date: string): Promise<void> {
    this.selectedDate.set(date);
    await this.loadAll();
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
