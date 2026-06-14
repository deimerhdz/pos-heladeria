import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MenuApiService } from './menu-api.service';
import {
  CartItemResponse,
  CartResponse,
  OrderResponse,
  OrderScope,
} from '../interfaces/table.interface';

/**
 * State for the shared table cart of the QR menu flow. Wraps {@link MenuApiService},
 * keeping the latest {@link CartResponse}. The backend is REST (no realtime), so
 * the cart refreshes after the user's own actions and on a manual "refresh".
 */
@Injectable({ providedIn: 'root' })
export class MenuCartService {
  private readonly api = inject(MenuApiService);

  readonly cart = signal<CartResponse | null>(null);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);
  /** Set when an order was just created (cleared on the next cart mutation). */
  readonly lastOrderConfirmed = signal(false);

  // Active orders of the table/session.
  readonly orders = signal<OrderResponse[]>([]);
  readonly ordersLoading = signal(false);
  readonly ordersError = signal<string | null>(null);

  readonly items = computed<CartItemResponse[]>(() => this.cart()?.items ?? []);
  readonly total = computed(() => this.cart()?.total ?? '0');
  readonly myItems = computed(() => this.items().filter(i => i.is_mine));
  readonly otherItems = computed(() => this.items().filter(i => !i.is_mine));
  readonly hasMyItems = computed(() => this.myItems().length > 0);
  readonly hasItems = computed(() => this.items().length > 0);
  /** Total quantity across all table items (for the cart badge). */
  readonly totalItems = computed(() => this.items().reduce((sum, i) => sum + i.quantity, 0));

  /** Quantity the current session has of a given product (0 if none). */
  myQuantityForProduct(productId: string): number {
    return this.myItems()
      .filter(i => i.product_id === productId)
      .reduce((sum, i) => sum + i.quantity, 0);
  }

  /** Find my cart item for a product (for +/- on the product list). */
  private myItemForProduct(productId: string): CartItemResponse | undefined {
    return this.myItems().find(i => i.product_id === productId);
  }

  /** Load the shared table cart. */
  async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.cart.set(await this.api.getCart());
    } catch (err) {
      this.error.set(this.api.extractError(err, 'No se pudo cargar el carrito.'));
    } finally {
      this.loading.set(false);
    }
  }

  async addByProduct(productId: string): Promise<void> {
    await this.mutate(() => this.api.addCartItem(productId, 1));
  }

  /** Increment my item for a product by one (adds it if absent). */
  async incrementProduct(productId: string): Promise<void> {
    await this.addByProduct(productId);
  }

  /** Decrement my item for a product; removes it when it reaches zero. */
  async decrementProduct(productId: string): Promise<void> {
    const item = this.myItemForProduct(productId);
    if (!item) return;
    if (item.quantity <= 1) {
      await this.remove(item.id);
    } else {
      await this.setQuantity(item.id, item.quantity - 1);
    }
  }

  async setQuantity(itemId: string, quantity: number): Promise<void> {
    if (quantity < 1) {
      await this.remove(itemId);
      return;
    }
    await this.mutate(() => this.api.updateCartItem(itemId, quantity));
  }

  async remove(itemId: string): Promise<void> {
    await this.mutate(() => this.api.removeCartItem(itemId));
  }

  /** Load the active orders of the table/session. */
  async loadActiveOrders(): Promise<void> {
    this.ordersLoading.set(true);
    this.ordersError.set(null);
    try {
      this.orders.set(await this.api.getActiveOrders());
    } catch (err) {
      this.ordersError.set(this.api.extractError(err, 'No se pudieron cargar las órdenes.'));
    } finally {
      this.ordersLoading.set(false);
    }
  }

  /** Create an order from the cart, then refresh the cart and active orders. */
  async createOrder(scope: OrderScope): Promise<boolean> {
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      await this.api.createOrder(scope);
      this.lastOrderConfirmed.set(true);
      await this.refresh();
      await this.loadActiveOrders();
      return true;
    } catch (err) {
      this.error.set(this.api.extractError(err, 'No se pudo generar la orden.'));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /** Run a cart-mutating call and store the returned cart (auto-refresh). */
  private async mutate(op: () => Promise<CartResponse>): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);
    this.lastOrderConfirmed.set(false);
    try {
      this.cart.set(await op());
    } catch (err) {
      const msg =
        err instanceof HttpErrorResponse && err.status === 403
          ? 'Solo puedes modificar tus propios ítems.'
          : this.api.extractError(err, 'No se pudo actualizar el carrito.');
      this.error.set(msg);
      // Resync to reflect the real server state after a failed mutation.
      await this.refresh();
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
