import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';

import { routes } from './app.routes';
import { provideTenantInitializer } from './core/tenant/tenant.initializer';
import { authTokenInterceptor } from './core/auth/auth-token.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideTenantInitializer(),
    provideHttpClient(withInterceptors([authTokenInterceptor])),
    provideRouter(routes, withComponentInputBinding()),
    // Registra los controladores de Chart.js una sola vez para toda la app; las
    // gráficas de `shared/charts` asumen que ya está hecho.
    provideCharts(withDefaultRegisterables()),
    provideTanStackQuery(
      new QueryClient({
        defaultOptions: {
          queries: {
            // Sesión de trabajo típica reutiliza caché sin quedar desactualizada
            // entre cajeros/admins concurrentes editando el mismo catálogo.
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            // Cada servicio paginado es un singleton de sesión completa (un solo
            // observer activo, nunca se destruye): sin esto, cualquier alt-tab
            // re-consulta TODO recurso ya tocado, no solo la vista abierta.
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
    ),
  ],
};
