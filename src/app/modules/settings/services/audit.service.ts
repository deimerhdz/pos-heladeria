import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  user_id: string | null;
  user_name: string | null;
  payload: Record<string, unknown> | null;
  at: string;
}

interface AuditPage {
  items: AuditLog[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/audit-logs`;

  readonly logs = signal<AuditLog[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly entity = signal<string>('');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async load(page = 1): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const params: Record<string, string> = { page: String(page), size: '20' };
    if (this.entity()) params['entity'] = this.entity();
    try {
      const res = await firstValueFrom(this.http.get<AuditPage>(this.baseUrl, { params }));
      this.logs.set(res.items);
      this.total.set(res.total);
      this.page.set(res.page);
      this.pages.set(res.pages);
    } catch {
      this.error.set('No se pudo cargar la bitácora.');
    } finally {
      this.loading.set(false);
    }
  }

  async setEntity(entity: string): Promise<void> {
    this.entity.set(entity);
    await this.load(1);
  }
}
