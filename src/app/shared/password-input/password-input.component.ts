import {
  ChangeDetectionStrategy,
  Component,
  Input,
  inject,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NgControl } from '@angular/forms';
import { IconComponent } from '../icon/icon.component';

/**
 * Reusable password field with a show/hide toggle. Implements
 * `ControlValueAccessor` so it drops into Reactive Forms via `formControlName`.
 *
 * Label and error messages stay in the parent form (they vary per case); this
 * component owns only the input + eye toggle. The neutral/invalid border color
 * is managed here, so `sizeClass` should carry padding/rounding/text only (no
 * `border-*`).
 */
@Component({
  selector: 'app-password-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="relative">
      <input
        [id]="id"
        [type]="show() ? 'text' : 'password'"
        [value]="value()"
        [placeholder]="placeholder"
        [attr.autocomplete]="autocomplete"
        [disabled]="disabled()"
        (input)="onInput($event)"
        (blur)="onTouched()"
        class="w-full border focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition placeholder-gray-400 text-gray-900 pr-10 disabled:bg-gray-50 disabled:text-gray-400"
        [class]="sizeClass"
        [class.border-red-400]="invalid"
        [class.border-gray-200]="!invalid"
      />
      <button
        type="button"
        (click)="toggle()"
        [attr.aria-label]="show() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
        [attr.aria-pressed]="show()"
        tabindex="-1"
        class="absolute right-3 inset-y-0 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
      >
        <span class="w-5 h-5 block">
          <app-icon [name]="show() ? 'eye-off' : 'eye'" />
        </span>
      </button>
    </div>
  `,
})
export class PasswordInputComponent implements ControlValueAccessor {
  @Input() placeholder = '';
  @Input() id?: string;
  @Input() autocomplete = 'current-password';
  @Input() invalid = false;
  @Input() sizeClass = 'px-3 py-2.5 rounded-xl text-sm';

  readonly value = signal('');
  readonly disabled = signal(false);
  readonly show = signal(false);

  private onChange: (value: string) => void = () => {};
  onTouched: () => void = () => {};

  constructor() {
    // Wire the CVA without an NG_VALUE_ACCESSOR provider (avoids the circular
    // dependency between the control and its value accessor).
    const ngControl = inject(NgControl, { self: true, optional: true });
    if (ngControl) ngControl.valueAccessor = this;
  }

  toggle(): void {
    this.show.update((v) => !v);
  }

  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.value.set(value);
    this.onChange(value);
  }

  // ── ControlValueAccessor ───────────────────────────────────────────────────
  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
