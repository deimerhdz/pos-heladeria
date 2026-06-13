import { resolveTenantContext, TenantResolverConfig } from './tenant-resolver';
import { TenantKind } from './tenant-context.model';

const config: TenantResolverConfig = {
  rootDomain: 'pos-sistem.com',
  devRootHosts: ['localhost', '127.0.0.1'],
  reservedSlugs: ['www', 'app'],
};

describe('resolveTenantContext', () => {
  interface Case {
    hostname: string;
    kind: TenantKind;
    slug?: string;
  }

  const cases: Case[] = [
    { hostname: 'pos-sistem.com', kind: TenantKind.SuperAdmin },
    { hostname: 'localhost', kind: TenantKind.SuperAdmin },
    { hostname: '127.0.0.1', kind: TenantKind.SuperAdmin },
    { hostname: 'conodoble.pos-sistem.com', kind: TenantKind.Tenant, slug: 'conodoble' },
    { hostname: 'heladeria.localhost', kind: TenantKind.Tenant, slug: 'heladeria' },
    { hostname: 'www.pos-sistem.com', kind: TenantKind.SuperAdmin },
    { hostname: 'unknown-host.example.org', kind: TenantKind.SuperAdmin },
  ];

  for (const c of cases) {
    it(`resolves "${c.hostname}" to ${c.kind}${c.slug ? ` (slug=${c.slug})` : ''}`, () => {
      const result = resolveTenantContext(c.hostname, config);
      expect(result.kind).toBe(c.kind);
      if (c.kind === TenantKind.Tenant) {
        expect(result.kind === TenantKind.Tenant && result.slug).toBe(c.slug);
      }
    });
  }

  it('is case-insensitive and trims the hostname', () => {
    const result = resolveTenantContext('  ConoDoble.POS-SISTEM.com  ', config);
    expect(result.kind).toBe(TenantKind.Tenant);
    expect(result.kind === TenantKind.Tenant && result.slug).toBe('conodoble');
  });

  it('treats reserved local subdomains as Super Admin', () => {
    const result = resolveTenantContext('www.localhost', config);
    expect(result.kind).toBe(TenantKind.SuperAdmin);
  });
});
