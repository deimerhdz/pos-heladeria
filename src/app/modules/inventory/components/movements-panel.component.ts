import { DatePipe } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { InventoryMovement, MovementType } from '../interfaces/inventory.interface';

@Component({
  selector: 'app-movements-panel',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div
      class="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4"
      (click)="closed.emit()"
    >
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col z-50" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 class="text-base font-bold text-gray-900">Movimientos de inventario</h2>
            <p class="text-xs text-gray-400 mt-0.5">{{ productName }}</p>
          </div>
          <button
            (click)="closed.emit()"
            class="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"
          >
            ✕
          </button>
        </div>

        <!-- Lista -->
        <div class="overflow-y-auto flex-1">
          @if (movements.length === 0) {
            <div class="px-6 py-12 text-center">
              <p class="text-3xl mb-3">📋</p>
              <p class="text-sm text-gray-400">Sin movimientos registrados</p>
            </div>
          } @else {
            <div class="divide-y divide-gray-50">
              @for (movement of movements; track movement.id) {
                <div class="px-6 py-3 flex items-center gap-3">
                  <!-- Tipo badge -->
                  <div
                    class="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
                    [class]="typeClass(movement.type)"
                  >
                    {{ typeIcon(movement.type) }}
                  </div>

                  <!-- Detalle -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="text-xs font-semibold uppercase tracking-wide" [class]="typeLabelClass(movement.type)">
                        {{ typeLabel(movement.type) }}
                      </span>
                      <span class="text-sm font-bold text-gray-800" [class]="movement.type === 'out' ? 'text-red-600' : 'text-green-700'">
                        {{ movement.type === 'out' ? '−' : '+' }}{{ movement.quantity }}
                      </span>
                    </div>
                    <p class="text-xs text-gray-500 truncate mt-0.5">{{ movement.reason }}</p>
                  </div>

                  <!-- Fecha -->
                  <p class="text-xs text-gray-400 shrink-0">{{ movement.created_at | date:'dd/MM HH:mm' }}</p>
                </div>
              }
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class MovementsPanelComponent {
  @Input({ required: true }) movements!: InventoryMovement[];
  @Input({ required: true }) productName!: string;
  @Output() closed = new EventEmitter<void>();

  typeIcon(type: MovementType): string {
    return type === 'in' ? '+' : type === 'out' ? '−' : '±';
  }

  typeClass(type: MovementType): string {
    const map: Record<MovementType, string> = {
      in: 'bg-green-100 text-green-700',
      out: 'bg-red-100 text-red-600',
      adjustment: 'bg-yellow-100 text-yellow-600',
    };
    return map[type];
  }

  typeLabelClass(type: MovementType): string {
    const map: Record<MovementType, string> = {
      in: 'text-green-600',
      out: 'text-red-500',
      adjustment: 'text-yellow-600',
    };
    return map[type];
  }

  typeLabel(type: MovementType): string {
    const map: Record<MovementType, string> = {
      in: 'Entrada',
      out: 'Salida',
      adjustment: 'Ajuste',
    };
    return map[type];
  }
}
