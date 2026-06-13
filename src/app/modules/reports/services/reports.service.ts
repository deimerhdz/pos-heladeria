import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import {
  CashSession,
  DailySale,
  LowStockIngredient,
  ReportPeriod,
  SalesSummary,
  TopProduct,
} from '../interfaces/reports.interface';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly supabase = inject(SupabaseService);

  readonly period = signal<ReportPeriod>('today');
  readonly selectedDate = signal<string>(new Date().toLocaleDateString('en-CA'));
  readonly salesSummary = signal<SalesSummary | null>(null);
  readonly dailySales = signal<DailySale[]>([]);
  readonly topProducts = signal<TopProduct[]>([]);
  readonly cashSessions = signal<CashSession[]>([]);
  readonly lowStockIngredients = signal<LowStockIngredient[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  private getDateRange(period: ReportPeriod): { from: string; to: string } {
    const now = new Date();
    let from: Date = now;
    let to: Date = now;

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

    return { from: from.toISOString(), to: to.toISOString() };
  }

  private groupByMonth(rows: { paid_at: string; amount: number }[]): DailySale[] {
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const year = new Date().getFullYear();
    const byMonth = Array.from({ length: 12 }, () => ({ count: 0, total: 0 }));

    for (const row of rows) {
      const monthIndex = new Date(row.paid_at).getMonth();
      byMonth[monthIndex].count += 1;
      byMonth[monthIndex].total += row.amount;
    }

    return byMonth.map((data, i) => ({
      date: `${monthNames[i]} ${year}`,
      count: data.count,
      total: data.total,
    }));
  }

  async loadAll(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    const { from, to } = this.getDateRange(this.period());

    try {
      await Promise.all([
        this.loadSalesSummary(from, to),
        this.loadDailySales(from, to),
        this.loadTopProducts(from, to),
        this.loadCashSessions(from, to),
        this.loadLowStock(),
      ]);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error al cargar los informes');
    }

    this.isLoading.set(false);
  }

  private async loadSalesSummary(from: string, to: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('payments')
      .select('amount, payment_method')
      .gte('paid_at', from)
      .lte('paid_at', to);

    if (error) { this.error.set(error.message); return; }

    const rows = (data ?? []) as { amount: number; payment_method: string }[];
    const total = rows.reduce((s, r) => s + r.amount, 0);
    const count = rows.length;
    const cashTotal = rows.filter(r => r.payment_method === 'cash').reduce((s, r) => s + r.amount, 0);
    const cardTotal = rows.filter(r => r.payment_method === 'card').reduce((s, r) => s + r.amount, 0);

    this.salesSummary.set({
      total,
      count,
      cashTotal,
      cardTotal,
      average: count > 0 ? total / count : 0,
    });
  }

  private async loadDailySales(from: string, to: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('payments')
      .select('paid_at, amount')
      .gte('paid_at', from)
      .lte('paid_at', to)
      .order('paid_at', { ascending: false });

    if (error) { this.error.set(error.message); return; }

    const rows = (data ?? []) as { paid_at: string; amount: number }[];

    if (this.period() === 'year') {
      this.dailySales.set(this.groupByMonth(rows));
      return;
    }

    const byDay = new Map<string, { count: number; total: number }>();

    for (const row of rows) {
      const day = row.paid_at.split('T')[0];
      const existing = byDay.get(day) ?? { count: 0, total: 0 };
      byDay.set(day, { count: existing.count + 1, total: existing.total + row.amount });
    }

    const sales: DailySale[] = Array.from(byDay.entries())
      .map(([date, { count, total }]) => ({ date, count, total }))
      .sort((a, b) => b.date.localeCompare(a.date));

    this.dailySales.set(sales);
  }

  private async loadTopProducts(from: string, to: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('order_items')
      .select('product_name, quantity, subtotal, order:orders!inner(created_at)')
      .gte('order.created_at', from)
      .lte('order.created_at', to);

    if (error) { this.error.set(error.message); return; }

    const rows = (data ?? []) as { product_name: string; quantity: number; subtotal: number }[];
    const byProduct = new Map<string, { totalQty: number; totalRevenue: number }>();

    for (const row of rows) {
      const existing = byProduct.get(row.product_name) ?? { totalQty: 0, totalRevenue: 0 };
      byProduct.set(row.product_name, {
        totalQty: existing.totalQty + row.quantity,
        totalRevenue: existing.totalRevenue + row.subtotal,
      });
    }

    const products: TopProduct[] = Array.from(byProduct.entries())
      .map(([name, { totalQty, totalRevenue }]) => ({ name, totalQty, totalRevenue }))
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 10);

    this.topProducts.set(products);
  }

  private async loadCashSessions(from: string, to: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('cash_registers')
      .select('id, opened_at, closed_at, opening_amount, closing_amount, status, payments(amount)')
      .gte('opened_at', from)
      .lte('opened_at', to)
      .order('opened_at', { ascending: false });

    if (error) { this.error.set(error.message); return; }

    const sessions: CashSession[] = (data ?? []).map((row: any) => ({
      id: row.id,
      openedAt: row.opened_at,
      closedAt: row.closed_at,
      openingAmount: row.opening_amount,
      closingAmount: row.closing_amount,
      status: row.status,
      totalCollected: (row.payments ?? []).reduce((s: number, p: any) => s + p.amount, 0),
    }));

    this.cashSessions.set(sessions);
  }

  private async loadLowStock(): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('ingredients')
      .select('id, name, unit, current_stock, min_stock, reorder_point, category')
      .eq('is_active', true)
      .order('current_stock', { ascending: true });

    if (error) { this.error.set(error.message); return; }

    const all = (data ?? []) as LowStockIngredient[];
    this.lowStockIngredients.set(all.filter(i => i.current_stock <= i.reorder_point));
  }

  async loadTodayRevenue(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    const { from, to } = this.getDateRange('today');
    await this.loadSalesSummary(from, to);
    this.isLoading.set(false);
  }

  async setPeriod(period: ReportPeriod): Promise<void> {
    this.period.set(period);
    await this.loadAll();
  }

  async setSelectedDate(date: string): Promise<void> {
    this.selectedDate.set(date);
    await this.loadAll();
  }
}
