import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { map, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.authReady$.pipe(
    take(1),
    map(() => {
      if (authService.currentUser()) return true;
      return router.createUrlTree(['/login']);
    }),
  );
};

export const redirectIfAuthGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const ROLE_HOME: Record<string, string> = {
    admin: '/dashboard/admin',
    cashier: '/dashboard/caja',
    staff: '/dashboard/cocina',
  };

  return authService.authReady$.pipe(
    take(1),
    map(() => {
      const user = authService.currentUser();
      if (!user) return true;
      return router.createUrlTree([ROLE_HOME[user.role] ?? '/dashboard']);
    }),
  );
};
