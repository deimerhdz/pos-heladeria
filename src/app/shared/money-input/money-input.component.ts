import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { ControlValueAccessor, NgControl } from '@angular/forms';

/** Caracteres que el usuario puede escribir dentro del campo: dígitos y, si
 *  `decimals > 0`, una sola coma decimal. Todo lo demás se descarta al vuelo. */
const SIGNIFICANT_RE = /[\d,]/;

/**
 * Input reutilizable para precios y montos (spec 035, Historia 2): formatea
 * con separador de miles en vivo, con el mismo locale que ya usa
 * `shared/money.ts:formatMoney` (`es-CO`, punto de miles / coma decimal), sin
 * esperar a que el campo pierda el foco. Implementa `ControlValueAccessor`
 * (mismo patrón que `shared/password-input/`) — el valor que entrega al
 * `FormControl`/`ngModel` que lo envuelve es siempre un `number | null`
 * limpio, nunca la cadena formateada.
 *
 * `decimals` (por defecto `0`, igual que `formatMoney`, que redondea a peso
 * entero) habilita centavos para los campos que ya los admiten hoy (precio
 * extra de opción, costo unitario, precio de plan).
 */
@Component({
  selector: 'app-money-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass],
  template: `
    <input
      [id]="id"
      type="text"
      inputmode="decimal"
      [value]="displayValue()"
      [placeholder]="placeholder"
      [disabled]="disabled()"
      (input)="onInput($event)"
      (blur)="onTouched(); blurred.emit()"
      class="w-full focus:outline-none transition placeholder-gray-400 text-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
      [ngClass]="[sizeClass, borderClass()]"
    />
  `,
})
export class MoneyInputComponent implements ControlValueAccessor {
  @Input() placeholder = '0';
  @Input() id?: string;
  @Input() invalid = false;
  @Input() sizeClass = 'px-3 py-2.5 rounded-xl text-sm';
  /** Cantidad de decimales admitidos — `0` = solo pesos enteros. */
  @Input() decimals = 0;
  /** `false` cuando un contenedor padre ya pone el borde (ej. una caja con el
   *  `$` como prefijo fuera del propio `<input>`) — evita un doble borde. */
  @Input() bordered = true;

  /** Se emite en el `blur` del `<input>` interno — el DOM no burbujea `blur`
   *  hasta el host de un componente, así que un `(blur)` puesto directamente
   *  sobre `<app-money-input>` nunca dispararía por sí solo. */
  @Output() readonly blurred = new EventEmitter<void>();

  /** Lo que se ve en el `<input>`: dígitos agrupados + coma decimal, nunca el `$`. */
  readonly displayValue = signal('');
  readonly disabled = signal(false);

  borderClass(): string {
    if (!this.bordered) return '';
    const base = 'border focus:ring-2 focus:ring-indigo-400 focus:border-transparent';
    return this.invalid ? `${base} border-red-400` : `${base} border-gray-200`;
  }

  private onChange: (value: number | null) => void = () => {};
  onTouched: () => void = () => {};

  constructor() {
    // Wire the CVA without an NG_VALUE_ACCESSOR provider (avoids the circular
    // dependency between the control and its value accessor) — mismo patrón
    // que shared/password-input/password-input.component.ts.
    const ngControl = inject(NgControl, { self: true, optional: true });
    if (ngControl) ngControl.valueAccessor = this;
  }

  onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const rawBefore = input.value;
    const caretBefore = input.selectionStart ?? rawBefore.length;
    const significantBefore = this.countSignificant(rawBefore.slice(0, caretBefore));

    const cleaned = this.clean(rawBefore);
    const display = this.formatForDisplay(cleaned);
    const value = this.toNumber(cleaned);

    this.displayValue.set(display);
    // Se fija de una vez (además del binding [value]) para poder restaurar el
    // cursor en el mismo ciclo — si se espera al próximo change detection, el
    // cursor ya saltó al final.
    input.value = display;
    const newCaret = this.caretAfterSignificant(display, significantBefore);
    input.setSelectionRange(newCaret, newCaret);

    this.onChange(value);
  }

  // ── Formateo / parseo ───────────────────────────────────────────────────

  /** Descarta cualquier carácter que no sea dígito o (si aplica) una sola coma decimal. */
  private clean(raw: string): string {
    let significant = raw.split('').filter((c) => SIGNIFICANT_RE.test(c)).join('');
    if (this.decimals <= 0) {
      return significant.replace(/,/g, '');
    }
    const firstComma = significant.indexOf(',');
    if (firstComma === -1) return significant;
    const intPart = significant.slice(0, firstComma);
    const decPart = significant.slice(firstComma + 1).replace(/,/g, '').slice(0, this.decimals);
    return `${intPart},${decPart}`;
  }

  /** Agrupa la parte entera con `Intl.NumberFormat('es-CO')`; conserva la
   *  parte decimal tal cual la escribió el usuario (sin redondearla ni
   *  completarla) para no perder una coma recién tecleada a mitad de
   *  escritura. */
  private formatForDisplay(cleaned: string): string {
    const [intPart, decPart] = cleaned.split(',');
    const grouped = intPart
      ? new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(intPart))
      : '';
    return decPart === undefined ? grouped : `${grouped},${decPart}`;
  }

  private toNumber(cleaned: string): number | null {
    if (!cleaned || cleaned === ',') return null;
    const n = Number(cleaned.replace(',', '.'));
    return Number.isNaN(n) ? null : n;
  }

  /** `number` ya conocido (hidratado vía `writeValue`) → forma "limpia"
   *  (dígitos + coma), lista para `formatForDisplay`. */
  private numberToCleaned(n: number): string {
    const fixed = this.decimals > 0 ? n.toFixed(this.decimals) : String(Math.round(n));
    return fixed.replace('.', ',');
  }

  // ── Cursor ───────────────────────────────────────────────────────────────

  private countSignificant(s: string): number {
    return s.split('').filter((c) => SIGNIFICANT_RE.test(c)).length;
  }

  private caretAfterSignificant(s: string, count: number): number {
    if (count <= 0) return 0;
    let seen = 0;
    for (let i = 0; i < s.length; i++) {
      if (SIGNIFICANT_RE.test(s[i])) {
        seen++;
        if (seen === count) return i + 1;
      }
    }
    return s.length;
  }

  // ── ControlValueAccessor ───────────────────────────────────────────────────

  writeValue(value: number | null | undefined): void {
    if (value === null || value === undefined) {
      this.displayValue.set('');
      return;
    }
    this.displayValue.set(this.formatForDisplay(this.numberToCleaned(value)));
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
