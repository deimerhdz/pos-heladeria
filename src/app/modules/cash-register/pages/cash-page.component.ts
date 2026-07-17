import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CashService } from '../services/cash.service';
import { CashMovementType } from '../interfaces/cash.interface';

@Component({
  selector: 'app-cash-page',
  standalone: true,
  imports: [DecimalPipe, DatePipe],
  template: `
    <div class="space-y-6 max-w-3xl">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Caja</h1>
        <p class="text-gray-500 text-sm mt-1">Turno de caja, movimientos y arqueo</p>
      </div>

      @if (cash.error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{{ cash.error() }}</div>
      }

      <!-- ═══ SIN TURNO: abrir ═══ -->
      @if (!cash.shift()) {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 class="text-lg font-semibold text-gray-900">Abrir turno</h2>

          @if (cash.registers().length === 0) {
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
              <p class="text-sm text-amber-800">No hay cajas registradas. Crea una para empezar.</p>
              <div class="flex gap-2">
                <input
                  type="text"
                  [value]="newRegisterName()"
                  (input)="newRegisterName.set($any($event.target).value)"
                  placeholder="Nombre de la caja (ej: Caja 1)"
                  class="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <button
                  (click)="createRegister()"
                  [disabled]="cash.isSubmitting() || !newRegisterName().trim()"
                  class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  Crear caja
                </button>
              </div>
            </div>
          } @else {
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Caja</label>
              <select
                [value]="selectedRegisterId()"
                (change)="selectedRegisterId.set($any($event.target).value)"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="">Selecciona una caja…</option>
                @for (r of cash.registers(); track r.id) {
                  <option [value]="r.id">{{ r.name }}</option>
                }
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Monto inicial (base)</label>
              <input
                type="number"
                min="0"
                [value]="openingAmount()"
                (input)="openingAmount.set($any($event.target).value)"
                placeholder="0"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            <button
              (click)="openShift()"
              [disabled]="cash.isSubmitting() || !selectedRegisterId()"
              class="w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {{ cash.isSubmitting() ? 'Abriendo…' : 'Abrir turno' }}
            </button>
          }
        </div>
      }

      <!-- ═══ TURNO ABIERTO ═══ -->
      @if (cash.shift() && cash.isOpen()) {
        <!-- Cabecera del turno -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-gray-900">{{ registerName() }}</p>
            <p class="text-xs text-gray-400">
              Abierto {{ cash.shift()!.opened_at | date: 'dd/MM HH:mm' }} · Base $ {{ +cash.shift()!.opening_amount | number: '1.2-2' }}
            </p>
          </div>
          <span class="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">Abierto</span>
        </div>

        <!-- Arqueo en vivo -->
        @if (cash.reconciliation(); as rec) {
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div class="bg-white rounded-xl border border-gray-100 p-4">
              <p class="text-xs text-gray-400">Base</p>
              <p class="text-lg font-bold text-gray-900">$ {{ +rec.opening_amount | number: '1.2-2' }}</p>
            </div>
            <div class="bg-white rounded-xl border border-gray-100 p-4">
              <p class="text-xs text-gray-400">Ventas efectivo</p>
              <p class="text-lg font-bold text-gray-900">$ {{ +rec.cash_sales | number: '1.2-2' }}</p>
            </div>
            <div class="bg-white rounded-xl border border-gray-100 p-4">
              <p class="text-xs text-gray-400">Entradas</p>
              <p class="text-lg font-bold text-green-600">$ {{ +rec.cash_in | number: '1.2-2' }}</p>
            </div>
            <div class="bg-white rounded-xl border border-gray-100 p-4">
              <p class="text-xs text-gray-400">Salidas</p>
              <p class="text-lg font-bold text-red-600">$ {{ +rec.cash_out | number: '1.2-2' }}</p>
            </div>
            <div class="bg-indigo-600 rounded-xl p-4 col-span-2 md:col-span-1">
              <p class="text-xs text-indigo-100">Esperado en caja</p>
              <p class="text-lg font-bold text-white">$ {{ +rec.expected | number: '1.2-2' }}</p>
            </div>
          </div>
        }

        <!-- Movimientos -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
          <h2 class="text-base font-semibold text-gray-900">Registrar movimiento</h2>
          <div class="flex gap-2">
            <button
              (click)="movementType.set('in')"
              class="flex-1 py-2 rounded-lg text-sm font-medium border transition-colors"
              [class]="movementType() === 'in' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600'"
            >
              ↓ Entrada
            </button>
            <button
              (click)="movementType.set('out')"
              class="flex-1 py-2 rounded-lg text-sm font-medium border transition-colors"
              [class]="movementType() === 'out' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600'"
            >
              ↑ Salida
            </button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="number" min="0"
              [value]="movementAmount()"
              (input)="movementAmount.set($any($event.target).value)"
              placeholder="Monto"
              class="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <input
              type="text"
              [value]="movementDescription()"
              (input)="movementDescription.set($any($event.target).value)"
              placeholder="Descripción"
              class="sm:col-span-2 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <button
            (click)="addMovement()"
            [disabled]="cash.isSubmitting() || !canAddMovement()"
            class="w-full py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            Registrar {{ movementType() === 'in' ? 'entrada' : 'salida' }}
          </button>

          @if (cash.movements().length > 0) {
            <div class="divide-y divide-gray-50 pt-2">
              @for (m of cash.movements(); track m.id) {
                <div class="flex items-center justify-between py-2 text-sm">
                  <div class="min-w-0">
                    <span class="font-medium" [class]="m.type === 'in' ? 'text-green-600' : 'text-red-600'">
                      {{ m.type === 'in' ? '↓' : '↑' }} {{ m.description }}
                    </span>
                    <span class="text-xs text-gray-400 ml-2">{{ m.occurred_at | date: 'HH:mm' }}</span>
                  </div>
                  <span class="font-semibold shrink-0" [class]="m.type === 'in' ? 'text-green-600' : 'text-red-600'">
                    {{ m.type === 'in' ? '+' : '−' }} $ {{ +m.amount | number: '1.2-2' }}
                  </span>
                </div>
              }
            </div>
          }
        </div>

        <!-- Cerrar turno (arqueo) -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
          <h2 class="text-base font-semibold text-gray-900">Cerrar turno (arqueo)</h2>
          <label class="block text-sm font-medium text-gray-700">Efectivo contado en caja</label>
          <input
            type="number" min="0"
            [value]="countedAmount()"
            (input)="countedAmount.set($any($event.target).value)"
            placeholder="0"
            class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            (click)="closeShift()"
            [disabled]="cash.isSubmitting() || countedAmount() === ''"
            class="w-full py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {{ cash.isSubmitting() ? 'Cerrando…' : 'Cerrar turno' }}
          </button>
        </div>
      }

      <!-- ═══ TURNO CERRADO: resumen ═══ -->
      @if (cash.shift() && !cash.isOpen()) {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4 text-center">
          <div class="text-4xl">✅</div>
          <h2 class="text-lg font-semibold text-gray-900">Turno cerrado</h2>
          @if (cash.reconciliation(); as rec) {
            <div class="space-y-2 text-left max-w-xs mx-auto">
              <div class="flex justify-between text-sm"><span class="text-gray-500">Esperado</span><span class="font-semibold">$ {{ +rec.expected | number: '1.2-2' }}</span></div>
              <div class="flex justify-between text-sm"><span class="text-gray-500">Contado</span><span class="font-semibold">$ {{ +(rec.counted_amount ?? '0') | number: '1.2-2' }}</span></div>
              <div class="flex justify-between text-sm border-t border-gray-100 pt-2">
                <span class="text-gray-700 font-medium">Diferencia</span>
                <span class="font-bold" [class]="differenceClass(rec.difference)">$ {{ +(rec.difference ?? '0') | number: '1.2-2' }}</span>
              </div>
            </div>
          }
          <button
            (click)="cash.reset()"
            class="w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
          >
            Nuevo turno
          </button>
        </div>
      }
    </div>
  `,
})
export class CashPageComponent implements OnInit {
  readonly cash = inject(CashService);

