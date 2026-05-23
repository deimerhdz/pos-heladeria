import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Product, ProductForm } from '../interfaces/product.interface';

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
      .select('*')
      .order('name');

    if (error) {
      this.error.set(error.message);
    } else {
      this.products.set(data as Product[]);
    }

    this.loading.set(false);
  }

  async createProduct(data: ProductForm): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const stock = data.stock ?? 0;
    const isActive = stock > 0;

    const { data: inserted, error } = await this.supabase.client.from('products').insert({
      name: data.name,
      description: data.description || null,
      price: data.price,
      image_url: data.image_url || null,
      category_id: data.category_id,
      stock,
      is_active: isActive,
    }).select('id').single();

    if (error) {
      this.error.set(error.message);
      this.isSubmitting.set(false);
      return;
    }

    if (stock > 0 && inserted) {
      await this.supabase.client.from('inventory_movements').insert({
        product_id: (inserted as { id: string }).id,
        type: 'in',
        quantity: stock,
        reason: 'Stock inicial',
      });
    }

    await this.loadProducts();
    this.isSubmitting.set(false);
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
