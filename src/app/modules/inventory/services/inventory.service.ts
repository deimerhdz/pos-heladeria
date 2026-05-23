import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { InventoryMovement, ProductStock } from '../interfaces/inventory.interface';

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly supabase = inject(SupabaseService);

  readonly products = signal<ProductStock[]>([]);
  readonly movements = signal<InventoryMovement[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  readonly lowStockProducts = computed(() =>
    this.products().filter(p => p.stock > 0 && p.stock <= 5)
  );

  readonly outOfStockProducts = computed(() =>
    this.products().filter(p => p.stock === 0)
  );

  async loadProducts(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    const { data, error } = await this.supabase.client
      .from('products')
      .select('*')
      .order('name');

    if (error) {
      this.error.set(error.message);
    } else {
      this.products.set((data ?? []) as ProductStock[]);
    }

    this.isLoading.set(false);
  }

  async loadMovements(productId: string): Promise<void> {
    this.movements.set([]);
    this.error.set(null);

    const { data, error } = await this.supabase.client
      .from('inventory_movements')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      this.error.set(error.message);
    } else {
      this.movements.set((data ?? []) as InventoryMovement[]);
    }
  }

  async replenishStock(productId: string, quantity: number, reason: string): Promise<void> {
    if (quantity <= 0) {
      this.error.set('La cantidad debe ser mayor a 0.');
      return;
    }

    this.error.set(null);

    const product = this.products().find(p => p.id === productId);
    if (!product) return;

    const newStock = product.stock + quantity;
    const shouldReactivate = product.stock === 0 && newStock > 0;

    const updatePayload: Record<string, unknown> = { stock: newStock };
    if (shouldReactivate) {
      updatePayload['is_active'] = true;
    }

    const { error: updateError } = await this.supabase.client
      .from('products')
      .update(updatePayload)
      .eq('id', productId);

    if (updateError) {
      this.error.set(updateError.message);
      return;
    }

    const user = await this.supabase.client.auth.getUser();
    const userId = user.data.user?.id ?? null;

    const { error: movError } = await this.supabase.client
      .from('inventory_movements')
      .insert({
        product_id: productId,
        type: 'in',
        quantity,
        reason,
        created_by: userId,
      });

    if (movError) {
      this.error.set(movError.message);
      return;
    }

    await this.loadProducts();
  }
}
