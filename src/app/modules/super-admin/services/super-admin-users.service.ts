import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiErrorBody } from '../../../core/auth/auth.models';
import {
  AdminUser,
  AdminUserCreatePayload,
  AdminUserForm,
  AdminUserUpdatePayload,
} from '../interfaces/admin-user.interface';
import { Page } from '../interfaces/page.interface';

@Injectable({ providedIn: 'root' })
export class SuperAdminUsersService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/super-admin/users`;

  readonly users = signal<AdminUser[]>([]);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  async loadUsers(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const data = await firstValueFrom(this.http.get<Page<AdminUser>>(this.baseUrl));
      this.users.set([...data.items].sort((a, b) => a.email.localeCompare(b.email)));
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.loading.set(false);
    }
  }

  async createUser(data: AdminUserForm): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    if (data.tenant_id === null) {
      this.error.set('Debes seleccionar un tenant.');
      this.isSubmitting.set(false);
      return;
    }

    const payload: AdminUserCreatePayload = {
      email: data.email,
      password: data.password,
      name: data.name,
      role: data.role,
      tenant_id: data.tenant_id,
    };

    try {
      await firstValueFrom(this.http.post<AdminUser>(this.baseUrl, payload));
      await this.loadUsers();
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async updateUser(id: string, data: AdminUserForm): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const payload: AdminUserUpdatePayload = {
      name: data.name,
      role: data.role,
      tenant_id: data.tenant_id ?? undefined,
    };

    try {
      await firstValueFrom(this.http.patch<AdminUser>(`${this.baseUrl}/${id}`, payload));
      await this.loadUsers();
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async toggleActive(id: string, current: boolean): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const payload: AdminUserUpdatePayload = { is_active: !current };

    try {
      await firstValueFrom(this.http.patch<AdminUser>(`${this.baseUrl}/${id}`, payload));
      await this.loadUsers();
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as ApiErrorBody | null;
      return body?.detail ?? body?.message ?? 'No se pudo completar la operación.';
    }
    return 'No se pudo completar la operación.';
  }
}
