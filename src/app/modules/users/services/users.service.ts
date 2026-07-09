import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiErrorBody } from '../../../core/auth/auth.models';
import {
  Page,
  RoleName,
  TenantUser,
  TenantUserCreatePayload,
  TenantUserForm,
  TenantUserRoleUpdatePayload,
  TenantUserStatusUpdatePayload,
} from '../interfaces/user-profile.interface';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/users`;

  readonly users = signal<TenantUser[]>([]);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  // Estado de paginación (reflejo del `Page<T>` del backend).
  readonly page = signal(1);
  readonly size = signal(20);
  readonly total = signal(0);
  readonly totalPages = signal(0);

  /** Total real de usuarios en el tenant (consumido por el dashboard admin). */
  readonly totalCount = computed(() => this.total());

  async loadUsers(page: number = this.page(), size: number = this.size()): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    const params = new HttpParams().set('page', page).set('size', size);

    try {
      const data = await firstValueFrom(
        this.http.get<Page<TenantUser>>(this.baseUrl, { params }),
      );
      this.users.set([...data.items].sort((a, b) => a.name.localeCompare(b.name)));
      this.page.set(data.page);
      this.size.set(data.size);
      this.total.set(data.total);
      this.totalPages.set(data.pages);
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.loading.set(false);
    }
  }

  async createUser(form: TenantUserForm): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    if (form.role === '') {
      this.error.set('Debes seleccionar un rol.');
      this.isSubmitting.set(false);
      return;
    }

    const phone = form.phone.trim();
    const payload: TenantUserCreatePayload = {
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      role: form.role,
      ...(phone ? { phone } : {}),
    };

    try {
      await firstValueFrom(this.http.post<TenantUser>(this.baseUrl, payload));
      await this.loadUsers(1);
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async changeRole(userId: string, role: RoleName): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const payload: TenantUserRoleUpdatePayload = { role };

    try {
      await firstValueFrom(
        this.http.patch<TenantUser>(`${this.baseUrl}/${userId}/role`, payload),
      );
      await this.loadUsers();
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async toggleActive(userId: string, active: boolean): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const payload: TenantUserStatusUpdatePayload = { active };

    try {
      await firstValueFrom(
        this.http.patch<TenantUser>(`${this.baseUrl}/${userId}/status`, payload),
      );
      await this.loadUsers();
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /** Consulta puntual de un usuario por id (`GET /users/{user_id}`). No usado por la UI base. */
  async getUser(userId: string): Promise<TenantUser | null> {
    try {
      return await firstValueFrom(this.http.get<TenantUser>(`${this.baseUrl}/${userId}`));
    } catch (err) {
      this.error.set(this.extractError(err));
      return null;
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
