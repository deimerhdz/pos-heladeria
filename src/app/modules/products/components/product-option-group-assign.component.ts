import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OptionGroupService } from '../../option-groups/services/option-group.service';
import { ProductOptionGroupPayload } from '../interfaces/product.interface';
import { ProductService } from '../services/product.service';

@Component({
  selector: 'app-product-option-group-assign',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 class="text-base font-bold text-gray-900">Asignar grupo de opciones</h2>
          <button type="button" (click)="close.emit()" class="text-gray-400 hover:text-gray-600 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div class="p-6 space-y-4">
          @if (groupService.groups().length === 0) {
            <p class="text-sm text-gray-400">
              No hay grupos de opciones. Créalos primero en "Grupos de opciones".
            </p>
          } @else {
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Grupo *</label>
              <select [ngModel]="groupId()" (ngModelChange)="onGroupChange($event)"
                class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Seleccionar grupo...</option>
                @for (g of groupService.groups(); track g.id) {
                  <option [value]="g.id">{{ g.name }} ({{ g.min_select }}–{{ g.max_select }})</option>
                }
              </select>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Mínimo</label>
                <input [ngModel]="minSelect()" (ngModelChange)="minSelect.set($event)" type="number" min="0" step="1"
                  class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Máximo</label>
                <input [ngModel]="maxSelect()" (ngModelChange)="maxSelect.set($event)" type="number" min="1" step="1"
                  class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
            </div>
            <p class="text-xs text-gray-400">Ajusta el mínimo/máximo para este producto (por defecto los del grupo).</p>
          }

          @if (service.error()) {
            <p class="text-red-600 text-sm">{{ service.error() }}</p>
          }

          <div class="flex gap-3 pt-2">
            <button type="button" (click)="close.emit()"
              class="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="button" (click)="onSubmit()" [disabled]="!groupId() || service.isSubmitting()"
              class="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors">
              {{ service.isSubmitting() ? 'Asignando...' : 'Asignar' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ProductOptionGroupAssignComponent implements OnInit {
  @Input({ required: true }) productId!: string;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  readonly service = inject(ProductService);
  readonly groupService = inject(OptionGroupService);

  readonly groupId = signal('');
  readonly minSelect = signal(0);
  readonly maxSelect = signal(1);

  ngOnInit(): void {
    if (this.groupService.groups().length === 0) this.groupService.loadGroups();
  }

  onGroupChange(id: string): void {
    this.groupId.set(id);
    const group = this.groupService.groups().find((g) => g.id === id);
    if (group) {
      this.minSelect.set(group.min_select);
      this.maxSelect.set(group.max_select);
    }
  }

  async onSubmit(): Promise<void> {
    if (!this.groupId()) return;
    const payload: ProductOptionGroupPayload = {
      option_group_id: this.groupId(),
      min_select: Number(this.minSelect()),
      max_select: Number(this.maxSelect()),
    };
    const ok = await this.service.assignOptionGroup(this.productId, payload);
    if (ok) {
      this.saved.emit();
      this.close.emit();
    }
  }
}
