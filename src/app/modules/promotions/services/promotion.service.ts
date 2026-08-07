import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiErrorBody } from '../../../core/auth/auth.models';
import { Page } from '../../../core/interfaces/page.interface';
import { injectPagedQuery } from '../../../core/query/paged-query';
import {
  Promotion,
  PromotionCreatePayload,
  PromotionForm,
  PromotionUpdatePayload,
} from '../interfaces/promotion.interface';

@Injectable({ providedIn: 'root' })
export class PromotionService {
  private readonly http = inject(HttpClient);
  private readonly queryClient = inject(QueryClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/promotions`;

  readonly isSubmitting = signal(false);
  /** Errores fuera de las dos queries: mutaciones, y el formulario del wizard
   *  (`promotions-page.component.ts` escribe acá directo para su banner). */
  readonly otherError = signal<string | null>(null);

  // Entrada de las queries reactivas (antes: reflejo del `Page<T>` del backend).
  readonly page = signal(1);
  readonly size = signal(20);
  private readonly wantsPage = signal(false);
  private readonly wantsAll = signal(false);

  /** Página actual, para la tabla de Promociones. */
  private readonly pageQuery = injectPagedQuery<Promotion>({
    queryKey: () => ['promotions', 'page', { page: this.page(), size: this.size() }],
    queryFn: () =>
      firstValueFrom(
        this.http.get<Page<Promotion>>(this.baseUrl, {
          params: new HttpParams().set('page', this.page()).set('size', this.size()),
        }),
      ),
    enabled: () => this.wantsPage(),
  });

  /**
   * Lista completa (tope 100), exclusiva para el motor de detección de
   * solapamientos: cada fila se compara contra *todas* las demás promociones,
   * no solo las de la página actual (`rows()` en promotions-page.component.ts).
   */
  private readonly allQuery = injectPagedQuery<Promotion>({
    queryKey: () => ['promotions', 'all'],
    queryFn: () =>
      firstValueFrom(this.http.get<Page<Promotion>>(this.baseUrl, { params: { size: 100 } })),
    enabled: () => this.wantsAll(),
  });

  readonly promotions = computed(() => this.pageQuery.data()?.items ?? []);
  readonly allPromotions = computed(() => this.allQuery.data()?.items ?? []);
  readonly total = computed(() => this.pageQuery.data()?.total ?? 0);
  readonly totalPages = computed(() => this.pageQuery.data()?.pages ?? 0);
  readonly loading = computed(() => this.pageQuery.isFetching());
  readonly error = computed(() => {
    if (this.otherError()) return this.otherError();
    if (this.pageQuery.isError()) return this.extractError(this.pageQuery.error());
    if (this.allQuery.isError()) return this.extractError(this.allQuery.error());
    return null;
  });

  /** Antes: async, esperaba el round-trip. Ahora: setter síncrono. */
  load(page: number = this.page(), size: number = this.size()): void {
    this.otherError.set(null);
    this.page.set(page);
    this.size.set(size);
    this.wantsPage.set(true);
  }

  /** Lista completa (tope 100) para el motor de solapamientos. */
  loadAll(): void {
    this.otherError.set(null);
    this.wantsAll.set(true);
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
    this.otherError.set(null);
    try {
      await firstValueFrom(request());
      // 'promotions' matchea por prefijo tanto ['promotions','page',{...}] como
      // ['promotions','all'] — reemplaza el Promise.all([load(), loadAll()]) de antes.
      await this.queryClient.invalidateQueries({ queryKey: ['promotions'] });
      return true;
    } catch (err) {
      this.otherError.set(this.extractError(err));
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
