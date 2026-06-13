/** Discriminator for the resolved tenant context. */
export const TenantKind = {
  SuperAdmin: 'SUPER_ADMIN',
  Tenant: 'TENANT',
} as const;
export type TenantKind = (typeof TenantKind)[keyof typeof TenantKind];

/**
 * Resolved tenant context. Modeled as a discriminated union so a `TENANT`
 * always carries a `slug` and a `SUPER_ADMIN` never does — invalid states are
 * unrepresentable.
 */
export type TenantContext =
  | { readonly kind: typeof TenantKind.SuperAdmin; readonly hostname: string }
  | { readonly kind: typeof TenantKind.Tenant; readonly slug: string; readonly hostname: string };
