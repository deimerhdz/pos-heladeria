import { TenantContext, TenantKind } from './tenant-context.model';

/** Subset of `AppEnvironment` the pure resolver needs. */
export interface TenantResolverConfig {
  readonly rootDomain: string;
  readonly devRootHosts: readonly string[];
  readonly reservedSlugs: readonly string[];
}

/**
 * Pure function: maps a hostname to a {@link TenantContext}. No Angular, no
 * globals — trivially unit-testable.
 *
 * Algorithm (see design.md §4):
 *  1. Normalize (lowercase; `location.hostname` already excludes the port).
 *  2. Root/dev host or exact `rootDomain` → SUPER_ADMIN.
 *  3. `<slug>.<rootDomain>` → TENANT(slug).
 *  4. `<slug>.localhost` → TENANT(slug).
 *  5. Reserved slug → SUPER_ADMIN.
 *  6. No match → SUPER_ADMIN (safe default) + warning.
 */
export function resolveTenantContext(
  hostname: string,
  config: TenantResolverConfig
): TenantContext {
  const host = hostname.trim().toLowerCase();
  const rootDomain = config.rootDomain.toLowerCase();

  // 2. Root / dev hosts.
  if (host === rootDomain || config.devRootHosts.includes(host)) {
    return { kind: TenantKind.SuperAdmin, hostname: host };
  }

  // 3. Subdomain of the configured root domain.
  const rootSlug = extractLeadingLabel(host, `.${rootDomain}`);
  if (rootSlug !== null) {
    return finalizeSlug(rootSlug, host, config);
  }

  // 4. Local subdomain (`*.localhost`), independent of rootDomain config.
  const localSlug = extractLeadingLabel(host, '.localhost');
  if (localSlug !== null) {
    return finalizeSlug(localSlug, host, config);
  }

  // 6. Safe default.
  console.warn(
    `[tenant-resolver] Unrecognized hostname "${host}"; defaulting to SUPER_ADMIN.`
  );
  return { kind: TenantKind.SuperAdmin, hostname: host };
}

/**
 * If `host` ends with `suffix`, return the first label preceding it
 * (e.g. host `conodoble.pos-sistem.com`, suffix `.pos-sistem.com` → `conodoble`).
 * Returns `null` when the suffix does not match or no leading label exists.
 */
function extractLeadingLabel(host: string, suffix: string): string | null {
  if (!host.endsWith(suffix)) return null;
  const prefix = host.slice(0, -suffix.length);
  if (prefix.length === 0) return null;
  // Multi-level subdomains are out of scope: take the first label only.
  const firstLabel = prefix.split('.')[0];
  return firstLabel.length > 0 ? firstLabel : null;
}

/** Reserved slugs collapse back to the root/Super Admin context. */
function finalizeSlug(
  slug: string,
  host: string,
  config: TenantResolverConfig
): TenantContext {
  if (config.reservedSlugs.includes(slug)) {
    return { kind: TenantKind.SuperAdmin, hostname: host };
  }
  return { kind: TenantKind.Tenant, slug, hostname: host };
}
