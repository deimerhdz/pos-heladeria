/**
 * "Hoy" en la zona horaria del negocio, no en la del calendario del navegador
 * (spec 030, FR-004). Usado por `reports.service.ts::getDateRange` para
 * `'today'`/`'week'`/`'month'`/`'year'` — `'specific-date'` no pasa por aquí,
 * ya usa el string que el usuario eligió (FR-006).
 */
export function businessToday(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}
