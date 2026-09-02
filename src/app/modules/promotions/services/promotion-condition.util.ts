/**
 * spec 066 (FR-018) — réplica en TypeScript del texto de condición del backend.
 *
 * **Es la única reimplementación del algoritmo**, y existe por una razón concreta:
 * la vista previa del formulario de promociones describe variantes que **todavía no
 * están guardadas**, así que no puede pedirle el texto al backend como hacen el
 * cartel del menú, la terminal y el listado de administración.
 *
 * Contrato normativo: `contracts/texto-condicion.md` §2, §3 y §4. Cualquier cambio
 * aquí tiene que ir acompañado del mismo cambio en
 * `app/api/v1/promotions/service.py` — si un caso de la tabla de §5 da distinto en
 * los dos lenguajes, las superficies se separaron y SC-005 deja de cumplirse.
 */

export interface ConditionRule {
  type: 'percent' | 'package_price';
  value: number;
  min_qty: number;
}

/**
 * Clave de ordenación de FR-002: sin tildes y sin distinguir mayúsculas, para que
 * el orden no dependa del punto de código ni de la configuración regional del
 * navegador. Equivale a `unicodedata.normalize("NFD", …)` + descarte de marcas
 * combinantes + `casefold()` en Python.
 */
function sortKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

/** `$12.000` — mismo formato que `_money()` en el backend. */
function money(value: number): string {
  return '$' + Math.trunc(value).toLocaleString('es-CO').replace(/,/g, '.');
}

/**
 * `10.00` -> `10`, `12.50` -> `12.5`, **con punto decimal**.
 *
 * `String(value)` y no `toLocaleString('es-CO')`: el backend emite el porcentaje
 * con punto (FR-005) y cambiar el separador aquí separaría las dos superficies
 * (contracts/texto-condicion.md §6).
 */
function percent(value: number): string {
  return String(value);
}

/**
 * Descriptor del conjunto (FR-002, FR-003) y si nombra a más de uno — lo segundo
 * decide el `'entre '` de FR-004.
 *
 * Recorta, descarta vacíos, deduplica por el **nombre mostrado** y ordena por
 * `sortKey` con desempate por el nombre original. `null` cuando no queda ningún
 * nombre utilizable: ahí el texto vuelve al respaldo por conteo (FR-006).
 */
export function setDescriptor(names: string[]): { text: string; multiple: boolean } | null {
  const distintos = [...new Set(names.map((n) => (n ?? '').trim()).filter((n) => n !== ''))];
  if (distintos.length === 0) return null;

  const ordenados = distintos.sort((a, b) => {
    const ka = sortKey(a);
    const kb = sortKey(b);
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    // Desempate por el nombre original: mantiene determinista el caso de dos
    // nombres con la misma clave ('Pequeño' y 'pequeño').
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });

  const d = ordenados.length;
  if (d === 1) return { text: ordenados[0], multiple: false };
  if (d === 2) return { text: `${ordenados[0]} y ${ordenados[1]}`, multiple: true };
  if (d === 3) {
    return { text: `${ordenados[0]}, ${ordenados[1]} y ${ordenados[2]}`, multiple: true };
  }
  // `d - 3` cuenta **nombres distintos** restantes, no variantes.
  return {
    text: `${ordenados[0]}, ${ordenados[1]}, ${ordenados[2]} y ${d - 3} más`,
    multiple: true,
  };
}

/**
 * Los cuatro textos de FR-004, o el respaldo por conteo de FR-006 cuando ninguna
 * variante del conjunto aporta nombre.
 *
 * `variantCount` es el tamaño del conjunto y solo se usa en el respaldo.
 */
export function conditionText(
  rule: ConditionRule,
  names: string[],
  variantCount: number,
): string {
  const descriptor = setDescriptor(names);
  const d = descriptor ? descriptor.text : `estas ${variantCount} variantes`;
  const e = descriptor?.multiple ? 'entre ' : '';

  if (rule.type === 'package_price') {
    if (rule.min_qty > 1) {
      return descriptor === null
        ? `Llevando ${rule.min_qty} de ${d} pagas ${money(rule.value)}`
        : `Llevando ${rule.min_qty} ${e}${d} pagas ${money(rule.value)}`;
    }
    return descriptor === null
      ? `Cada una de ${d} a ${money(rule.value)}`
      : `Cada ${e}${d} a ${money(rule.value)}`;
  }

  const pct = percent(rule.value);
  if (rule.min_qty === 1) {
    // `percent` con cantidad mínima 1 es la única de las cuatro que no lleva `e`.
    return `${pct}% en ${d}`;
  }
  return descriptor === null
    ? `${pct}% llevando ${rule.min_qty} de ${d}`
    : `${pct}% llevando ${rule.min_qty} ${e}${d}`;
}
