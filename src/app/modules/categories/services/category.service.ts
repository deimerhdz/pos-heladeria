import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiErrorBody } from '../../../core/auth/auth.models';
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

  readonly categories = signal<Category[]>([]);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  async loadCategories(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const data = await firstValueFrom(this.http.get<Category[]>(this.baseUrl));
      this.categories.set([...data].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.loading.set(false);
    }
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
      await this.loadCategories();
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
      await this.loadCategories();
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
      await this.loadCategories();
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
