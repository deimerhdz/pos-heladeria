import { AppEnvironment } from '../app/core/tenant/app-environment.interface';

export const environment: AppEnvironment = {
  production: true,
  rootDomain: 'skeilopos.com',
  devRootHosts: ['localhost', '127.0.0.1'],
  reservedSlugs: ['www', 'app'],
  tenantHeaderName: 'X-Tenant-Host',
  apiBaseUrl: 'https://api.skeilopos.com/api/v1',
};
