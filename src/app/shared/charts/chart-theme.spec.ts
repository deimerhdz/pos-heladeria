import { CHART_COLORS, baseOptions, formatValue, seriesColor } from './chart-theme';

describe('paleta de gráficas', () => {
  it('asigna el color por posición, en orden fijo', () => {
    expect(seriesColor(0)).toBe(CHART_COLORS[0]);
    expect(seriesColor(4)).toBe(CHART_COLORS[4]);
  });

  it('no cicla: a partir del orden fijo devuelve el gris de «Otros»', () => {
    // La guía prohíbe inventar un tono para la serie N+1 — se agrupa en "Otros".
    expect(seriesColor(5)).toBe('#94a3b8');
    expect(seriesColor(12)).toBe('#94a3b8');
    expect(seriesColor(5)).toBe(seriesColor(9));
  });

  it('arranca en el indigo-600 que ya es el acento de la app', () => {
    expect(CHART_COLORS[0]).toBe('#4f46e5');
  });

  it('mantiene los cinco colores validados', () => {
    // Canario: si alguien toca un color hay que volver a pasar
    // `validate_palette.js` — el par emerald↔rose de un intento anterior fallaba
    // la separación para daltonismo con ΔE 5.8.
    expect([...CHART_COLORS]).toEqual([
      '#4f46e5',
      '#0d9488',
      '#d97706',
      '#be123c',
      '#7c3aed',
    ]);
  });

  it('los cinco son distintos entre sí', () => {
    expect(new Set(CHART_COLORS).size).toBe(CHART_COLORS.length);
  });
});

describe('formatValue', () => {
  it('formatea dinero con el formato único de la app', () => {
    expect(formatValue(17000, 'money')).toBe('$ 17.000');
  });

  it('redondea las unidades: media unidad vendida no existe', () => {
    expect(formatValue(84, 'units')).toBe('84 u');
    expect(formatValue(83.6, 'units')).toBe('84 u');
  });
});

describe('baseOptions', () => {
  it('no dibuja leyenda: las gráficas de una serie las nombra su tarjeta', () => {
    expect(baseOptions('money').plugins?.legend?.display).toBe(false);
  });

  it('siempre lleva tooltip, que es donde se lee la cifra exacta', () => {
    const tooltip = baseOptions('money').plugins?.tooltip;
    expect(tooltip).toBeDefined();
    expect(tooltip?.enabled).not.toBe(false);
  });

  it('deja la rejilla vertical fuera para que no compita con las barras', () => {
    expect(baseOptions('units').scales?.['x']?.grid?.display).toBe(false);
  });
});
