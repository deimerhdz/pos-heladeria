import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiErrorBody } from '../../../core/auth/auth.models';
import { Page } from '../../../core/interfaces/page.interface';
import {
  Category,
  CategoryCreatePayload,
  CategoryForm,
  CategoryUpdatePayload,
} from '../interfaces/category.interface';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/categories`;

  /** Página actual, para la tabla de Categorías. */
  readonly categories = signal<Category[]>([]);
  /** Lista completa (tope 100), para pickers/validaciones en otros módulos. */
  readonly allCategories = signal<Category[]>([]);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  // Estado de paginación y filtros (reflejo del `Page<T>` del backend).
  readonly page = signal(1);
  readonly size = signal(20);
  readonly total = signal(0);
  readonly totalPages = signal(0);
  readonly search = signal('');
  readonly activeFilter = signal<'' | 'active' | 'inactive'>('');

  async loadCategories(page: number = this.page(), size: number = this.size()): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      let params = new HttpParams().set('page', page).set('size', size);
      const search = this.search().trim();
      if (search) params = params.set('search', search);
      if (this.activeFilter() === 'active') params = params.set('active', 'true');
      if (this.activeFilter() === 'inactive') params = params.set('active', 'false');

      const data = await firstValueFrom(this.http.get<Page<Category>>(this.baseUrl, { params }));
      this.categories.set(data.items);
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

  /** Lista completa (tope 100) para pickers/validaciones de otros módulos. */
  async loadAllCategories(): Promise<void> {
    try {
      const data = await firstValueFrom(
        this.http.get<Page<Category>>(this.baseUrl, { params: { size: 100 } }),
      );
      this.allCategories.set([...data.items].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      this.error.set(this.extractError(err));
    }
  }

  /** Aplica el término de búsqueda y recarga desde la página 1. */
  async setSearch(term: string): Promise<void> {
    this.search.set(term);
    await this.loadCategories(1);
  }

  /** Aplica el filtro de estado y recarga desde la página 1. */
  async setActiveFilter(filter: '' | 'active' | 'inactive'): Promise<void> {
    this.activeFilter.set(filter);
    await this.loadCategories(1);
  }

  async createCategory(data: CategoryForm): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const payload: CategoryCreatePayload = {
      name: data.name,
      description: data.description || null,
    };

    try {
      await firstValueFrom(this.http.post<Category>(this.baseUrl, payload));
      await Promise.all([this.loadCategories(1), this.loadAllCategories()]);
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async updateCategory(id: string, data: CategoryForm): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const payload: CategoryUpdatePayload = {
      name: data.name,
      description: data.description || null,
    };

    try {
      await firstValueFrom(this.http.patch<Category>(`${this.baseUrl}/${id}`, payload));
      await Promise.all([this.loadCategories(), this.loadAllCategories()]);
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async toggleActive(id: string, current: boolean): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const payload: CategoryUpdatePayload = { active: !current };

    try {
      await firstValueFrom(this.http.patch<Category>(`${this.baseUrl}/${id}`, payload));
      await Promise.all([this.loadCategories(), this.loadAllCategories()]);
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as ApiErrorBody | null;
      return body?.detail ?? body?.message ?? 'No se pudo completar la operación.';
    }
    return 'No se pudo completar la operación.';
  }
}
