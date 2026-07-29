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
  CloseSessionResponse,
  PaymentLine,
  SessionBill,
  SplitPayment,
} from '../interfaces/dining.interface';
import { PaymentMethod } from '../../sales/interfaces/sales.interface';
import { TableSessionService } from '../services/table-session.service';
import { formatMoney } from '../services/receipt.util';
import { ToastService } from '../../../shared/feedback/toast.service';

/** Cobro asignado a un comensal en modo `split`. */
interface SplitDraft {
  participantId: string | null;
  label: string;
  subtotal: number;
  methodId: string;
  /** Con cuánto paga: en efectivo puede ser más que `subtotal` y generar vuelto. */
  received: number;
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
              (ngModelChange)="setUnifiedMethod($event)"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">Selecciona…</option>
              @for (m of methods; track m.id) {
                <option [value]="m.id">{{ m.name }}</option>
              }
            </select>

            @if (isCash()) {
              <div class="pt-3 mt-1 border-t border-gray-100 space-y-2">
                <label class="block text-xs font-medium text-gray-600" for="cash-received">
                  Con cuánto paga
                </label>
                <input
                  id="cash-received"
                  type="number"
                  inputmode="numeric"
                  min="0"
                  [ngModel]="cashReceived()"
                  (ngModelChange)="setCashReceived($event)"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                @if (missing() > 0) {
                  <p class="text-xs font-medium text-red-600">
                    Faltan {{ money(missing()) }} para cubrir la cuenta.
                  </p>
                } @else {
                  <div class="flex items-center justify-between bg-emerald-50 rounded-lg px-3 py-2">
                    <span class="text-xs font-medium text-emerald-800">Vuelto</span>
                    <span class="text-base font-bold text-emerald-700">
                      {{ money(changeDue()) }}
                    </span>
                  </div>
                }
              </div>
            }
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

                @if (isCashMethod(d.methodId)) {
                  <div class="mt-2 pt-2 border-t border-gray-100 space-y-1.5">
                    <label class="block text-[11px] font-medium text-gray-500">
                      Con cuánto paga
                    </label>
                    <input
                      type="number"
                      inputmode="numeric"
                      min="0"
                      [ngModel]="d.received"
                      (ngModelChange)="setSplitReceived(d.participantId, $event)"
                      class="w-full px-2 py-1.5 border border-gray-200 rounded text-xs"
                    />
                    @if (d.received < d.subtotal) {
                      <p class="text-[11px] font-medium text-red-600">
                        Faltan {{ money(d.subtotal - d.received) }}
                      </p>
                    } @else {
                      <div class="flex items-center justify-between text-xs">
                        <span class="text-emerald-800">Vuelto</span>
                        <span class="font-bold text-emerald-700">
                          {{ money(d.received - d.subtotal) }}
                        </span>
                      </div>
                    }
                  </div>
                }
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
  /** Cierre completo: sus `sale_ids` son la fuente de la factura impresa. */
  @Output() charged = new EventEmitter<CloseSessionResponse>();

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

  /** Con cuánto paga el cliente en efectivo; el exceso es el vuelto. */
  readonly cashReceived = signal(0);

  /**
   * Espejo de la cuenta que llega por `@Input`.
   *
   * Los `computed` de abajo dependen de ella: leer `this.bill` directamente los
   * dejaría congelados en su primer valor, porque un campo normal no notifica
   * cambios (es el mismo fallo que tenía `unifiedMethod`).
   */
  private readonly currentBill = signal<SessionBill | null>(null);

  readonly total = computed(() => Number(this.currentBill()?.total ?? 0));

  /** Dividir solo tiene sentido si hay consumo de más de un comensal. */
  readonly canSplit = computed(() => (this.currentBill()?.split.length ?? 0) > 1);

  /** El método elegido para la cuenta única cobra en efectivo. */
  readonly isCash = computed(() => !!this.method(this.unifiedMethod())?.is_cash);

