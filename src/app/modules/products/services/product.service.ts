import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiErrorBody } from '../../../core/auth/auth.models';
import { MenuService } from '../../menu/services/menu.service';
import { OptionGroupService } from '../../option-groups/services/option-group.service';
import {
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
  VariantOptionGroup,
  VariantOptionGroupDraft,
  VariantUpdatePayload,
} from '../interfaces/product.interface';

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
  created_at: string;
  updated_at?: string | null;
}

interface ProductPage {
  items: ProductResponse[];
  total: number;
  page: number;
  size: number;
  pages: number;
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
  private readonly menuService = inject(MenuService);
  private readonly optionGroupService = inject(OptionGroupService);
  private readonly productsUrl = `${environment.apiBaseUrl}/products`;
  private readonly variantsUrl = `${environment.apiBaseUrl}/variants`;
  private readonly uploadsUrl = `${environment.apiBaseUrl}/uploads`;

  readonly products = signal<Product[]>([]);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  // --- Products ---

  async loadProducts(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await firstValueFrom(
        this.http.get<ProductPage>(this.productsUrl, { params: { size: 100 } }),
      );
      const products = page.items
        .map((p) => this.toProduct(p))
        .sort((a, b) => a.name.localeCompare(b.name));
      this.products.set(products);
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.loading.set(false);
    }
  }

  async getProduct(id: string): Promise<Product | null> {
    try {
      const p = await firstValueFrom(this.http.get<ProductResponse>(`${this.productsUrl}/${id}`));
      return this.toProduct(p);
    } catch (err) {
      this.error.set(this.extractError(err));
      return null;
    }
  }

  /** Creates a product and returns its id (or null on error). */
  async createProduct(form: ProductForm): Promise<string | null> {
    this.isSubmitting.set(true);
    this.error.set(null);
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
      await this.loadProducts();
      return created.id;
    } catch (err) {
      this.error.set(this.extractError(err));
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
    if (ok) await this.loadProducts();
    return ok;
  }

  async toggleActive(id: string, current: boolean): Promise<boolean> {
    const payload: ProductUpdatePayload = { active: !current };
    const ok = await this.run(() =>
      this.http.patch<ProductResponse>(`${this.productsUrl}/${id}`, payload),
    );
    if (ok) await this.loadProducts();
    return ok;
  }

  /** Marca el producto como disponible / agotado temporalmente (RF-006). */
  async toggleAvailable(id: string, current: boolean): Promise<boolean> {
    const payload: ProductUpdatePayload = { available: !current };
    const ok = await this.run(() =>
      this.http.patch<ProductResponse>(`${this.productsUrl}/${id}`, payload),
    );
    if (ok) await this.loadProducts();
    return ok;
  }

  // --- Variants ---

  async loadVariants(productId: string): Promise<Variant[]> {
    try {
      const data = await firstValueFrom(
        this.http.get<VariantResponse[]>(`${this.productsUrl}/${productId}/variants`),
      );
      return data.map((v) => this.toVariant(v));
    } catch (err) {
      this.error.set(this.extractError(err));
      return [];
    }
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
      this.error.set(this.extractError(err));
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
      this.error.set(this.extractError(err));
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

    const variants = await this.loadVariants(id);
    const variantDrafts: VariantDraft[] = [];
    for (const v of variants) {
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
      variants: variantDrafts,
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
    this.error.set(null);
    try {
      const productId = draft.id
        ? await this.saveExistingProduct(draft)
        : await this.saveNewProduct(draft);
      await this.loadProducts();
      return productId;
    } catch (err) {
      this.error.set(this.extractError(err));
      return null;
    } finally {
      this.isSubmitting.set(false);
    }
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

    const existing = await firstValueFrom(
      this.http.get<VariantResponse[]>(`${this.productsUrl}/${productId}/variants`),
    );
    const keptIds = new Set(draft.variants.map((v) => v.id).filter(Boolean));

    // Reconcilia: actualiza las que tienen id, crea las nuevas. Toda la configuración
    // de una presentación va junta y sin orden obligado entre presentaciones, porque
    // receta y grupos son dos PUT idempotentes sobre la misma variante.
    for (const v of draft.variants) {
      const variantId = v.id
        ? (await this.patchVariant(v.id, { name: v.name, price: v.price })).id
        : (await this.postVariant(productId, { name: v.name, price: v.price })).id;
      await this.saveVariantConfig(variantId, v);
    }

    // Elimina (soft) las variantes que el usuario quitó del draft.
    for (const ex of existing) {
      if (!keptIds.has(ex.id)) {
        await firstValueFrom(this.http.delete(`${this.variantsUrl}/${ex.id}`));
      }
    }
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
    };
  }

  private postVariant(productId: string, form: { name: string; price: number }) {
    return firstValueFrom(
      this.http.post<VariantResponse>(`${this.productsUrl}/${productId}/variants`, form),
    );
  }

  private patchVariant(variantId: string, form: { name: string; price: number }) {
    return firstValueFrom(
      this.http.patch<VariantResponse>(`${this.variantsUrl}/${variantId}`, form),
    );
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
    this.error.set(null);
    try {
      await firstValueFrom(request());
      return true;
    } catch (err) {
      this.error.set(this.extractError(err));
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

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as ApiErrorBody | null;
      return body?.detail ?? body?.message ?? 'No se pudo completar la operación.';
    }
    return 'No se pudo completar la operación.';
  }
}
