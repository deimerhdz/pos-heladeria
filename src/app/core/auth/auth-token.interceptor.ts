import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TokenStorageService } from './token-storage.service';
import { AuthService } from '../services/auth.service';

const LOGIN_PATH = '/auth/login';
const REFRESH_PATH = '/auth/refresh-token';

/**
 * For requests to the own backend (`{apiBaseUrl}`):
 *  - adds `X-Tenant-Host` and `Authorization: Bearer <access_token>`
 *    (login is public; refresh sets its own bearer explicitly);
 *  - on a `401`, refreshes the access token once (shared) and retries;
 *    if the refresh fails, forces logout.
 */
export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBaseUrl)) {
    return next(req);
  }

  const tokenStorage = inject(TokenStorageService);
  const tenant = inject(TenantContextService);
  const auth = inject(AuthService);

  const isAuthEndpoint = req.url.includes(LOGIN_PATH) || req.url.includes(REFRESH_PATH);
  const authedReq = decorate(req, tokenStorage.getAccessToken(), tenant.tenantSlug(), isAuthEndpoint);

  return next(authedReq).pipe(
    catchError((err: unknown) => {
      const is401 = err instanceof HttpErrorResponse && err.status === 401;
      if (!is401 || isAuthEndpoint) {
        return throwError(() => err);
      }
      return from(auth.tryRefresh()).pipe(
        switchMap(ok => {
          if (!ok) {
            auth.forceLogout();
            return throwError(() => err);
          }
          const retried = decorate(req, tokenStorage.getAccessToken(), tenant.tenantSlug(), false);
          return next(retried);
        })
      );
    })
  );
};

function decorate(
  req: HttpRequest<unknown>,
  accessToken: string | null,
  tenantSlug: string | null,
  isAuthEndpoint: boolean
): HttpRequest<unknown> {
  const setHeaders: Record<string, string> = {};
  if (tenantSlug) {
    setHeaders[environment.tenantHeaderName] = tenantSlug;
  }
  if (accessToken && !isAuthEndpoint) {
    setHeaders['Authorization'] = `Bearer ${accessToken}`;
  }
  return Object.keys(setHeaders).length ? req.clone({ setHeaders }) : req;
}