  /** Vuelto de la cuenta única. */
  readonly changeDue = computed(() => Math.max(0, this.cashReceived() - this.total()));

  /** Lo que falta para cubrir la cuenta única (0 si ya está cubierta). */
  readonly missing = computed(() => Math.max(0, this.total() - this.cashReceived()));

  readonly ready = computed(() => {
    if (this.mode() === 'unified') {
      if (!this.unifiedMethod()) return false;
      // En efectivo el importe lo teclea el cajero: no puede quedarse corto.
      return !this.isCash() || this.cashReceived() >= this.total();
    }
    return (
      this.splits().length > 0 &&
      this.splits().every(
        (s) => !!s.methodId && (!this.isCashMethod(s.methodId) || s.received >= s.subtotal),
      )
    );
  });

  ngOnChanges(): void {
    this.error.set(null);
    this.currentBill.set(this.bill);
    // El método elegido es de esta cuenta: no debe arrastrarse a la siguiente mesa.
    this.unifiedMethod.set('');
    this.cashReceived.set(0);
    this.splits.set(
      (this.bill?.split ?? []).map((l) => ({
        participantId: l.participant_id,
        label: this.lineLabel(l.display_label),
        subtotal: Number(l.subtotal),
        methodId: '',
        received: Number(l.subtotal),
      })),
    );
    if (!this.canSplit()) this.mode.set('unified');
  }

  /** Los ítems sin comensal los añadió el mesero. */
  lineLabel(label: string | null): string {
    return label ?? 'Sin asignar (mesero)';
  }

  /** Importes con el mismo formato que la terminal y la factura. */
  money(n: number): string {
    return formatMoney(n);
  }

  isCashMethod(methodId: string): boolean {
    return !!this.method(methodId)?.is_cash;
  }

  private method(methodId: string): PaymentMethod | undefined {
    return this.methods.find((m) => m.id === methodId);
  }

  /** Al elegir método, el efectivo arranca en el importe justo (vuelto $ 0). */
  setUnifiedMethod(methodId: string): void {
    this.unifiedMethod.set(methodId);
    this.cashReceived.set(this.isCashMethod(methodId) ? this.total() : 0);
  }

  setCashReceived(value: string | number): void {
    this.cashReceived.set(Math.max(0, Number(value) || 0));
  }

  setSplitMethod(participantId: string | null, methodId: string): void {
    this.splits.update((list) =>
      list.map((s) =>
        s.participantId === participantId ? { ...s, methodId, received: s.subtotal } : s,
      ),
    );
  }

  setSplitReceived(participantId: string | null, value: string | number): void {
    const received = Math.max(0, Number(value) || 0);
    this.splits.update((list) =>
      list.map((s) => (s.participantId === participantId ? { ...s, received } : s)),
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
      const closed = await this.api.close(
        this.bill.table_session_id,
        this.buildPayload(this.cashShiftId),
      );
      this.toast.success('Mesa cobrada y liberada');
      this.charged.emit(closed);
    } catch (err) {
      this.showChargeError(err);
    } finally {
      this.submitting.set(false);
    }
  }

  /**
   * En efectivo se manda **lo que entregó el cliente**, no el importe justo: el
   * backend deriva de ahí `paid_amount` y `change_given`, y sin eso el vuelto no
   * se descuenta del efectivo esperado del turno.
   */
  private buildPayload(cashShiftId: string): CloseSessionPayload {
    if (this.mode() === 'unified') {
      const payments: PaymentLine[] = [
        {
          payment_method_id: this.unifiedMethod(),
          amount: this.isCash() ? this.cashReceived() : this.total(),
        },
      ];
      return { cash_shift_id: cashShiftId, billing_mode: 'unified', payments };
    }
    const splits: SplitPayment[] = this.splits().map((s) => ({
      participant_id: s.participantId,
      payments: [
        {
          payment_method_id: s.methodId,
          amount: this.isCashMethod(s.methodId) ? s.received : s.subtotal,
        },
      ],
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
