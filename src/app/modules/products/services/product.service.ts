import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Page } from '../../../core/interfaces/page.interface';

import { MenuService } from '../../../core/services/menu.service';
import { injectPagedQuery } from '../../../core/query/paged-query';
import { OptionGroupService } from '../../option-groups/services/option-group.service';
import {
  DeactivatedVariant,
  Product,
  ProductCreatePayload,
  ProductDraft,
  ProductForm,
  ProductUpdatePayload,
  RecipeItem,
  RecipeLineDraft,
  Variant,
  VariantCreatePayload,
  VariantDraft,
  VariantForm,
  VariantNameConflict,
  VariantOptionGroup,
  VariantOptionGroupDraft,
  VariantUpdatePayload,
} from '../interfaces/product.interface';

/**
 * El nombre de la presentación ya está tomado dentro del producto (409 del backend).
 *
 * Se tipa aparte del `HttpErrorResponse` porque el guardado necesita distinguir el caso
 * `active: false` — una presentación soft-borrada que hay que restaurar — del choque con
 * una que el usuario tiene delante.
 */
export class VariantNameConflictError extends Error {
  constructor(readonly conflict: VariantNameConflict) {
    super(conflict.error);
    this.name = 'VariantNameConflictError';
  }
}

/** Extrae el `detail` del 409 si tiene la forma del conflicto de nombre. */
function toNameConflict(err: unknown): VariantNameConflict | null {
  if (!(err instanceof HttpErrorResponse) || err.status !== 409) return null;
  const detail = (err.error as { detail?: unknown } | null)?.detail;
  if (detail && typeof detail === 'object' && 'variant_id' in detail) {
    return detail as VariantNameConflict;
  }
  return null;
}

/** Raw backend product. */
interface ProductResponse {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  preparation_type: Product['preparation_type'];
  image_url: string | null;
  active: boolean;
  available: boolean;
  tracks_inventory: boolean;
  created_at: string;
  updated_at?: string | null;
}

/** Raw backend variant (decimals arrive as strings). */
interface VariantResponse {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  price: string;
  active: boolean;
}

interface RecipeItemResponse {
  id: string;
  inventory_item_id: string;
  quantity: string;
}

/** Raw backend `VariantOptionGroupResponse` de `GET /variants/{id}/option-groups`. */
interface VariantOptionGroupResponse {
  id: string;
  product_variant_id: string;
  option_group_id: string;
  min_select: number;
  max_select: number;
  quantity_per_option: string;
}

