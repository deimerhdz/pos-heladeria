import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { MenuCategory, MenuOptionGroup } from '../../products/interfaces/product.interface';
import { DiningOrder } from '../interfaces/dining.interface';
import {
  CartItemPayload,
  CartItemUpdatePayload,
  CartResponse,
  DinerTable,
  SessionOpenResponse,
  StockConflictDetail,
} from '../interfaces/diner.interface';
import { DinerTokenStore } from './diner-token.store';

/** Branding del negocio que acompaña al menú público. */
export interface ResolvedBusiness {
  name: string;
  logo_url: string | null;
}

/** Resultado de resolver el QR firmado: mesa + negocio + menú activo. */
export interface ResolvedMenu {
  table: DinerTable;
  business: ResolvedBusiness | null;
  categories: MenuCategory[];
}

/** Mapea grupos de opciones crudos; se usa a nivel de variante y de producto. */
function mapGroups(raw: unknown): MenuOptionGroup[] {
  return ((raw as Record<string, unknown>[]) ?? []).map((g) => ({
    id: g['id'] as string,
    name: g['name'] as string,
    min_select: (g['min_select'] as number) ?? 0,
    max_select: (g['max_select'] as number) ?? 0,
    options: ((g['options'] as Record<string, unknown>[]) ?? []).map((o) => ({
      id: o['id'] as string,
      name: o['name'] as string,
      extra_price: Number(o['extra_price']),
      available: (o['available'] as boolean) ?? true,
    })),
  }));
}

/** Error de sesión: hay que volver a pedir el nombre al comensal. */
export class DinerSessionExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DinerSessionExpiredError';
  }
}

/**
 * Transporte del flujo **público** del comensal (`/menu/qr-token`, `/cart`).
 *
 * Se autentica solo con el `session_token` firmado, que inyecta el
 * `authTokenInterceptor` en `x-session-token`. Nunca lleva el Bearer del staff:
 * por eso vive separado de `DiningSessionService`, que es el lado del personal.
 *
 * Los métodos lanzan `HttpErrorResponse` salvo el `401`, que se traduce a
 * `DinerSessionExpiredError` y limpia el token — es la señal de "vuelve a
 * escanear el QR", no un error de programación.
 */
@Injectable({ providedIn: 'root' })
export class DinerService {
  private readonly http = inject(HttpClient);
  private readonly tokenStore = inject(DinerTokenStore);
  private readonly api = environment.apiBaseUrl;

  // ── Menú por QR firmado ──────────────────────────────────────────────────

  /**
   * Resuelve el token **firmado** del QR en mesa + negocio + menú.
   * El tenant viaja dentro del token, así que no hace falta `x-tenant-host`.
   */
  async resolveByToken(token: string): Promise<ResolvedMenu> {
    const raw = await firstValueFrom(
      this.http.get<Record<string, unknown>>(`${this.api}/menu/qr-token/${token}`),
    );
    return this.mapResolved(raw);
  }

  // ── Sesión ───────────────────────────────────────────────────────────────

  /**
   * Une al comensal a la mesa. Si la mesa ya tiene una sesión activa **se une a
   * ella**; si no, la abre. Persiste el `session_token` devuelto.
   */
  async openSession(qrToken: string, displayName: string): Promise<SessionOpenResponse> {
    const res = await firstValueFrom(
      this.http.post<SessionOpenResponse>(`${this.api}/cart/sessions`, {
        qr_token: qrToken,
        display_name: displayName,
      }),
    );
    this.tokenStore.set(res.session_token);
    return res;
  }

  // ── Carrito (borrador en el backend) ─────────────────────────────────────

  /** Carrito vigente. Devuelve el carrito completo, como toda mutación. */
  getCart(): Promise<CartResponse> {
    return this.call(() => this.http.get<CartResponse>(`${this.api}/cart`));
  }

  addItem(item: CartItemPayload): Promise<CartResponse> {
    return this.call(() => this.http.post<CartResponse>(`${this.api}/cart/items`, item));
  }

  updateItem(itemId: string, patch: CartItemUpdatePayload): Promise<CartResponse> {
    return this.call(() =>
      this.http.patch<CartResponse>(`${this.api}/cart/items/${itemId}`, patch),
    );
  }

  removeItem(itemId: string): Promise<CartResponse> {
    return this.call(() => this.http.delete<CartResponse>(`${this.api}/cart/items/${itemId}`));
  }

  // ── Pedidos propios ──────────────────────────────────────────────────────

