import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiErrorBody } from '../../../core/auth/auth.models';
import {
  GroupBill,
  Table,
  TableCreatePayload,
  TableForm,
  TableQrToken,
  TableStatus,
  TableUpdatePayload,
} from '../interfaces/table.interface';

@Injectable({ providedIn: 'root' })
export class TableService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/orders/tables`;
  private readonly ordersUrl = `${environment.apiBaseUrl}/orders`;

  readonly tables = signal<Table[]>([]);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  async loadTables(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const data = await firstValueFrom(this.http.get<Table[]>(this.baseUrl));
      this.tables.set([...data].sort((a, b) => a.number - b.number));
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.loading.set(false);
    }
  }

  async createTable(data: TableForm): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    // The backend generates the `qr_token`; the client only sends number + name.
    const payload: TableCreatePayload = {
      number: data.number,
      name: data.name?.trim() || null,
    };

    try {
      await firstValueFrom(this.http.post<Table>(this.baseUrl, payload));
      await this.loadTables();
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async updateTable(id: string, data: TableForm): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const payload: TableUpdatePayload = { name: data.name?.trim() || null };

    try {
      await firstValueFrom(this.http.patch<Table>(`${this.baseUrl}/${id}`, payload));
      await this.loadTables();
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async toggleActive(id: string, current: boolean): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const payload: TableUpdatePayload = { active: !current };

    try {
      await firstValueFrom(this.http.patch<Table>(`${this.baseUrl}/${id}`, payload));
      await this.loadTables();
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /** Fetch the signed, printable QR token for a table. Throws `HttpErrorResponse`. */
  async getQrToken(id: string): Promise<TableQrToken> {
    return firstValueFrom(this.http.get<TableQrToken>(`${this.baseUrl}/${id}/qr-token`));
  }

  /** Cambiar el estado operativo de la mesa (RF-051). Refresca la lista. */
  async setStatus(id: string, status: TableStatus): Promise<boolean> {
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.patch<Table>(`${this.baseUrl}/${id}/status`, { status }));
      await this.loadTables();
      return true;
    } catch (err) {
      this.error.set(this.extractError(err));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /** Mover una orden abierta a otra mesa (RF-052). Throws `HttpErrorResponse`. */
  async moveOrder(orderId: string, targetTableId: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.ordersUrl}/${orderId}/move`, { dining_table_id: targetTableId }),
    );
  }

  /** Unir órdenes en una sola cuenta (RF-053). Devuelve el grupo. */
  async mergeOrders(orderIds: string[]): Promise<{ merged_group_id: string; order_ids: string[] }> {
    return firstValueFrom(
      this.http.post<{ merged_group_id: string; order_ids: string[] }>(
        `${this.ordersUrl}/merge`,
        { order_ids: orderIds },
      ),
    );
  }

  /** Cuenta consolidada de un grupo de mesas (RF-053). */
  async groupBill(groupId: string): Promise<GroupBill> {
    return firstValueFrom(this.http.get<GroupBill>(`${this.ordersUrl}/group/${groupId}/bill`));
  }

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as ApiErrorBody | null;
      return body?.detail ?? body?.message ?? 'No se pudo completar la operación.';
    }
    return 'No se pudo completar la operación.';
  }
}
