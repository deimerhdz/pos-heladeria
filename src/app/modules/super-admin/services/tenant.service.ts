import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Tenant, TenantCreateWithUser } from '../interfaces/tenant.interface';
import { Page } from '../interfaces/page.interface';

@Injectable({ providedIn: 'root' })
export class TenantService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/super-admin`;
  /** Tenant creation lives under a different base (`/admin/tenants`). */
  private readonly adminTenantsUrl = `${environment.apiBaseUrl}/admin/tenants`;

  readonly tenants = signal<Tenant[]>([]);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  loadTenants() {
    return this.http.get<Page<Tenant>>(`${this.baseUrl}/tenants`);
  }

  /**
   * Create a tenant together with its first administrator user via
   * `POST /api/v1/admin/tenants`. Response body is empty; callers reload the list.
   */
  async createTenant(payload: TenantCreateWithUser): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    try {
      await firstValueFrom(this.http.post<void>(this.adminTenantsUrl, payload));
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private extractError(err: unknown): string {
    const fallback = 'No se pudo completar la operación.';
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: unknown; message?: string } | null;
      const detail = body?.detail;
      if (typeof detail === 'string') return detail;
      // FastAPI 422: `detail` is an array of `{ msg, loc, ... }`.
      if (Array.isArray(detail) && detail.length > 0) {
        const first = detail[0] as { msg?: string };
        return first?.msg ?? fallback;
      }
      return body?.message ?? fallback;
    }
    return fallback;
  }
}
