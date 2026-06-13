import { AppEnvironment } from '../app/core/tenant/app-environment.interface';

export const environment: AppEnvironment = {
  production: true,
  supabaseUrl: 'https://kirenwgublwdbpbfhqwr.supabase.co',
  supabaseAnonKey: 'sb_publishable_GrNt8CK6LZLqrOt0l85gNA_QCHSgmw8',
  rootDomain: 'pos-sistem.com',
  devRootHosts: ['localhost', '127.0.0.1'],
  reservedSlugs: ['www', 'app'],
  tenantHeaderName: 'X-Tenant-Host',
  // TODO: confirmar la URL del backend en producción.
  apiBaseUrl: 'https://api.pos-sistem.com/api/v1',
};
