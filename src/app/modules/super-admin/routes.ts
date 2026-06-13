import { Routes } from '@angular/router';
import { DashboardLayoutComponent } from '../dashboard/layout/dashboard-layout.component';

export const superAdminRoutes: Routes = [
  {
    path: '',
    component: DashboardLayoutComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'tenants',
      },
      {
        path: 'tenants',
        loadComponent: () =>
          import('./pages/tenants-page.component').then((m) => m.TenantsPageComponent),
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./pages/super-admin-users-page.component').then(
            (m) => m.SuperAdminUsersPageComponent,
          ),
      },
    ],
  },
];
