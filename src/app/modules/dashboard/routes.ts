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
          import('./pages/admin-dashboard.component').then((m) => m.AdminDashboardComponent),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
      {
        path: 'caja',
        loadComponent: () =>
          import('../cash-register/pages/cash-register-page.component').then(
            (m) => m.CashRegisterPageComponent,
          ),
        canActivate: [roleGuard([UserRole.ADMIN, UserRole.CASHIER])],
      },
      // {
      //   path: 'cocina',
      //   loadComponent: () =>
      //     import('./pages/staff-dashboard.component').then(m => m.StaffDashboardComponent),
      //   canActivate: [roleGuard([UserRole.ADMIN, UserRole.STAFF])],
      // },
      {
        path: 'categories',
        loadComponent: () =>
          import('../categories/pages/categories-page.component').then(
            (m) => m.CategoriesPageComponent,
          ),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
      {
        path: 'products',
        loadComponent: () =>
          import('../products/pages/products-page.component').then((m) => m.ProductsPageComponent),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
      {
        path: 'unit-measures',
        loadComponent: () =>
          import('../unit-measures/pages/unit-measures-page.component').then(
            (m) => m.UnitMeasuresPageComponent,
          ),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
      {
        path: 'tables',
        loadComponent: () =>
          import('../tables/pages/tables-page.component').then((m) => m.TablesPageComponent),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
      {
        path: 'orders',
        loadComponent: () =>
          import('../orders/pages/orders-page.component').then((m) => m.OrdersPageComponent),
        canActivate: [roleGuard([UserRole.ADMIN, UserRole.CASHIER, UserRole.STAFF])],
      },
      {
        path: 'orders/:id',
        loadComponent: () =>
          import('../orders/pages/order-detail.component').then((m) => m.OrderDetailComponent),
        canActivate: [roleGuard([UserRole.ADMIN, UserRole.CASHIER, UserRole.STAFF])],
      },
      {
        path: 'insumos',
        loadComponent: () =>
          import('../ingredients/pages/ingredients-page.component').then(
            (m) => m.IngredientsPageComponent,
          ),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
      {
        path: 'inventario',
        redirectTo: 'insumos',
        pathMatch: 'full',
      },
      {
        path: 'users',
        loadComponent: () =>
          import('../users/pages/users-page.component').then((m) => m.UsersPageComponent),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('../reports/pages/reports-page.component').then((m) => m.ReportsPageComponent),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
    ],
  },
];
