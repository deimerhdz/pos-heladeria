import { injectQuery } from '@tanstack/angular-query-experimental';
import type { Page } from '../interfaces/page.interface';

/**
 * Wrapper delgado sobre `injectQuery` para un endpoint paginado `Page<T>`.
 * `queryKey`/`queryFn`/`enabled` se reevalúan reactivamente cada vez que las
 * signals que leen adentro cambian, así que volver a una combinación de
 * página/filtros ya vista sirve desde caché en vez de repetir la petición.
 * `placeholderData` mantiene las filas de la página anterior visibles
 * mientras carga la nueva, en vez de parpadear a una tabla vacía.
 */
export function injectPagedQuery<T>(config: {
  queryKey: () => readonly unknown[];
  queryFn: () => Promise<Page<T>>;
  enabled: () => boolean;
}) {
  return injectQuery(() => ({
    queryKey: config.queryKey(),
    queryFn: config.queryFn,
    enabled: config.enabled(),
    placeholderData: (prev: Page<T> | undefined) => prev,
  }));
}
