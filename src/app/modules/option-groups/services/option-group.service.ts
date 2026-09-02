import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiErrorBody } from '../../../core/auth/auth.models';
import {
  Option,
  OptionCreatePayload,
  OptionForm,
  OptionGroup,
  OptionGroupCreatePayload,
  OptionGroupForm,
  OptionGroupUpdatePayload,
  OptionUpdatePayload,
} from '../../products/interfaces/product.interface';

/** Raw backend option (decimals arrive as strings). */
interface OptionResponse {
  id: string;
  option_group_id: string;
  name: string;
  extra_price: string;
  inventory_item_id: string | null;
  item_quantity: string;
  active: boolean;
}

interface OptionGroupResponse {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  active: boolean;
  pricing_type: OptionGroup['pricing_type'];
  selection_mode: OptionGroup['selection_mode'];
  max_quantity_per_option: number | null;
  max_total_quantity: number | null;
  options?: OptionResponse[];
}

/** Catalog of option groups and their options (`/option-groups`). */
@Injectable({ providedIn: 'root' })
export class OptionGroupService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/option-groups`;
  /** Las opciones cuelgan de la raíz (`/options/{id}`), no del grupo. */
  private readonly optionsUrl = `${environment.apiBaseUrl}/options`;

  readonly groups = signal<OptionGroup[]>([]);
  readonly isLoading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  async loadGroups(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const data = await firstValueFrom(this.http.get<OptionGroupResponse[]>(this.baseUrl));
      const groups = data
        .map((g) => this.toGroup(g))
        .sort((a, b) => a.name.localeCompare(b.name));
      this.groups.set(groups);
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isLoading.set(false);
    }
  }

  async createGroup(form: OptionGroupForm): Promise<boolean> {
    if (form.pricing_type === null) {
      throw new Error('pricing_type es obligatorio para crear un grupo de opciones (FR-001).');
    }
    const payload: OptionGroupCreatePayload = {
      name: form.name,
      min_select: form.min_select,
      max_select: form.max_select,
      pricing_type: form.pricing_type,
      selection_mode: form.selection_mode,
      max_quantity_per_option: form.max_quantity_per_option,
      max_total_quantity: form.max_total_quantity,
    };
    return this.submit(() => this.http.post<OptionGroupResponse>(this.baseUrl, payload));
  }

  async updateGroup(id: string, form: OptionGroupForm): Promise<boolean> {
    const payload: OptionGroupUpdatePayload = {
      name: form.name,
      min_select: form.min_select,
      max_select: form.max_select,
      pricing_type: form.pricing_type ?? undefined,
      selection_mode: form.selection_mode,
      max_quantity_per_option: form.max_quantity_per_option,
      max_total_quantity: form.max_total_quantity,
    };
    return this.submit(() => this.http.patch<OptionGroupResponse>(`${this.baseUrl}/${id}`, payload));
  }

  /** Desactiva/reactiva un grupo (soft-delete: nunca se borra físicamente). */
  async toggleGroupActive(id: string, current: boolean): Promise<boolean> {
    const payload: OptionGroupUpdatePayload = { active: !current };
    return this.submit(() => this.http.patch<OptionGroupResponse>(`${this.baseUrl}/${id}`, payload));
  }

  async addOption(groupId: string, form: OptionForm): Promise<boolean> {
    const payload: OptionCreatePayload = {
      name: form.name,
      extra_price: form.extra_price,
      inventory_item_id: form.inventory_item_id,
      item_quantity: form.item_quantity,
    };
    return this.submit(() =>
      this.http.post<OptionResponse>(`${this.baseUrl}/${groupId}/options`, payload),
    );
  }

  async updateOption(id: string, form: OptionForm): Promise<boolean> {
    const payload: OptionUpdatePayload = {
      name: form.name,
      extra_price: form.extra_price,
      inventory_item_id: form.inventory_item_id,
      item_quantity: form.inventory_item_id ? form.item_quantity : 0,
    };
    return this.submit(() =>
      this.http.patch<OptionResponse>(`${this.optionsUrl}/${id}`, payload),
    );
  }

  /** Desactiva/reactiva una opción. Las ventas anteriores la siguen referenciando. */
  async toggleOptionActive(id: string, current: boolean): Promise<boolean> {
    const payload: OptionUpdatePayload = { active: !current };
    return this.submit(() =>
      this.http.patch<OptionResponse>(`${this.optionsUrl}/${id}`, payload),
    );
  }

  /**
   * Runs a write request, then refreshes the list. Returns `true` on success so
   * callers can close their modal only when the operation succeeded.
   */
  private async submit(request: () => Observable<unknown>): Promise<boolean> {
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(request());
      await this.loadGroups();
      return true;
    } catch (err) {
      this.error.set(this.extractError(err));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private toOption(o: OptionResponse): Option {
    return {
      id: o.id,
      option_group_id: o.option_group_id,
      name: o.name,
      extra_price: Number(o.extra_price),
      inventory_item_id: o.inventory_item_id,
      item_quantity: Number(o.item_quantity),
      active: o.active,
    };
  }

  private toGroup(g: OptionGroupResponse): OptionGroup {
    return {
      id: g.id,
      name: g.name,
      min_select: g.min_select,
      max_select: g.max_select,
      active: g.active,
      pricing_type: g.pricing_type,
      selection_mode: g.selection_mode,
      max_quantity_per_option: g.max_quantity_per_option,
      max_total_quantity: g.max_total_quantity,
      options: (g.options ?? []).map((o) => this.toOption(o)),
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
