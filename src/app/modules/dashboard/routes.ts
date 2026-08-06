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
          import('../cash-register/pages/cash-page.component').then((m) => m.CashPageComponent),
        canActivate: [roleGuard([UserRole.ADMIN, UserRole.CASHIER])],
      },
      // Mesas salió de Ajustes a Operaciones; va antes del bloque 'ajustes'
      // para que el redirect gane al match de la ruta padre.
      { path: 'ajustes/mesas', pathMatch: 'full', redirectTo: 'mesas' },
      // Promociones salió de Ajustes a Catálogo; mismo motivo que arriba.
      { path: 'ajustes/promociones', pathMatch: 'full', redirectTo: 'promotions' },
      {
        path: 'ajustes',
        loadComponent: () =>
          import('../settings/pages/settings-page.component').then((m) => m.SettingsPageComponent),
        canActivate: [roleGuard([UserRole.ADMIN])],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'informacion' },
          {
            path: 'informacion',
            loadComponent: () =>
              import('../settings/pages/tenant-info.component').then((m) => m.TenantInfoComponent),
          },
          {
            path: 'metodos-pago',
            loadComponent: () =>
              import('../sales/pages/payment-methods-page.component').then(
                (m) => m.PaymentMethodsPageComponent,
              ),
          },
          {
            path: 'unidades',
            loadComponent: () =>
              import('../unit-measures/pages/unit-measures-page.component').then(
                (m) => m.UnitMeasuresPageComponent,
              ),
          },
          {
            path: 'grupos-opciones',
            loadComponent: () =>
              import('../option-groups/pages/option-groups-page.component').then(
                (m) => m.OptionGroupsPageComponent,
              ),
          },
          {
            path: 'horarios',
            loadComponent: () =>
              import('../settings/pages/business-hours.component').then(
                (m) => m.BusinessHoursComponent,
              ),
          },
          {
            path: 'auditoria',
            loadComponent: () =>
              import('../settings/pages/audit-logs.component').then((m) => m.AuditLogsComponent),
          },
        ],
      },
      // Rutas reubicadas — se conservan como redirect (deep links/marcadores).
      { path: 'metodos-pago', pathMatch: 'full', redirectTo: 'ajustes/metodos-pago' },
      { path: 'unit-measures', pathMatch: 'full', redirectTo: 'ajustes/unidades' },
      { path: 'option-groups', pathMatch: 'full', redirectTo: 'ajustes/grupos-opciones' },
      { path: 'tables', pathMatch: 'full', redirectTo: 'mesas' },
      {
        path: 'ventas',
        loadComponent: () =>
          import('../sales/pages/sales-page.component').then((m) => m.SalesPageComponent),
        canActivate: [roleGuard([UserRole.ADMIN, UserRole.CASHIER])],
      },
      {
        path: 'cocina',
        loadComponent: () =>
          import('../tables/pages/kitchen-board.component').then((m) => m.KitchenBoardComponent),
        canActivate: [roleGuard([UserRole.ADMIN, UserRole.STAFF])],
      },
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
        // 'new' debe ir antes de ':id' para no ser capturado como id.
        path: 'products/new',
        loadComponent: () =>
          import('../products/pages/product-form.component').then((m) => m.ProductFormComponent),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
      {
        path: 'products/:id',
        loadComponent: () =>
          import('../products/pages/product-form.component').then((m) => m.ProductFormComponent),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
      {
        path: 'menu',
        loadComponent: () =>
          import('../menu/pages/menu-page.component').then((m) => m.MenuPageComponent),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
      {
        path: 'promotions',
        loadComponent: () =>
          import('../promotions/pages/promotions-page.component').then(
            (m) => m.PromotionsPageComponent,
          ),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
      {
        // Antes que `mesas` para que no la capture como parámetro.
        path: 'mesas/qr',
        loadComponent: () =>
          import('../tables/pages/table-qr-sheet.component').then((m) => m.TableQrSheetComponent),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
      {
        path: 'mesas',
        loadComponent: () =>
          import('../tables/pages/tables-page.component').then((m) => m.TablesPageComponent),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
      {
        path: 'mesas-sesiones',
        loadComponent: () =>
          import('../tables/pages/table-sessions.component').then((m) => m.TableSessionsComponent),
        canActivate: [roleGuard([UserRole.ADMIN, UserRole.CASHIER, UserRole.STAFF])],
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
        path: 'inventario',
        loadComponent: () =>
          import('../inventory/pages/inventory-page.component').then(
            (m) => m.InventoryPageComponent,
          ),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
      {
        path: 'insumos',
        redirectTo: 'inventario',
        pathMatch: 'full',
      },
      {
        path: 'proveedores',
        loadComponent: () =>
          import('../suppliers/pages/suppliers-page.component').then(
            (m) => m.SuppliersPageComponent,
          ),
        canActivate: [roleGuard([UserRole.ADMIN])],
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
