import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiErrorBody } from '../../../core/auth/auth.models';
import {
  Promotion,
  PromotionCreatePayload,
  PromotionForm,
  PromotionUpdatePayload,
} from '../interfaces/promotion.interface';

@Injectable({ providedIn: 'root' })
export class PromotionService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/promotions`;

  readonly promotions = signal<Promotion[]>([]);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await firstValueFrom(this.http.get<Promotion[]>(this.baseUrl));
      this.promotions.set(data);
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.loading.set(false);
    }
  }

  async create(form: PromotionForm): Promise<boolean> {
    return this.submit(() => this.http.post<Promotion>(this.baseUrl, this.toCreate(form)));
  }

  async update(id: string, form: PromotionForm): Promise<boolean> {
    const payload: PromotionUpdatePayload = {
      name: form.name,
      value: form.value,
      active: form.active,
      starts_at: form.starts_at,
      ends_at: form.ends_at,
      days_of_week: this.daysToStr(form.days_of_week),
      start_time: form.start_time,
      end_time: form.end_time,
      min_qty: form.min_qty,
    };
    return this.submit(() => this.http.patch<Promotion>(`${this.baseUrl}/${id}`, payload));
  }

  async toggleActive(promo: Promotion): Promise<boolean> {
    const payload: PromotionUpdatePayload = { active: !promo.active };
    return this.submit(() => this.http.patch<Promotion>(`${this.baseUrl}/${promo.id}`, payload));
  }

  async remove(id: string): Promise<boolean> {
    return this.submit(() => this.http.delete<void>(`${this.baseUrl}/${id}`));
  }

  private async submit(request: () => import('rxjs').Observable<unknown>): Promise<boolean> {
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(request());
      await this.load();
      return true;
    } catch (err) {
      this.error.set(this.extractError(err));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private toCreate(form: PromotionForm): PromotionCreatePayload {
    return {
      name: form.name,
      type: form.type,
      value: form.value,
      active: form.active,
      starts_at: form.starts_at,
      ends_at: form.ends_at,
      days_of_week: this.daysToStr(form.days_of_week),
      start_time: form.start_time,
      end_time: form.end_time,
      min_qty: form.min_qty,
      targets: [
        ...form.categoryIds.map(id => ({ category_id: id, product_id: null })),
        ...form.productIds.map(id => ({ product_id: id, category_id: null })),
      ],
    };
  }

  private daysToStr(days: number[]): string | null {
    return days.length ? [...days].sort((a, b) => a - b).join(',') : null;
  }

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as ApiErrorBody | null;
      const detail = body?.detail ?? body?.message;
      if (typeof detail === 'string') return detail;
    }
    return 'No se pudo completar la operación.';
  }
}
