import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Cifra destacada de una sola métrica. La guía de visualización llama a esto un
 * *stat tile*: cuando el dato es un único número, un número grande se lee mejor
 * que cualquier gráfica.
 */
@Component({
  selector: 'app-stat-tile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p class="text-[11px] font-bold uppercase tracking-wider text-gray-500">{{ label }}</p>
      @if (loading) {
        <div class="h-8 mt-2 bg-gray-100 rounded-lg animate-pulse w-24"></div>
      } @else {
        <p class="text-2xl font-bold mt-1.5" [class]="toneClass">{{ value }}</p>
        @if (hint) {
          <p class="text-xs text-gray-400 mt-1">{{ hint }}</p>
        }
      }
    </div>
  `,
})
export class StatTileComponent {
  @Input({ required: true }) label = '';
  @Input({ required: true }) value = '';
  @Input() hint = '';
  @Input() loading = false;
  /** `positive` resalta el margen en verde, como ya hacía la vista anterior. */
  @Input() tone: 'neutral' | 'positive' = 'neutral';

  get toneClass(): string {
    return this.tone === 'positive' ? 'text-emerald-600' : 'text-gray-900';
  }
}
