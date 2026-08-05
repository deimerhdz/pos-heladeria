import { UnitMeasure } from '../../../core/interfaces/unit-measure.interface';
import { InventoryItem } from '../interfaces/inventory.interface';

/**
 * Resolves inventory-item ids to a name and a unit abbreviation.
 *
 * `InventoryItem` only carries `unit_measure_id`, so every screen that shows "80 g de Helado
 * chocolate" has to join two collections. Se hacía por separado en cada pantalla (receta,
 * kardex, opciones), con el mismo `Map` reconstruido a mano.
 *
 * Función pura, no servicio, siguiendo el precedente de `menu-lookup.ts`: quien llama decide
 * cuándo tiene los datos cargados. Un servicio con un `computed` interno devolvería un mapa
 * vacío en silencio mientras las unidades aún no han llegado.
 */
export interface UnitLookup {
  /** Abreviatura de la unidad del insumo ('g', 'ml'); `''` si no se conoce. */
  abbrOf(itemId: string | null | undefined): string;
  /** Nombre del insumo; `''` si no se conoce. */
  nameOf(itemId: string | null | undefined): string;
  /** '80 g de Helado chocolate'. Cadena vacía si el insumo no se conoce. */
  describe(itemId: string | null | undefined, quantity: number): string;
}

export function buildUnitLookup(items: InventoryItem[], units: UnitMeasure[]): UnitLookup {
  const abbrByUnit = new Map(units.map((u) => [u.id, u.abbreviation]));
  const abbr = new Map<string, string>();
  const names = new Map<string, string>();

  for (const item of items) {
    abbr.set(item.id, abbrByUnit.get(item.unit_measure_id) ?? '');
    names.set(item.id, item.name);
  }

  const abbrOf = (id: string | null | undefined) => (id ? (abbr.get(id) ?? '') : '');
  const nameOf = (id: string | null | undefined) => (id ? (names.get(id) ?? '') : '');

  return {
    abbrOf,
    nameOf,
    describe: (id, quantity) => {
      const name = nameOf(id);
      if (!name) return '';
      const unit = abbrOf(id);
      return `${formatQuantity(quantity)}${unit ? ` ${unit}` : ''} de ${name}`;
    },
  };
}

/** Recorta los ceros de la parte decimal: `80.000` → `80`, `0.500` → `0.5`. */
export function formatQuantity(quantity: number): string {
  if (!Number.isFinite(quantity)) return '0';
  return String(Number(quantity.toFixed(3)));
}
