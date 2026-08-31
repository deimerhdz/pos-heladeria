import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  readonly id: number;
  readonly kind: ToastKind;
  readonly text: string;
}

/**
 * Cola de notificaciones efímeras (toasts). Basada en `signal`; el
 * `ToastContainerComponent` la renderiza. Autodismiss configurable.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  readonly toasts = signal<Toast[]>([]);

  success(text: string, ms = 3000): void {
    this.push('success', text, ms);
  }

  error(text: string, ms = 5000): void {
    this.push('error', text, ms);
  }

  info(text: string, ms = 3000): void {
    this.push('info', text, ms);
  }

  dismiss(id: number): void {
    this.toasts.update(list => list.filter(t => t.id !== id));
  }

  private push(kind: ToastKind, text: string, ms: number): void {
    // Bugfix (spec 050): un error que se repite (p. ej. reintentar una
    // acción bloqueada) no debe apilar una copia idéntica por cada intento —
    // se deja que la ya visible siga su propio temporizador.
    if (this.toasts().some(t => t.kind === kind && t.text === text)) return;
    const id = ++this.seq;
    this.toasts.update(list => [...list, { id, kind, text }]);
    if (ms > 0) {
      setTimeout(() => this.dismiss(id), ms);
    }
  }
}
