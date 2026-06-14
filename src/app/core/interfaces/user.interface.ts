export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'admin',
  CASHIER = 'cashier',
  STAFF = 'staff',
}

export interface User {
  id: string;
  /** Optional: the backend does not return a name; falls back to the email. */
  name?: string;
  email: string;
  role: UserRole;
  /** `null` for super admins, who are not scoped to a tenant. */
  tenantId: number | null;
  isSuperAdmin: boolean;
  /** When `true`, the user must change a temporary password before using the app. */
  mustChangePassword: boolean;
}

const ROLE_VALUES = new Set<string>(Object.values(UserRole));

/**
 * Normalize a backend role (UPPERCASE, e.g. `ADMIN`) to the `UserRole` enum.
 * Returns `null` for unknown roles so callers can treat it as an invalid session.
 */
export function mapBackendRole(role: string): UserRole | null {
  const normalized = role?.toLowerCase();
  return ROLE_VALUES.has(normalized) ? (normalized as UserRole) : null;
}

/** Display name fallback when the backend does not provide one: the email local part. */
export function displayNameFromEmail(email: string): string {
  return email.split('@')[0] || email;
}
