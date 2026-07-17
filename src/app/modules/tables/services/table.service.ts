import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiErrorBody } from '../../../core/auth/auth.models';
import {
  Table,
  TableCreatePayload,
  TableForm,
  TableQrToken,
  TableUpdatePayload,
} from '../interfaces/table.interface';

@Injectable({ providedIn: 'root' })
export class TableService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/orders/tables`;

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

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as ApiErrorBody | null;
      return body?.detail ?? body?.message ?? 'No se pudo completar la operación.';
    }
    return 'No se pudo completar la operación.';
  }
}
