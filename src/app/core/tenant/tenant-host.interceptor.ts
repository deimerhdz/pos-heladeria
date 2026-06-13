import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { TenantContextService } from './tenant-context.service';

/**
 * Adds the tenant header to HttpClient requests aimed at our own backend.
 * The Supabase client has its own custom-fetch propagation (see
 * `supabase.service.ts`); this interceptor covers present/future HttpClient use.
 */
export const tenantHostInterceptor: HttpInterceptorFn = (req, next) => {
  const tenant = inject(TenantContextService);
  const slug = tenant.tenantSlug();

  const targetsOwnApi = req.url.startsWith(environment.supabaseUrl);
  if (slug === null || !targetsOwnApi) {
    return next(req);
  }

  return next(
    req.clone({ setHeaders: { [environment.tenantHeaderName]: slug } })
  );
};
