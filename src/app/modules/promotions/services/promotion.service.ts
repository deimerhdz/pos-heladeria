import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Page } from '../../../core/interfaces/page.interface';
import { injectPagedQuery } from '../../../core/query/paged-query';
import {
  Promotion,
  PromotionCreatePayload,
  PromotionDuplicatePayload,
  PromotionForm,
  PromotionShapePayload,
  PromotionStatus,
  PromotionStatusPayload,
  PromotionTarget,
  PromotionUpdatePayload,
  PromotionWithOverlaps,
} from '../interfaces/promotion.interface';

/**
 * `detail` de FastAPI: string en los `HTTPException` del router (409/422 ya
 * redactados en español) y array de errores en las validaciones de Pydantic.
 * `ApiErrorBody` (compartido) solo declara el caso string, así que este módulo
 * tipa el suyo para no perder el mensaje de `_combo_items_required` y compañía.
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
  /** Errores fuera de las queries: mutaciones, y el formulario del asistente
   *  (`promotions-page.component.ts` escribe acá directo para su banner). */
  readonly otherError = signal<string | null>(null);

  // Entrada de las queries reactivas: las signals arman la query key.
  readonly page = signal(1);
  readonly size = signal(20);
  readonly search = signal('');
  readonly statusFilter = signal<PromotionStatus | ''>('');
  private readonly wantsPage = signal(false);
  private readonly wantsCandidates = signal(false);
  private readonly wantsActive = signal(false);

  /** Página actual, para la tabla de Promociones. */
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

  /**
   * Lista completa (tope 100) para el motor de solapamientos de la tabla: cada
   * fila se compara contra *todas* las promociones, no solo las de la página
   * actual (`rows()` en promotions-page.component.ts). El backend solo devuelve
   * `overlaps` en create/update/shape, así que la lista los calcula en cliente
   * con el mismo algoritmo (`findOverlaps` en promotion-pricing.util).
   */
  private readonly candidatesQuery = injectPagedQuery<Promotion>({
    queryKey: () => ['promotions', 'candidates'],
    queryFn: () =>
      firstValueFrom(this.http.get<Page<Promotion>>(this.baseUrl, { params: { size: 100 } })),
    enabled: () => this.wantsCandidates(),
  });

  /**
   * Promociones vigentes para vender, **la que consume el POS**. Antes el
   * terminal leía `promotions()` —la página 1 de la pantalla de administración,
   * tamaño 20—, así que un tenant con más de 20 promociones perdía combos e
   * insignias de descuento en silencio, y cambiar de página en el admin movía
   * el catálogo del cajero.
   */
  private readonly activeQuery = injectPagedQuery<Promotion>({
    queryKey: () => ['promotions', 'active'],
    queryFn: () =>
      firstValueFrom(
        this.http.get<Page<Promotion>>(this.baseUrl, {
          params: { status: 'active', size: 100 },
          observe: 'response',
        }),
      ).then((res) => {
        // A-09: esta es la única llamada que el POS de staff hace para
        // promociones vigentes — se aprovecha para sincronizar la hora del
        // servidor en vez de sumar una petición dedicada (research.md
        // Decisión 1).
        const serverTime = res.headers.get('X-Server-Time');
        if (serverTime) this.serverTimeOffsetMs.set(new Date(serverTime).getTime() - Date.now());
        return res.body!;
      }),
    enabled: () => this.wantsActive(),
  });

  /** Desfase (ms) entre `X-Server-Time` del último `GET /promotions?status=active`
   *  y el reloj local en el instante de recibirlo. `null` hasta el primer sync. */
  readonly serverTimeOffsetMs = signal<number | null>(null);

  /** `true` en cuanto hay una hora de servidor con la que evaluar vigencia. */
  readonly ready = computed(() => this.serverTimeOffsetMs() !== null);

  /**
   * Hora a usar para evaluar vigencia de promociones en el POS de staff, en
   * vez de `new Date()` del dispositivo (A-09). Solo debe llamarse cuando
   * `ready()` es `true` — los consumidores deben degradar explícito (sin
   * insignias/descuento de previsualización) mientras no haya sync, nunca caer
   * de vuelta al reloj del dispositivo sin corregir.
   */
  now(): Date {
    return new Date(Date.now() + (this.serverTimeOffsetMs() ?? 0));
  }

  readonly promotions = computed(() => this.pageQuery.data()?.items ?? []);
  readonly overlapCandidates = computed(() => this.candidatesQuery.data()?.items ?? []);
  readonly activePromotions = computed(() => this.activeQuery.data()?.items ?? []);
  readonly total = computed(() => this.pageQuery.data()?.total ?? 0);
  readonly totalPages = computed(() => this.pageQuery.data()?.pages ?? 0);
  readonly loading = computed(() => this.pageQuery.isFetching());
  readonly error = computed(() => {
    if (this.otherError()) return this.otherError();
    if (this.pageQuery.isError()) return this.extractError(this.pageQuery.error());
    if (this.candidatesQuery.isError()) return this.extractError(this.candidatesQuery.error());
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

  /** Setter síncrono; el fetch es un efecto reactivo de `pageQuery`. */
  load(page: number = this.page(), size: number = this.size()): void {
    this.otherError.set(null);
    this.page.set(page);
    this.size.set(size);
    this.wantsPage.set(true);
  }

  /** Candidatas al aviso de solapamiento de la tabla (tope 100). */
  loadOverlapCandidates(): void {
    this.otherError.set(null);
    this.wantsCandidates.set(true);
  }

  /** Vigentes para vender; la usa el POS. */
  loadActive(): void {
    this.wantsActive.set(true);
  }

  /** Aplica el término de búsqueda y recarga desde la página 1. */
  setSearch(term: string): void {
    this.search.set(term);
    this.load(1);
  }

  /** Aplica el filtro de estado y recarga desde la página 1. */
  setStatusFilter(status: PromotionStatus | ''): void {
    this.statusFilter.set(status);
    this.load(1);
  }

  // ── Los 7 endpoints ──────────────────────────────────────────────────

  /** `POST /promotions`. `status` decide si nace en borrador o ya activa. */
  create(form: PromotionForm, status: 'draft' | 'active'): Promise<PromotionWithOverlaps | null> {
    return this.submit(() =>
      this.http.post<PromotionWithOverlaps>(this.baseUrl, this.toCreate(form, status)),
    );
  }

  /** `PATCH /promotions/{id}` — solo campos escalares. */
  update(id: string, form: PromotionForm): Promise<PromotionWithOverlaps | null> {
    const payload: PromotionUpdatePayload = this.toScalars(form);
    return this.submit(() =>
      this.http.patch<PromotionWithOverlaps>(`${this.baseUrl}/${id}`, payload),
    );
  }

  /**
   * `PATCH /promotions/{id}/shape` — tipo, alcance y componentes. El backend
   * responde 409 si la promoción ya salió de `draft`; la UI solo ofrece esta
   * ruta en borradores.
   */
  updateShape(id: string, form: PromotionForm): Promise<PromotionWithOverlaps | null> {
    const payload: PromotionShapePayload = {
      type: form.type,
      targets: this.toTargets(form),
      combo_items: form.type === 'combo' ? form.comboItems : [],
    };
    return this.submit(() =>
      this.http.patch<PromotionWithOverlaps>(`${this.baseUrl}/${id}/shape`, payload),
    );
  }

  /** `PATCH /promotions/{id}/status` — activar, pausar, reanudar o finalizar. */
  changeStatus(id: string, status: PromotionStatus): Promise<Promotion | null> {
    const payload: PromotionStatusPayload = { status };
    return this.submit(() => this.http.patch<Promotion>(`${this.baseUrl}/${id}/status`, payload));
  }

  /** `POST /promotions/{id}/duplicate` — la copia nace en `draft`. */
  duplicate(id: string, name: string): Promise<Promotion | null> {
    const payload: PromotionDuplicatePayload = { name };
    return this.submit(() =>
      this.http.post<Promotion>(`${this.baseUrl}/${id}/duplicate`, payload),
    );
  }

  /** `DELETE /promotions/{id}` — 204, sin cuerpo. */
  async remove(id: string): Promise<boolean> {
    const done = await this.submit(() =>
      this.http.delete<void>(`${this.baseUrl}/${id}`),
    );
    return done !== null;
  }

  /**
   * Ejecuta la mutación, invalida el caché y devuelve el cuerpo de la
   * respuesta (o `null` si falló), para que la página pueda leer `overlaps`.
   * `DELETE` devuelve 204: se normaliza a un objeto vacío truthy.
   */
  private async submit<T>(request: () => Observable<T>): Promise<T | null> {
    this.isSubmitting.set(true);
    this.otherError.set(null);
    try {
      const body = await firstValueFrom(request());
      // 'promotions' matchea por prefijo las tres queries del servicio.
      await this.queryClient.invalidateQueries({ queryKey: ['promotions'] });
      return body ?? ({} as T);
    } catch (err) {
      this.otherError.set(this.extractError(err));
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
      // Un combo define su alcance en `combo_items`; mandarle targets es 422.
      targets: this.toTargets(form),
      combo_items: form.type === 'combo' ? form.comboItems : [],
    };
  }

  /**
   * Los opcionales viajan siempre, incluso en `null`: el backend usa
   * `model_fields_set`, así que enviar `null` explícito es la única forma de
   * limpiar una vigencia ya guardada.
   */
  private toScalars(form: PromotionForm) {
    return {
      name: form.name.trim(),
      description: form.description.trim() || null,
      value: form.value,
      priority: form.priority,
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
      days_of_week: this.daysToStr(form.days_of_week),
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      min_qty: form.min_qty,
    };
  }

  /**
   * Los precios por destino solo los entiende el backend en `qty_price`; en el
   * resto de tipos manda `null` aunque el formulario arrastre algún valor de un
   * cambio de tipo, que si no responde 422.
   */
  private toTargets(form: PromotionForm): PromotionTarget[] {
    if (form.type === 'combo') return [];
    const pack = form.type === 'qty_price';
    return [
      ...form.categoryTargets.map((t) => ({
        category_id: t.id,
        product_id: null,
        value: pack ? t.value : null,
        min_qty: pack ? t.min_qty : null,
      })),
      ...form.productTargets.map((t) => ({
        product_id: t.id,
        category_id: null,
        value: pack ? t.value : null,
        min_qty: pack ? t.min_qty : null,
      })),
    ];
  }

  private daysToStr(days: number[]): string | null {
    return days.length ? [...days].sort((a, b) => a - b).join(',') : null;
  }

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as PromotionErrorBody | null;
      const detail = body?.detail;
      if (typeof detail === 'string') return detail;
      // Validaciones de Pydantic: `[{loc, msg, type}]`. Sin esta rama, mensajes
      // como "Un combo requiere al menos 2 productos distintos" caían al
      // genérico y el admin no sabía qué corregir.
      if (Array.isArray(detail)) {
        const msgs = detail.map((d) => d?.msg).filter((m): m is string => !!m);
        if (msgs.length) return msgs.map((m) => m.replace(/^Value error, /, '')).join(' · ');
      }
      if (typeof body?.message === 'string') return body.message;
    }
    return 'No se pudo completar la operación.';
  }
}
