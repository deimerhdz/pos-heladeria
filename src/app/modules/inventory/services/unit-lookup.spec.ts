import { UnitMeasure } from '../../../core/interfaces/unit-measure.interface';
import { InventoryItem } from '../interfaces/inventory.interface';
import { buildUnitLookup, formatQuantity } from './unit-lookup';

function item(patch: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'i1',
    name: 'Helado chocolate',
    unit_measure_id: 'u1',
    type: 'raw_material',
    current_stock: 10,
    min_stock: 0,
    unit_cost: 1,
    active: true,
    ...patch,
  } as InventoryItem;
}

function unit(patch: Partial<UnitMeasure> = {}): UnitMeasure {
  return {
    id: 'u1',
    name: 'Gramo',
    abbreviation: 'g',
    active: true,
    created_at: '2026-01-01T00:00:00',
    ...patch,
  } as UnitMeasure;
}

describe('buildUnitLookup', () => {
  it('resuelve nombre y unidad de un insumo', () => {
    const lookup = buildUnitLookup([item()], [unit()]);

    expect(lookup.nameOf('i1')).toBe('Helado chocolate');
    expect(lookup.abbrOf('i1')).toBe('g');
  });

  it('compone la descripción con cantidad, unidad y nombre', () => {
    const lookup = buildUnitLookup([item()], [unit()]);

    expect(lookup.describe('i1', 80)).toBe('80 g de Helado chocolate');
  });

  it('devuelve vacío para un insumo desconocido, nulo o indefinido', () => {
    // Una opción sin insumo trae `inventory_item_id: null`; el llamador distingue el
    // caso por la cadena vacía en vez de tener que comprobar el id antes.
    const lookup = buildUnitLookup([item()], [unit()]);

    expect(lookup.nameOf('otro')).toBe('');
    expect(lookup.nameOf(null)).toBe('');
    expect(lookup.abbrOf(undefined)).toBe('');
    expect(lookup.describe(null, 80)).toBe('');
  });

  it('omite la unidad cuando el insumo apunta a una medida que no está cargada', () => {
    // Las unidades y los insumos se cargan por separado: si una falta, el nombre del
    // insumo sigue siendo útil y es mejor que no mostrar nada.
    const lookup = buildUnitLookup([item({ unit_measure_id: 'ausente' })], [unit()]);

    expect(lookup.abbrOf('i1')).toBe('');
    expect(lookup.describe('i1', 80)).toBe('80 de Helado chocolate');
  });

  it('distingue insumos con unidades distintas', () => {
    const lookup = buildUnitLookup(
      [item(), item({ id: 'i2', name: 'Jarabe', unit_measure_id: 'u2' })],
      [unit(), unit({ id: 'u2', name: 'Mililitro', abbreviation: 'ml' })],
    );

    expect(lookup.describe('i1', 80)).toBe('80 g de Helado chocolate');
    expect(lookup.describe('i2', 30)).toBe('30 ml de Jarabe');
  });
});

describe('formatQuantity', () => {
  it('recorta los ceros que arrastran los decimales del backend', () => {
    // El backend devuelve Numeric(12,3), así que "80.000" es lo normal y "80" lo legible.
    expect(formatQuantity(80)).toBe('80');
    expect(formatQuantity(0.5)).toBe('0.5');
    expect(formatQuantity(1.25)).toBe('1.25');
  });

  it('no rompe con valores no finitos', () => {
    expect(formatQuantity(NaN)).toBe('0');
  });
});
