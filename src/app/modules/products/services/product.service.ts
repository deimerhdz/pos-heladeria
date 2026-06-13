import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Product, ProductForm, RecipeItem, RecipeItemForm } from '../interfaces/product.interface';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly supabase = inject(SupabaseService);

  readonly products = signal<Product[]>([]);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  async loadProducts(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    const { data, error } = await this.supabase.client
      .from('products')
      .select('id, name, description, price, image_url, is_active, category_id, created_at')
      .order('name');

    if (error) {
      this.error.set(error.message);
    } else {
      this.products.set((data ?? []) as Product[]);
    }

    this.loading.set(false);
  }

  async createProduct(data: ProductForm): Promise<string | null> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const { data: inserted, error } = await this.supabase.client
      .from('products')
      .insert({
        name: data.name,
        description: data.description || null,
        price: data.price,
        image_url: data.image_url || null,
        category_id: data.category_id,
        is_active: true,
      })
      .select('id')
      .single();

    if (error) {
      this.error.set(error.message);
      this.isSubmitting.set(false);
      return null;
    }

    await this.loadProducts();
    this.isSubmitting.set(false);
    return (inserted as { id: string }).id;
  }

  async updateProduct(id: string, data: ProductForm): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const { error } = await this.supabase.client
      .from('products')
      .update({
        name: data.name,
        description: data.description || null,
        price: data.price,
        image_url: data.image_url || null,
        category_id: data.category_id,
      })
      .eq('id', id);

    if (error) {
      this.error.set(error.message);
      this.isSubmitting.set(false);
      return;
    }

    await this.loadProducts();
    this.isSubmitting.set(false);
  }

  async loadRecipe(productId: string): Promise<RecipeItem[]> {
    const { data, error } = await this.supabase.client
      .from('recipe_items')
      .select(`
        id, product_id, ingredient_id, quantity,
        ingredients ( name, unit, cost_per_unit )
      `)
      .eq('product_id', productId);

    if (error || !data) return [];

    return (data as unknown as {
      id: string;
      product_id: string;
      ingredient_id: string;
      quantity: number;
      ingredients: { name: string; unit: string; cost_per_unit: number } | null;
    }[]).map(row => ({
      id: row.id,
      product_id: row.product_id,
      ingredient_id: row.ingredient_id,
      quantity: row.quantity,
      ingredient_name: row.ingredients?.name ?? '',
      ingredient_unit: (row.ingredients?.unit ?? 'unidad') as RecipeItem['ingredient_unit'],
      ingredient_cost_per_unit: row.ingredients?.cost_per_unit ?? 0,
    }));
  }

  async saveRecipe(productId: string, items: RecipeItemForm[]): Promise<void> {
    const { error: deleteError } = await this.supabase.client
      .from('recipe_items')
      .delete()
      .eq('product_id', productId);

    if (deleteError) {
      this.error.set(deleteError.message);
      return;
    }

    if (items.length === 0) return;

    const rows = items.map(item => ({
      product_id: productId,
      ingredient_id: item.ingredient_id,
      quantity: item.quantity,
    }));

    const { error: insertError } = await this.supabase.client
      .from('recipe_items')
      .insert(rows);

    if (insertError) {
      this.error.set(insertError.message);
    }
  }

  calculateProductCost(recipe: RecipeItem[]): number {
    return recipe.reduce(
      (sum, item) => sum + item.quantity * item.ingredient_cost_per_unit,
      0
    );
  }

  async uploadProductImage(file: File): Promise<string> {
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `products/${timestamp}-${safeName}`;

    const { error } = await this.supabase.client.storage
      .from('product-images')
      .upload(path, file, { upsert: false });

    if (error) throw new Error(error.message);

    const { data } = this.supabase.client.storage
      .from('product-images')
      .getPublicUrl(path);

    return data.publicUrl;
  }

  async deleteProductImage(imageUrl: string): Promise<void> {
    const marker = '/product-images/';
    const idx = imageUrl.indexOf(marker);
    if (idx === -1) return;
    const path = imageUrl.slice(idx + marker.length);
    await this.supabase.client.storage.from('product-images').remove([path]);
  }

  async toggleActive(id: string, current: boolean): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const { error } = await this.supabase.client
      .from('products')
      .update({ is_active: !current })
      .eq('id', id);

    if (error) {
      this.error.set(error.message);
    } else {
      await this.loadProducts();
    }

    this.isSubmitting.set(false);
  }
}
