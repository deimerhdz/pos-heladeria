import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiErrorBody } from '../../../core/auth/auth.models';
import {
  AdjustForm,
  AdjustmentPayload,
  InventoryItem,
  InventoryItemCreatePayload,
  InventoryItemForm,
  InventoryItemUpdatePayload,
  InventoryMovement,
  Purchase,
  PurchaseCreatePayload,
  PurchaseForm,
} from '../interfaces/inventory.interface';

/** Raw backend item (decimals arrive as strings). */
interface InventoryItemResponse {
  id: string;
  name: string;
  unit_measure_id: string;
  type: InventoryItem['type'];
  current_stock: string;
  min_stock: string;
  unit_cost: string;
  active: boolean;
}

/** Raw backend movement (decimals arrive as strings). */
interface MovementResponse {
  id: string;
  inventory_item_id: string;
  type: string;
  quantity: string;
  reason: string | null;
  reference_type: string | null;
  reference_id: string | null;
  moved_at: string;
}

interface PurchaseItemResponse {
  id: string;
  inventory_item_id: string;
  quantity: string;
  received_quantity: string;
  unit_cost: string;
}

interface PurchaseResponse {
  id: string;
  supplier_id: string | null;
  invoice_number: string | null;
  status: Purchase['status'];
  total: string;
  purchased_at: string;
  items?: PurchaseItemResponse[];
}

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/inventory`;

  readonly items = signal<InventoryItem[]>([]);
  readonly purchases = signal<Purchase[]>([]);
  readonly isLoading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  /** Active items whose current stock is at or below their minimum. */
  readonly lowStockItems = computed(() =>
    this.items().filter(i => i.active && i.current_stock <= i.min_stock)
  );

  async loadItems(active?: boolean): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    let params = new HttpParams();
    if (active !== undefined) params = params.set('active', String(active));

    try {
      const data = await firstValueFrom(
        this.http.get<InventoryItemResponse[]>(`${this.baseUrl}/items`, { params })
      );
      const items = data
        .map(i => this.toItem(i))
        .sort((a, b) => a.name.localeCompare(b.name));
      this.items.set(items);
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isLoading.set(false);
    }
  }

  async createItem(form: InventoryItemForm): Promise<boolean> {
    const payload: InventoryItemCreatePayload = {
      name: form.name,
      unit_measure_id: form.unit_measure_id,
      type: form.type,
      current_stock: form.current_stock,
      min_stock: form.min_stock,
      unit_cost: form.unit_cost,
    };
    return this.submit(() =>
      this.http.post<InventoryItemResponse>(`${this.baseUrl}/items`, payload)
    );
  }

  async updateItem(id: string, form: InventoryItemForm): Promise<boolean> {
    const payload: InventoryItemUpdatePayload = {
      name: form.name,
      unit_measure_id: form.unit_measure_id,
      type: form.type,
      min_stock: form.min_stock,
      unit_cost: form.unit_cost,
    };
    return this.submit(() =>
      this.http.patch<InventoryItemResponse>(`${this.baseUrl}/items/${id}`, payload)
    );
  }

  async toggleActive(id: string, current: boolean): Promise<boolean> {
    const payload: InventoryItemUpdatePayload = { active: !current };
    return this.submit(() =>
      this.http.patch<InventoryItemResponse>(`${this.baseUrl}/items/${id}`, payload)
    );
  }

  /** Adjust stock by a signed delta. Direction determines the sign. */
  async adjustStock(id: string, form: AdjustForm): Promise<boolean> {
    const magnitude = Math.abs(form.quantity);
    const payload: AdjustmentPayload = {
      signed_delta: form.direction === 'out' ? -magnitude : magnitude,
      reason: form.reason || null,
    };
    return this.submit(() =>
      this.http.post<MovementResponse>(`${this.baseUrl}/items/${id}/adjust`, payload)
    );
  }

  /** Fetch the kardex (movements) of a single item, newest first. */
  async loadMovements(itemId: string): Promise<InventoryMovement[]> {
    try {
      const data = await firstValueFrom(
        this.http.get<MovementResponse[]>(`${this.baseUrl}/items/${itemId}/movements`)
      );
      return data
        .map(m => this.toMovement(m))
        .sort((a, b) => b.moved_at.localeCompare(a.moved_at));
    } catch (err) {
      this.error.set(this.extractError(err));
      return [];
    }
  }

  async loadPurchases(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const data = await firstValueFrom(
        this.http.get<PurchaseResponse[]>(`${this.baseUrl}/purchases`)
      );
      const purchases = data
        .map(p => this.toPurchase(p))
        .sort((a, b) => b.purchased_at.localeCompare(a.purchased_at));
      this.purchases.set(purchases);
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Register a purchase; refreshes items (stock rises) and the purchase list. */
  async createPurchase(form: PurchaseForm): Promise<boolean> {
    return this.postPurchase(`${this.baseUrl}/purchases`, form);
  }

  /** Crear una orden de compra (draft, sin alta de stock) — RF-022. */
  async createPurchaseOrder(form: PurchaseForm): Promise<boolean> {
    return this.postPurchase(`${this.baseUrl}/purchases/order`, form);
  }

  private async postPurchase(url: string, form: PurchaseForm): Promise<boolean> {
    const payload: PurchaseCreatePayload = {
      supplier_id: form.supplier_id || null,
      invoice_number: form.invoice_number || null,
      items: form.items.map(i => ({
        inventory_item_id: i.inventory_item_id,
        quantity: i.quantity,
        unit_cost: i.unit_cost,
      })),
    };
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.post<PurchaseResponse>(url, payload));
      await Promise.all([this.loadItems(), this.loadPurchases()]);
      return true;
    } catch (err) {
      this.error.set(this.extractError(err));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /** Recibir (parcial o total) una orden de compra — RF-022. */
  async receivePurchase(
    purchaseId: string,
    items: { purchase_item_id: string; quantity: number }[],
  ): Promise<boolean> {
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.http.post<PurchaseResponse>(`${this.baseUrl}/purchases/${purchaseId}/receive`, { items }),
      );
      await Promise.all([this.loadItems(), this.loadPurchases()]);
      return true;
    } catch (err) {
      this.error.set(this.extractError(err));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /**
   * Runs a write request against items, then refreshes the item list. Returns
   * `true` on success so callers can close their modal only when it succeeded.
   */
  private async submit(request: () => Observable<unknown>): Promise<boolean> {
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(request());
      await this.loadItems();
      return true;
    } catch (err) {
      this.error.set(this.extractError(err));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private toItem(i: InventoryItemResponse): InventoryItem {
    return {
      id: i.id,
      name: i.name,
      unit_measure_id: i.unit_measure_id,
      type: i.type,
      current_stock: Number(i.current_stock),
      min_stock: Number(i.min_stock),
      unit_cost: Number(i.unit_cost),
      active: i.active,
    };
  }

  private toMovement(m: MovementResponse): InventoryMovement {
    return {
      id: m.id,
      inventory_item_id: m.inventory_item_id,
      type: m.type,
      quantity: Number(m.quantity),
      reason: m.reason,
      reference_type: m.reference_type,
      reference_id: m.reference_id,
      moved_at: m.moved_at,
    };
  }

  private toPurchase(p: PurchaseResponse): Purchase {
    return {
      id: p.id,
      supplier_id: p.supplier_id,
      invoice_number: p.invoice_number,
      status: p.status ?? 'received',
      total: Number(p.total),
      purchased_at: p.purchased_at,
      items: (p.items ?? []).map(it => ({
        id: it.id,
        inventory_item_id: it.inventory_item_id,
        quantity: Number(it.quantity),
        received_quantity: Number(it.received_quantity ?? 0),
        unit_cost: Number(it.unit_cost),
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
