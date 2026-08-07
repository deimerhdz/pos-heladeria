import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiErrorBody } from '../../../core/auth/auth.models';
import { Page } from '../../../core/interfaces/page.interface';
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

  /** Página actual, para la tabla de Promociones. */
  readonly promotions = signal<Promotion[]>([]);
  /**
   * Lista completa (tope 100), exclusiva para el motor de detección de
   * solapamientos: cada fila se compara contra *todas* las demás promociones,
   * no solo las de la página actual (`rows()` en promotions-page.component.ts).
   */
  readonly allPromotions = signal<Promotion[]>([]);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  // Estado de paginación (reflejo del `Page<T>` del backend).
  readonly page = signal(1);
  readonly size = signal(20);
  readonly total = signal(0);
  readonly totalPages = signal(0);

  async load(page: number = this.page(), size: number = this.size()): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const params = new HttpParams().set('page', page).set('size', size);
      const data = await firstValueFrom(
        this.http.get<Page<Promotion>>(this.baseUrl, { params }),
      );
      this.promotions.set(data.items);
      this.page.set(data.page);
      this.size.set(data.size);
      this.total.set(data.total);
      this.totalPages.set(data.pages);
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.loading.set(false);
    }
  }

  /** Lista completa (tope 100) para el motor de solapamientos. */
  async loadAll(): Promise<void> {
    try {
      const data = await firstValueFrom(
        this.http.get<Page<Promotion>>(this.baseUrl, { params: { size: 100 } }),
      );
      this.allPromotions.set(data.items);
    } catch (err) {
      this.error.set(this.extractError(err));
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
      days_of_month: this.daysToStr(form.days_of_month),
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
      await Promise.all([this.load(this.page(), this.size()), this.loadAll()]);
      return true;
    } catch (err) {
      this.error.set(this.extractError(err));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private toCreate(form: PromotionForm): PromotionCreatePayload {
    const isCombo = form.type === 'combo';
    return {
      name: form.name,
      type: form.type,
      value: form.value,
      active: form.active,
      starts_at: form.starts_at,
      ends_at: form.ends_at,
      days_of_week: this.daysToStr(form.days_of_week),
      days_of_month: this.daysToStr(form.days_of_month),
      start_time: form.start_time,
      end_time: form.end_time,
      min_qty: form.min_qty,
      targets: isCombo
        ? []
        : [
            ...form.categoryIds.map(id => ({ category_id: id, product_id: null })),
            ...form.productIds.map(id => ({ product_id: id, category_id: null })),
          ],
      combo_items: isCombo ? form.comboItems : [],
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
