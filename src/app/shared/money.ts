/**
 * Formato de moneda único del producto: `$ 17.000`.
 *
 * Sin decimales y con separador de miles es-CO. Se redondea porque el peso no
 * tiene fracción de uso: mostrar `$ 17.000,00` es ruido, y `$ 17,000.00` (lo que
 * da `DecimalPipe` sin `LOCALE_ID` registrado) es directamente otro país.
 *
 * Vive en `shared/` y no junto al ticket térmico para que el menú QR —una ruta
 * pública— pueda usarlo sin arrastrar el generador de facturas a su bundle.
 */
export function formatMoney(n: number): string {
  return '$ ' + Math.round(n || 0).toLocaleString('es-CO');
}
