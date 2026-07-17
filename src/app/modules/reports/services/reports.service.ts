import { Injectable, inject, signal } from '@angular/core';
import { SalesService } from '../../sales/services/sales.service';
import { PaymentMethodService } from '../../sales/services/payment-method.service';
import { InventoryService } from '../../inventory/services/inventory.service';
import { InventoryItem } from '../../inventory/interfaces/inventory.interface';
import { Sale } from '../../sales/interfaces/sales.interface';
import {
  CashSession,
  DailySale,
  LowStockIngredient,
  ReportPeriod,
  SalesSummary,
  TopProduct,
} from '../interfaces/reports.interface';

/**
 * Reports aggregated from the real API (there is no `/reports` endpoint):
 * `/sales` (revenue, daily series, top products, cash/card split via payment
 * methods) and `/inventory` (low stock). Cash-shift history is unavailable (the
 * API has no "list shifts" endpoint), so `cashSessions` stays empty.
 */
@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly salesApi = inject(SalesService);
  private readonly paymentMethods = inject(PaymentMethodService);
  private readonly inventory = inject(InventoryService);

  readonly period = signal<ReportPeriod>('today');
  readonly selectedDate = signal<string>(new Date().toLocaleDateString('en-CA'));
  readonly salesSummary = signal<SalesSummary | null>(null);
  readonly dailySales = signal<DailySale[]>([]);
  readonly topProducts = signal<TopProduct[]>([]);
  readonly cashSessions = signal<CashSession[]>([]);
  readonly lowStockIngredients = signal<LowStockIngredient[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  async loadAll(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      await Promise.all([
        this.salesApi.list(),
        this.paymentMethods.load(),
        this.inventory.loadItems(true),
      ]);
      this.compute();
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

  // ── Aggregation ────────────────────────────────────────────────────────────

  private compute(): void {
    const { from, to } = this.getDateRange(this.period());
    const fromMs = from.getTime();
    const toMs = to.getTime();

    const inRange = this.salesApi
      .sales()
      .filter((s) => {
        const ts = new Date(s.sold_at).getTime();
        return ts >= fromMs && ts <= toMs;
      });

    this.computeSummary(inRange);
    this.computeDaily(inRange);
    this.computeTopProducts(inRange);
    this.lowStockIngredients.set(this.inventory.lowStockItems().map((i) => this.toLowStock(i)));
    this.cashSessions.set([]); // no shift-history endpoint
  }

  private computeSummary(sales: Sale[]): void {
    const isCash = new Map(this.paymentMethods.methods().map((m) => [m.id, m.is_cash]));
    let cashTotal = 0;
    let cardTotal = 0;
    for (const sale of sales) {
      for (const p of sale.payments ?? []) {
        const amount = Number(p.amount);
        if (isCash.get(p.payment_method_id)) cashTotal += amount;
        else cardTotal += amount;
      }
    }
    const total = sales.reduce((s, sale) => s + Number(sale.total), 0);
    const count = sales.length;
    this.salesSummary.set({
      total,
      count,
      cashTotal,
      cardTotal,
      average: count > 0 ? total / count : 0,
    });
  }

  private computeDaily(sales: Sale[]): void {
    if (this.period() === 'year') {
      this.dailySales.set(this.groupByMonth(sales));
      return;
    }
    const byDay = new Map<string, { count: number; total: number }>();
    for (const sale of sales) {
      const day = sale.sold_at.split('T')[0];
      const e = byDay.get(day) ?? { count: 0, total: 0 };
      byDay.set(day, { count: e.count + 1, total: e.total + Number(sale.total) });
    }
    this.dailySales.set(
      [...byDay.entries()]
        .map(([date, { count, total }]) => ({ date, count, total }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    );
  }

  private computeTopProducts(sales: Sale[]): void {
    const byProduct = new Map<string, { totalQty: number; totalRevenue: number }>();
    for (const sale of sales) {
      for (const item of sale.items ?? []) {
        const e = byProduct.get(item.description) ?? { totalQty: 0, totalRevenue: 0 };
        byProduct.set(item.description, {
          totalQty: e.totalQty + item.quantity,
          totalRevenue: e.totalRevenue + Number(item.line_total),
        });
      }
    }
    this.topProducts.set(
      [...byProduct.entries()]
        .map(([name, v]) => ({ name, totalQty: v.totalQty, totalRevenue: v.totalRevenue }))
        .sort((a, b) => b.totalQty - a.totalQty)
        .slice(0, 10),
    );
  }

  private groupByMonth(sales: Sale[]): DailySale[] {
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const year = new Date().getFullYear();
    const byMonth = Array.from({ length: 12 }, () => ({ count: 0, total: 0 }));
    for (const sale of sales) {
      const m = new Date(sale.sold_at).getMonth();
      byMonth[m].count += 1;
      byMonth[m].total += Number(sale.total);
    }
    return byMonth.map((data, i) => ({ date: `${monthNames[i]} ${year}`, count: data.count, total: data.total }));
  }

  /** The inventory item lacks unit/category/reorder_point; min_stock is the threshold. */
  private toLowStock(i: InventoryItem): LowStockIngredient {
    return {
      id: i.id,
      name: i.name,
      unit: '',
      current_stock: i.current_stock,
      min_stock: i.min_stock,
      reorder_point: i.min_stock,
      category: '',
    };
  }

  private getDateRange(period: ReportPeriod): { from: Date; to: Date } {
    const now = new Date();
    let from = now;
    let to = now;
    switch (period) {
      case 'today':
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        break;
      case 'week':
        from = new Date(now);
        from.setDate(from.getDate() - 6);
        from.setHours(0, 0, 0, 0);
        break;
      case 'month':
        from = new Date(now);
        from.setDate(from.getDate() - 29);
        from.setHours(0, 0, 0, 0);
        break;
      case 'specific-date': {
        const [y, m, d] = this.selectedDate().split('-').map(Number);
        from = new Date(y, m - 1, d, 0, 0, 0, 0);
        to = new Date(y, m - 1, d, 23, 59, 59, 999);
        break;
      }
      case 'year':
        from = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        to = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        break;
    }
    return { from, to };
  }
}
