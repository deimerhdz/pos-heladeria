/** Mirrors the backend tenant resource (`TenantResponse`). */
export interface Tenant {
  id: number;
  name: string;
  schema: string;
  plan: string;
  host: string;
  created_at: string;
  updated_at?: string | null;
}

/**
 * Request body for `POST /api/v1/admin/tenants` (`TenantCreateWithUser`).
 * Creates the tenant together with its first administrator user.
 */
export interface TenantCreateWithUser {
  tenant_name: string;
  schema_name: string;
  host: string;
  /** Administrator user fields. */
  name: string;
  email: string;
  password: string;
}
