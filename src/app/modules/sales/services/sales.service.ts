import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Page, Sale, SaleCreatePayload, SaleStatus } from '../interfaces/sales.interface';

/** Transport for sales / checkout (`/api/v1/sales`). */
@Injectable({ providedIn: 'root' })
export class SalesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/sales`;

  readonly sales = signal<Sale[]>([]);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  // Estado de paginación y filtros (reflejo del `Page<T>` del backend).
  readonly page = signal(1);
  readonly size = signal(20);
  readonly total = signal(0);
  readonly totalPages = signal(0);
  readonly status = signal<SaleStatus | ''>('');
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly invoiceReference = signal('');

  async list(page: number = this.page(), size: number = this.size()): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    let params = new HttpParams().set('page', page).set('size', size);
    if (this.status()) params = params.set('status', this.status());
    if (this.dateFrom()) params = params.set('date_from', this.dateFrom());
    if (this.dateTo()) params = params.set('date_to', this.dateTo());
    // El backend guarda/busca la referencia sin el guion que sí se muestra en el ticket (ej. "A-000004" → "A000004").
    const invoiceRef = this.invoiceReference().trim().replaceAll('-', '');
    if (invoiceRef) params = params.set('invoice_reference', invoiceRef);

    try {
      const data = await firstValueFrom(this.http.get<Page<Sale>>(this.baseUrl, { params }));
      this.sales.set(data.items);
      this.page.set(data.page);
      this.size.set(data.size);
      this.total.set(data.total);
      this.totalPages.set(data.pages);
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudieron cargar las ventas.'));
    } finally {
      this.loading.set(false);
    }
  }

  async setStatus(value: SaleStatus | ''): Promise<void> {
    this.status.set(value);
    await this.list(1);
  }

  async setDateFrom(value: string): Promise<void> {
    this.dateFrom.set(value);
    await this.list(1);
  }

  async setDateTo(value: string): Promise<void> {
    this.dateTo.set(value);
    await this.list(1);
  }

  async setInvoiceReference(value: string): Promise<void> {
    this.invoiceReference.set(value);
    await this.list(1);
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
