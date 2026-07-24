import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../shared/feedback/toast.service';
import { BusinessHours, BusinessHoursService } from '../services/business-hours.service';

const DAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

@Component({
  selector: 'app-business-hours',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="space-y-4 max-w-2xl">
      <p class="text-sm text-gray-500">Define el horario de atención por día. Marca "Cerrado" para los días sin atención.</p>

      @if (svc.loading()) {
        <div class="flex justify-center py-10">
          <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      } @else {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">
          @for (row of week(); track row.day_of_week) {
            <div class="flex items-center gap-3 px-4 py-3">
              <span class="w-24 text-sm font-medium text-gray-700">{{ label(row.day_of_week) }}</span>
              <label class="flex items-center gap-1.5 text-sm text-gray-600">
                <input type="checkbox" [(ngModel)]="row.closed" /> Cerrado
              </label>
              <div class="flex items-center gap-2 ml-auto" [class.opacity-40]="row.closed">
                <input type="time" [(ngModel)]="row.open_time" [disabled]="row.closed"
                  class="px-2 py-1 border border-gray-200 rounded-lg text-sm" />
                <span class="text-gray-400 text-sm">a</span>
                <input type="time" [(ngModel)]="row.close_time" [disabled]="row.closed"
                  class="px-2 py-1 border border-gray-200 rounded-lg text-sm" />
              </div>
            </div>
          }
        </div>

        @if (svc.error()) {
          <div class="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">{{ svc.error() }}</div>
        }

        <div class="flex justify-end">
          <button type="button" (click)="save()" [disabled]="svc.isSubmitting()"
            class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold">
            {{ svc.isSubmitting() ? 'Guardando…' : 'Guardar horarios' }}
          </button>
        </div>
      }
    </div>
  `,
})
export class BusinessHoursComponent implements OnInit {
  readonly svc = inject(BusinessHoursService);
  private readonly toast = inject(ToastService);
  readonly week = signal<BusinessHours[]>([]);

  async ngOnInit(): Promise<void> {
    await this.svc.load();
    const byDay = new Map(this.svc.hours().map(h => [h.day_of_week, h]));
    this.week.set(
      Array.from({ length: 7 }, (_, d) =>
        byDay.get(d) ?? { day_of_week: d, open_time: '10:00', close_time: '20:00', closed: false },
      ).map(h => ({ ...h, open_time: h.open_time?.slice(0, 5) ?? '10:00', close_time: h.close_time?.slice(0, 5) ?? '20:00' })),
    );
  }

  label(d: number): string {
    return DAY_LABELS[d];
  }

  async save(): Promise<void> {
    const payload = this.week().map(r => ({
      day_of_week: r.day_of_week,
      closed: r.closed,
      open_time: r.closed ? null : r.open_time || null,
      close_time: r.closed ? null : r.close_time || null,
    }));
    const ok = await this.svc.save(payload);
    if (ok) this.toast.success('Horarios guardados');
    else this.toast.error(this.svc.error() ?? 'No se pudo guardar');
  }
}
