import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { PlanSummaryService } from '../../modules/plan/services/plan-summary.service';
import { ModuleAccess } from '../../modules/plan/interfaces/plan-summary.interface';

/** Bloquea una ruta cuando el plan vigente del tenant no incluye el módulo,
 * O cuando el tenant está vencido (spec 033, Historias de Usuario 4 y 5) —
 * `vencido` gana sin importar lo que digan los flags de módulo
 * individuales. Mismo patrón que `role.guard.ts`, pero la fuente de verdad
 * es `GET /plan`, no el usuario autenticado. */
export const planModuleGuard =
  (moduleKey: keyof ModuleAccess): CanActivateFn =>
  () => {
    const planSummaryService = inject(PlanSummaryService);
    const router = inject(Router);

    return planSummaryService.fetch().pipe(
      map((summary) => {
        if (summary.vencido) return router.createUrlTree(['/dashboard']);
        if (!summary.modules[moduleKey]) return router.createUrlTree(['/dashboard']);
        return true;
      }),
      // Si `GET /plan` falla (red, 401 ya manejado por el interceptor, etc.),
      // no dejamos la ruta bloqueada indefinidamente — se deja pasar y el
      // propio endpoint de destino, si corresponde, devolverá su 403 real.
      catchError(() => of(true)),
    );
  };
