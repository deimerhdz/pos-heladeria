import { conditionText, setDescriptor } from './promotion-condition.util';

/**
 * spec 066 — **la misma tabla de casos** que ejercita
 * `app/scripts/test_promotions_rules.py` §6 en el backend
 * (`contracts/texto-condicion.md` §5, los 10 casos).
 *
 * Es la garantía de SC-005 entre los dos lenguajes: si un caso da distinto aquí
 * que en Python, la vista previa del formulario se separó del texto que ven el
 * comensal, el cajero y el listado de administración.
 */
describe('conditionText — tabla normativa de contracts/texto-condicion.md §5', () => {
  it('1. paquete, 8 variantes con el mismo nombre -> un solo nombre, sin "entre"', () => {
    expect(
      conditionText(
        { type: 'package_price', value: 12000, min_qty: 2 },
        Array<string>(8).fill('Pequeño 8oz'),
        8,
      ),
    ).toBe('Llevando 2 Pequeño 8oz pagas $12.000');
  });

  it('2. paquete, conjunto de UNA variante -> nunca "de estas 1 variantes"', () => {
    expect(
      conditionText({ type: 'package_price', value: 12000, min_qty: 2 }, ['Pequeño 8oz'], 1),
    ).toBe('Llevando 2 Pequeño 8oz pagas $12.000');
  });

  it('3. paquete, 3 nombres -> orden alfabético (Grande primero), con "entre"', () => {
    expect(
      conditionText(
        { type: 'package_price', value: 15000, min_qty: 2 },
        ['Pequeño 8oz', 'Mediano 12oz', 'Grande 16oz'],
        3,
      ),
    ).toBe('Llevando 2 entre Grande 16oz, Mediano 12oz y Pequeño 8oz pagas $15.000');
  });

  it('4. paquete, 5 nombres -> tres primeros y "y 2 más"', () => {
    expect(
      conditionText(
        { type: 'package_price', value: 15000, min_qty: 2 },
        ['Durazno', 'Ácai', 'Cereza', 'Almendra', 'Banano'],
        5,
      ),
    ).toBe('Llevando 2 entre Ácai, Almendra, Banano y 2 más pagas $15.000');
  });

  it('5. percent con cantidad mínima 1 -> sin "entre" aunque el conjunto sea grande', () => {
    expect(
      conditionText({ type: 'percent', value: 10, min_qty: 1 }, Array<string>(8).fill('Pequeño 8oz'), 8),
    ).toBe('10% en Pequeño 8oz');
  });

  it('6. percent con cantidad mínima > 1 y 2 nombres -> "entre A y B"', () => {
    expect(
      conditionText({ type: 'percent', value: 15, min_qty: 3 }, ['Mediano 12oz', 'Grande 16oz'], 2),
    ).toBe('15% llevando 3 entre Grande 16oz y Mediano 12oz');
  });

  it('7. paquete con cantidad mínima 1 -> "Cada {nombre} a {valor}"', () => {
    expect(
      conditionText({ type: 'package_price', value: 6000, min_qty: 1 }, ['Pequeño 8oz'], 1),
    ).toBe('Cada Pequeño 8oz a $6.000');
  });

  it('8. ningún nombre utilizable -> respaldo por conteo intacto (FR-006)', () => {
    expect(conditionText({ type: 'percent', value: 10, min_qty: 1 }, [], 3)).toBe(
      '10% en estas 3 variantes',
    );
  });

  it('9. el respaldo por conteo también cubre las otras tres formas', () => {
    expect(conditionText({ type: 'package_price', value: 12000, min_qty: 2 }, [], 8)).toBe(
      'Llevando 2 de estas 8 variantes pagas $12.000',
    );
    expect(conditionText({ type: 'package_price', value: 5000, min_qty: 1 }, [], 3)).toBe(
      'Cada una de estas 3 variantes a $5.000',
    );
    expect(conditionText({ type: 'percent', value: 15, min_qty: 3 }, [], 4)).toBe(
      '15% llevando 3 de estas 4 variantes',
    );
  });

  it('10. porcentaje con decimal -> punto, no coma (FR-005)', () => {
    expect(conditionText({ type: 'percent', value: 12.5, min_qty: 1 }, ['Pequeño 8oz'], 1)).toBe(
      '12.5% en Pequeño 8oz',
    );
  });
});

describe('setDescriptor — deduplicación y orden (FR-002, FR-003)', () => {
  it('0 nombres -> null (respaldo por conteo)', () => {
    expect(setDescriptor([])).toBeNull();
  });

  it('solo vacíos y espacios -> null', () => {
    expect(setDescriptor(['', '   '])).toBeNull();
  });

  it('recorta y deduplica por el nombre mostrado', () => {
    expect(setDescriptor(['Pequeño 8oz', '  Pequeño 8oz  '])).toEqual({
      text: 'Pequeño 8oz',
      multiple: false,
    });
  });

  it('los vacíos no cuentan, el nombre bueno sobrevive', () => {
    expect(setDescriptor(['  ', 'Pequeño 8oz', ''])).toEqual({
      text: 'Pequeño 8oz',
      multiple: false,
    });
  });

  it('la tilde no altera el orden: Ácai antes que Almendra', () => {
    expect(setDescriptor(['Almendra', 'Ácai'])).toEqual({
      text: 'Ácai y Almendra',
      multiple: true,
    });
  });

  it('mayúsculas y minúsculas se ordenan juntas', () => {
    expect(setDescriptor(['banano', 'Ácai'])).toEqual({
      text: 'Ácai y banano',
      multiple: true,
    });
  });
});
