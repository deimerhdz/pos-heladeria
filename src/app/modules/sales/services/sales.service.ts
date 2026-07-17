import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Sale, SaleCreatePayload } from '../interfaces/sales.interface';

/** Transport for sales / checkout (`/api/v1/sales`). */
@Injectable({ providedIn: 'root' })
export class SalesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/sales`;

  readonly sales = signal<Sale[]>([]);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  async list(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await firstValueFrom(this.http.get<Sale[]>(this.baseUrl));
      this.sales.set([...data].sort((a, b) => b.sold_at.localeCompare(a.sold_at)));
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudieron cargar las ventas.'));
    } finally {
      this.loading.set(false);
    }
  }

  async get(id: string): Promise<Sale> {
    return firstValueFrom(this.http.get<Sale>(`${this.baseUrl}/${id}`));
  }

  /** Checkout: emit and charge a sale. Sets `error` and returns null on failure. */
  async checkout(payload: SaleCreatePayload): Promise<Sale | null> {
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      return await firstValueFrom(this.http.post<Sale>(this.baseUrl, payload));
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudo emitir la venta.'));
      return null;
    } finally {
      this.isSubmitting.set(false);
    }
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
