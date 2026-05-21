import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Category, CategoryForm } from '../interfaces/category.interface';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly supabase = inject(SupabaseService);

  readonly categories = signal<Category[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async loadCategories(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    const { data, error } = await this.supabase.client
      .from('categories')
      .select('*')
      .order('name');

    if (error) {
      this.error.set(error.message);
    } else {
      this.categories.set(data as Category[]);
    }

    this.loading.set(false);
  }

  async createCategory(data: CategoryForm): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    const { error } = await this.supabase.client
      .from('categories')
      .insert({ ...data, is_active: true });

    if (error) {
      this.error.set(error.message);
      this.loading.set(false);
      return;
    }

    await this.loadCategories();
  }

  async updateCategory(id: string, data: CategoryForm): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    const { error } = await this.supabase.client
      .from('categories')
      .update(data)
      .eq('id', id);

    if (error) {
      this.error.set(error.message);
      this.loading.set(false);
      return;
    }

    await this.loadCategories();
  }

  async toggleActive(id: string, current: boolean): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    const { error } = await this.supabase.client
      .from('categories')
      .update({ is_active: !current })
      .eq('id', id);

    if (error) {
      this.error.set(error.message);
      this.loading.set(false);
      return;
    }

    await this.loadCategories();
  }
}
