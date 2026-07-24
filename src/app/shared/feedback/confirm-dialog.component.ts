import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ConfirmService } from './confirm.service';

/**
 * Diálogo de confirmación global. Se monta una vez en el layout; se dispara con
 * `ConfirmService.ask(...)` y resuelve la Promise al elegir.
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (confirm.state(); as s) {
      <div
        class="fixed inset-0 bg-black/40 z-[90] flex items-center justify-center p-4"
        (click)="confirm.respond(false)"
      >
        <div
          class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4"
          (click)="$event.stopPropagation()"
        >
          <div class="flex flex-col gap-1">
            <h2 class="text-base font-bold text-gray-900">{{ s.title }}</h2>
            <p class="text-sm text-gray-500 leading-snug">{{ s.message }}</p>
          </div>
          <div class="flex justify-end gap-2">
            <button
              type="button"
              (click)="confirm.respond(false)"
              class="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            >{{ s.cancelText || 'Cancelar' }}</button>
            <button
              type="button"
              (click)="confirm.respond(true)"
              class="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
              [class]="s.tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'"
            >{{ s.confirmText || 'Confirmar' }}</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConfirmDialogComponent {
  readonly confirm = inject(ConfirmService);
}
