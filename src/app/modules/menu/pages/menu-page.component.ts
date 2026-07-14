import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MenuService } from '../services/menu.service';

@Component({
  selector: 'app-menu-page',
  standalone: true,
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-gray-900">Menú</h1>
          <p class="text-sm text-gray-500 mt-0.5">Vista previa del catálogo activo que ven los clientes</p>
        </div>
        <button (click)="service.loadMenu()"
          class="px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50 transition-colors">
          Actualizar
        </button>
      </div>

      @if (service.error()) {
        <p class="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-2">{{ service.error() }}</p>
      }

      @if (service.isLoading()) {
        <p class="text-sm text-gray-400">Cargando menú...</p>
      } @else if (isEmpty()) {
        <div class="bg-white rounded-xl border border-gray-100 flex flex-col items-center justify-center py-12">
          <p class="text-sm text-gray-400">El menú está vacío</p>
          <p class="text-xs text-gray-400 mt-1">Crea productos con variantes y actívalos para que aparezcan aquí.</p>
        </div>
      } @else {
        @for (cat of service.categories(); track cat.id) {
          @if (cat.products.length > 0) {
            <section class="space-y-3">
              <h2 class="text-sm font-bold text-gray-900 uppercase tracking-wide">{{ cat.name }}</h2>
              <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                @for (p of cat.products; track p.id) {
                  <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col">
                    <div class="h-32 bg-gray-50 flex items-center justify-center">
                      @if (p.image_url) {
                        <img [src]="p.image_url" [alt]="p.name" class="h-full w-full object-cover">
                      } @else {
                        <span class="text-4xl">🍦</span>
                      }
                    </div>
                    <div class="p-4 flex-1 flex flex-col gap-2">
                      <div>
                        <p class="font-semibold text-gray-900">{{ p.name }}</p>
                        @if (p.description) {
                          <p class="text-xs text-gray-500 mt-0.5">{{ p.description }}</p>
                        }
                      </div>

                      <!-- Variantes -->
                      @if (p.variants.length > 0) {
                        <ul class="space-y-1">
                          @for (v of p.variants; track v.id) {
                            <li class="flex items-center justify-between text-sm">
                              <span class="text-gray-700">{{ v.name }}</span>
                              <span class="font-semibold text-gray-900">{{ v.price | number:'1.2-2' }}</span>
                            </li>
                          }
                        </ul>
                      } @else {
                        <p class="text-xs text-amber-600">Sin variantes (no aparece con precio)</p>
                      }

                      <!-- Grupos de opciones -->
                      @if (p.option_groups.length > 0) {
                        <div class="pt-2 border-t border-gray-50 space-y-1">
                          @for (g of p.option_groups; track g.id) {
                            <div class="text-xs">
                              <span class="font-medium text-gray-600">{{ g.name }}</span>
                              <span class="text-gray-400"> ({{ g.min_select }}–{{ g.max_select }}):</span>
                              <span class="text-gray-500">
                                {{ groupOptionsLabel(g.options) }}
                              </span>
                            </div>
                          }
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
            </section>
          }
        }
      }
    </div>
  `,
})
export class MenuPageComponent implements OnInit {
  readonly service = inject(MenuService);

  readonly isEmpty = computed(() =>
    this.service.categories().every((c) => c.products.length === 0),
  );

  async ngOnInit(): Promise<void> {
    await this.service.loadMenu();
  }

  groupOptionsLabel(options: { name: string; extra_price: number }[]): string {
    if (options.length === 0) return 'sin opciones';
    return options
      .map((o) => (o.extra_price > 0 ? `${o.name} (+${o.extra_price.toFixed(2)})` : o.name))
      .join(', ');
  }
}
