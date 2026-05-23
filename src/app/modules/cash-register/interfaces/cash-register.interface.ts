export type CashRegisterStatus = 'open' | 'closed';
export type PaymentMethod = 'cash' | 'card';

export interface CashRegister {
  id: string;
  opened_by: string;
  opening_amount: number;
  closing_amount: number | null;
  status: CashRegisterStatus;
  opened_at: string;
  closed_at: string | null;
}

export interface Payment {
  id: string;
  order_id: string;
  cash_register_id: string;
  amount: number;
  payment_method: PaymentMethod;
  change_given: number;
  paid_at: string;
  table_name?: string;
}
