/** Rol asignable a un usuario del tenant por un admin (`RoleName` del backend). */
export type RoleName = 'ADMIN' | 'CASHIER';

/** Envoltura de paginación devuelta por el backend (`Page[UserResponse]`). */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

/** Usuario del tenant tal como lo devuelve la API (`UserResponse`). */
export interface TenantUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
  role_name: string | null;
  tenant_id: number | null;
  tenant_name: string | null;
  created_at: string;
  updated_at: string | null;
}

/** Campos capturados por el formulario de creación. */
export interface TenantUserForm {
  name: string;
  email: string;
  password: string;
  phone: string;
  role: RoleName | '';
}

/** Cuerpo para `POST /users` (`UserCreate`). */
export interface TenantUserCreatePayload {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: RoleName;
}

/** Cuerpo para `PATCH /users/{user_id}/role` (`UserRoleUpdate`). */
export interface TenantUserRoleUpdatePayload {
  role: RoleName;
}

/** Cuerpo para `PATCH /users/{user_id}/status` (`UserStatusUpdate`). */
export interface TenantUserStatusUpdatePayload {
  active: boolean;
}
