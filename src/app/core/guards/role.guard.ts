import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { MockUserService } from '../services/mock-user.service';
import { UserRole } from '../interfaces/user.interface';

const ROLE_DEFAULT_ROUTES: Record<UserRole, string> = {
  [UserRole.ADMIN]:   '/dashboard/admin',
  [UserRole.CASHIER]: '/dashboard/caja',
  [UserRole.STAFF]:   '/dashboard/cocina',
};

export const roleGuard = (allowedRoles: UserRole[]): CanActivateFn =>
  () => {
    const userService = inject(MockUserService);
    const router = inject(Router);
    const user = userService.currentUser();

    if (allowedRoles.includes(user.role)) {
      return true;
    }

    return router.createUrlTree([ROLE_DEFAULT_ROUTES[user.role]]);
  };
