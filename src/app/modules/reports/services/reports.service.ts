import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import {
  CashSession,
  DailySale,
  LowStockProduct,
  ReportPeriod,
  SalesSummary,
  TopProduct,
} from '../interfaces/reports.interface';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly supabase = inject(SupabaseService);

  readonly period = signal<ReportPeriod>('today');
  readonly salesSummary = signal<SalesSummary | null>(null);
  readonly dailySales = signal<DailySale[]>([]);
  readonly topProducts = signal<TopProduct[]>([]);
  readonly cashSessions = signal<CashSession[]>([]);
  readonly lowStockProducts = signal<LowStockProduct[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  private getDateRange(period: ReportPeriod): { from: string; to: string } {
    const now = new Date();
    const to = now.toISOString();
    let from: Date;

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
    }

    return { from: from.toISOString(), to };
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
      .from('products')
      .select('id, name, stock, category_id')
      .lte('stock', 5)
      .order('stock', { ascending: true });

    if (error) { this.error.set(error.message); return; }

    this.lowStockProducts.set((data ?? []) as LowStockProduct[]);
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
}
