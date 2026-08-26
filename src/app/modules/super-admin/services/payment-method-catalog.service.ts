import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  PaymentMethodCatalogCreatePayload,
  PaymentMethodCatalogEntry,
  PaymentMethodCatalogUpdatePayload,
} from '../interfaces/payment-method-catalog.interface';

/** Transport for the platform payment methods catalog
 * (`/api/v1/super-admin/payment-methods-catalog`). Solo el Super Admin. */
@Injectable({ providedIn: 'root' })
export class PaymentMethodCatalogService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/super-admin/payment-methods-catalog`;

  readonly entries = signal<PaymentMethodCatalogEntry[]>([]);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.entries.set(
        await firstValueFrom(this.http.get<PaymentMethodCatalogEntry[]>(this.baseUrl)),
      );
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudo cargar el catálogo de métodos de pago.'));
    } finally {
      this.loading.set(false);
    }
  }

  async create(payload: PaymentMethodCatalogCreatePayload): Promise<boolean> {
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.post<PaymentMethodCatalogEntry>(this.baseUrl, payload));
      await this.load();
      return true;
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudo crear el método de pago.'));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async update(id: string, patch: PaymentMethodCatalogUpdatePayload): Promise<boolean> {
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.http.patch<PaymentMethodCatalogEntry>(`${this.baseUrl}/${id}`, patch),
      );
      await this.load();
      return true;
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudo actualizar el método de pago.'));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private extractError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: unknown } | null;
      const detail = body?.detail;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail) && detail.length > 0) {
        const first = detail[0] as { msg?: string };
        return first?.msg ?? fallback;
      }
    }
    return fallback;
  }
}
