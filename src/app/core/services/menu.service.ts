import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiErrorBody } from '../auth/auth.models';
import {
  MenuCategory,
  MenuOptionGroup,
  MenuVariantPromotion,
} from '../../modules/products/interfaces/product.interface';

/** Raw backend menu (decimals arrive as strings). */
interface MenuOptionResponse {
  id: string;
  name: string;
  extra_price: string;
  /** Ausente contra un backend sin desplegar; se asume disponible. */
  available?: boolean;
}

interface MenuOptionGroupResponse {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  consume?: boolean;
  options?: MenuOptionResponse[];
}

interface MenuVariantResponse {
  id: string;
  name: string;
  price: string;
  /**
   * spec 066 (FR-016): la terminal gana la **condición** de la promoción.
   *
   * `discounted_price` y `discount_kind` siguen **deliberadamente ausentes** de
   * este tipo: es así como la terminal los descarta. Mapearlos haría que
   * `effectivePrice` empezara a mostrar precios con descuento en la terminal, lo
   * que choca con FR-017 y con la spec 063 FR-023 — el importe de la terminal lo
   * resuelve el preview del cobro, no el menú (research.md D-10). No añadirlos.
   */
  promotion?: MenuVariantPromotion | null;
  option_groups?: MenuOptionGroupResponse[];
  available?: boolean;
}

interface MenuProductResponse {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  variants?: MenuVariantResponse[];
  option_groups?: MenuOptionGroupResponse[];
  available?: boolean;
}

interface MenuCategoryResponse {
  id: string;
  name: string;
  products?: MenuProductResponse[];
}

function toGroup(g: MenuOptionGroupResponse): MenuOptionGroup {
  return {
    id: g.id,
    name: g.name,
    min_select: g.min_select,
    max_select: g.max_select,
    consume: g.consume ?? false,
    options: (g.options ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      extra_price: Number(o.extra_price),
      available: o.available ?? true,
    })),
  };
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
        // `?? true` para no romper contra un backend aún sin desplegar.
        available: p.available ?? true,
        variants: (p.variants ?? []).map((v) => ({
          id: v.id,
          name: v.name,
          price: Number(v.price),
          // spec 066 (FR-016): solo la condición. Ningún importe con descuento
          // entra a la terminal por aquí (FR-017, research.md D-10).
          promotion: v.promotion ?? null,
          option_groups: (v.option_groups ?? []).map(toGroup),
          available: v.available ?? true,
        })),
        option_groups: (p.option_groups ?? []).map(toGroup),
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