interface PresignResponse {
  upload_url: string;
  key: string;
  public_url: string;
  expires_in: number;
}

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly http = inject(HttpClient);
  private readonly queryClient = inject(QueryClient);
  private readonly menuService = inject(MenuService);
  private readonly optionGroupService = inject(OptionGroupService);
  private readonly productsUrl = `${environment.apiBaseUrl}/products`;
  private readonly variantsUrl = `${environment.apiBaseUrl}/variants`;
  private readonly uploadsUrl = `${environment.apiBaseUrl}/uploads`;

  readonly isSubmitting = signal(false);
  /**
   * Errores fuera de la query paginada: mutaciones, getProduct, drafts, subida de
   * imagen, y validaciones de formulario del lado del cliente (`product-form.component.ts`
   * escribe acá directo para reusar el mismo banner de error). Se funde con el
   * error de la query paginada en el `error` público de abajo.
   */
  readonly otherError = signal<string | null>(null);
  /**
   * Conflicto de nombre del último guardado, o null. El formulario lo consulta para
   * refrescar la lista de desactivadas y dejar el botón «Restaurar» a la vista.
   */
  readonly lastVariantConflict = signal<VariantNameConflict | null>(null);

  // Entrada de la query paginada (antes: reflejo del `Page<T>` leído del backend
  // tras cada fetch; ahora maneja al revés — son la entrada que arma la query key).
  readonly page = signal(1);
  readonly size = signal(20);
  readonly search = signal('');
  readonly activeFilter = signal<'' | 'active' | 'inactive'>('');
  /** true tras el primer `loadProducts()`; gatea el fetch para que construir el
   *  servicio vía DI (p. ej. desde otro módulo) no dispare una petición sola. */
  private readonly wantsPage = signal(false);

  private readonly productsQuery = injectPagedQuery<ProductResponse>({
    queryKey: () => [
      'products',
      'page',
      {
        page: this.page(),
        size: this.size(),
        search: this.search().trim(),
        active: this.activeFilter(),
      },
    ],
    queryFn: () =>
      this.fetchProductsPage(this.page(), this.size(), this.search().trim(), this.activeFilter()),
    enabled: () => this.wantsPage(),
  });

  readonly products = computed(() =>
    (this.productsQuery.data()?.items ?? [])
      .map((p) => this.toProduct(p))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  readonly total = computed(() => this.productsQuery.data()?.total ?? 0);
  readonly totalPages = computed(() => this.productsQuery.data()?.pages ?? 0);
  /** true durante cualquier fetch (primero o repaginado) — igual semántica que
   *  el `loading` de antes, que el pager usa para deshabilitarse en cada cambio. */
  readonly loading = computed(() => this.productsQuery.isFetching());
  readonly error = computed(
    () =>
      this.otherError() ??
      (this.productsQuery.isError() ? this.extractError(this.productsQuery.error()) : null),
  );

  // --- Products ---

  private fetchProductsPage(
    page: number,
    size: number,
    search: string,
    activeFilter: '' | 'active' | 'inactive',
  ): Promise<Page<ProductResponse>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (search) params = params.set('search', search);
    if (activeFilter === 'active') params = params.set('active', 'true');
    if (activeFilter === 'inactive') params = params.set('active', 'false');
    return firstValueFrom(this.http.get<Page<ProductResponse>>(this.productsUrl, { params }));
  }

  /** Antes: async, esperaba el round-trip. Ahora: setter síncrono; el fetch es un
   *  efecto reactivo de `productsQuery` sobre page/size/search/activeFilter/wantsPage. */
  loadProducts(page: number = this.page(), size: number = this.size()): void {
    this.otherError.set(null);
    this.page.set(page);
    this.size.set(size);
    this.wantsPage.set(true);
  }

  /** Aplica el término de búsqueda y recarga desde la página 1. */
  setSearch(term: string): void {
    this.search.set(term);
    this.loadProducts(1);
  }

  /** Aplica el filtro de estado y recarga desde la página 1. */
  setActiveFilter(filter: '' | 'active' | 'inactive'): void {
    this.activeFilter.set(filter);
    this.loadProducts(1);
  }

  async getProduct(id: string): Promise<Product | null> {
    try {
      const p = await firstValueFrom(this.http.get<ProductResponse>(`${this.productsUrl}/${id}`));
      return this.toProduct(p);
    } catch (err) {
      this.otherError.set(this.extractError(err));
      return null;
    }
  }

  /** Creates a product and returns its id (or null on error). */
  async createProduct(form: ProductForm): Promise<string | null> {
    this.isSubmitting.set(true);
    this.otherError.set(null);
    const payload: ProductCreatePayload = {
      category_id: form.category_id,
      name: form.name,
      description: form.description || null,
      preparation_type: form.preparation_type,
      image_url: form.image_url || null,
    };
    try {
      const created = await firstValueFrom(
        this.http.post<ProductResponse>(this.productsUrl, payload),
      );
      await this.queryClient.invalidateQueries({ queryKey: ['products'] });
      return created.id;
    } catch (err) {
      this.otherError.set(this.extractError(err));
      return null;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async updateProduct(id: string, form: ProductForm): Promise<boolean> {
    const payload: ProductUpdatePayload = {
      category_id: form.category_id,
      name: form.name,
      description: form.description || null,
      preparation_type: form.preparation_type,
      image_url: form.image_url || null,
    };
    const ok = await this.run(() =>
      this.http.patch<ProductResponse>(`${this.productsUrl}/${id}`, payload),
    );
    if (ok) await this.queryClient.invalidateQueries({ queryKey: ['products'] });
    return ok;
  }

  async toggleActive(id: string, current: boolean): Promise<boolean> {
    const payload: ProductUpdatePayload = { active: !current };
    const ok = await this.run(() =>
      this.http.patch<ProductResponse>(`${this.productsUrl}/${id}`, payload),
    );
    if (ok) await this.queryClient.invalidateQueries({ queryKey: ['products'] });
    return ok;
  }

  /** Marca el producto como disponible / agotado temporalmente (RF-006). */
  async toggleAvailable(id: string, current: boolean): Promise<boolean> {
    const payload: ProductUpdatePayload = { available: !current };
    const ok = await this.run(() =>
      this.http.patch<ProductResponse>(`${this.productsUrl}/${id}`, payload),
    );
    if (ok) await this.queryClient.invalidateQueries({ queryKey: ['products'] });
    return ok;
  }

  // --- Variants ---

  /** Variantes del producto; `active` filtra por estado (sin él, todas). */
  async loadVariants(productId: string, active?: boolean): Promise<Variant[]> {
    try {
      const data = await firstValueFrom(
        this.http.get<VariantResponse[]>(`${this.productsUrl}/${productId}/variants`, {
          params: active === undefined ? {} : { active },
        }),
      );
      return data.map((v) => this.toVariant(v));
    } catch (err) {
      this.otherError.set(this.extractError(err));
      return [];
    }
  }

  /** Las presentaciones soft-borradas, para la sección «desactivadas» del editor. */
  async loadDeactivated(productId: string): Promise<DeactivatedVariant[]> {
    const variants = await this.loadVariants(productId, false);
    return variants.map((v) => ({ id: v.id, name: v.name, price: v.price }));
  }

  /** Devuelve una presentación desactivada a la carta. */
  async restoreVariant(variantId: string): Promise<boolean> {
    return this.updateVariant(variantId, { active: true });
  }

  async createVariant(productId: string, form: VariantForm): Promise<boolean> {
    const payload: VariantCreatePayload = {
      name: form.name,
      price: form.price,
      sku: form.sku,
    };
    return this.run(() =>
      this.http.post<VariantResponse>(`${this.productsUrl}/${productId}/variants`, payload),
    );
  }

  async updateVariant(variantId: string, payload: VariantUpdatePayload): Promise<boolean> {
    return this.run(() => this.http.patch(`${this.variantsUrl}/${variantId}`, payload));
  }

  async deleteVariant(variantId: string): Promise<boolean> {
    return this.run(() => this.http.delete(`${this.variantsUrl}/${variantId}`));
  }

  /**
   * Persiste el orden de las presentaciones activas de un producto (spec 042). Se
   * llama una sola vez, al final de `saveExistingProduct` — arrastrar una fila solo
   * reordena `draft().variants` en memoria (feedback inmediato), nunca dispara esta
   * llamada por sí solo.
   */
  private async reorderVariants(productId: string, orderedIds: string[]): Promise<void> {
    await firstValueFrom(
      this.http.patch(`${this.productsUrl}/${productId}/variants/reorder`, {
        variant_ids: orderedIds,
      }),
    );
  }

  // --- Recipes (per variant, consume inventory items) ---

  /** Fetch a variant's recipe. A missing recipe (404) is a valid empty state. */
  async getVariantRecipe(variantId: string): Promise<RecipeItem[]> {
    try {
      const data = await firstValueFrom(
        this.http.get<RecipeItemResponse[]>(`${this.variantsUrl}/${variantId}/recipe`),
      );
      return data.map((i) => ({
        inventory_item_id: i.inventory_item_id,
        quantity: Number(i.quantity),
      }));
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 404) return [];
      this.otherError.set(this.extractError(err));
      return [];
    }
  }

  // --- Option groups (per variant) ---

  /**
   * Grupos que ofrece una variante, con su nombre resuelto contra el catálogo (el
   * endpoint solo devuelve ids).
   */
  async getVariantOptionGroups(variantId: string): Promise<VariantOptionGroupDraft[]> {
    try {
      const [links] = await Promise.all([
        firstValueFrom(
          this.http.get<VariantOptionGroupResponse[]>(
            `${this.variantsUrl}/${variantId}/option-groups`,
          ),
        ),
        this.optionGroupService.groups().length
          ? Promise.resolve()
          : this.optionGroupService.loadGroups(),
      ]);
      const byId = new Map(this.optionGroupService.groups().map((g) => [g.id, g]));
      return links.map((l) => ({
        option_group_id: l.option_group_id,
        name: byId.get(l.option_group_id)?.name ?? 'Grupo',
        min_select: l.min_select,
        max_select: l.max_select,
        quantity_per_option: Number(l.quantity_per_option),
      }));
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 404) return [];
      this.otherError.set(this.extractError(err));
      return [];
    }
  }

  // --- Draft: single-page create/edit orchestration ---

  /**
   * Loads a product and its whole graph (cada variante con su receta y sus grupos)
   * into a single editable {@link ProductDraft}.
   */
  async getProductDraft(id: string): Promise<ProductDraft | null> {
    const product = await this.getProduct(id);
    if (!product) return null;

    // Una sola lectura, partida por estado: las desactivadas se listan aparte para
    // restaurarlas, y no se les pide receta ni grupos porque no se editan. Mezclarlas con
    // las vivas hacía que una presentación borrada reapareciera como si se vendiera.
    const variants = await this.loadVariants(id);
    const variantDrafts: VariantDraft[] = [];
    for (const v of variants.filter((v) => v.active)) {
      const [recipe, optionGroups] = await Promise.all([
        this.getVariantRecipe(v.id),
        this.getVariantOptionGroups(v.id),
      ]);
      variantDrafts.push({
        id: v.id,
        localId: v.id,
        name: v.name,
        price: v.price,
        recipe: recipe.map((r) => ({ ...r })),
        optionGroups,
      });
    }

    return {
      id: product.id,
      name: product.name,
      category_id: product.category_id,
      description: product.description ?? '',
      preparation_type: product.preparation_type,
      image_url: product.image_url ?? '',
      active: product.active,
      hasSizes: variantDrafts.length > 1,
      tracks_inventory: product.tracks_inventory,
      variants: variantDrafts,
      deactivated: variants
        .filter((v) => !v.active)
        .map((v) => ({ id: v.id, name: v.name, price: v.price })),
    };
  }

  /**
   * Persists a whole {@link ProductDraft}, orchestrating the flat backend
   * endpoints (there is no nested create). Returns the product id on success,
   * `null` on failure. Runs sequentially: a failing step aborts the rest, so on
   * create the product may remain partially saved (still editable afterwards).
   */
  async saveProduct(draft: ProductDraft): Promise<string | null> {
    this.isSubmitting.set(true);
    this.otherError.set(null);
    this.lastVariantConflict.set(null);
    try {
      const productId = draft.id
        ? await this.saveExistingProduct(draft)
        : await this.saveNewProduct(draft);
      await this.queryClient.invalidateQueries({ queryKey: ['products'] });
      return productId;
    } catch (err) {
      if (err instanceof VariantNameConflictError) {
        this.lastVariantConflict.set(err.conflict);
        this.otherError.set(this.conflictMessage(err.conflict));
      } else {
        this.otherError.set(this.extractError(err));
      }
      return null;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /** Mensaje del 409 de nombre, dirigido a la acción que lo resuelve. */
  private conflictMessage(conflict: VariantNameConflict): string {
    return conflict.active
      ? conflict.error
      : `${conflict.error} Búscala en «Presentaciones desactivadas», más abajo.`;
  }

  private async saveNewProduct(draft: ProductDraft): Promise<string> {
    const created = await firstValueFrom(
      this.http.post<ProductResponse>(this.productsUrl, this.toProductPayload(draft)),
    );
    const productId = created.id;

    // El backend auto-crea una variante "Single"; se reutiliza como la primera.
    const auto = await firstValueFrom(
      this.http.get<VariantResponse[]>(`${this.productsUrl}/${productId}/variants`),
    );
    const autoId = auto[0]?.id ?? null;

    for (let i = 0; i < draft.variants.length; i++) {
      const v = draft.variants[i];
      const variantId =
        i === 0 && autoId
          ? (await this.patchVariant(autoId, { name: v.name, price: v.price })).id
          : (await this.postVariant(productId, { name: v.name, price: v.price })).id;
      await this.saveVariantConfig(variantId, v);
    }
    return productId;
  }

  private async saveExistingProduct(draft: ProductDraft): Promise<string> {
    const productId = draft.id!;
    await firstValueFrom(
      this.http.patch<ProductResponse>(
        `${this.productsUrl}/${productId}`,
        this.toProductPayload(draft),
      ),
    );

    // Solo las vivas: el draft ya no las trae todas, y volver a soft-borrar una
    // desactivada en cada guardado sería un DELETE inútil por presentación retirada.
    const existing = await firstValueFrom(
      this.http.get<VariantResponse[]>(`${this.productsUrl}/${productId}/variants`, {
        params: { active: true },
      }),
    );
    const keptIds = new Set(draft.variants.map((v) => v.id).filter(Boolean));

    // Reconcilia: actualiza las que tienen id, crea las nuevas. Toda la configuración
    // de una presentación va junta y sin orden obligado entre presentaciones, porque
    // receta y grupos son dos PUT idempotentes sobre la misma variante.
    const orderedIds: string[] = [];
    for (const v of draft.variants) {
      const variantId = v.id
        ? (await this.patchVariant(v.id, { name: v.name, price: v.price })).id
        : (await this.postVariant(productId, { name: v.name, price: v.price })).id;
      orderedIds.push(variantId);
      await this.saveVariantConfig(variantId, v);
    }

    // Elimina (soft) las variantes que el usuario quitó del draft.
    for (const ex of existing) {
      if (!keptIds.has(ex.id)) {
        await firstValueFrom(this.http.delete(`${this.variantsUrl}/${ex.id}`));
      }
    }

    // spec 042 (FR-002/FR-003): el orden que el usuario vio y arrastró en el
    // formulario se persiste aquí, al guardar — nunca al soltar la fila. Se llama
    // después del loop de arriba (todo id ya resuelto) y del borrado (el conjunto de
    // activas en el backend ya coincide exactamente con `orderedIds`).
    await this.reorderVariants(productId, orderedIds);

    return productId;
  }

  /** Receta e grupos de una presentación: dos reemplazos totales e idempotentes. */
  private async saveVariantConfig(variantId: string, v: VariantDraft): Promise<void> {
    await this.setRecipe(variantId, v.recipe);
    await this.setVariantOptionGroups(variantId, v.optionGroups);
  }

  private toProductPayload(draft: ProductDraft): ProductCreatePayload & ProductUpdatePayload {
    return {
      category_id: draft.category_id,
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      preparation_type: draft.preparation_type,
      image_url: draft.image_url || null,
      tracks_inventory: draft.tracks_inventory,
    };
  }

  /**
   * Crea la presentación, traduciendo el 409 de nombre tomado a un error tipado. Sin
   * esto el guardado solo podía mostrar el texto del backend, y el caso que de verdad
   * importa —el nombre lo ocupa una presentación desactivada, que el editor no lista—
   * quedaba indistinguible de un duplicado a la vista del usuario.
   */
  private async postVariant(productId: string, form: { name: string; price: number }) {
    try {
      return await firstValueFrom(
        this.http.post<VariantResponse>(`${this.productsUrl}/${productId}/variants`, form),
      );
    } catch (err) {
      const conflict = toNameConflict(err);
      if (conflict) throw new VariantNameConflictError(conflict);
      throw err;
    }
  }

  /** Renombrar al nombre de otra presentación choca igual que crearla: mismo trato. */
  private async patchVariant(variantId: string, form: { name: string; price: number }) {
    try {
      return await firstValueFrom(
        this.http.patch<VariantResponse>(`${this.variantsUrl}/${variantId}`, form),
      );
    } catch (err) {
      const conflict = toNameConflict(err);
      if (conflict) throw new VariantNameConflictError(conflict);
      throw err;
    }
  }

  /**
   * Reemplazo total de los insumos fijos. Descarta las líneas sin insumo elegido o sin
   * cantidad, y deduplica por insumo (el backend rechaza el repetido con 422).
   */
  private async setRecipe(variantId: string, lines: RecipeLineDraft[]): Promise<void> {
    const seen = new Set<string>();
    const items: RecipeItem[] = [];
    for (const l of lines) {
      if (!l.inventory_item_id || Number(l.quantity) <= 0) continue;
      if (seen.has(l.inventory_item_id)) continue;
      seen.add(l.inventory_item_id);
      items.push({ inventory_item_id: l.inventory_item_id, quantity: Number(l.quantity) });
    }
    await firstValueFrom(this.http.put(`${this.variantsUrl}/${variantId}/recipe`, { items }));
  }

  /**
   * Reemplazo total de los grupos que ofrece la presentación. Descarta las filas sin
   * grupo elegido y deduplica; `quantity_per_option` en 0 es válido (el grupo se ofrece
   * sin descontar por sí mismo).
   */
  private async setVariantOptionGroups(
    variantId: string,
    drafts: VariantOptionGroupDraft[],
  ): Promise<void> {
    const seen = new Set<string>();
    const groups: VariantOptionGroup[] = [];
    for (const g of drafts) {
      if (!g.option_group_id || seen.has(g.option_group_id)) continue;
      seen.add(g.option_group_id);
      groups.push({
        option_group_id: g.option_group_id,
        min_select: Number(g.min_select) || 0,
        max_select: Number(g.max_select) || 1,
        quantity_per_option: Number(g.quantity_per_option) || 0,
      });
    }
    await firstValueFrom(
      this.http.put(`${this.variantsUrl}/${variantId}/option-groups`, { groups }),
    );
  }

  // --- Image storage (Cloudflare R2, via presigned upload) ---

  /**
   * Uploads a product image directly to R2: asks the backend for a presigned
   * PUT URL scoped to the tenant, then PUTs the file straight to R2 (bytes
   * never go through our API). Deleting the previous image is handled by the
   * backend automatically when `image_url` changes on PATCH /products/{id}.
   */
  async uploadProductImage(file: File): Promise<string> {
    const presign = await firstValueFrom(
      this.http.post<PresignResponse>(`${this.uploadsUrl}/presign`, {
        filename: file.name,
        content_type: file.type,
      }),
    );

    await firstValueFrom(
      this.http.put(presign.upload_url, file, {
        headers: { 'Content-Type': file.type },
      }),
    );

    return presign.public_url;
  }

  // --- Helpers ---

  /** Runs a write request under isSubmitting/error; returns success boolean. */
  private async run(request: () => Observable<unknown>): Promise<boolean> {
    this.isSubmitting.set(true);
    this.otherError.set(null);
    try {
      await firstValueFrom(request());
      return true;
    } catch (err) {
      this.otherError.set(this.extractError(err));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private toProduct(p: ProductResponse): Product {
    return {
      id: p.id,
      category_id: p.category_id,
      name: p.name,
      description: p.description,
      preparation_type: p.preparation_type,
      image_url: p.image_url,
      active: p.active,
      available: p.available ?? true,
      tracks_inventory: p.tracks_inventory ?? false,
      created_at: p.created_at,
      updated_at: p.updated_at,
    };
  }

  private toVariant(v: VariantResponse): Variant {
    return {
      id: v.id,
      product_id: v.product_id,
      name: v.name,
      sku: v.sku,
      price: Number(v.price),
      active: v.active,
    };
  }

  /**
   * Mensaje legible del error del backend. `detail` llega en tres formas: texto, la lista
   * de pydantic en los 422, y un objeto en los 409 que traen datos para actuar (nombre
   * de variante tomado, grupo de opciones en uso). Sin cubrir el objeto, esos 409 se
   * mostraban como `[object Object]`.
   */
  private extractError(err: unknown): string {
    const fallback = 'No se pudo completar la operación.';
    if (!(err instanceof HttpErrorResponse)) return fallback;
    const body = err.error as { detail?: unknown; message?: string } | null;
    const detail = body?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      return (detail[0] as { msg?: string })?.msg ?? fallback;
    }
    if (detail && typeof detail === 'object') {
      return (detail as { error?: string }).error ?? fallback;
    }
    return body?.message ?? fallback;
  }
}
