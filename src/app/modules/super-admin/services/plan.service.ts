import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Plan, PlanCreatePayload, PlanUpdatePayload } from '../interfaces/plan.interface';

/** Transport for the platform plan catalog (`/api/v1/super-admin/plans`,
 * spec 033). Solo el Super Admin. Mismo patrón que
 * `payment-method-catalog.service.ts`. */
@Injectable({ providedIn: 'root' })
export class PlanService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/super-admin/plans`;

  readonly plans = signal<Plan[]>([]);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.plans.set(await firstValueFrom(this.http.get<Plan[]>(this.baseUrl)));
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudo cargar el catálogo de planes.'));
    } finally {
      this.loading.set(false);
    }
  }

  async create(payload: PlanCreatePayload): Promise<boolean> {
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.post<Plan>(this.baseUrl, payload));
      await this.load();
      return true;
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudo crear el plan.'));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async update(id: string, patch: PlanUpdatePayload): Promise<boolean> {
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.patch<Plan>(`${this.baseUrl}/${id}`, patch));
      await this.load();
      return true;
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudo actualizar el plan.'));
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
