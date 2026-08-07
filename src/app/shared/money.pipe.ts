import { Pipe, PipeTransform } from '@angular/core';
import { formatMoney } from './money';

/**
 * `{{ precio | money }}` → `$ 17.000`.
 *
 * Envuelve `formatMoney` para las plantillas. El `$` lo pone el propio formato:
 * no hace falta escribirlo antes de la interpolación.
 */
@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform {
  transform(value: number | string | null | undefined): string {
    return formatMoney(Number(value ?? 0));
  }
}
