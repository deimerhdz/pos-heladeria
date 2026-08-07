import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Promotion } from '../../promotions/interfaces/promotion.interface';
import { MenuService } from '../../../core/services/menu.service';
import { buildMenuLookup } from '../services/menu-lookup';

const DAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

/** Emitted when the cashier confirms adding a combo to the draft order. */
export interface ComboSelection {
  promo: Promotion;
  quantity: number;
}

/**
 * Picker de un combo: sin variante/opciones (un combo no las tiene), muestra
 * los productos incluidos, el ahorro frente al precio normal, y — si el combo
 * tiene ventana horaria/días configurados — un aviso explícito para que el
 * cajero no se sorprenda con un 409 "combo no disponible" al cobrar.
 */
@Component({
  selector: 'app-combo-select',
  standalone: true,
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div class="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[90vh] flex flex-col">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 class="text-lg font-semibold text-gray-900 truncate">🎁 {{ promo.name }}</h2>
          <button type="button" (click)="cancelled.emit()" class="text-gray-400 hover:text-gray-600 transition-colors">✕</button>
        </div>

        <div class="px-6 py-4 space-y-4 overflow-y-auto">
          <div>
            <p class="text-sm font-semibold text-gray-700 mb-2">Incluye</p>
            <ul class="space-y-1">
              @for (item of promo.combo_items; track item.product_variant_id) {
                <li class="text-sm text-gray-700">{{ item.quantity }}x {{ variantLabel(item.product_variant_id) }}</li>
              }
            </ul>
          </div>

          <div class="p-3 rounded-lg" [class]="savings() > 0 ? 'bg-emerald-50 border border-emerald-100' : 'bg-amber-50 border border-amber-100'">
            <div class="flex justify-between text-sm">
              <span class="text-gray-600">Suma normal</span>
              <span class="font-semibold text-gray-900">$ {{ normalTotal() | number: '1.2-2' }}</span>
            </div>
            <div class="flex justify-between text-sm mt-0.5">
              <span class="text-gray-600">Precio del combo</span>
              <span class="font-semibold text-gray-900">$ {{ comboPrice() | number: '1.2-2' }}</span>
            </div>
            @if (savings() > 0) {
              <p class="text-sm font-bold text-emerald-700 mt-1">Ahorro: $ {{ savings() | number: '1.2-2' }}</p>
            }
          </div>

          @if (vigenciaHint()) {
            <p class="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg px-3 py-2">
              ⏰ {{ vigenciaHint() }}
            </p>
          }
        </div>

        <div class="px-6 py-4 border-t border-gray-100 shrink-0 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-600">Cantidad</span>
            <div class="flex items-center gap-2">
              <button type="button" (click)="dec()" class="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold">−</button>
              <span class="w-6 text-center font-semibold">{{ quantity() }}</span>
              <button type="button" (click)="inc()" class="w-8 h-8 rounded-full bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-bold">+</button>
            </div>
          </div>
          <button
            type="button"
            (click)="confirm()"
            class="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
          >
            Agregar · $ {{ (comboPrice() * quantity()) | number: '1.2-2' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ComboSelectComponent implements OnInit {
  @Input() promo!: Promotion;
  @Output() confirmed = new EventEmitter<ComboSelection>();
  @Output() cancelled = new EventEmitter<void>();

  private readonly menuService = inject(MenuService);
  private readonly lookup = computed(() => buildMenuLookup(this.menuService.categories()));

  readonly quantity = signal(1);

  ngOnInit(): void {
    this.quantity.set(1);
  }

  variantLabel(variantId: string): string {
    return this.lookup().variantLabel(variantId);
  }

  comboPrice(): number {
    return Number(this.promo.value);
  }

  normalTotal(): number {
    return this.promo.combo_items.reduce(
      (sum, ci) => sum + this.lookup().variantPrice(ci.product_variant_id) * ci.quantity,
      0,
    );
  }

  savings(): number {
    return this.normalTotal() - this.comboPrice();
  }

  /** Aviso de vigencia acotada, para que el cajero no se lleve un 409 al cobrar. */
  vigenciaHint(): string | null {
    const parts: string[] = [];
    if (this.promo.start_time && this.promo.end_time) {
      parts.push(`Disponible de ${this.promo.start_time.slice(0, 5)} a ${this.promo.end_time.slice(0, 5)}`);
    }
    if (this.promo.days_of_week) {
      const days = this.promo.days_of_week.split(',').map((d) => DAYS[Number(d)]).filter(Boolean);
      if (days.length) parts.push(`Solo ${days.join(', ')}`);
    }
    if (this.promo.days_of_month) {
      parts.push(`Solo los días ${this.promo.days_of_month.replaceAll(',', ', ')} del mes`);
    }
    return parts.length ? parts.join(' · ') : null;
  }

  inc(): void {
    this.quantity.update((q) => q + 1);
  }

  dec(): void {
    this.quantity.update((q) => Math.max(1, q - 1));
  }

  confirm(): void {
    this.confirmed.emit({ promo: this.promo, quantity: this.quantity() });
  }
}
