import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  computed,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PaymentMethodCheckoutOption } from '../../sales/interfaces/sales.interface';
import {
  PaymentDraft,
  changeDue,
  emptyPaymentDraft,
  missingAmount,
  paymentIssue,
} from '../services/payment-draft.util';
import { formatMoney } from '../services/receipt.util';
import { MoneyInputComponent } from '../../../shared/money-input/money-input.component';

/**
 * Cómo paga el cliente un cobro: un único método (spec 046, FR-004/FR-007).
 *
 * Se usa igual para la cuenta única y para el bloque de cada comensal en la
 * cuenta dividida, así que el importe a cubrir llega por `total`.
 */
@Component({
  selector: 'app-payment-input',
  standalone: true,
  imports: [FormsModule, MoneyInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-2">
      <label class="block text-sm font-medium text-gray-600">Método de pago</label>
      <select
        [ngModel]="draft().methodId"
        (ngModelChange)="setMethod($event)"
        class="w-full min-h-11 px-3 py-2 border border-gray-200 rounded-lg text-base"
      >
        <option value="">Selecciona…</option>
        @for (m of methods; track m.id) {
          <option [value]="m.id">{{ m.name }}</option>
        }
      </select>

      @if (draft().methodId) {
        <label class="block text-sm font-medium text-gray-600">
          {{ isCash(draft().methodId) ? 'Con cuánto paga' : 'Importe' }}
        </label>
        <app-money-input
          [ngModel]="draft().amount"
          (ngModelChange)="setAmount($event ?? 0)"
          sizeClass="min-h-11 px-3 py-2 rounded-lg text-base"
        />
      }

      @if (issue(); as problema) {
        <p class="text-sm font-medium text-red-600">{{ problema }}</p>
      } @else if (change() > 0) {
        <div class="flex items-center justify-between bg-emerald-50 rounded-lg px-3 py-2">
          <span class="text-sm font-medium text-emerald-800">Vuelto</span>
          <span class="text-lg font-bold text-emerald-700">{{ money(change()) }}</span>
        </div>
      }
    </div>
  `,
})
export class PaymentInputComponent implements OnChanges {
  /** Lo que hay que cubrir con este cobro. */
  @Input() total = 0;
  @Input() methods: PaymentMethodCheckoutOption[] = [];
  /** Estado del pago cada vez que cambia; el padre lo usa para validar y cobrar. */
  @Output() changed = new EventEmitter<PaymentDraft>();

  readonly draft = signal<PaymentDraft>(emptyPaymentDraft());

  readonly issue = computed(() => paymentIssue(this.draft(), this.total, this.methods));
  readonly change = computed(() => changeDue(this.draft(), this.total));

  ngOnChanges(): void {
    // Cambió la cuenta (otra mesa, otro importe): el pago anterior ya no vale.
    this.draft.set(emptyPaymentDraft());
    this.changed.emit(this.draft());
  }

  money(n: number): string {
    return formatMoney(n);
  }

  isCash(methodId: string): boolean {
    return !!this.methods.find((m) => m.id === methodId)?.is_cash;
  }

  /** Al elegir método se precarga el importe justo: el caso habitual. */
  setMethod(methodId: string): void {
    this.patch({ methodId, amount: methodId ? this.total : 0 });
  }

  setAmount(value: string | number): void {
    this.patch({ amount: this.toAmount(value) });
  }

  private toAmount(value: string | number): number {
    return Math.max(0, Number(value) || 0);
  }

  private patch(partial: Partial<PaymentDraft>): void {
    this.draft.update((d) => ({ ...d, ...partial }));
    this.changed.emit(this.draft());
  }
}
