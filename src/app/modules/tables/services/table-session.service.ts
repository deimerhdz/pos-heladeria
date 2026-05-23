import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { TableSession } from '../interfaces/table.interface';

@Injectable({ providedIn: 'root' })
export class TableSessionService {
  private readonly supabase = inject(SupabaseService);

  async getActiveSession(tableId: string): Promise<TableSession | null> {
    // Step 1: find active order for this table (not paid)
    const { data: orderData, error: orderError } = await this.supabase.client
      .from('orders')
      .select('id, status, total')
      .eq('table_id', tableId)
      .neq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orderError || !orderData) return null;

    // Step 2: find the session linked to that order
    const { data: sessionData, error: sessionError } = await this.supabase.client
      .from('table_sessions')
      .select('id, member_count, capacity')
      .eq('order_id', orderData.id)
      .maybeSingle();

    if (sessionError || !sessionData) return null;

    // Step 3: load order items
    const { data: itemsData } = await this.supabase.client
      .from('order_items')
      .select('product_name, unit_price, quantity, subtotal')
      .eq('order_id', orderData.id)
      .order('created_at');

    const items = (itemsData ?? []) as {
      product_name: string;
      unit_price: number;
      quantity: number;
      subtotal: number;
    }[];

    return {
      sessionId: sessionData.id as string,
      orderId: orderData.id as string,
      orderStatus: orderData.status as TableSession['orderStatus'],
      memberCount: sessionData.member_count as number,
      capacity: sessionData.capacity as number,
      items: items.map(i => ({
        product_name: i.product_name,
        unit_price: i.unit_price,
        quantity: i.quantity,
        subtotal: i.subtotal,
      })),
      total: orderData.total as number,
    };
  }

  async joinSession(sessionId: string): Promise<TableSession | null> {
    const { data, error } = await this.supabase.client.rpc('join_table_session', {
      p_session_id: sessionId,
    });

    if (error || !data || (data as unknown[]).length === 0) return null;

    const row = (data as {
      id: string;
      order_id: string;
      member_count: number;
      capacity: number;
    }[])[0];

    // Load current session state (items + status) after join
    const updated = await this.getActiveSession_byOrderId(row.order_id);
    if (!updated) return null;

    return {
      ...updated,
      sessionId: row.id,
      memberCount: row.member_count,
      capacity: row.capacity,
    };
  }

  async createSession(tableId: string, orderId: string, capacity: number): Promise<void> {
    await this.supabase.client.from('table_sessions').insert({
      table_id: tableId,
      order_id: orderId,
      member_count: 1,
      capacity: capacity > 0 ? capacity : 1,
    });
  }

  async loadMemberItems(orderId: string, memberId: string): Promise<{
    product_name: string;
    unit_price: number;
    quantity: number;
    subtotal: number;
  }[]> {
    const { data } = await this.supabase.client
      .from('order_items')
      .select('product_name, unit_price, quantity, subtotal')
      .eq('order_id', orderId)
      .eq('member_id', memberId)
      .order('created_at');

    return (data ?? []) as {
      product_name: string;
      unit_price: number;
      quantity: number;
      subtotal: number;
    }[];
  }

  private async getActiveSession_byOrderId(orderId: string): Promise<Omit<TableSession, 'sessionId' | 'memberCount' | 'capacity'> | null> {
    const { data: orderData } = await this.supabase.client
      .from('orders')
      .select('id, status, total')
      .eq('id', orderId)
      .maybeSingle();

    if (!orderData) return null;

    const { data: itemsData } = await this.supabase.client
      .from('order_items')
      .select('product_name, unit_price, quantity, subtotal')
      .eq('order_id', orderId)
      .order('created_at');

    const items = (itemsData ?? []) as {
      product_name: string;
      unit_price: number;
      quantity: number;
      subtotal: number;
    }[];

    return {
      orderId: orderData.id as string,
      orderStatus: orderData.status as TableSession['orderStatus'],
      items: items.map(i => ({
        product_name: i.product_name,
        unit_price: i.unit_price,
        quantity: i.quantity,
        subtotal: i.subtotal,
      })),
      total: orderData.total as number,
    };
  }
}
