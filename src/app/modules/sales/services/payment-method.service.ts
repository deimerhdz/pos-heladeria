import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { PaymentMethod, PaymentMethodType } from '../interfaces/sales.interface';

/** Transport for payment methods (`/api/v1/sales/payment-methods`). */
@Injectable({ providedIn: 'root' })
export class PaymentMethodService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/sales/payment-methods`;

  readonly methods = signal<PaymentMethod[]>([]);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.methods.set(await firstValueFrom(this.http.get<PaymentMethod[]>(this.baseUrl)));
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudieron cargar los métodos de pago.'));
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Crea un método de pago **clasificado**.
   *
   * El `type` es lo que usa el arqueo para saber qué entra al cajón; omitirlo
   * dejaba todo lo que no era efectivo como "otro" y fuera del desglose. Se manda
   * junto a `is_cash` para respetar la invariante del modelo:
   * `is_cash ⇔ type === 'cash'`.
   */
  async create(name: string, type: PaymentMethodType): Promise<boolean> {
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.http.post<PaymentMethod>(this.baseUrl, {
          name,
          type,
          is_cash: type === 'cash',
        }),
      );
      await this.load();
      return true;
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudo crear el método de pago.'));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private extractError(err: unknown, fallback: string): string {
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
