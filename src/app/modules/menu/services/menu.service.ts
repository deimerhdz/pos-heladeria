import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiErrorBody } from '../../../core/auth/auth.models';
import { MenuCategory } from '../../products/interfaces/product.interface';

/** Raw backend menu (decimals arrive as strings). */
interface MenuOptionResponse {
  id: string;
  name: string;
  extra_price: string;
}

interface MenuOptionGroupResponse {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  options?: MenuOptionResponse[];
}

interface MenuVariantResponse {
  id: string;
  name: string;
  price: string;
}

interface MenuProductResponse {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  variants?: MenuVariantResponse[];
  option_groups?: MenuOptionGroupResponse[];
}

interface MenuCategoryResponse {
  id: string;
  name: string;
  products?: MenuProductResponse[];
}

/** Read-only public menu (`GET /menu`) — the active catalog customers see. */
@Injectable({ providedIn: 'root' })
export class MenuService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/menu`;

  readonly categories = signal<MenuCategory[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  async loadMenu(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const data = await firstValueFrom(this.http.get<MenuCategoryResponse[]>(this.baseUrl));
      this.categories.set(data.map((c) => this.toCategory(c)));
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isLoading.set(false);
    }
  }

  private toCategory(c: MenuCategoryResponse): MenuCategory {
    return {
      id: c.id,
      name: c.name,
      products: (c.products ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        image_url: p.image_url,
        variants: (p.variants ?? []).map((v) => ({
          id: v.id,
          name: v.name,
          price: Number(v.price),
        })),
        option_groups: (p.option_groups ?? []).map((g) => ({
          id: g.id,
          name: g.name,
          min_select: g.min_select,
          max_select: g.max_select,
          options: (g.options ?? []).map((o) => ({
            id: o.id,
            name: o.name,
            extra_price: Number(o.extra_price),
          })),
        })),
      })),
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
