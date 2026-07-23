import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { MenuCategory } from '../../products/interfaces/product.interface';
import {
  DiningOrder,
  DiningOrderItem,
  DiningOrderStatus,
  DiningSession,
  KitchenStatus,
  OrderCreatePayload,
  SessionOpenPayload,
} from '../interfaces/dining.interface';

/** Minimal table info resolved from the QR (for display). */
export interface ResolvedTable {
  id: string;
  number: number | null;
  name: string | null;
}

/** Branding del negocio que acompaña al menú público (el comensal es anónimo). */
export interface ResolvedBusiness {
  name: string;
  logo_url: string | null;
}

/** Result of resolving a QR token: the table + the active menu. */
export interface ResolvedMenu {
  table: ResolvedTable;
  business: ResolvedBusiness | null;
  categories: MenuCategory[];
}

/** Persisted session (per QR token) so it survives reloads. */
interface StoredSession {
  sessionId: string;
  customerName: string;
}

const STORAGE_PREFIX = 'dining.session.';

/**
 * Transport for the QR menu / table-session flow.
 *
 * Diner side: resolve a table by its QR token, open/close a session and submit
 * orders (there is no server cart — the whole order is posted at once).
 * Staff side: list orders and advance their status, plus close sessions.
 *
 * Public reads carry the tenant header (added by the tenant interceptor); the
 * staff endpoints also carry the Bearer token (auth interceptor).
 */
@Injectable({ providedIn: 'root' })
export class DiningSessionService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  // ── Diner: resolve QR → table + menu ─────────────────────────────────────

  /**
   * Resolve the table's QR token (UUID) into the table + active menu.
   * Backend shape: `{ table: {id, number, name}, menu: [...categories] }`.
   * The caller opens the session with the same URL token (the response does not
   * echo the `qr_token`).
   */
  async resolveByToken(token: string): Promise<ResolvedMenu> {
    const raw = await firstValueFrom(
      this.http.get<Record<string, unknown>>(`${this.api}/menu/qr/${token}`),
    );
    return this.mapResolved(raw);
  }

  private mapResolved(raw: Record<string, unknown>): ResolvedMenu {
    const tableRaw = (raw['table'] ?? raw['dining_table'] ?? raw) as Record<string, unknown>;
    const categoriesRaw = (raw['menu'] ?? raw['categories'] ?? raw['items'] ?? []) as unknown[];
    const businessRaw = raw['business'] as Record<string, unknown> | undefined;

    return {
      table: {
        id: (tableRaw['id'] as string) ?? '',
        number: (tableRaw['number'] as number) ?? null,
        name: (tableRaw['name'] as string) ?? null,
      },
      business: businessRaw
        ? {
            name: (businessRaw['name'] as string) ?? '',
            logo_url: (businessRaw['logo_url'] as string) ?? null,
          }
        : null,
      categories: (categoriesRaw as Record<string, unknown>[]).map((c) => this.mapCategory(c)),
    };
  }

  private mapCategory(c: Record<string, unknown>): MenuCategory {
    return {
      id: c['id'] as string,
      name: c['name'] as string,
      products: ((c['products'] as Record<string, unknown>[]) ?? []).map((p) => ({
        id: p['id'] as string,
        name: p['name'] as string,
        description: (p['description'] as string) ?? null,
        image_url: (p['image_url'] as string) ?? null,
        variants: ((p['variants'] as Record<string, unknown>[]) ?? []).map((v) => ({
          id: v['id'] as string,
          name: v['name'] as string,
          price: Number(v['price']),
        })),
        option_groups: ((p['option_groups'] as Record<string, unknown>[]) ?? []).map((g) => ({
          id: g['id'] as string,
          name: g['name'] as string,
          min_select: (g['min_select'] as number) ?? 0,
          max_select: (g['max_select'] as number) ?? 0,
          options: ((g['options'] as Record<string, unknown>[]) ?? []).map((o) => ({
            id: o['id'] as string,
            name: o['name'] as string,
            extra_price: Number(o['extra_price']),
          })),
        })),
      })),
    };
  }

  // ── Sessions (`/orders/sessions`) ────────────────────────────────────────

  /** Open a table session by scanning a QR. Throws `HttpErrorResponse`. */
  async openSession(qrToken: string, customerName: string): Promise<DiningSession> {
    const body: SessionOpenPayload = { qr_token: qrToken, customer_name: customerName };
    return firstValueFrom(this.http.post<DiningSession>(`${this.api}/orders/sessions`, body));
  }

  /** Close a table session (client self-checkout or staff). Throws on error. */
  async closeSession(sessionId: string): Promise<DiningSession> {
    return firstValueFrom(
      this.http.post<DiningSession>(`${this.api}/orders/sessions/${sessionId}/close`, {}),
    );
  }

  // ── Orders (`/orders`) ───────────────────────────────────────────────────

  /** Submit a whole order (client-side cart → one comanda). Throws on error. */
  async createOrder(payload: OrderCreatePayload): Promise<DiningOrder> {
    return firstValueFrom(this.http.post<DiningOrder>(`${this.api}/orders`, payload));
  }

  /** List comandas (staff), optionally filtered by status. Returns an array. */
  async listOrders(status?: DiningOrderStatus): Promise<DiningOrder[]> {
    const params = status ? { status } : undefined;
    return firstValueFrom(this.http.get<DiningOrder[]>(`${this.api}/orders`, { params }));
  }

  /** Fetch a single comanda by id (staff). Throws `HttpErrorResponse` (e.g. 404). */
  async getOrder(id: string): Promise<DiningOrder> {
    return firstValueFrom(this.http.get<DiningOrder>(`${this.api}/orders/${id}`));
  }

  /** Change the billing status of a comanda (staff). Throws on error. */
  async updateOrderStatus(orderId: string, status: DiningOrderStatus): Promise<DiningOrder> {
    return firstValueFrom(
      this.http.patch<DiningOrder>(`${this.api}/orders/${orderId}/status`, { status }),
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

  // ── Session persistence (survives reloads, keyed by QR token) ─────────────

  storeSession(token: string, session: StoredSession): void {
    sessionStorage.setItem(STORAGE_PREFIX + token, JSON.stringify(session));
  }

  restoreSession(token: string): StoredSession | null {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + token);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredSession;
    } catch {
      return null;
    }
  }

  clearSession(token: string): void {
    sessionStorage.removeItem(STORAGE_PREFIX + token);
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
      return body?.message ?? fallback;
    }
    return fallback;
  }
}