  readonly selectedRegisterId = signal('');
  readonly openingAmount = signal<string>('');
  readonly newRegisterName = signal('');

  readonly movementType = signal<CashMovementType>('in');
  readonly movementAmount = signal<string>('');
  readonly movementDescription = signal('');

  readonly countedAmount = signal<string>('');

  readonly registerName = computed(() => {
    const s = this.cash.shift();
    if (!s) return '';
    return this.cash.registers().find((r) => r.id === s.cash_register_id)?.name ?? 'Caja';
  });

  async ngOnInit(): Promise<void> {
    await this.cash.loadRegisters();
    await this.cash.restoreShift();
  }

  canAddMovement(): boolean {
    return Number(this.movementAmount()) > 0 && this.movementDescription().trim().length > 0;
  }

  async createRegister(): Promise<void> {
    const name = this.newRegisterName().trim();
    if (!name) return;
    await this.cash.createRegister(name);
    this.newRegisterName.set('');
  }

  async openShift(): Promise<void> {
    const ok = await this.cash.openShift(this.selectedRegisterId(), Number(this.openingAmount()) || 0);
    if (ok) {
      this.openingAmount.set('');
      this.selectedRegisterId.set('');
    }
  }

  async addMovement(): Promise<void> {
    if (!this.canAddMovement()) return;
    const ok = await this.cash.addMovement(
      this.movementType(),
      Number(this.movementAmount()),
      this.movementDescription().trim(),
    );
    if (ok) {
      this.movementAmount.set('');
      this.movementDescription.set('');
    }
  }

  async closeShift(): Promise<void> {
    if (this.countedAmount() === '') return;
    await this.cash.closeShift(Number(this.countedAmount()) || 0);
    this.countedAmount.set('');
  }

  differenceClass(difference?: string | null): string {
    const d = Number(difference ?? 0);
    if (d === 0) return 'text-gray-900';
    return d > 0 ? 'text-green-600' : 'text-red-600';
  }
}
