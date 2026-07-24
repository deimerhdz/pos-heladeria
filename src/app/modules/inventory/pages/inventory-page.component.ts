import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UnitMeasureService } from '../../../core/services/unit-measure.service';
import { SuppliersService } from '../../suppliers/services/suppliers.service';
import {
  InventoryItem,
  InventoryItemType,
  InventoryMovement,
  Purchase,
  PurchaseStatus,
} from '../interfaces/inventory.interface';
import { InventoryService } from '../services/inventory.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { InventoryItemFormComponent } from '../components/inventory-item-form.component';
import { StockAdjustModalComponent } from '../components/stock-adjust-modal.component';
import { PurchaseFormComponent } from '../components/purchase-form.component';

type Tab = 'items' | 'purchases' | 'movements';
type TypeFilter = '' | InventoryItemType;
type ActiveFilter = '' | 'active' | 'inactive';

@Component({
  selector: 'app-inventory-page',
  standalone: true,
  imports: [
    DecimalPipe,
    DatePipe,
    FormsModule,
    InventoryItemFormComponent,
    StockAdjustModalComponent,
    PurchaseFormComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-gray-900">Inventario</h1>
          <p class="text-sm text-gray-500 mt-0.5">Insumos, compras y movimientos de stock</p>
        </div>
        <div class="flex gap-2">
          @if (tab() === 'items') {
            <button (click)="openCreate()"
              class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
              Nuevo insumo
            </button>
          }
          @if (tab() === 'purchases') {
            <button (click)="showPurchase.set(true)"
              class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
              Nueva compra
            </button>
          }
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 border-b border-gray-200">
        <button (click)="setTab('items')" class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
          [class]="tab() === 'items' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'">
          Insumos
        </button>
        <button (click)="setTab('purchases')" class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
          [class]="tab() === 'purchases' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'">
          Compras
        </button>
        <button (click)="setTab('movements')" class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
          [class]="tab() === 'movements' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'">
          Movimientos
        </button>
      </div>

      @if (service.error()) {
        <p class="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-2">{{ service.error() }}</p>
      }

      <!-- ============ TAB: INSUMOS ============ -->
      @if (tab() === 'items') {
        <!-- Alert -->
        <button type="button" (click)="toggleLowFilter()"
          class="text-left rounded-xl border p-4 transition-colors max-w-xs w-full"
          [class]="onlyLow()
            ? 'bg-amber-100 border-amber-300'
            : 'bg-amber-50 border-amber-100 hover:bg-amber-100'">
          <p class="text-xs text-amber-700 font-medium uppercase tracking-wide">Bajo mínimo</p>
          <p class="text-2xl font-bold text-amber-800 mt-1">{{ service.lowStockItems().length }}</p>
        </button>

        <!-- Filters -->
        <div class="bg-white rounded-xl border border-gray-100 p-4 flex flex-wrap gap-3">
          <input [ngModel]="searchSignal()" (ngModelChange)="searchSignal.set($event)" type="text"
            placeholder="Buscar por nombre..."
            class="flex-1 min-w-48 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <select [ngModel]="typeFilter()" (ngModelChange)="typeFilter.set($event)"
            class="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Todos los tipos</option>
            <option value="raw_material">Materia prima</option>
            <option value="packaged">Empacado</option>
          </select>
          <select [ngModel]="activeFilter()" (ngModelChange)="activeFilter.set($event)"
            class="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Activos e inactivos</option>
            <option value="active">Solo activos</option>
            <option value="inactive">Solo inactivos</option>
          </select>
        </div>

        <!-- Table -->
        <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
          @if (service.isLoading()) {
            <div class="flex items-center justify-center py-12"><p class="text-sm text-gray-400">Cargando insumos...</p></div>
          } @else if (filteredItems().length === 0) {
            <div class="flex flex-col items-center justify-center py-12"><p class="text-sm text-gray-400">No se encontraron insumos</p></div>
          } @else {
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-gray-100 bg-gray-50">
                    <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</th>
                    <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                    <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Unidad</th>
                    <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stock</th>
                    <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Mínimo</th>
                    <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Costo</th>
                    <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                    <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Acciones</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                  @for (i of filteredItems(); track i.id) {
                    <tr class="hover:bg-gray-50 transition-colors" [class.opacity-50]="!i.active">
                      <td class="px-4 py-3"><p class="font-medium text-gray-900">{{ i.name }}</p></td>
                      <td class="px-4 py-3 text-gray-600">{{ typeLabel(i.type) }}</td>
                      <td class="px-4 py-3 text-gray-600">{{ unitAbbr(i.unit_measure_id) }}</td>
                      <td class="px-4 py-3 text-right font-semibold" [class]="isLow(i) ? 'text-amber-600' : 'text-gray-900'">
                        {{ i.current_stock | number:'1.0-3' }}
                      </td>
                      <td class="px-4 py-3 text-right text-gray-500">{{ i.min_stock | number:'1.0-3' }}</td>
                      <td class="px-4 py-3 text-right text-gray-500">{{ i.unit_cost | number:'1.2-2' }}</td>
                      <td class="px-4 py-3">
                        @if (isLow(i)) {
                          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Bajo mínimo</span>
                        } @else {
                          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">OK</span>
                        }
                      </td>
                      <td class="px-4 py-3">
                        <div class="flex items-center justify-end gap-1">
                          <button (click)="openAdjust(i)"
                            class="px-2 py-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors">Ajustar</button>
                          <button (click)="openKardex(i)"
                            class="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">Kardex</button>
                          <button (click)="openEdit(i)"
                            class="px-2 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors">Editar</button>
                          <button (click)="service.toggleActive(i.id, i.active)"
                            class="px-2 py-1 text-xs font-medium rounded-lg transition-colors"
                            [class]="i.active ? 'text-gray-600 bg-gray-100 hover:bg-gray-200' : 'text-green-700 bg-green-50 hover:bg-green-100'">
                            {{ i.active ? 'Desactivar' : 'Activar' }}
                          </button>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      }

      <!-- ============ TAB: COMPRAS ============ -->
      @if (tab() === 'purchases') {
        <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
          @if (service.isLoading()) {
            <div class="flex items-center justify-center py-12"><p class="text-sm text-gray-400">Cargando compras...</p></div>
          } @else if (service.purchases().length === 0) {
            <div class="flex flex-col items-center justify-center py-12"><p class="text-sm text-gray-400">Aún no hay compras registradas</p></div>
          } @else {
            <div class="divide-y divide-gray-50">
              @for (p of service.purchases(); track p.id) {
                <div class="px-4 py-3">
                  <div class="w-full flex items-center justify-between gap-3">
                    <button type="button" (click)="toggleExpanded(p.id)" class="flex-1 text-left">
                      <p class="font-medium text-gray-900">{{ supplierName(p.supplier_id) }}</p>
                      <p class="text-xs text-gray-500">
                        {{ p.purchased_at | date:'short' }}
                        @if (p.invoice_number) { · Factura {{ p.invoice_number }} }
                        · {{ p.items.length }} ítem(s)
                      </p>
                    </button>
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" [class]="purchaseChip(p.status)">
                      {{ purchaseLabel(p.status) }}
                    </span>
                    @if (p.status !== 'received') {
                      <button type="button" (click)="openReceive(p)"
                        class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold">Recibir</button>
                    }
                    <span class="text-sm font-bold text-gray-900 w-20 text-right">{{ p.total | number:'1.2-2' }}</span>
                  </div>
                  @if (expandedId() === p.id) {
                    <div class="mt-3 rounded-lg bg-gray-50 border border-gray-100 overflow-hidden">
                      <table class="w-full text-xs">
                        <thead>
                          <tr class="text-gray-400">
                            <th class="text-left px-3 py-2 font-semibold">Insumo</th>
                            <th class="text-right px-3 py-2 font-semibold">Cantidad</th>
                            <th class="text-right px-3 py-2 font-semibold">Costo unit.</th>
                            <th class="text-right px-3 py-2 font-semibold">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                          @for (it of p.items; track it.id) {
                            <tr>
                              <td class="px-3 py-2 text-gray-700">{{ itemName(it.inventory_item_id) }}</td>
                              <td class="px-3 py-2 text-right text-gray-600">{{ it.quantity | number:'1.0-3' }}</td>
                              <td class="px-3 py-2 text-right text-gray-600">{{ it.unit_cost | number:'1.2-2' }}</td>
                              <td class="px-3 py-2 text-right text-gray-700">{{ (it.quantity * it.unit_cost) | number:'1.2-2' }}</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- ============ TAB: MOVIMIENTOS ============ -->
      @if (tab() === 'movements') {
        <div class="bg-white rounded-xl border border-gray-100 p-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">Insumo</label>
          <select [ngModel]="movementItemId()" (ngModelChange)="onMovementItemChange($event)"
            class="w-full max-w-md px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Seleccionar insumo...</option>
            @for (i of service.items(); track i.id) {
              <option [value]="i.id">{{ i.name }}</option>
            }
          </select>
        </div>

        <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
          @if (!movementItemId()) {
            <div class="flex items-center justify-center py-12"><p class="text-sm text-gray-400">Selecciona un insumo para ver su kardex</p></div>
          } @else if (movementsLoading()) {
            <div class="flex items-center justify-center py-12"><p class="text-sm text-gray-400">Cargando movimientos...</p></div>
          } @else if (movements().length === 0) {
            <div class="flex items-center justify-center py-12"><p class="text-sm text-gray-400">Sin movimientos para este insumo</p></div>
          } @else {
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-gray-100 bg-gray-50">
                    <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fecha</th>
                    <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                    <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cantidad</th>
                    <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Motivo</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                  @for (m of movements(); track m.id) {
                    <tr class="hover:bg-gray-50 transition-colors">
                      <td class="px-4 py-3 text-gray-600">{{ m.moved_at | date:'short' }}</td>
                      <td class="px-4 py-3 text-gray-600">{{ m.type }}</td>
                      <td class="px-4 py-3 text-right font-semibold" [class]="m.quantity < 0 ? 'text-red-600' : 'text-green-600'">
                        {{ m.quantity | number:'1.0-3' }}
                      </td>
                      <td class="px-4 py-3 text-gray-500">{{ m.reason || '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      }
    </div>

    <!-- Modals -->
    @if (showForm()) {
      <app-inventory-item-form [item]="selectedItem()" (close)="showForm.set(false)" (saved)="showForm.set(false)"></app-inventory-item-form>
    }
    @if (showAdjust()) {
      <app-stock-adjust-modal [item]="selectedItem()" (close)="showAdjust.set(false)" (saved)="onAdjusted()"></app-stock-adjust-modal>
    }
    @if (showPurchase()) {
      <app-purchase-form (close)="showPurchase.set(false)" (saved)="showPurchase.set(false)"></app-purchase-form>
    }

    <!-- Modal recepción de orden de compra (RF-022) -->
    @if (receivePurchase(); as rp) {
      <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
          <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-base font-bold text-gray-900">Recibir compra</h2>
            <button type="button" (click)="receivePurchase.set(null)" class="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <div class="p-6 space-y-3 overflow-y-auto">
            <p class="text-sm text-gray-500">Indica cuánto recibes ahora de cada ítem. Puedes recibir parcialmente.</p>
            @for (row of receiveRows(); track row.purchase_item_id) {
              <div class="flex items-center gap-3">
                <div class="flex-1">
                  <p class="text-sm font-medium text-gray-800">{{ itemName(row.inventory_item_id) }}</p>
                  <p class="text-xs text-gray-400">Pendiente: {{ row.pending | number:'1.0-3' }} de {{ row.quantity | number:'1.0-3' }}</p>
                </div>
                <input type="number" min="0" [max]="row.pending" [(ngModel)]="row.receive"
                  class="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
              </div>
            }
            @if (service.error()) {
              <div class="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">{{ service.error() }}</div>
            }
          </div>
          <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
            <button type="button" (click)="receivePurchase.set(null)" class="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
            <button type="button" (click)="submitReceive(rp.id)" [disabled]="service.isSubmitting()"
              class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold">
              {{ service.isSubmitting() ? 'Recibiendo…' : 'Confirmar recepción' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class InventoryPageComponent implements OnInit {
  readonly service = inject(InventoryService);
  readonly unitMeasureService = inject(UnitMeasureService);
  readonly suppliersService = inject(SuppliersService);
  private readonly toast = inject(ToastService);

  readonly tab = signal<Tab>('items');

  readonly searchSignal = signal('');
  readonly typeFilter = signal<TypeFilter>('');
  readonly activeFilter = signal<ActiveFilter>('');
  readonly onlyLow = signal(false);

  readonly showForm = signal(false);
  readonly showAdjust = signal(false);
  readonly showPurchase = signal(false);
  readonly selectedItem = signal<InventoryItem | null>(null);

  readonly expandedId = signal<string | null>(null);

  // Recepción de compra (RF-022)
  readonly receivePurchase = signal<Purchase | null>(null);
  readonly receiveRows = signal<{ purchase_item_id: string; inventory_item_id: string; quantity: number; pending: number; receive: number }[]>([]);

  readonly movementItemId = signal('');
  readonly movements = signal<InventoryMovement[]>([]);
  readonly movementsLoading = signal(false);

  private readonly unitMap = computed(
    () => new Map(this.unitMeasureService.unitMeasures().map(u => [u.id, u.abbreviation]))
  );
  private readonly itemMap = computed(
    () => new Map(this.service.items().map(i => [i.id, i.name]))
  );
  private readonly supplierMap = computed(
    () => new Map(this.suppliersService.suppliers().map(s => [s.id, s.name]))
  );

  readonly filteredItems = computed(() => {
    const q = this.searchSignal().toLowerCase().trim();
    const type = this.typeFilter();
    const active = this.activeFilter();
    const low = this.onlyLow();

    return this.service.items().filter(i => {
      if (q && !i.name.toLowerCase().includes(q)) return false;
      if (type && i.type !== type) return false;
      if (active === 'active' && !i.active) return false;
      if (active === 'inactive' && i.active) return false;
      if (low && !(i.active && i.current_stock <= i.min_stock)) return false;
      return true;
    });
  });

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.service.loadItems(),
      this.unitMeasureService.loadUnitMeasures(),
      this.suppliersService.loadSuppliers(),
    ]);
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
    if (tab === 'purchases' && this.service.purchases().length === 0) {
      this.service.loadPurchases();
    }
  }

  // --- helpers ---
  unitAbbr(id: string): string {
    return this.unitMap().get(id) ?? '—';
  }
  itemName(id: string): string {
    return this.itemMap().get(id) ?? '—';
  }
  supplierName(id: string | null): string {
    if (!id) return 'Sin proveedor';
    return this.supplierMap().get(id) ?? 'Proveedor';
  }
  typeLabel(type: InventoryItemType): string {
    return type === 'packaged' ? 'Empacado' : 'Materia prima';
  }
  isLow(i: InventoryItem): boolean {
    return i.active && i.current_stock <= i.min_stock;
  }

  toggleLowFilter(): void {
    this.onlyLow.update(v => !v);
  }
  toggleExpanded(id: string): void {
    this.expandedId.update(current => (current === id ? null : id));
  }

  // --- recepción de compra (RF-022) ---
  purchaseLabel(s: PurchaseStatus): string {
    return { draft: 'Orden', partial: 'Parcial', received: 'Recibida' }[s];
  }
  purchaseChip(s: PurchaseStatus): string {
    return {
      draft: 'bg-gray-100 text-gray-600',
      partial: 'bg-amber-100 text-amber-700',
      received: 'bg-emerald-100 text-emerald-700',
    }[s];
  }
  openReceive(p: Purchase): void {
    this.receiveRows.set(
      p.items.map(it => {
        const pending = it.quantity - it.received_quantity;
        return {
          purchase_item_id: it.id,
          inventory_item_id: it.inventory_item_id,
          quantity: it.quantity,
          pending,
          receive: pending,
        };
      }),
    );
    this.service.error.set(null);
    this.receivePurchase.set(p);
  }
  async submitReceive(purchaseId: string): Promise<void> {
    const items = this.receiveRows()
      .filter(r => Number(r.receive) > 0)
      .map(r => ({ purchase_item_id: r.purchase_item_id, quantity: Number(r.receive) }));
    if (items.length === 0) {
      this.toast.info('Indica al menos una cantidad a recibir');
      return;
    }
    const ok = await this.service.receivePurchase(purchaseId, items);
    if (ok) {
      this.toast.success('Recepción registrada');
      this.receivePurchase.set(null);
    } else {
      this.toast.error(this.service.error() ?? 'No se pudo recibir la compra');
    }
  }

  // --- items ---
  openCreate(): void {
    this.selectedItem.set(null);
    this.showForm.set(true);
  }
  openEdit(i: InventoryItem): void {
    this.selectedItem.set(i);
    this.showForm.set(true);
  }
  openAdjust(i: InventoryItem): void {
    this.selectedItem.set(i);
    this.showAdjust.set(true);
  }
  openKardex(i: InventoryItem): void {
    this.tab.set('movements');
    this.onMovementItemChange(i.id);
  }

  onAdjusted(): void {
    this.showAdjust.set(false);
    // Refresh the kardex if we're viewing this item's movements.
    if (this.movementItemId()) this.onMovementItemChange(this.movementItemId());
  }

  // --- movements ---
  async onMovementItemChange(itemId: string): Promise<void> {
    this.movementItemId.set(itemId);
    if (!itemId) {
      this.movements.set([]);
      return;
    }
    this.movementsLoading.set(true);
    const data = await this.service.loadMovements(itemId);
    this.movements.set(data);
    this.movementsLoading.set(false);
  }
}
