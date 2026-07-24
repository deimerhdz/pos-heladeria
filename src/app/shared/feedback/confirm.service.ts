import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  readonly title: string;
  readonly message: string;
  readonly confirmText?: string;
  readonly cancelText?: string;
  /** Estilo del botón de confirmar: 'danger' para acciones destructivas. */
  readonly tone?: 'primary' | 'danger';
}

interface ConfirmState extends ConfirmOptions {
  readonly resolve: (ok: boolean) => void;
}

/**
 * Confirmación modal basada en Promise. `ConfirmDialogComponent` la renderiza.
 *
 *   if (await confirm.ask({ title: '...', message: '...', tone: 'danger' })) { ... }
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly state = signal<ConfirmState | null>(null);

  ask(options: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      this.state.set({ ...options, resolve });
    });
  }

  respond(ok: boolean): void {
    const s = this.state();
    if (s) {
      s.resolve(ok);
      this.state.set(null);
    }
  }
}
