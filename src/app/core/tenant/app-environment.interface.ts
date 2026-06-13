/**
 * Shape that both `environment.ts` (prod) and `environment.development.ts` must
 * satisfy. Centralizing the type prevents config drift between the two files.
 */
export interface AppEnvironment {
  readonly production: boolean;
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;

  /**
   * Logical root domain for tenant resolution.
   * - Production: `pos-sistem.com`
   * - Development: `localhost`
   * A hostname equal to this (or in `devRootHosts`) resolves to Super Admin;
   * a `<slug>.<rootDomain>` hostname resolves to a tenant.
   */
  readonly rootDomain: string;

  /** Hostnames that always count as the root/Super Admin context. */
  readonly devRootHosts: readonly string[];

  /** Subdomain labels that are NOT tenants (treated as root). */
  readonly reservedSlugs: readonly string[];

  /** HTTP header used to propagate the tenant slug to the backend. */
  readonly tenantHeaderName: string;

  /** Base URL of the own multi-tenant backend API (e.g. `http://localhost:8000/api/v1`). */
  readonly apiBaseUrl: string;
}
