import { Routes } from '@angular/router';
import { authGuard, redirectIfAuthGuard } from './core/guards/auth.guard';
import {
  changePasswordPageGuard,
  passwordChangeGuard,
} from './core/guards/password-change.guard';
import { superAdminDomainGuard } from './core/tenant/guards/super-admin-domain.guard';
import { tenantDomainGuard } from './core/tenant/guards/tenant-domain.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'login',
  },
  {
    // Context-aware: works on both root and tenant subdomains.
    path: 'login',
    canActivate: [redirectIfAuthGuard],
    loadComponent: () =>
      import('./modules/auth/pages/login.component').then(m => m.LoginComponent),
  },
  {
    // Forces a password change before accessing the app (temporary password).
    path: 'change-password',
    canActivate: [authGuard, changePasswordPageGuard],
    loadComponent: () =>
      import('./modules/auth/pages/change-password.component').then(m => m.ChangePasswordComponent),
  },
  {
    // Super Admin area — root domain only.
    path: 'super-admin',
    canActivate: [authGuard, superAdminDomainGuard, passwordChangeGuard],
    loadChildren: () =>
      import('./modules/super-admin/routes').then(m => m.superAdminRoutes),
  },
  {
    // Tenant POS — subdomains only.
    path: 'dashboard',
    canActivate: [authGuard, tenantDomainGuard, passwordChangeGuard],
    loadChildren: () =>
      import('./modules/dashboard/routes').then(m => m.dashboardRoutes),
  },
  {
    // Entrada del comensal. `token` es el JWT **firmado** de la mesa: lleva el
    // tenant dentro, así que esta ruta funciona en cualquier dominio.
    path: 'menu/t/:token',
    loadComponent: () =>
      import('./modules/tables/pages/public-menu.component').then(m => m.PublicMenuComponent),
  },
  {
    // QR antiguos (UUID plano). El backend ya no acepta ese formato, pero hay
    // códigos impresos pegados en las mesas: mejor explicarlo que dar un 404 mudo.
    path: 'menu/qr/:token',
    loadComponent: () =>
      import('./modules/tables/pages/expired-qr.component').then(m => m.ExpiredQrComponent),
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];
