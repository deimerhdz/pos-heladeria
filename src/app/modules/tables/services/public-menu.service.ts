import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { PublicMenuTable, MenuCategory, MenuProduct } from '../interfaces/table.interface';

export interface PublicMenuData {
  table: PublicMenuTable;
  categories: MenuCategory[];
}

@Injectable({ providedIn: 'root' })
export class PublicMenuService {
  private readonly supabase = inject(SupabaseService);

  async getMenuByCode(code: string): Promise<PublicMenuData | null> {
    const { data: tableData, error: tableError } = await this.supabase.client
      .from('tables')
      .select('*')
      .eq('code', code)
      .single();

    if (tableError || !tableData) return null;

    const table = tableData as PublicMenuTable;

    const { data: productsData, error: productsError } = await this.supabase.client
      .from('products')
      .select('id, name, description, price, image_url, category_id')
      .eq('is_active', true)
      .order('name');

    if (productsError) return { table, categories: [] };

    const { data: categoriesData, error: categoriesError } = await this.supabase.client
      .from('categories')
      .select('id, name')
      .eq('is_active', true)
      .order('name');

    if (categoriesError) return { table, categories: [] };

    const categoryMap = new Map<string, MenuCategory>();
    for (const cat of categoriesData as { id: string; name: string }[]) {
      categoryMap.set(cat.id, { id: cat.id, name: cat.name, products: [] });
    }

    for (const p of productsData as (MenuProduct & { category_id: string })[]) {
      const cat = categoryMap.get(p.category_id);
      if (cat) {
        cat.products.push({
          id: p.id,
          name: p.name,
          description: p.description,
          price: p.price,
          image_url: p.image_url,
        });
      }
    }

    const categories = Array.from(categoryMap.values()).filter(c => c.products.length > 0);

    return { table, categories };
  }
}