  /**
   * Envía el carrito como pedido. Queda en `recibida`: **no descuenta
   * inventario** y cocina no lo ve hasta que el personal lo confirme.
   */
  submitCart(): Promise<DiningOrder> {
    return this.call(() => this.http.post<DiningOrder>(`${this.api}/cart/submit`, {}));
  }

  /** Pedidos de este comensal. Única fuente del progreso (por polling). */
  myOrders(): Promise<DiningOrder[]> {
    return this.call(() => this.http.get<DiningOrder[]>(`${this.api}/cart/orders`));
  }

  /** Cancela un pedido propio. El backend rechaza si cocina ya empezó. */
  cancelMyOrder(orderId: string, motivo: string): Promise<DiningOrder> {
    return this.call(() =>
      this.http.post<DiningOrder>(`${this.api}/cart/orders/${orderId}/cancel`, { motivo }),
    );
  }

  /**
   * El comensal se va de la mesa. Si era el último y no dejó ningún pedido, la
   * mesa vuelve a estar libre en el acto en vez de quedarse ocupada.
   *
   * **No pasa por `call()` a propósito**: ese helper traduce el `401` a
   * `DinerSessionExpiredError` y relanza el flujo de nombre, que es justo lo que
   * no se quiere al salir. Aquí un token caducado significa que el objetivo ya
   * está cumplido, no que haya que pedir el nombre otra vez.
   */
  async leave(): Promise<void> {
    try {
      await firstValueFrom(this.http.post<void>(`${this.api}/cart/leave`, {}));
    } finally {
      this.tokenStore.clear();
    }
  }

  // ── Errores ──────────────────────────────────────────────────────────────

  /**
   * Traduce un error del comensal a un mensaje mostrable.
   *
   * El "no hay stock" llega en **dos formatos distintos** que no son
   * intercambiables: objeto estructurado en `/cart/items` (permite señalar el
   * insumo) y cadena plana en la confirmación del staff.
   */
  extractError(err: unknown, fallback = 'No se pudo completar la operación.'): string {
    if (err instanceof DinerSessionExpiredError) return err.message;
    if (!(err instanceof HttpErrorResponse)) return fallback;

    if (err.status === 429) {
      const secs = Number(err.headers.get('Retry-After'));
      return Number.isFinite(secs) && secs > 0
        ? `Demasiadas peticiones. Espera ${secs} segundos.`
        : 'Demasiadas peticiones. Espera un momento.';
    }

    const body = err.error as { detail?: unknown; message?: string } | null;
    const detail = body?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      return (detail[0] as { msg?: string })?.msg ?? fallback;
    }
    if (detail && typeof detail === 'object') {
      return (detail as { error?: string }).error ?? fallback;
    }
    return body?.message ?? fallback;
  }

  /** Detalle del conflicto de stock, si el error es ese `409` estructurado. */
  stockConflict(err: unknown): StockConflictDetail | null {
    if (!(err instanceof HttpErrorResponse) || err.status !== 409) return null;
    const detail = (err.error as { detail?: unknown } | null)?.detail;
    if (detail && typeof detail === 'object' && 'insumo' in detail) {
      return detail as StockConflictDetail;
    }
    return null;
  }

  // ── Internos ─────────────────────────────────────────────────────────────

  /** Ejecuta la llamada traduciendo el `401` a "sesión caducada". */
  private async call<T>(fn: () => import('rxjs').Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(fn());
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        this.tokenStore.clear();
        throw new DinerSessionExpiredError(
          this.extractError(err, 'Tu sesión terminó. Vuelve a escanear el QR.'),
        );
      }
      throw err;
    }
  }

  private mapResolved(raw: Record<string, unknown>): ResolvedMenu {
    const tableRaw = (raw['table'] ?? raw['dining_table'] ?? raw) as Record<string, unknown>;
    const categoriesRaw = (raw['menu'] ?? raw['categories'] ?? raw['items'] ?? []) as unknown[];
    const businessRaw = raw['business'] as Record<string, unknown> | undefined;

    return {
      table: {
        id: (tableRaw['id'] as string) ?? '',
        number: (tableRaw['number'] as number) ?? 0,
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
          discounted_price: v['discounted_price'] != null ? Number(v['discounted_price']) : null,
          // Los grupos cuelgan de la presentación: cuántos sabores se eligen cambia
          // con el tamaño.
          option_groups: mapGroups(v['option_groups']),
          available: (v['available'] as boolean) ?? true,
        })),
        // `?? true` para no romper contra un backend aún sin desplegar: sin el campo,
        // todo se comporta como antes (disponible).
        available: (p['available'] as boolean) ?? true,
        option_groups: mapGroups(p['option_groups']),
      })),
    };
  }
}
