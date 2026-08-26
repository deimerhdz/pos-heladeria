import { Injectable, signal } from '@angular/core';

/** Breakpoint `md` de Tailwind (mismo valor usado en `sidebar.component.ts`
 *  y `dashboard-layout.component.ts`) — a partir de aquí el sidebar deja de
 *  ser un slide-over móvil y pasa a ser un panel colapsable de escritorio. */
const DESKTOP_BREAKPOINT_PX = 768;

@Injectable({ providedIn: 'root' })
export class LayoutService {
  /**
   * Spec 036 (FR-012): antes solo controlaba el slide-over móvil (siempre
   * arrancaba en `false`, y el sidebar de escritorio lo ignoraba —
   * `sidebar.component.ts` lo mostraba siempre vía `md:relative
   * md:translate-x-0` incondicional). Ahora también controla el colapso en
   * escritorio, así que el valor inicial depende del viewport para no
   * cambiar el comportamiento por defecto ya existente: visible en
   * escritorio, oculto en móvil.
   */
  readonly sidebarOpen = signal(
    typeof window !== 'undefined' ? window.innerWidth >= DESKTOP_BREAKPOINT_PX : true,
  );

  open(): void {
    this.sidebarOpen.set(true);
  }

  close(): void {
    this.sidebarOpen.set(false);
  }

  toggle(): void {
    this.sidebarOpen.update(v => !v);
  }
}
