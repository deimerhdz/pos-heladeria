import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CatalogPaymentMethodOption } from '../interfaces/sales.interface';

/**
 * Catálogo de métodos de pago disponibles para que el Tenant Admin active
 * (`GET /sales/payment-methods/catalog`, spec 032 FR-005/FR-006). Distinto de
 * `PaymentMethodCatalogService` del módulo `super-admin`: ese administra el
 * catálogo completo (plataforma); este solo lo consulta para activar.
 */
@Injectable({ providedIn: 'root' })
export class TenantPaymentMethodCatalogService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/sales/payment-methods/catalog`;

  readonly options = signal<CatalogPaymentMethodOption[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.options.set(
        await firstValueFrom(this.http.get<CatalogPaymentMethodOption[]>(this.baseUrl)),
      );
    } catch {
      this.error.set('No se pudo cargar el catálogo de métodos de pago disponibles.');
    } finally {
      this.loading.set(false);
    }
  }
}
