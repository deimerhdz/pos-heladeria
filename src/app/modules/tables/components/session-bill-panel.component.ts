import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  BillingMode,
  CloseSessionPayload,
  PaymentLine,
  SessionBill,
  SplitPayment,
} from '../interfaces/dining.interface';
import { PaymentMethod } from '../../sales/interfaces/sales.interface';
import { TableSessionService } from '../services/table-session.service';
import { ToastService } from '../../../shared/feedback/toast.service';

/** Cobro asignado a un comensal en modo `split`. */
interface SplitDraft {
  participantId: string | null;
  label: string;
  subtotal: number;
  methodId: string;
}

/**
 * Cuenta de la mesa y cobro.
 *
 * El desglose por comensal es exacto porque la asignación vive en cada ítem
 * (`order_items.participant_id`), no en el pedido: un pedido que mezcle
 * personas se reparte igualmente bien.
 */
@Component({
  selector: 'app-session-bill-panel',
  standalone: true,
  imports: [DecimalPipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col h-full">
      <h2 class="text-sm font-bold text-gray-900 mb-3">Cuenta de la mesa</h2>

      @if (!bill) {
        <p class="text-xs text-gray-400 py-6 text-center">Selecciona una mesa con consumo.</p>
      } @else {
        <!-- Desglose -->
        <div class="space-y-1.5 mb-4">
          @for (line of bill.split; track line.participant_id) {
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-700 truncate">{{ lineLabel(line.display_label) }}</span>
              <span class="font-medium text-gray-900">$ {{ +line.subtotal | number: '1.2-2' }}</span>
            </div>
          }
          <div class="flex items-center justify-between pt-2 border-t border-gray-100">
            <span class="text-sm font-semibold text-gray-800">Total</span>
            <span class="text-base font-bold text-gray-900">
              $ {{ +bill.total | number: '1.2-2' }}
            </span>
          </div>
        </div>

        <!-- Modo de cobro -->
        <div class="flex gap-2 mb-3">
          <button
            (click)="mode.set('unified')"
            class="flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors"
            [class]="
              mode() === 'unified'
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            "
          >
            Cuenta única
          </button>
          <button
            (click)="mode.set('split')"
            [disabled]="!canSplit()"
            class="flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40"
            [class]="
              mode() === 'split'
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            "
          >
            Dividir por comensal
          </button>
        </div>

        @if (!canSplit()) {
          <p class="text-[11px] text-gray-400 mb-3">
            Dividir requiere consumo asignado a más de un comensal.
          </p>
        }

        <!-- Pago -->
        <div class="flex-1 overflow-y-auto space-y-2 mb-3">
          @if (mode() === 'unified') {
            <label class="block text-xs font-medium text-gray-600">Método de pago</label>
            <select
              [ngModel]="unifiedMethod()"
              (ngModelChange)="unifiedMethod.set($event)"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">Selecciona…</option>
              @for (m of methods; track m.id) {
                <option [value]="m.id">{{ m.name }}</option>
              }
            </select>
          } @else {
            <p class="text-xs text-gray-500">Un método por cada comensal con consumo:</p>
            @for (d of splits(); track d.participantId) {
              <div class="border border-gray-200 rounded-lg p-2">
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-xs font-semibold text-gray-700 truncate">{{ d.label }}</span>
                  <span class="text-sm font-medium text-gray-900">
                    $ {{ d.subtotal | number: '1.2-2' }}
                  </span>
                </div>
                <select
                  [ngModel]="d.methodId"
                  (ngModelChange)="setSplitMethod(d.participantId, $event)"
                  class="w-full px-2 py-1.5 border border-gray-200 rounded text-xs"
                >
                  <option value="">Selecciona…</option>
                  @for (m of methods; track m.id) {
                    <option [value]="m.id">{{ m.name }}</option>
                  }
                </select>
              </div>
            }
          }
        </div>

        @if (error()) {
          <div class="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
            <p class="text-xs text-red-700">{{ error() }}</p>
          </div>
        }

        <button
          (click)="charge()"
          [disabled]="submitting() || !ready()"
          class="w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {{ submitting() ? 'Cobrando...' : 'Cobrar y cerrar mesa' }}
        </button>
      }
    </div>
  `,
})
export class SessionBillPanelComponent implements OnChanges {
  @Input() bill: SessionBill | null = null;
  @Input() methods: PaymentMethod[] = [];
  @Input() cashShiftId: string | null = null;
  @Output() charged = new EventEmitter<string[]>();

  private readonly api = inject(TableSessionService);
  private readonly toast = inject(ToastService);

  readonly mode = signal<BillingMode>('unified');
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly splits = signal<SplitDraft[]>([]);

  /**
   * Método de pago de la cuenta única. **Es una señal**: `ready()` la lee, y un
   * `computed` solo se recalcula cuando cambia una señal. Como campo normal, el
   * botón de cobrar se quedaba deshabilitado para siempre.
   */
  readonly unifiedMethod = signal('');

  /** Dividir solo tiene sentido si hay consumo de más de un comensal. */
  readonly canSplit = computed(() => (this.bill?.split.length ?? 0) > 1);

  readonly ready = computed(() =>
    this.mode() === 'unified'
      ? !!this.unifiedMethod()
      : this.splits().length > 0 && this.splits().every((s) => !!s.methodId),
  );

  ngOnChanges(): void {
    this.error.set(null);
    // El método elegido es de esta cuenta: no debe arrastrarse a la siguiente mesa.
    this.unifiedMethod.set('');
    this.splits.set(
      (this.bill?.split ?? []).map((l) => ({
        participantId: l.participant_id,
        label: this.lineLabel(l.display_label),
        subtotal: Number(l.subtotal),
        methodId: '',
      })),
    );
    if (!this.canSplit()) this.mode.set('unified');
  }

  /** Los ítems sin comensal los añadió el mesero. */
  lineLabel(label: string | null): string {
    return label ?? 'Sin asignar (mesero)';
  }

  setSplitMethod(participantId: string | null, methodId: string): void {
    this.splits.update((list) =>
      list.map((s) => (s.participantId === participantId ? { ...s, methodId } : s)),
    );
  }

  async charge(): Promise<void> {
    if (!this.bill || !this.cashShiftId) {
      this.error.set('No hay un turno de caja abierto.');
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    try {
      await this.api.close(this.bill.table_session_id, this.buildPayload(this.cashShiftId));
      this.toast.success('Mesa cobrada y liberada');
      this.charged.emit(this.bill.order_ids);
    } catch (err) {
      this.showChargeError(err);
    } finally {
      this.submitting.set(false);
    }
  }

  private buildPayload(cashShiftId: string): CloseSessionPayload {
    if (this.mode() === 'unified') {
      const payments: PaymentLine[] = [
        { payment_method_id: this.unifiedMethod(), amount: Number(this.bill!.total) },
      ];
      return { cash_shift_id: cashShiftId, billing_mode: 'unified', payments };
    }
    const splits: SplitPayment[] = this.splits().map((s) => ({
      participant_id: s.participantId,
      payments: [{ payment_method_id: s.methodId, amount: s.subtotal }],
    }));
    return { cash_shift_id: cashShiftId, billing_mode: 'split', splits };
  }

  /**
   * Los rechazos al cerrar son accionables, no genéricos: o falta confirmar
   * pedidos, o cocina sigue trabajando, o el split deja comensales sin cubrir.
   */
  private showChargeError(err: unknown): void {
    const blocked = this.api.closeBlocked(err);
    if (blocked) {
      this.error.set(blocked.error);
      return;
    }
    const incomplete = this.api.splitIncomplete(err);
    if (incomplete) {
      const missing = this.splits()
        .filter((s) => (incomplete.participant_ids ?? []).includes(s.participantId ?? ''))
        .map((s) => s.label);
      this.error.set(
        missing.length > 0
          ? `Falta asignar el pago de: ${missing.join(', ')}.`
          : incomplete.error,
      );
      return;
    }
    this.error.set(this.api.extractError(err, 'No se pudo cobrar la mesa.'));
  }
}
