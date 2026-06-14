import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  OrderResponse,
  OrderStatus,
  Page,
} from '../../tables/interfaces/table.interface';

export interface OrdersPageInfo {
  page: number;
  size: number;
  pages: number;
  total: number;
}

export interface ListOrdersOptions {
  tableId?: string | null;
  status?: OrderStatus | null;
  page?: number;
  size?: number;
}

/**
 * Backend transport for the staff orders module (`/api/v1/orders`). Read-only:
 * paginated list + detail. The Bearer (access token) and tenant header are added
 * by the existing interceptors. The legacy Supabase `OrdersService` is untouched
 * (still used by dashboards/cash-register).
 */
@Injectable({ providedIn: 'root' })
export class OrdersApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/orders`;

  readonly orders = signal<OrderResponse[]>([]);
  readonly pageInfo = signal<OrdersPageInfo>({ page: 1, size: 20, pages: 1, total: 0 });
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async listOrders(opts: ListOrdersOptions = {}): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    const params: Record<string, string | number> = {
      page: opts.page ?? 1,
      size: opts.size ?? 20,
    };
    if (opts.tableId) params['table_id'] = opts.tableId;
    if (opts.status) params['status'] = opts.status;

    try {
      const data = await firstValueFrom(
        this.http.get<Page<OrderResponse>>(this.baseUrl, { params }),
      );
      this.orders.set(data.items);
      this.pageInfo.set({ page: data.page, size: data.size, pages: data.pages, total: data.total });
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudieron cargar las órdenes.'));
    } finally {
      this.loading.set(false);
    }
  }

  /** Fetch a single order by id. Throws `HttpErrorResponse` (e.g. 404). */
  async getOrder(id: string): Promise<OrderResponse> {
    return firstValueFrom(this.http.get<OrderResponse>(`${this.baseUrl}/${id}`));
  }

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
