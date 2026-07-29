import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  DiningOrder,
  DiningOrderItem,
  DiningOrderStatus,
  KitchenStatus,
  OrderItemPayload,
} from '../interfaces/dining.interface';

/**
 * Transporte del lado **staff** del flujo de mesas: comandas, cocina y cobro.
 *
 * El flujo del comensal (menú por QR, sesión, carrito, pedidos propios) vive en
 * `DinerService`: son rutas públicas que se autentican con `x-session-token` y
 * mezclarlas aquí arrastraría el Bearer del personal a peticiones anónimas.
 */
@Injectable({ providedIn: 'root' })
export class DiningSessionService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  // ── Orders (`/orders`) ───────────────────────────────────────────────────

  /** List comandas (staff), optionally filtered by status. Returns an array. */
  async listOrders(status?: DiningOrderStatus): Promise<DiningOrder[]> {
    const params = status ? { status } : undefined;
    return firstValueFrom(this.http.get<DiningOrder[]>(`${this.api}/orders`, { params }));
  }

  /** Fetch a single comanda by id (staff). Throws `HttpErrorResponse` (e.g. 404). */
  async getOrder(id: string): Promise<DiningOrder> {
    return firstValueFrom(this.http.get<DiningOrder>(`${this.api}/orders/${id}`));
  }

  /**
   * Acepta un pedido `recibida` → `abierta`.
   *
   * **Es el único punto que descuenta inventario** en el flujo de mesa. Un
   * `400` significa que falta stock; el pedido se queda en `recibida` y se
   * puede reintentar tras reponer.
   */
  async confirmOrder(orderId: string): Promise<DiningOrder> {
    return firstValueFrom(this.http.post<DiningOrder>(`${this.api}/orders/${orderId}/confirm`, {}));
  }

  /** Cancela un pedido (staff, sin restricción de estado). */
  async cancelOrder(orderId: string, motivo: string): Promise<DiningOrder> {
    return firstValueFrom(
      this.http.post<DiningOrder>(`${this.api}/orders/${orderId}/cancel`, { motivo }),
    );
  }

  /** Advance an item's kitchen status (pendiente→en_preparacion→listo→entregado). */
  async updateItemKitchen(itemId: string, estado: KitchenStatus): Promise<DiningOrderItem> {
    return firstValueFrom(
      this.http.patch<DiningOrderItem>(`${this.api}/orders/items/${itemId}/kitchen`, {
        estado_cocina: estado,
      }),
    );
  }

  // ── Cobro / cierre de comedor (Fase 7) ───────────────────────────────────

  /** Add a single item directly to a table's open order (waiter). Creates the
   *  order if none and deducts inventory. Returns the updated order. */
  async addTableItem(tableId: string, item: OrderItemPayload): Promise<DiningOrder> {
    return firstValueFrom(
      this.http.post<DiningOrder>(`${this.api}/orders/tables/${tableId}/items`, item),
    );
  }

  /** Void (and optionally replace) an order item. Reverses inventory if pendiente. */
  async voidItem(itemId: string, motivo: string): Promise<DiningOrder> {
    return firstValueFrom(
      this.http.post<DiningOrder>(`${this.api}/orders/items/${itemId}/void`, { motivo }),
    );
  }

  /** Translate an error into a readable message (FastAPI `detail` string/array). */
  extractError(err: unknown, fallback = 'No se pudo completar la operación.'): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: unknown; message?: string } | null;
      const detail = body?.detail;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail) && detail.length > 0) {
        return (detail[0] as { msg?: string })?.msg ?? fallback;
      }
      // El bloqueo por cocina devuelve `detail` como objeto `{error, items}`.
      if (detail && typeof detail === 'object') {
        return (detail as { error?: string }).error ?? fallback;
      }
      return body?.message ?? fallback;
    }
    return fallback;
  }
}
