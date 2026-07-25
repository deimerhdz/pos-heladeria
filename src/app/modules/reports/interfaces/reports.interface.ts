export type ReportPeriod = 'today' | 'week' | 'month' | 'specific-date' | 'year';

export interface SalesSummary {
  total: number;
  count: number;
  cashTotal: number;
  cardTotal: number;
  average: number;
}

export interface DailySale {
  date: string;
  count: number;
  total: number;
}

export interface TopProduct {
  name: string;
  totalQty: number;
  totalRevenue: number;
}

export interface CashSession {
  id: string;
  openedAt: string;
  closedAt: string | null;
  openingAmount: number;
  closingAmount: number | null;
  status: 'open' | 'closed';
  totalCollected: number;
}

export interface LowStockIngredient {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  reorder_point: number;
  category: string;
}

/** Fila de ventas por categoría (`GET /reports/categories`). */
export interface CategoryReportRow {
  categoryId: string | null;
  categoryName: string | null;
  units: number;
  revenue: number;
}

/** Fila de ventas por cajero (`GET /reports/cashiers`). */
export interface CashierReportRow {
  userId: string | null;
  userName: string | null;
  ticketCount: number;
  total: number;
}

/** Rentabilidad por categoría (`GET /reports/profitability`). */
export interface ProfitabilityRow {
  categoryId: string | null;
  categoryName: string | null;
  revenue: number;
  cogs: number;
  margin: number;
}

export interface ProfitabilityReport {
  revenue: number;
  cogs: number;
  margin: number;
  byCategory: ProfitabilityRow[];
}
