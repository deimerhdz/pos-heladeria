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
import { PaymentMethod } from '../../sales/interfaces/sales.interface';
import {
  PaymentDraft,
  changeDue,
  emptyPaymentDraft,
  missingAmount,
  paymentIssue,
} from '../services/payment-draft.util';
import { formatMoney } from '../services/receipt.util';

/**
 * Cómo paga el cliente un cobro: un método, o dos combinados.
 *
 * Se usa igual para la cuenta única y para el bloque de cada comensal en la
 * cuenta dividida, así que el importe a cubrir llega por `total`.
 */
@Component({
  selector: 'app-payment-input',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-2">
      <label class="block text-xs font-medium text-gray-600">Método de pago</label>
      <select
        [ngModel]="draft().methodId"
        (ngModelChange)="setMethod($event)"
        class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
      >
        <option value="">Selecciona…</option>
        @for (m of methods; track m.id) {
          <option [value]="m.id">{{ m.name }}</option>
        }
      </select>

      @if (draft().methodId) {
        <label class="block text-xs font-medium text-gray-600">
          {{ isCash(draft().methodId) ? 'Con cuánto paga' : 'Importe' }}
        </label>
        <input
          type="number"
          inputmode="numeric"
          min="0"
          [ngModel]="draft().amount"
          (ngModelChange)="setAmount($event)"
          class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        />

        <label class="flex items-center gap-2 text-xs text-gray-700 pt-1">
          <input
            type="checkbox"
            [checked]="draft().combined"
            (change)="toggleCombined($any($event.target).checked)"
            class="rounded"
          />
          Combinar con otro método
        </label>
      }

      @if (draft().combined) {
        <div class="border border-gray-200 rounded-lg p-2 space-y-2">
          <select
            [ngModel]="draft().secondMethodId"
            (ngModelChange)="setSecondMethod($event)"
            class="w-full px-2 py-1.5 border border-gray-200 rounded text-xs"
          >
            <option value="">Selecciona…</option>
            <!-- Sin el método ya elegido: dos líneas iguales suman bien pero se
                 leen como un error. -->
            @for (m of otherMethods(); track m.id) {
              <option [value]="m.id">{{ m.name }}</option>
            }
          </select>
          <input
            type="number"
            inputmode="numeric"
            min="0"
            [ngModel]="draft().secondAmount"
            (ngModelChange)="setSecondAmount($event)"
            class="w-full px-2 py-1.5 border border-gray-200 rounded text-xs"
          />
        </div>
      }

      @if (issue(); as problema) {
        <p class="text-xs font-medium text-red-600">{{ problema }}</p>
      } @else if (change() > 0) {
        <div class="flex items-center justify-between bg-emerald-50 rounded-lg px-3 py-2">
          <span class="text-xs font-medium text-emerald-800">Vuelto</span>
          <span class="text-base font-bold text-emerald-700">{{ money(change()) }}</span>
        </div>
      }
    </div>
  `,
})
export class PaymentInputComponent implements OnChanges {
  /** Lo que hay que cubrir con este cobro. */
  @Input() total = 0;
  @Input() methods: PaymentMethod[] = [];
  /** Estado del pago cada vez que cambia; el padre lo usa para validar y cobrar. */
  @Output() changed = new EventEmitter<PaymentDraft>();

  readonly draft = signal<PaymentDraft>(emptyPaymentDraft());

  readonly issue = computed(() => paymentIssue(this.draft(), this.total, this.methods));
  readonly change = computed(() => changeDue(this.draft(), this.total));

  readonly otherMethods = computed(() =>
    this.methods.filter((m) => m.id !== this.draft().methodId),
  );

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
    const amount = this.toAmount(value);
    // El segundo método cubre lo que falte, para que el cajero no tenga que restar.
    this.patch({
      amount,
      secondAmount: this.draft().combined ? this.remainder(amount) : 0,
    });
  }

  toggleCombined(combined: boolean): void {
    this.patch(
      combined
        ? { combined, secondAmount: this.remainder(this.draft().amount) }
        : { combined, secondMethodId: '', secondAmount: 0 },
    );
  }

  setSecondMethod(secondMethodId: string): void {
    this.patch({ secondMethodId });
  }

  setSecondAmount(value: string | number): void {
    this.patch({ secondAmount: this.toAmount(value) });
  }

  private remainder(paid: number): number {
    return Math.max(0, this.total - paid);
  }

  private toAmount(value: string | number): number {
    return Math.max(0, Number(value) || 0);
  }

  private patch(partial: Partial<PaymentDraft>): void {
    this.draft.update((d) => ({ ...d, ...partial }));
    this.changed.emit(this.draft());
  }
}
