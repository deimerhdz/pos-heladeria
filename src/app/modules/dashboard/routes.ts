import { Routes } from '@angular/router';
import { DashboardLayoutComponent } from './layout/dashboard-layout.component';
import { roleGuard } from '../../core/guards/role.guard';
import { UserRole } from '../../core/interfaces/user.interface';

export const dashboardRoutes: Routes = [
  {
    path: '',
    component: DashboardLayoutComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'admin',
      },
      {
        path: 'admin',
        loadComponent: () =>
          import('./pages/admin-dashboard.component').then(m => m.AdminDashboardComponent),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
      {
        path: 'caja',
        loadComponent: () =>
          import('./pages/cashier-dashboard.component').then(m => m.CashierDashboardComponent),
        canActivate: [roleGuard([UserRole.ADMIN, UserRole.CASHIER])],
      },
      {
        path: 'cocina',
        loadComponent: () =>
          import('./pages/staff-dashboard.component').then(m => m.StaffDashboardComponent),
        canActivate: [roleGuard([UserRole.ADMIN, UserRole.STAFF])],
      },
      {
        path: 'categories',
        loadComponent: () =>
          import('../categories/pages/categories-page.component').then(m => m.CategoriesPageComponent),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
    ],
  },
];
