/**
 * Texto listo para comparar en un buscador: sin mayúsculas, sin acentos y sin espacios
 * en los extremos.
 *
 * Escribir "limon" tiene que encontrar "Limón", y "cafe" a "Café": en una carta de
 * heladería medio catálogo lleva tilde y nadie la teclea en el buscador del móvil.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}
