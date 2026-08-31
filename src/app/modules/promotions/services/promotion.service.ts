import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Page } from '../../../core/interfaces/page.interface';
import { injectPagedQuery } from '../../../core/query/paged-query';
import {
  OverlapConflictError,
  PackageNotDiscountError,
  Promotion,
  PromotionCreatePayload,
  PromotionDuplicatePayload,
  PromotionForm,
  PromotionShapePayload,
  PromotionStatus,
  PromotionStatusPayload,
  PromotionUpdatePayload,
} from '../interfaces/promotion.interface';

/**
 * spec 063 — modelo por conjunto explícito de variantes (decisión de negocio
 * A-58…A-65). Se van del servicio: `overlapCandidates` (el solape real lo
 * bloquea el backend con 409, ya no se calcula en cliente), targets, combos,
 * reglas por presentación y `priority`.
 */
interface PromotionErrorBody {
  detail?: string | { msg?: string }[];
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class PromotionService {
  private readonly http = inject(HttpClient);
  private readonly queryClient = inject(QueryClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/promotions`;

  readonly isSubmitting = signal(false);
  readonly otherError = signal<string | null>(null);

  /** spec 063 (FR-014): detalle del último 409 de solape real bloqueado. */
  readonly overlapConflict = signal<OverlapConflictError | null>(null);
  /** spec 063 (FR-016): detalle del último 409 de "precio de paquete sin descuento". */
  readonly packageNotDiscount = signal<PackageNotDiscountError | null>(null);

  readonly page = signal(1);
  readonly size = signal(20);
  readonly search = signal('');
  readonly statusFilter = signal<PromotionStatus | ''>('');
  private readonly wantsPage = signal(false);
  private readonly wantsActive = signal(false);
  private readonly wantsClosedByRefactor = signal(false);

  private readonly pageQuery = injectPagedQuery<Promotion>({
    queryKey: () => [
      'promotions',
      'page',
      {
        page: this.page(),
        size: this.size(),
        search: this.search().trim(),
        status: this.statusFilter(),
      },
    ],
    queryFn: () =>
      firstValueFrom(
        this.http.get<Page<Promotion>>(this.baseUrl, {
          params: this.listParams(this.page(), this.size(), this.search().trim(), this.statusFilter()),
        }),
      ),
    enabled: () => this.wantsPage(),
  });

  /** Promociones vigentes para vender, la que consume el POS (tope 100). */
  private readonly activeQuery = injectPagedQuery<Promotion>({
    queryKey: () => ['promotions', 'active'],
    queryFn: () =>
      firstValueFrom(
        this.http.get<Page<Promotion>>(this.baseUrl, {
          params: { status: 'active', size: 100 },
          observe: 'response',
        }),
      ).then((res) => {
        const serverTime = res.headers.get('X-Server-Time');
        if (serverTime) this.serverTimeOffsetMs.set(new Date(serverTime).getTime() - Date.now());
        return res.body!;
      }),
    enabled: () => this.wantsActive(),
  });

  /**
   * spec 063 (FR-025): promociones que la migración de la spec 063 pasó a
   * `Finalizada` — el banner descartable del módulo (`closed_by_refactor=true`).
   */
  private readonly closedByRefactorQuery = injectPagedQuery<Promotion>({
    queryKey: () => ['promotions', 'closed-by-refactor'],
    queryFn: () =>
      firstValueFrom(
        this.http.get<Page<Promotion>>(this.baseUrl, {
          params: { closed_by_refactor: true, size: 100 },
        }),
      ),
    enabled: () => this.wantsClosedByRefactor(),
  });

  readonly serverTimeOffsetMs = signal<number | null>(null);
  readonly ready = computed(() => this.serverTimeOffsetMs() !== null);

  now(): Date {
    return new Date(Date.now() + (this.serverTimeOffsetMs() ?? 0));
  }

  readonly promotions = computed(() => this.pageQuery.data()?.items ?? []);
  readonly activePromotions = computed(() => this.activeQuery.data()?.items ?? []);
  readonly closedByRefactor = computed(() => this.closedByRefactorQuery.data()?.items ?? []);
  readonly total = computed(() => this.pageQuery.data()?.total ?? 0);
  readonly totalPages = computed(() => this.pageQuery.data()?.pages ?? 0);
  readonly loading = computed(() => this.pageQuery.isFetching());
  readonly error = computed(() => {
    if (this.otherError()) return this.otherError();
    if (this.pageQuery.isError()) return this.extractError(this.pageQuery.error());
    return null;
  });

  private listParams(
    page: number,
    size: number,
    search: string,
    status: PromotionStatus | '',
  ): HttpParams {
    let params = new HttpParams().set('page', page).set('size', size);
    if (search) params = params.set('search', search);
    if (status) params = params.set('status', status);
    return params;
  }

  load(page: number = this.page(), size: number = this.size()): void {
    this.otherError.set(null);
    this.page.set(page);
    this.size.set(size);
    this.wantsPage.set(true);
  }

  loadActive(): void {
    this.wantsActive.set(true);
  }

  /** Carga la lista del banner de FR-025 (una vez al entrar al módulo). */
  loadClosedByRefactor(): void {
    this.wantsClosedByRefactor.set(true);
  }

  setSearch(term: string): void {
    this.search.set(term);
    this.load(1);
  }

  setStatusFilter(status: PromotionStatus | ''): void {
    this.statusFilter.set(status);
    this.load(1);
  }

  // ── Los 7 endpoints ──────────────────────────────────────────────────

  create(form: PromotionForm, status: 'draft' | 'active'): Promise<Promotion | null> {
    return this.submit(() =>
      this.http.post<Promotion>(this.baseUrl, this.toCreate(form, status)),
    );
  }

  /** `PATCH /promotions/{id}` — solo campos escalares (FR-018). */
  update(id: string, form: PromotionForm): Promise<Promotion | null> {
    const payload: PromotionUpdatePayload = this.toScalars(form);
    return this.submit(() => this.http.patch<Promotion>(`${this.baseUrl}/${id}`, payload));
  }

  /** `PATCH /promotions/{id}/shape` — tipo y conjunto de variantes, solo en `draft`. */
  updateShape(id: string, form: PromotionForm): Promise<Promotion | null> {
    const payload: PromotionShapePayload = {
      type: form.type,
      variant_ids: [...new Set(form.variantIds)],
    };
    return this.submit(() => this.http.patch<Promotion>(`${this.baseUrl}/${id}/shape`, payload));
  }

  changeStatus(id: string, status: PromotionStatus): Promise<Promotion | null> {
    const payload: PromotionStatusPayload = { status };
    return this.submit(() => this.http.patch<Promotion>(`${this.baseUrl}/${id}/status`, payload));
  }

  duplicate(id: string, name: string): Promise<Promotion | null> {
    const payload: PromotionDuplicatePayload = { name };
    return this.submit(() => this.http.post<Promotion>(`${this.baseUrl}/${id}/duplicate`, payload));
  }

  async remove(id: string): Promise<boolean> {
    const done = await this.submit(() => this.http.delete<void>(`${this.baseUrl}/${id}`));
    return done !== null;
  }

  private async submit<T>(request: () => Observable<T>): Promise<T | null> {
    this.isSubmitting.set(true);
    this.otherError.set(null);
    this.overlapConflict.set(null);
    this.packageNotDiscount.set(null);
    try {
      const body = await firstValueFrom(request());
      await this.queryClient.invalidateQueries({ queryKey: ['promotions'] });
      return body ?? ({} as T);
    } catch (err) {
      const detail =
        err instanceof HttpErrorResponse
          ? (err.error as { detail?: unknown } | null)?.detail
          : null;
      if (
        err instanceof HttpErrorResponse &&
        err.status === 409 &&
        detail &&
        typeof detail === 'object' &&
        'conflicts' in detail
      ) {
        this.overlapConflict.set(detail as OverlapConflictError); // FR-014
      } else if (
        err instanceof HttpErrorResponse &&
        err.status === 409 &&
        detail &&
        typeof detail === 'object' &&
        'cheapest_unit_price' in detail
      ) {
        this.packageNotDiscount.set(detail as PackageNotDiscountError); // FR-016
      } else {
        this.otherError.set(this.extractError(err));
      }
      return null;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  // ── Formulario → payload ─────────────────────────────────────────────

  private toCreate(form: PromotionForm, status: 'draft' | 'active'): PromotionCreatePayload {
    return {
      ...this.toScalars(form),
      type: form.type,
      status,
      starts_at: form.starts_at ?? new Date().toISOString(),
      variant_ids: [...new Set(form.variantIds)],
    };
  }

  private toScalars(form: PromotionForm) {
    return {
      name: form.name.trim(),
      description: form.description.trim() || null,
      value: form.value,
      ends_at: form.ends_at || null,
      days_of_week: this.daysToStr(form.days_of_week),
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      min_qty: form.min_qty,
    };
  }

  private daysToStr(days: number[]): string | null {
    return days.length ? [...days].sort((a, b) => a - b).join(',') : null;
  }

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as PromotionErrorBody | null;
      const detail = body?.detail;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail)) {
        const msgs = detail.map((d) => d?.msg).filter((m): m is string => !!m);
        if (msgs.length) return msgs.map((m) => m.replace(/^Value error, /, '')).join(' · ');
      }
      if (typeof body?.message === 'string') return body.message;
    }
    return 'No se pudo completar la operación.';
  }
}
