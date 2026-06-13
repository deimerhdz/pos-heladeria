import { AppEnvironment } from '../app/core/tenant/app-environment.interface';

export const environment: AppEnvironment = {
  production: false,
  supabaseUrl: 'https://kirenwgublwdbpbfhqwr.supabase.co',
  supabaseAnonKey: 'sb_publishable_GrNt8CK6LZLqrOt0l85gNA_QCHSgmw8',
  rootDomain: 'localhost',
  devRootHosts: ['localhost', '127.0.0.1'],
  reservedSlugs: ['www', 'app'],
  tenantHeaderName: 'X-Tenant-Host',
  apiBaseUrl: 'http://localhost:8000/api/v1',
};
