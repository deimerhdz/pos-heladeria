import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Input,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NgControl } from '@angular/forms';
import { normalizeText } from '../normalize-text';

export interface SearchableSelectOption {
  id: string;
  label: string;
}

/**
 * Select con buscador. Implementa `ControlValueAccessor` (igual que
 * `PasswordInputComponent`) para poder usarse como reemplazo directo de un
 * `<select>` vía `[ngModel]`/`(ngModelChange)`. `options` es un `@Input`
 * plano (no signal), por lo que el filtrado se hace en métodos leídos desde
 * el template en cada ciclo de `OnPush`, no en `computed()` (que sólo
 * trackea signals y no vería cambios del input).
 */
@Component({
  selector: 'app-searchable-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="relative">
      <button
        type="button"
        (click)="toggle()"
        [disabled]="disabled()"
        class="w-full flex items-center justify-between gap-2 px-3 py-2 border rounded-lg text-sm text-left bg-white
          focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
        [class.border-gray-200]="true"
      >
        <span class="truncate" [class.text-gray-400]="!value()">{{ selectedLabel() || placeholder }}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
          stroke-linejoin="round" class="w-4 h-4 text-gray-400 shrink-0">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      @if (open()) {
        <div class="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <input #filterInput [value]="query()" (input)="onQueryInput($any($event.target).value)"
            (keydown)="onKeydown($event)" placeholder="Buscar…"
            class="w-full px-3 py-2 text-sm border-b border-gray-100 focus:outline-none" />
          <ul class="max-h-48 overflow-y-auto py-1">
            @for (o of filteredOptions(); track o.id; let i = $index) {
              <li (click)="selectOption(o)" (mouseenter)="highlightedIndex.set(i)"
                class="px-3 py-1.5 text-sm cursor-pointer"
                [class]="i === highlightedIndex() ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-50'">
                {{ o.label }}
              </li>
            } @empty {
              <li class="px-3 py-2 text-sm text-gray-400">Sin resultados</li>
            }
          </ul>
        </div>
      }
    </div>
  `,
})
export class SearchableSelectComponent implements ControlValueAccessor {
  @Input() options: SearchableSelectOption[] = [];
  @Input() placeholder = 'Seleccionar…';
  @Input() id?: string;

  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly filterInput = viewChild<ElementRef<HTMLInputElement>>('filterInput');

  readonly value = signal('');
  readonly disabled = signal(false);
  readonly open = signal(false);
  readonly query = signal('');
  readonly highlightedIndex = signal(0);

  private onChange: (value: string) => void = () => {};
  onTouched: () => void = () => {};

  constructor() {
    const ngControl = inject(NgControl, { self: true, optional: true });
    if (ngControl) ngControl.valueAccessor = this;
  }

  selectedLabel(): string {
    return this.options.find((o) => o.id === this.value())?.label ?? '';
  }

  /**
   * Filtra con `normalizeText`, que además de minúsculas quita los acentos:
   * antes se comparaba con `toLowerCase()` y escribir "cafe" no encontraba
   * "Café" ni "limon" a "Limón" — media despensa lleva tilde y nadie la teclea.
   */
  filteredOptions(): SearchableSelectOption[] {
    const q = normalizeText(this.query());
    if (!q) return this.options;
    return this.options.filter((o) => normalizeText(o.label).includes(q));
  }

  toggle(): void {
    if (this.disabled()) return;
    if (this.open()) {
      this.open.set(false);
      return;
    }
    this.query.set('');
    this.highlightedIndex.set(0);
    this.open.set(true);
    this.onTouched();
    setTimeout(() => this.filterInput()?.nativeElement.focus());
  }

  onQueryInput(v: string): void {
    this.query.set(v);
    this.highlightedIndex.set(0);
  }

  selectOption(opt: SearchableSelectOption): void {
    this.value.set(opt.id);
    this.onChange(opt.id);
    this.open.set(false);
  }

  onKeydown(event: KeyboardEvent): void {
    const options = this.filteredOptions();
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.open.set(false);
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.highlightedIndex.update((i) => Math.min(i + 1, options.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.highlightedIndex.update((i) => Math.max(i - 1, 0));
        break;
      case 'Enter': {
        event.preventDefault();
        const opt = options[this.highlightedIndex()];
        if (opt) this.selectOption(opt);
        break;
      }
    }
  }

  @HostListener('document:click', ['$event.target'])
  onDocumentClick(target: EventTarget | null): void {
    if (this.open() && !this.elementRef.nativeElement.contains(target as Node | null)) {
      this.open.set(false);
    }
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
