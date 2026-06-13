import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiErrorBody } from '../../../core/auth/auth.models';
import {
  Ingredient,
  IngredientForm,
  InventoryMovementPayload,
  ProductComponentForm,
  ProductCreatePayload,
  ProductType,
  ProductUpdatePayload,
  RecordMovementForm,
} from '../interfaces/ingredient.interface';

/** Raw backend product (price/cost arrive as decimal strings). */
interface ProductResponse {
  id: string;
  name: string;
  description: string | null;
  price: string;
  cost: string;
  is_menu: boolean;
  product_type: ProductType;
  control_stock: boolean;
  stock?: number | null;
  stock_min?: number | null;
  category_id: string;
  unit_measure_id: string;
  active: boolean;
  created_at: string;
  updated_at?: string | null;
}

/** Raw backend recipe component (quantity arrives as a decimal string). */
interface ProductComponentResponse {
  id: string;
  component_id: string;
  quantity: string;
}

/** `GET /products/{id}` (`ProductDetailResponse`) — list fields plus `components`. */
interface ProductDetailResponse extends ProductResponse {
  components: ProductComponentResponse[];
}

interface ProductPage {
  items: ProductResponse[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

@Injectable({ providedIn: 'root' })
export class IngredientsService {
  private readonly http = inject(HttpClient);
  private readonly productsUrl = `${environment.apiBaseUrl}/products`;
  private readonly inventoryUrl = `${environment.apiBaseUrl}/inventory`;

  readonly ingredients = signal<Ingredient[]>([]);
  readonly isLoading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  readonly outOfStockIngredients = computed(() =>
    this.ingredients().filter(i => i.active && i.stock <= 0)
  );

  async loadIngredients(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      // The list endpoint has no product_type filter, so fetch a page and
      // classify client-side (pagination TODO).
      const page = await firstValueFrom(
        this.http.get<ProductPage>(this.productsUrl, { params: { size: 100 } })
      );
      const products = page.items
        .map(p => this.toIngredient(p))
        .sort((a, b) => a.name.localeCompare(b.name));
      this.ingredients.set(products);
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isLoading.set(false);
    }
  }

  async createIngredient(form: IngredientForm): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const isIngredient = form.product_type === 'INGREDIENT';
    const isRecipe = form.product_type === 'RECIPE';

    const payload: ProductCreatePayload = {
      name: form.name,
      description: form.description || null,
      price: isIngredient ? 0 : form.price,
      cost: form.cost,
      is_menu: isIngredient ? false : form.is_menu,
      product_type: form.product_type,
      control_stock: form.control_stock,
      stock: form.control_stock ? form.current_stock : null,
      stock_min: form.stock_min,
      category_id: form.category_id,
      unit_measure_id: form.unit_measure_id,
      components: isRecipe ? form.components : null,
    };

    try {
      await firstValueFrom(this.http.post<ProductResponse>(this.productsUrl, payload));
      await this.loadIngredients();
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async updateIngredient(id: string, form: IngredientForm): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const isIngredient = form.product_type === 'INGREDIENT';
    const isRecipe = form.product_type === 'RECIPE';

    // ProductUpdate does not accept `stock`; stock changes go through inventory.
    const payload: ProductUpdatePayload = {
      name: form.name,
      description: form.description || null,
      price: isIngredient ? 0 : form.price,
      cost: form.cost,
      is_menu: isIngredient ? false : form.is_menu,
      product_type: form.product_type,
      control_stock: form.control_stock,
      stock_min: form.stock_min,
      components: isRecipe ? form.components : null,
      category_id: form.category_id,
      unit_measure_id: form.unit_measure_id,
    };

    try {
      await firstValueFrom(this.http.patch<ProductResponse>(`${this.productsUrl}/${id}`, payload));
      await this.loadIngredients();
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /** Fetch a single product's detail (incl. recipe components) for editing. */
  async loadProductComponents(id: string): Promise<ProductComponentForm[]> {
    try {
      const detail = await firstValueFrom(
        this.http.get<ProductDetailResponse>(`${this.productsUrl}/${id}`)
      );
      return (detail.components ?? []).map(c => ({
        component_id: c.component_id,
        quantity: Number(c.quantity),
      }));
    } catch (err) {
      this.error.set(this.extractError(err));
      return [];
    }
  }

  async toggleActive(id: string, current: boolean): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const payload: ProductUpdatePayload = { active: !current };

    try {
      await firstValueFrom(this.http.patch<ProductResponse>(`${this.productsUrl}/${id}`, payload));
      await this.loadIngredients();
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async recordMovement(id: string, form: RecordMovementForm): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const payload: InventoryMovementPayload = {
      quantity: form.quantity,
      reason: form.reason || null,
    };

    try {
      await firstValueFrom(
        this.http.post(`${this.inventoryUrl}/${id}/${form.type}`, payload)
      );
      await this.loadIngredients();
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private toIngredient(p: ProductResponse): Ingredient {
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      cost: Number(p.cost),
      price: Number(p.price),
      is_menu: p.is_menu,
      product_type: p.product_type,
      control_stock: p.control_stock,
      stock: p.stock ?? 0,
      stock_min: p.stock_min ?? 0,
      category_id: p.category_id,
      unit_measure_id: p.unit_measure_id,
      active: p.active,
      created_at: p.created_at,
      updated_at: p.updated_at,
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
