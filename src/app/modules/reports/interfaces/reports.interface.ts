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
