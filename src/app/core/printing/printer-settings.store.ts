import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'pos.terminal.paper_width_mm';

/** Anchos de rollo térmico habituales. */
export const PAPER_WIDTHS = [48, 58, 80] as const;

export type PaperWidthMm = (typeof PAPER_WIDTHS)[number];

const DEFAULT_WIDTH: PaperWidthMm = 48;

/**
 * Ajustes de impresión **de este dispositivo**, no del negocio: la impresora
 * cuelga del equipo que tiene la caja, y dos cajas pueden tener rollos
 * distintos. Por eso vive en `localStorage` y no en el tenant.
 *
 * El ancho tiene que coincidir con el papel del driver: si el documento se
 * compone más ancho, el navegador lo encaja reduciéndolo y la letra sale gris y
 * deshilachada en el cabezal térmico.
 */
@Injectable({ providedIn: 'root' })
export class PrinterSettingsStore {
  readonly paperWidthMm = signal<PaperWidthMm>(this.read());

  setPaperWidth(mm: PaperWidthMm): void {
    this.paperWidthMm.set(mm);
    try {
      localStorage.setItem(STORAGE_KEY, String(mm));
    } catch {
      /* storage bloqueado: vale solo para esta sesión */
    }
  }

  private read(): PaperWidthMm {
    try {
      const stored = Number(localStorage.getItem(STORAGE_KEY));
      // Un valor corrupto no puede dejar la impresión inservible.
      return PAPER_WIDTHS.find((w) => w === stored) ?? DEFAULT_WIDTH;
    } catch {
      return DEFAULT_WIDTH;
    }
  }
}
