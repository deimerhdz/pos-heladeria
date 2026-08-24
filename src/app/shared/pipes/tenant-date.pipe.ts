import { formatDate } from '@angular/common';
import { LOCALE_ID, Pipe, PipeTransform, inject } from '@angular/core';
import { TenantInfoService } from '../../core/tenant/tenant-info.service';

/** Zona horaria de respaldo mientras `TenantInfoService.info()` aún no cargó. */
const DEFAULT_TIMEZONE = 'America/Bogota';

/**
 * `{{ venta.sold_at | tenantDate:'dd/MM/yyyy HH:mm' }}` → hora del negocio, no
 * la del navegador (spec 030, FR-002/A-50).
 *
 * Envuelve `formatDate` de `@angular/common` (la misma función que usa el
 * `DatePipe` nativo por dentro) pasándole la zona horaria del tenant —
 * mecanismo único, usable en plantilla (este pipe) e inyectable directo en
 * stores/servicios (`transform()` es un método normal).
 */
@Pipe({ name: 'tenantDate', standalone: true, pure: false })
export class TenantDatePipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);
  private readonly tenantInfo = inject(TenantInfoService);

  transform(value: string | number | Date | null | undefined, format = 'medium'): string | null {
    if (value === null || value === undefined || value === '') return null;
    const timezone = this.tenantInfo.info()?.timezone ?? DEFAULT_TIMEZONE;
    return formatDate(value, format, this.locale, timezone);
  }
}
