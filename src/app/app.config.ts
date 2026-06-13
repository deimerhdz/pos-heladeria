import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { provideTenantInitializer } from './core/tenant/tenant.initializer';
import { tenantHostInterceptor } from './core/tenant/tenant-host.interceptor';
import { authTokenInterceptor } from './core/auth/auth-token.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideTenantInitializer(),
    provideHttpClient(withInterceptors([tenantHostInterceptor, authTokenInterceptor])),
    provideRouter(routes, withComponentInputBinding()),
  ],
};
