import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  CartItemCreate,
  CartItemUpdate,
  CartResponse,
  MenuCategory,
  MenuCategoryResponse,
  MenuProduct,
  MenuProductResponse,
  MenuSession,
  MenuSessionCreate,
  OrderCreate,
  OrderResponse,
  OrderScope,
  Page,
} from '../interfaces/table.interface';

const SESSION_HEADER = 'X-Menu-Session';
const STORAGE_PREFIX = 'menu.session.';

/**
 * Backend transport for the public QR menu flow (tag `menu`). Holds the menu
 * `session_token` and sends it as `X-Menu-Session` on the menu reads. These
 * endpoints are public (no Bearer); the tenant header is added by the
 * tenant interceptor.
 */
@Injectable({ providedIn: 'root' })
export class MenuApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/menu`;

  /** Current menu session token, kept in memory (and mirrored to sessionStorage). */
  readonly sessionToken = signal<string | null>(null);

  /** Open a menu session by scanning a table QR. Throws `HttpErrorResponse`. */
  async openSession(qrCode: string, customerName: string): Promise<MenuSession> {
    const body: MenuSessionCreate = { qr_code: qrCode, customer_name: customerName };
    const session = await firstValueFrom(
      this.http.post<MenuSession>(`${this.base}/sessions`, body),
    );
    this.setToken(qrCode, session.session_token);
    return session;
  }

  /** List menu categories for the active session. Throws on `401`/error. */
  async getCategories(): Promise<MenuCategory[]> {
    const data = await firstValueFrom(
      this.http.get<MenuCategoryResponse[]>(`${this.base}/categories`, {
        headers: this.sessionHeaders(),
      }),
    );
    return data.map(c => ({ id: c.id, name: c.name, products: [] }));
  }

  /**
   * List products of a category (single page, up to 100). Throws on `401`/error.
   */
  async getProducts(categoryId: string, size = 100): Promise<MenuProduct[]> {
    const page = await firstValueFrom(
      this.http.get<Page<MenuProductResponse>>(`${this.base}/products`, {
        headers: this.sessionHeaders(),
        params: { category_id: categoryId, page: 1, size },
      }),
    );
    return page.items.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      price: Number(p.price),
      image_url: null,
    }));
  }

  // ── Table cart ───────────────────────────────────────────────────────────

  /** Get the shared table cart for the active session. */
  async getCart(): Promise<CartResponse> {
    return firstValueFrom(
      this.http.get<CartResponse>(`${this.base}/cart`, { headers: this.sessionHeaders() }),
    );
  }

  /** Add a product to my cart (the backend sums if it already exists). */
  async addCartItem(productId: string, quantity = 1): Promise<CartResponse> {
    const body: CartItemCreate = { product_id: productId, quantity };
    return firstValueFrom(
      this.http.post<CartResponse>(`${this.base}/cart/items`, body, {
        headers: this.sessionHeaders(),
      }),
    );
  }

  /** Update the quantity of one of my cart items. `403` if not mine. */
  async updateCartItem(itemId: string, quantity: number): Promise<CartResponse> {
    const body: CartItemUpdate = { quantity };
    return firstValueFrom(
      this.http.patch<CartResponse>(`${this.base}/cart/items/${itemId}`, body, {
        headers: this.sessionHeaders(),
      }),
    );
  }

  /** Remove one of my cart items. `403` if not mine. */
  async removeCartItem(itemId: string): Promise<CartResponse> {
    return firstValueFrom(
      this.http.delete<CartResponse>(`${this.base}/cart/items/${itemId}`, {
        headers: this.sessionHeaders(),
      }),
    );
  }

  // ── Orders ─────────────────────────────────────────────────────────────--

  /** Convert the cart into an order (`individual` = my items, `table` = all). */
  async createOrder(scope: OrderScope): Promise<OrderResponse> {
    const body: OrderCreate = { scope };
    return firstValueFrom(
      this.http.post<OrderResponse>(`${this.base}/orders`, body, {
        headers: this.sessionHeaders(),
      }),
    );
  }

  /** List the active orders of the session/table. Throws on `401`/error. */
  async getActiveOrders(): Promise<OrderResponse[]> {
    return firstValueFrom(
      this.http.get<OrderResponse[]>(`${this.base}/orders/active`, {
        headers: this.sessionHeaders(),
      }),
    );
  }

  /** Restore a previously stored token for a QR code (survives reloads). */
  restoreToken(qrCode: string): string | null {
    const token = sessionStorage.getItem(STORAGE_PREFIX + qrCode);
    this.sessionToken.set(token);
    return token;
  }

  /** Clear the session (e.g. on `401`). */
  clearToken(qrCode: string): void {
    sessionStorage.removeItem(STORAGE_PREFIX + qrCode);
    this.sessionToken.set(null);
  }

  private setToken(qrCode: string, token: string): void {
    sessionStorage.setItem(STORAGE_PREFIX + qrCode, token);
    this.sessionToken.set(token);
  }

  private sessionHeaders(): HttpHeaders {
    return new HttpHeaders({ [SESSION_HEADER]: this.sessionToken() ?? '' });
  }

  /** Translate an error into a readable message (FastAPI `detail` string/array). */
  extractError(err: unknown, fallback = 'No se pudo cargar el menú.'): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: unknown; message?: string } | null;
      const detail = body?.detail;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail) && detail.length > 0) {
        return (detail[0] as { msg?: string })?.msg ?? fallback;
      }
      return body?.message ?? fallback;
    }
    return fallback;
  }
}
