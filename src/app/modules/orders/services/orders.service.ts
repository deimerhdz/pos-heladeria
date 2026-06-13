import { Injectable, computed, inject, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ManualOrderItem, Order, OrderStatus, OrderWithItems } from '../interfaces/order.interface';

@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly supabase = inject(SupabaseService);

  readonly orders = signal<Order[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  readonly pendingOrders = computed(() => this.orders().filter((o) => o.status === 'pending'));
  readonly preparingOrders = computed(() => this.orders().filter((o) => o.status === 'preparing'));
  readonly readyOrders = computed(() => this.orders().filter((o) => o.status === 'ready'));
  readonly billRequestedOrders = computed(() =>
    this.orders().filter((o) => o.status === 'bill_requested'),
  );
  readonly activeOrdersCount = computed(
    () => this.orders().filter((o) => o.status !== 'paid').length,
  );

  async loadOrders(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    const { data, error } = await this.supabase.client
      .from('orders')
      .select('*, table:tables(name)')
      .order('created_at', { ascending: false });

    if (error) {
      this.error.set(error.message);
      this.isLoading.set(false);
      return;
    }

    this.orders.set(
      (data ?? []).map((row: any) => ({
        id: row.id,
        table_id: row.table_id,
        table_name: row.table_id ? (row.table?.name ?? 'Mesa desconocida') : 'Venta directa',
        status: row.status as OrderStatus,
        notes: row.notes,
        total: row.total,
        customer_name: row.customer_name,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
    );
    this.isLoading.set(false);
  }

  async loadOrderWithItems(id: string): Promise<OrderWithItems | null> {
    const { data, error } = await this.supabase.client
      .from('orders')
      .select('*, table:tables(name), items:order_items(*)')
      .eq('id', id)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      table_id: data.table_id,
      table_name: (data as any).table?.name ?? 'Mesa desconocida',
      status: data.status as OrderStatus,
      notes: data.notes,
      total: data.total,
      customer_name: data.customer_name,
      created_at: data.created_at,
      updated_at: data.updated_at,
      items: (data as any).items ?? [],
    };
  }

  async updateStatus(orderId: string, newStatus: OrderStatus): Promise<void> {
    const previous = this.orders();
    this.orders.update((orders) =>
      orders.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)),
    );

    const { error } = await this.supabase.client
      .from('orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', orderId);

    if (error) {
      this.orders.set(previous);
      this.error.set(error.message);
    }
  }

  subscribeToOrders(callback: () => void): RealtimeChannel {
    return this.supabase.client
      .channel('orders-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, callback)
      .subscribe();
  }

  async createManualOrder(items: ManualOrderItem[]): Promise<string | null> {
    this.error.set(null);
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);

    const { data: order, error: orderError } = await this.supabase.client
      .from('orders')
      .insert({ table_id: null, status: 'paid', notes: null, customer_name: null, total })
      .select('id')
      .single();

    if (orderError || !order) {
      this.error.set(orderError?.message ?? 'Error al crear la orden');
      return null;
    }

    const orderId = (order as { id: string }).id;
    const rows = items.map(item => ({
      order_id: orderId,
      product_id: item.product_id,
      product_name: item.product_name,
      unit_price: item.unit_price,
      quantity: item.quantity,
      subtotal: item.subtotal,
    }));

    const { error: itemsError } = await this.supabase.client.from('order_items').insert(rows);

    if (itemsError) {
      await this.supabase.client.from('orders').delete().eq('id', orderId);
      this.error.set(itemsError.message);
      return null;
    }

    return orderId;
  }

  getNextStatus(current: OrderStatus): OrderStatus | null {
    const transitions: Partial<Record<OrderStatus, OrderStatus>> = {
      pending: 'preparing',
      preparing: 'ready',
      ready: 'paid',
      bill_requested: 'paid',
    };
    return transitions[current] ?? null;
  }

  getNextStatusLabel(current: OrderStatus): string | null {
    const labels: Partial<Record<OrderStatus, string>> = {
      pending: 'Preparar',
      preparing: 'Listo',
      ready: 'Cobrar',
      bill_requested: 'Cobrar',
    };
    return labels[current] ?? null;
  }
}
