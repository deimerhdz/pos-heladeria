import { UserRole } from '../../../core/interfaces/user.interface';

/** Mirrors the backend user resource as seen by the super admin (`GET /admin/users`). */
export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  tenant_id: number | null;
  is_active: boolean;
  created_at: string;
}

/** Editable fields captured by the admin-user form. `password` only on creation. */
export interface AdminUserForm {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  tenant_id: number | null;
}

/** Request body for `POST /admin/users`. */
export interface AdminUserCreatePayload {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  tenant_id: number;
}

/** Request body for `PATCH /admin/users/{id}`. */
export interface AdminUserUpdatePayload {
  name?: string;
  role?: UserRole;
  tenant_id?: number;
  is_active?: boolean;
}
