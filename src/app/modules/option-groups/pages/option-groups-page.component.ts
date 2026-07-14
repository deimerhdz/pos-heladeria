import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { OptionGroup } from '../../products/interfaces/product.interface';
import { OptionGroupService } from '../services/option-group.service';
import { OptionGroupFormComponent } from '../components/option-group-form.component';
import { OptionFormComponent } from '../components/option-form.component';

@Component({
  selector: 'app-option-groups-page',
  standalone: true,
  imports: [DecimalPipe, OptionGroupFormComponent, OptionFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-gray-900">Grupos de opciones</h1>
          <p class="text-sm text-gray-500 mt-0.5">Sabores, toppings y extras que se asignan a los productos</p>
        </div>
        <button (click)="showGroupForm.set(true)"
          class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          Nuevo grupo
        </button>
      </div>

      @if (service.error()) {
        <p class="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-2">{{ service.error() }}</p>
      }

      @if (service.isLoading()) {
        <p class="text-sm text-gray-400">Cargando grupos...</p>
      } @else if (service.groups().length === 0) {
        <div class="bg-white rounded-xl border border-gray-100 flex flex-col items-center justify-center py-12">
          <p class="text-sm text-gray-400">Aún no hay grupos de opciones</p>
        </div>
      } @else {
        <div class="grid gap-4 md:grid-cols-2">
          @for (g of service.groups(); track g.id) {
            <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div class="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                <div>
                  <p class="font-semibold text-gray-900">{{ g.name }}</p>
                  <p class="text-xs text-gray-500">Elige {{ g.min_select }}–{{ g.max_select }}</p>
                </div>
                <button (click)="openOptionForm(g)"
                  class="px-2 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors">
                  + Opción
                </button>
              </div>
              @if (g.options.length === 0) {
                <p class="px-4 py-3 text-sm text-gray-400">Sin opciones todavía</p>
              } @else {
                <ul class="divide-y divide-gray-50">
                  @for (o of g.options; track o.id) {
                    <li class="px-4 py-2 flex items-center justify-between text-sm" [class.opacity-50]="!o.active">
                      <span class="text-gray-800">
                        {{ o.name }}
                        @if (o.inventory_item_id) {
                          <span class="text-xs text-gray-400">· consume insumo</span>
                        }
                      </span>
                      <span class="text-gray-600">
                        @if (o.extra_price > 0) { +{{ o.extra_price | number:'1.2-2' }} } @else { — }
                      </span>
                    </li>
                  }
                </ul>
              }
            </div>
          }
        </div>
      }
    </div>

    <!-- Modals -->
    @if (showGroupForm()) {
      <app-option-group-form (close)="showGroupForm.set(false)" (saved)="showGroupForm.set(false)"></app-option-group-form>
    }
    @if (showOptionForm()) {
      <app-option-form [group]="selectedGroup()" (close)="showOptionForm.set(false)" (saved)="showOptionForm.set(false)"></app-option-form>
    }
  `,
})
export class OptionGroupsPageComponent implements OnInit {
  readonly service = inject(OptionGroupService);

  readonly showGroupForm = signal(false);
  readonly showOptionForm = signal(false);
  readonly selectedGroup = signal<OptionGroup | null>(null);

  async ngOnInit(): Promise<void> {
    await this.service.loadGroups();
  }

  openOptionForm(g: OptionGroup): void {
    this.selectedGroup.set(g);
    this.showOptionForm.set(true);
  }
}
