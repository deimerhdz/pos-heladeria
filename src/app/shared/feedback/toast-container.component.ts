import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Toast, ToastService } from './toast.service';

/**
 * Contenedor global de toasts (esquina inferior derecha). Se monta una vez en
 * el layout del dashboard.
 */
@Component({
  selector: 'app-toast-container',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm">
      @for (t of toasts.toasts(); track t.id) {
        <div
          class="flex items-start gap-3 rounded-xl shadow-lg px-4 py-3 text-sm border animate-[fadeIn_.15s_ease-out]"
          [class]="cls(t)"
          role="status"
        >
          <span class="mt-0.5 flex-none">{{ icon(t) }}</span>
          <span class="flex-1 leading-snug">{{ t.text }}</span>
          <button
            type="button"
            (click)="toasts.dismiss(t.id)"
            class="flex-none text-current/60 hover:text-current transition-colors"
            aria-label="Cerrar"
          >✕</button>
        </div>
      }
    </div>
  `,
})
export class ToastContainerComponent {
  readonly toasts = inject(ToastService);

  cls(t: Toast): string {
    switch (t.kind) {
      case 'success':
        return 'bg-emerald-50 border-emerald-200 text-emerald-800';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800';
      default:
        return 'bg-indigo-50 border-indigo-200 text-indigo-800';
    }
  }

  icon(t: Toast): string {
    switch (t.kind) {
      case 'success':
        return '✓';
      case 'error':
        return '⚠';
      default:
        return 'ℹ';
    }
  }
}
