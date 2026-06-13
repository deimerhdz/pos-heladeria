import { Injectable, computed, inject, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from '../../../core/services/supabase.service';
import { CartItem, MenuProduct, SessionItem, TableSession, TableSessionStorage } from '../interfaces/table.interface';
import { TableSessionService } from './table-session.service';

const SESSION_STORAGE_KEY = 'tableSession';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly supabase = inject(SupabaseService);
  private readonly tableSessionService = inject(TableSessionService);
  private realtimeChannel: RealtimeChannel | null = null;

  readonly items = signal<CartItem[]>([]);
  readonly tableId = signal<string>('');
  readonly customerName = signal<string>('');
  readonly lastOrderId = signal<string | null>(null);
  readonly billRequested = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly orderConfirmed = signal(false);
  readonly orderStatus = signal<string | null>(null);

  // Session state
  readonly activeSession = signal<TableSession | null>(null);
  readonly memberId = signal<string | null>(null);
  readonly isRejoin = signal(false);
  readonly myConfirmedItems = signal<SessionItem[]>([]);

  readonly personalTotal = computed(() =>
    this.items().reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  );

  constructor() {
    const saved = localStorage.getItem('guestName');
    if (saved) this.customerName.set(saved);
  }

  setCustomerName(name: string): void {
    this.customerName.set(name);
    localStorage.setItem('guestName', name);
  }

  readonly totalItems = computed(() =>
    this.items().reduce((sum, item) => sum + item.quantity, 0)
  );

  readonly totalAmount = computed(() =>
    this.items().reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  );

  async setTable(tableId: string): Promise<void> {
    this.tableId.set(tableId);

    const session = await this.tableSessionService.getActiveSession(tableId);

    if (!session) {
      this.clearSessionStorage();
      this.activeSession.set(null);
      this.memberId.set(null);
      this.isRejoin.set(false);
      this.myConfirmedItems.set([]);
      return;
    }

    // Check localStorage for rejoin
    const stored = this.loadSessionStorage();
    if (stored && stored.sessionId === session.sessionId) {
      this.memberId.set(stored.memberId);
      this.activeSession.set(session);
      this.isRejoin.set(true);
      this.billRequested.set(session.orderStatus === 'bill_requested');
      this.lastOrderId.set(session.orderId);
      this.orderStatus.set(session.orderStatus);
      this.subscribeToOrderStatus(session.orderId);
      const confirmed = await this.tableSessionService.loadMemberItems(session.orderId, stored.memberId);
      this.myConfirmedItems.set(confirmed);
      return;
    }

    // New visitor — just store session for the component to decide flow
    this.activeSession.set(session);
    this.isRejoin.set(false);
  }

  async joinSession(): Promise<boolean> {
    const session = this.activeSession();
    if (!session) return false;

    const updatedSession = await this.tableSessionService.joinSession(session.sessionId);
    if (!updatedSession) return false;

    const memberId = crypto.randomUUID();
    this.memberId.set(memberId);
    this.saveSessionStorage({ sessionId: updatedSession.sessionId, memberId });
    this.activeSession.set(updatedSession);
    return true;
  }

  addItem(product: MenuProduct): void {
    this.orderConfirmed.set(false);
    const current = this.items();
    const idx = current.findIndex(i => i.product.id === product.id);
    if (idx >= 0) {
      this.items.set(
        current.map((item, i) =>
          i === idx ? { ...item, quantity: item.quantity + 1 } : item
        )
      );
    } else {
      this.items.set([...current, { product, quantity: 1 }]);
    }
  }

  removeItem(productId: string): void {
    const current = this.items();
    const idx = current.findIndex(i => i.product.id === productId);
    if (idx < 0) return;

    if (current[idx].quantity === 1) {
      this.items.set(current.filter(i => i.product.id !== productId));
    } else {
      this.items.set(
        current.map((item, i) =>
          i === idx ? { ...item, quantity: item.quantity - 1 } : item
        )
      );
    }
  }

  async placeOrder(notes?: string): Promise<void> {
    if (this.items().length === 0 || this.isSubmitting()) return;

    // Re-check for active session — another comensal may have created one
    // between when we loaded the menu and when we're placing the order now
    let session = this.activeSession();
    if (!session) {
      const freshSession = await this.tableSessionService.getActiveSession(this.tableId());
      if (freshSession) {
        this.activeSession.set(freshSession);
        const joined = await this.joinSession();
        if (!joined) {
          this.error.set('No se pudo unir a la sesión de la mesa');
          return;
        }
        session = this.activeSession();
      }
    }

    if (session) {
      await this.placeOrderInSession(session, notes);
    } else {
      await this.placeNewOrder(notes);
    }
  }

  private async placeNewOrder(notes?: string): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const total = this.totalAmount();
    const tableId = this.tableId();
    const memberId = this.memberId() ?? crypto.randomUUID();
    if (!this.memberId()) this.memberId.set(memberId);

    const { data: orderData, error: orderError } = await this.supabase.client
      .from('orders')
      .insert({
        table_id: tableId,
        status: 'pending',
        notes: notes ?? null,
        total,
        customer_name: this.customerName() || null,
      })
      .select('id')
      .single();

    if (orderError || !orderData) {
      this.error.set(orderError?.message ?? 'Error al crear el pedido');
      this.isSubmitting.set(false);
      return;
    }

    const orderId = (orderData as { id: string }).id;

    const orderItems = this.items().map(item => ({
      order_id: orderId,
      product_id: item.product.id,
      product_name: item.product.name,
      unit_price: item.product.price,
      quantity: item.quantity,
      subtotal: item.product.price * item.quantity,
      member_id: memberId,
    }));

    const { error: itemsError } = await this.supabase.client
      .from('order_items')
      .insert(orderItems);

    if (itemsError) {
      this.error.set(itemsError.message);
      this.isSubmitting.set(false);
      return;
    }

    // null capacity → treat as unlimited (sentinel 99)
    const { data: tableData } = await this.supabase.client
      .from('tables')
      .select('capacity')
      .eq('id', tableId)
      .single();

    const capacity = (tableData as { capacity: number | null } | null)?.capacity ?? 99;
    await this.tableSessionService.createSession(tableId, orderId, capacity);

    const newSession = await this.tableSessionService.getActiveSession(tableId);
    if (newSession) {
      this.activeSession.set(newSession);
      this.saveSessionStorage({ sessionId: newSession.sessionId, memberId });
    }

    this.lastOrderId.set(orderId);
    this.orderStatus.set('pending');
    this.subscribeToOrderStatus(orderId);
    this.myConfirmedItems.update(prev => [
      ...prev,
      ...this.items().map(item => ({
        product_name: item.product.name,
        unit_price: item.product.price,
        quantity: item.quantity,
        subtotal: item.product.price * item.quantity,
      })),
    ]);
    this.items.set([]);
    this.orderConfirmed.set(true);
    this.isSubmitting.set(false);
  }

  private async placeOrderInSession(session: TableSession, notes?: string): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const memberId = this.memberId() ?? crypto.randomUUID();
    if (!this.memberId()) this.memberId.set(memberId);

    const delta = this.totalAmount();
    const newItems = this.items().map(item => ({
      order_id: session.orderId,
      product_id: item.product.id,
      product_name: item.product.name,
      unit_price: item.product.price,
      quantity: item.quantity,
      subtotal: item.product.price * item.quantity,
      member_id: memberId,
    }));

    const { error: itemsError } = await this.supabase.client
      .from('order_items')
      .insert(newItems);

    if (itemsError) {
      this.error.set(itemsError.message);
      this.isSubmitting.set(false);
      return;
    }

    const { error: totalError } = await this.supabase.client.rpc('increment_order_total', {
      p_order_id: session.orderId,
      p_delta: delta,
    });

    if (totalError) {
      this.error.set(totalError.message);
      this.isSubmitting.set(false);
      return;
    }

    this.activeSession.update(s => s ? { ...s, total: s.total + delta } : s);
    this.lastOrderId.set(session.orderId);
    this.orderStatus.set(session.orderStatus ?? 'pending');
    this.subscribeToOrderStatus(session.orderId);
    this.myConfirmedItems.update(prev => [
      ...prev,
      ...this.items().map(item => ({
        product_name: item.product.name,
        unit_price: item.product.price,
        quantity: item.quantity,
        subtotal: item.product.price * item.quantity,
      })),
    ]);
    this.items.set([]);
    this.orderConfirmed.set(true);
    this.isSubmitting.set(false);
  }

  private subscribeToOrderStatus(orderId: string): void {
    if (this.realtimeChannel) {
      this.supabase.client.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }

    this.realtimeChannel = this.supabase.client
      .channel(`order-status-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const newStatus = (payload.new as { status: string }).status;
          this.orderStatus.set(newStatus);
          if (newStatus === 'bill_requested') {
            this.billRequested.set(true);
            this.activeSession.update(s => s ? { ...s, orderStatus: 'bill_requested' } : s);
          }
        }
      )
      .subscribe();
  }

  async requestBill(): Promise<void> {
    const orderId = this.lastOrderId();
    if (!orderId || this.billRequested() || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    this.error.set(null);

    const { error } = await this.supabase.client
      .from('orders')
      .update({ status: 'bill_requested', updated_at: new Date().toISOString() })
      .eq('id', orderId);

    if (error) {
      this.error.set(error.message);
    } else {
      this.billRequested.set(true);
      this.orderStatus.set('bill_requested');
      this.activeSession.update(s => s ? { ...s, orderStatus: 'bill_requested' } : s);
    }

    this.isSubmitting.set(false);
  }

  private loadSessionStorage(): TableSessionStorage | null {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as TableSessionStorage) : null;
    } catch {
      return null;
    }
  }

  private saveSessionStorage(data: TableSessionStorage): void {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
  }

  private clearSessionStorage(): void {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    if (this.realtimeChannel) {
      this.supabase.client.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
    this.orderStatus.set(null);
  }
}
