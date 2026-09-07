import { Injectable, signal } from '@angular/core';

/** Breakpoint `lg` de Tailwind (mismo valor usado en
 *  `dashboard-layout.component.ts`) — a partir de aquí el sidebar deja de ser
 *  un slide-over que se superpone al contenido y pasa a ser un panel fijo de
 *  escritorio. spec 078 (US6, FR-031–FR-036; research.md D7; A-71 punto 1):
 *  el umbral subió de `md` (768) a `lg` (1024), así que a ancho de tablet
 *  (768–1023) el menú se colapsa igual que en móvil, en toda la app.
 *  `sidebar.component.ts` no cambia — su `translate` ya depende solo de
 *  `sidebarOpen()`. */
const DESKTOP_BREAKPOINT_PX = 1024;

@Injectable({ providedIn: 'root' })
export class LayoutService {
  /**
   * Spec 036 (FR-012): antes solo controlaba el slide-over móvil (siempre
   * arrancaba en `false`, y el sidebar de escritorio lo ignoraba —
   * `sidebar.component.ts` lo mostraba siempre vía `lg:relative
   * lg:translate-x-0` incondicional). Ahora también controla el colapso en
   * escritorio, así que el valor inicial depende del viewport para no
   * cambiar el comportamiento por defecto ya existente: visible desde
   * escritorio (≥ 1024px), oculto en tablet y móvil (spec 078, US6).
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
