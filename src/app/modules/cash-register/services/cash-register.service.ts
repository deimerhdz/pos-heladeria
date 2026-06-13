import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { OrdersService } from '../../orders/services/orders.service';
import { CashRegister, Payment } from '../interfaces/cash-register.interface';
import { PaymentFormData } from '../interfaces/payment.interface';

@Injectable({ providedIn: 'root' })
export class CashRegisterService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly ordersService = inject(OrdersService);

  readonly currentSession = signal<CashRegister | null>(null);
  readonly todayPayments = signal<Payment[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  readonly todaySalesTotal = computed(() =>
    this.todayPayments().reduce((sum, p) => sum + p.amount, 0)
  );

  async loadCurrentSession(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await this.supabase.client
      .from('cash_registers')
      .select('*')
      .eq('status', 'open')
      .gte('opened_at', `${today}T00:00:00`)
      .lte('opened_at', `${today}T23:59:59`)
      .maybeSingle();

    if (error) {
      this.error.set(error.message);
      this.isLoading.set(false);
      return;
    }

    this.currentSession.set(data ?? null);

    if (data) {
      await this.loadTodayPayments();
    }

    this.isLoading.set(false);
  }

  async openCashRegister(openingAmount: number): Promise<void> {
    if (this.currentSession()) {
      this.error.set('Ya existe una sesión de caja abierta para hoy.');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    const userId = this.auth.currentUser()?.id;
    if (!userId) {
      this.error.set('No se pudo identificar al usuario.');
      this.isLoading.set(false);
      return;
    }

    const { data, error } = await this.supabase.client
      .from('cash_registers')
      .insert({ opened_by: userId, opening_amount: openingAmount, status: 'open' })
      .select()
      .single();

    if (error) {
      this.error.set(error.message);
      this.isLoading.set(false);
      return;
    }

    this.currentSession.set(data as CashRegister);
    this.todayPayments.set([]);
    this.isLoading.set(false);
  }

  async closeCashRegister(): Promise<void> {
    const session = this.currentSession();
    if (!session) return;

    this.isLoading.set(true);
    this.error.set(null);

    const closingAmount = session.opening_amount + this.todaySalesTotal();

    const { error } = await this.supabase.client
      .from('cash_registers')
      .update({
        status: 'closed',
        closing_amount: closingAmount,
        closed_at: new Date().toISOString(),
      })
      .eq('id', session.id);

    if (error) {
      this.error.set(error.message);
      this.isLoading.set(false);
      return;
    }

    this.currentSession.set(null);
    this.isLoading.set(false);
  }

  async processPayment(data: PaymentFormData): Promise<void> {
    const session = this.currentSession();
    if (!session) {
      this.error.set('No hay una sesión de caja abierta.');
      return;
    }

    this.error.set(null);

    const { data: inserted, error } = await this.supabase.client
      .from('payments')
      .insert({
        order_id: data.orderId,
        cash_register_id: session.id,
        amount: data.amount,
        payment_method: data.paymentMethod,
        change_given: data.changeGiven,
      })
      .select()
      .single();

    if (error) {
      this.error.set(error.message);
      return;
    }

    await this.ordersService.updateStatus(data.orderId, 'paid');
    await this.loadTodayPayments();
  }

  async loadTodayPayments(): Promise<void> {
    const session = this.currentSession();
    if (!session) return;

    const { data, error } = await this.supabase.client
      .from('payments')
      .select('*, order:orders(table_id, tables(name))')
      .eq('cash_register_id', session.id)
      .order('paid_at', { ascending: false });

    if (error) {
      this.error.set(error.message);
      return;
    }

    this.todayPayments.set(
      (data ?? []).map((row: any) => ({
        id: row.id,
        order_id: row.order_id,
        cash_register_id: row.cash_register_id,
        amount: row.amount,
        payment_method: row.payment_method,
        change_given: row.change_given,
        paid_at: row.paid_at,
        table_name: row.order?.tables?.name ?? 'Mesa desconocida',
      }))
    );
  }
}
