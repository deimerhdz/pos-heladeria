import { Injectable, computed, inject, signal } from '@angular/core';
import {
  MenuCategory,
  MenuOption,
  MenuProduct,
  MenuVariant,
} from '../../products/interfaces/product.interface';
import { PaymentMethod } from '../../sales/interfaces/sales.interface';
import { MenuService } from '../../menu/services/menu.service';
import { PaymentMethodService } from '../../sales/services/payment-method.service';
import { CashService } from '../../cash-register/services/cash.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { ConfirmService } from '../../../shared/feedback/confirm.service';
import { Table, TableStatus } from '../interfaces/table.interface';
import { DiningOrder, DiningOrderItem, PaymentLine } from '../interfaces/dining.interface';
import { ProductSelection } from '../components/product-select.component';
import { buildMenuLookup, MenuLookup } from './menu-lookup';
import { TableService } from './table.service';
import { DiningSessionService } from './dining-session.service';

/** Una línea de pedido nueva sin guardar (draft del staff). */
interface DraftLine {
  key: string;
  product: MenuProduct;
  variant: MenuVariant;
  options: MenuOption[];
  quantity: number;
  notes: string | null;
  unitPrice: number;
}

/** Estado de mesa derivado para la vista. */
type TableDisplayStatus = 'libre' | 'en_preparacion' | 'listo' | 'pago_pendiente' | 'ocupada';

type TableFilter = 'todas' | 'libres' | 'ocupadas' | 'pendientes';

const STATUS_META: Record<TableDisplayStatus, { label: string; chip: string }> = {
  libre: { label: 'Libre', chip: 'bg-gray-100 text-gray-600' },
  en_preparacion: { label: 'En preparación', chip: 'bg-amber-100 text-amber-700' },
  listo: { label: 'Listo', chip: 'bg-green-100 text-green-700' },
  pago_pendiente: { label: 'Pago pendiente', chip: 'bg-indigo-600 text-white' },
  ocupada: { label: 'Ocupada', chip: 'bg-blue-100 text-blue-700' },
};

const NOT_READY: DiningOrderItem['estado_cocina'][] = ['pendiente', 'en_preparacion'];

/**
 * Store de la terminal POS de mesas (staff). Orquesta el catálogo, el armado del
 * pedido (draft + ítems persistidos), y el cobro por el ciclo de comedor
 * (`block → pay`). Se provee a nivel de la página.
 */
@Injectable()
export class PosTerminalStore {
  private readonly tableService = inject(TableService);
  private readonly api = inject(DiningSessionService);
  private readonly menuService = inject(MenuService);
  private readonly paymentMethodService = inject(PaymentMethodService);
  private readonly cash = inject(CashService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  // ─── Estado ────────────────────────────────────────────────────────────────
  readonly orders = signal<DiningOrder[]>([]);
  readonly selectedTableId = signal<string | null>(null);
  readonly selectedOrderId = signal<string | null>(null);
  readonly draftLines = signal<DraftLine[]>([]);
  readonly customerName = signal('');

  readonly search = signal('');
  readonly filter = signal<TableFilter>('todas');

  // Catálogo
  readonly catalogOpen = signal(false);
  readonly catalogCategoryId = signal<string | null>(null);
  readonly configuringProduct = signal<MenuProduct | null>(null);

  // Descuento
  readonly discountPanelOpen = signal(false);
  readonly discountType = signal<'percent' | 'fixed'>('percent');
  readonly discountValue = signal('');
  readonly discountReason = signal('');
  readonly appliedDiscount = signal<{ type: 'percent' | 'fixed'; value: number } | null>(null);
  readonly tax = signal(0);

  // Pago
  readonly paymentMethod = signal<string>(''); // id de método | 'mixto'
  readonly cashReceived = signal('');
  readonly mixedLines = signal<{ payment_method_id: string; amount: string }[]>([]);

  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  readonly successOpen = signal(false);
  readonly lastSale = signal<{ total: number; customer: string } | null>(null);

  private readonly nowTick = signal(Date.now());
  private timer?: ReturnType<typeof setInterval>;

  // ─── Derivados ───────────────────────────────────────────────────────────────
  readonly tables = this.tableService.tables;
  readonly paymentMethods = this.paymentMethodService.methods;
  readonly categories = this.menuService.categories;

  private readonly lookup = computed<MenuLookup>(() => buildMenuLookup(this.menuService.categories()));

  /** Órdenes activas (no pagadas/canceladas) por mesa. */
  private readonly activeOrders = computed(() =>
    this.orders().filter((o) => o.status !== 'pagada' && o.status !== 'cancelada'),
  );

  private ordersOfTable(tableId: string): DiningOrder[] {
    return this.activeOrders().filter((o) => o.dining_table_id === tableId);
  }

  readonly selectedTable = computed<Table | null>(
    () => this.tables().find((t) => t.id === this.selectedTableId()) ?? null,
  );

  readonly selectedOrder = computed<DiningOrder | null>(
    () => this.orders().find((o) => o.id === this.selectedOrderId()) ?? null,
  );

  readonly hasActiveOrder = computed(() => !!this.selectedTableId());

  /** Pestañas de pedido (cuando la mesa tiene >1 orden activa). */
  readonly orderTabs = computed(() => {
    const t = this.selectedTableId();
    if (!t) return [];
    const list = this.ordersOfTable(t);
    return list.length > 1
      ? list.map((o) => ({ id: o.id, label: o.customer_name || 'Pedido' }))
      : [];
  });

  readonly tablesView = computed(() => {
    this.nowTick();
    const term = this.search().trim();
    const f = this.filter();
    return this.tables()
      .filter((t) => {
        const list = this.ordersOfTable(t.id);
        const status = this.deriveStatus(list);
        if (f === 'libres' && list.length > 0) return false;
        if (f === 'ocupadas' && list.length === 0) return false;
        if (f === 'pendientes' && status !== 'listo' && status !== 'pago_pendiente') return false;
        if (term && !String(t.number).includes(term)) return false;
        return true;
      })
      .map((t) => {
        const list = this.ordersOfTable(t.id);
        const status = this.deriveStatus(list);
        const meta = STATUS_META[status];
        const items = list.reduce(
          (n, o) => n + (o.items ?? []).filter((i) => i.estado_cocina !== 'anulado').reduce((x, i) => x + i.quantity, 0),
          0,
        );
        const subtotal = list.reduce((s, o) => s + this.orderSubtotal(o), 0);
        const oldest = list.length
          ? Math.min(...list.map((o) => new Date(o.created_at).getTime()))
          : null;
        return {
          id: t.id,
          number: t.number,
          name: t.name,
          statusLabel: meta.label,
          chipClass: meta.chip,
          itemsLabel: `${items} ${items === 1 ? 'producto' : 'productos'}`,
          elapsedLabel: this.elapsedLabel(oldest),
          totalLabel: this.fmt(subtotal),
          ordersCount: list.length,
          selected: t.id === this.selectedTableId(),
        };
      });
  });

  readonly noTablesFound = computed(() => this.tablesView().length === 0);

  /** Líneas del carrito: ítems persistidos de la orden + draft nuevo. */
  readonly cartView = computed(() => {
    const lk = this.lookup();
    const order = this.selectedOrder();
    const persisted = (order?.items ?? [])
      .filter((i) => i.estado_cocina !== 'anulado')
      .map((i) => ({
        kind: 'persisted' as const,
        key: i.id,
        qty: i.quantity,
        name: lk.variantLabel(i.product_variant_id),
        bullets: [
          ...(i.options ?? []).map((o) => lk.optionLabel(o.option_id)).filter(Boolean),
          ...(i.notes ? [i.notes] : []),
        ],
        unitPrice: Number(i.unit_price),
        subtotal: Number(i.unit_price) * i.quantity,
        ready: !NOT_READY.includes(i.estado_cocina),
      }));
    const draft = this.draftLines().map((l) => ({
      kind: 'draft' as const,
      key: l.key,
      qty: l.quantity,
      name: l.product.name,
      bullets: [...l.options.map((o) => o.name), ...(l.notes ? [l.notes] : [])],
      unitPrice: l.unitPrice,
      subtotal: l.unitPrice * l.quantity,
      ready: true,
    }));
    return [...persisted, ...draft];
  });

  readonly cartEmpty = computed(() => this.cartView().length === 0);
  readonly hasDraft = computed(() => this.draftLines().length > 0);

  readonly subtotal = computed(() => this.cartView().reduce((s, i) => s + i.subtotal, 0));

  readonly totals = computed(() => {
    const subtotal = this.subtotal();
    const d = this.appliedDiscount();
    let discount = 0;
    if (d) {
      discount = d.type === 'percent' ? (subtotal * d.value) / 100 : d.value;
      discount = Math.max(0, Math.min(subtotal, discount));
    }
    const tax = Math.max(0, Number(this.tax()) || 0);
    const total = Math.max(0, Math.round(subtotal - discount + tax));
    return { subtotal, discount, tax, total };
  });

  /** ¿Todos los ítems persistidos están listos para cobrar? */
  readonly kitchenReady = computed(() => {
    const order = this.selectedOrder();
    const items = (order?.items ?? []).filter((i) => i.estado_cocina !== 'anulado');
    return items.length > 0 && items.every((i) => !NOT_READY.includes(i.estado_cocina));
  });

  readonly selectedMethodIsCash = computed(() => {
    const m = this.paymentMethods().find((x) => x.id === this.paymentMethod());
    return !!m?.is_cash;
  });

  readonly change = computed(() =>
    Math.max(0, (Number(this.cashReceived()) || 0) - this.totals().total),
  );

  readonly mixedReceived = computed(() =>
    this.mixedLines().reduce((s, l) => s + (Number(l.amount) || 0), 0),
  );

  readonly chargeDisabled = computed(() => {
    const order = this.selectedOrder();
    if (this.submitting() || !order || this.totals().total <= 0) return true;
    const method = this.paymentMethod();
    if (!method) return true;
    if (method === 'mixto') return this.mixedReceived() < this.totals().total;
    if (this.selectedMethodIsCash()) return (Number(this.cashReceived()) || 0) < this.totals().total;
    return false;
  });

  readonly catalogProducts = computed<MenuProduct[]>(() => {
    const cat = this.menuService.categories().find((c) => c.id === this.catalogCategoryId());
    return cat?.products ?? [];
  });

  // ─── Ciclo de vida ───────────────────────────────────────────────────────────
  async init(): Promise<void> {
    this.timer ??= setInterval(() => this.nowTick.set(Date.now()), 30000);
    this.loading.set(true);
    this.error.set(null);
    try {
      await Promise.all([
        this.tableService.loadTables(),
        this.reloadOrders(),
        this.paymentMethodService.methods().length === 0 ? this.paymentMethodService.load() : null,
        this.menuService.categories().length === 0 ? this.menuService.loadMenu() : null,
        this.cash.shift() ? null : this.cash.restoreShift(),
      ]);
      const cats = this.menuService.categories();
      if (cats.length && !this.catalogCategoryId()) this.catalogCategoryId.set(cats[0].id);
      const methods = this.paymentMethods();
      if (methods.length && !this.paymentMethod()) {
        this.paymentMethod.set((methods.find((m) => m.is_cash) ?? methods[0]).id);
      }
    } catch (err) {
      this.error.set(this.api.extractError(err, 'No se pudo cargar la terminal.'));
    } finally {
      this.loading.set(false);
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async reloadOrders(): Promise<void> {
    this.orders.set(await this.api.listOrders());
  }

  async reload(): Promise<void> {
    await Promise.all([this.tableService.loadTables(), this.reloadOrders()]);
  }

  // ─── Selección de mesa / pedido ───────────────────────────────────────────────
  selectTable(tableId: string): void {
    const list = this.ordersOfTable(tableId);
    this.selectedTableId.set(tableId);
    this.resetTransient();
    if (list.length > 0) {
      this.selectedOrderId.set(list[0].id);
      this.customerName.set(list[0].customer_name || '');
    } else {
      const table = this.tables().find((t) => t.id === tableId);
      this.selectedOrderId.set(null);
      this.customerName.set(`Cliente Mesa ${table?.number ?? ''}`.trim());
    }
  }

  selectOrder(orderId: string): void {
    this.selectedOrderId.set(orderId);
    this.customerName.set(this.selectedOrder()?.customer_name || '');
    this.draftLines.set([]);
    this.resetPayment();
  }

  newOrderOnTable(): void {
    this.selectedOrderId.set(null);
    this.draftLines.set([]);
    const table = this.selectedTable();
    this.customerName.set(`Cliente · Mesa ${table?.number ?? ''}`.trim());
    this.resetPayment();
  }

  cancelSelection(): void {
    this.selectedTableId.set(null);
    this.selectedOrderId.set(null);
    this.resetTransient();
  }

  private resetTransient(): void {
    this.draftLines.set([]);
    this.discountPanelOpen.set(false);
    this.appliedDiscount.set(null);
    this.catalogOpen.set(false);
    this.configuringProduct.set(null);
    this.error.set(null);
    this.resetPayment();
  }

  private resetPayment(): void {
    this.cashReceived.set('');
    this.mixedLines.set([]);
  }

  // ─── Catálogo / draft ─────────────────────────────────────────────────────────
  openCatalog(): void {
    this.catalogOpen.set(true);
    this.configuringProduct.set(null);
    if (!this.catalogCategoryId() && this.categories().length) {
      this.catalogCategoryId.set(this.categories()[0].id);
    }
  }
  closeCatalog(): void {
    this.catalogOpen.set(false);
    this.configuringProduct.set(null);
  }
  setCatalogCategory(id: string): void {
    this.catalogCategoryId.set(id);
  }
  openConfig(product: MenuProduct): void {
    this.configuringProduct.set(product);
  }
  closeConfig(): void {
    this.configuringProduct.set(null);
  }

  addDraftFromSelection(sel: ProductSelection): void {
    const unitPrice = sel.variant.price + sel.options.reduce((s, o) => s + o.extra_price, 0);
    const key =
      sel.variant.id + '|' + sel.options.map((o) => o.id).sort().join(',') + '|' + (sel.notes ?? '');
    this.draftLines.update((lines) => {
      const existing = lines.find((l) => l.key === key);
      if (existing) {
        return lines.map((l) => (l.key === key ? { ...l, quantity: l.quantity + sel.quantity } : l));
      }
      return [
        ...lines,
        {
          key,
          product: sel.product,
          variant: sel.variant,
          options: sel.options,
          quantity: sel.quantity,
          notes: sel.notes,
          unitPrice,
        },
      ];
    });
    this.configuringProduct.set(null);
    this.catalogOpen.set(false);
  }

  incDraft(key: string): void {
    this.draftLines.update((l) => l.map((x) => (x.key === key ? { ...x, quantity: x.quantity + 1 } : x)));
  }
  decDraft(key: string): void {
    this.draftLines.update((l) =>
      l.map((x) => (x.key === key ? { ...x, quantity: x.quantity - 1 } : x)).filter((x) => x.quantity > 0),
    );
  }
  removeDraft(key: string): void {
    this.draftLines.update((l) => l.filter((x) => x.key !== key));
  }

  /** Persiste el draft en la orden de la mesa (crea la orden si no existe). */
  async saveOrder(): Promise<boolean> {
    const tableId = this.selectedTableId();
    if (!tableId || this.draftLines().length === 0) return true;
    this.submitting.set(true);
    this.error.set(null);
    try {
      let order: DiningOrder | null = null;
      for (const l of this.draftLines()) {
        order = await this.api.addTableItem(tableId, {
          product_variant_id: l.variant.id,
          quantity: l.quantity,
          option_ids: l.options.map((o) => o.id),
          notes: l.notes,
        });
      }
      this.draftLines.set([]);
      await this.reload();
      if (order) this.selectedOrderId.set(order.id);
      this.toast.success('Pedido guardado');
      return true;
    } catch (err) {
      this.error.set(this.api.extractError(err, 'No se pudo guardar el pedido.'));
      this.toast.error(this.error()!);
      return false;
    } finally {
      this.submitting.set(false);
    }
  }

  async voidPersistedItem(itemId: string): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Anular ítem',
      message: '¿Anular este ítem del pedido? Se revierte el inventario si aún no se preparó.',
      confirmText: 'Anular',
    });
    if (!ok) return;
    this.submitting.set(true);
    try {
      await this.api.voidItem(itemId, 'Anulado desde terminal');
      await this.reload();
    } catch (err) {
      this.toast.error(this.api.extractError(err, 'No se pudo anular el ítem.'));
    } finally {
      this.submitting.set(false);
    }
  }

  /** Avanza todos los ítems a "listo" para poder cobrar sin depender del KDS. */
  async marcarListo(): Promise<void> {
    const order = this.selectedOrder();
    if (!order) return;
    this.submitting.set(true);
    try {
      for (const it of (order.items ?? []).filter((i) => NOT_READY.includes(i.estado_cocina))) {
        if (it.estado_cocina === 'pendiente') {
          await this.api.updateItemKitchen(it.id, 'en_preparacion');
        }
        await this.api.updateItemKitchen(it.id, 'listo');
      }
      await this.reload();
    } catch (err) {
      this.toast.error(this.api.extractError(err, 'No se pudo marcar como listo.'));
    } finally {
      this.submitting.set(false);
    }
  }

  // ─── Descuento ────────────────────────────────────────────────────────────────
  toggleDiscountPanel(): void {
    this.discountPanelOpen.update((v) => !v);
  }
  setDiscountType(t: 'percent' | 'fixed'): void {
    this.discountType.set(t);
  }
  applyDiscount(): void {
    const value = Number(this.discountValue()) || 0;
    this.appliedDiscount.set(value > 0 ? { type: this.discountType(), value } : null);
    this.discountPanelOpen.set(false);
  }
  cancelDiscount(): void {
    this.discountPanelOpen.set(false);
    this.discountValue.set('');
    this.discountReason.set('');
    this.appliedDiscount.set(null);
  }

  // ─── Pago ─────────────────────────────────────────────────────────────────────
  setPaymentMethod(v: string): void {
    this.paymentMethod.set(v);
  }
  addMixedLine(): void {
    const first = this.paymentMethods()[0];
    this.mixedLines.update((l) => [...l, { payment_method_id: first?.id ?? '', amount: '' }]);
  }
  updateMixedLine(i: number, patch: Partial<{ payment_method_id: string; amount: string }>): void {
    this.mixedLines.update((l) => l.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  removeMixedLine(i: number): void {
    this.mixedLines.update((l) => l.filter((_, idx) => idx !== i));
  }

  // ─── Cobro (block → pay) ──────────────────────────────────────────────────────
  async cobrar(): Promise<void> {
    if (this.chargeDisabled()) return;
    if (!this.cash.shift() || !this.cash.isOpen()) {
      this.toast.error('No hay un turno de caja abierto. Ábrelo en el módulo de Caja.');
      return;
    }
    // Guarda el draft pendiente antes de cobrar.
    if (this.hasDraft() && !(await this.saveOrder())) return;

    const order = this.selectedOrder();
    if (!order) return;
    const totals = this.totals();
    const payments = this.buildPayments(totals.total);
    if (!payments) return;

    this.submitting.set(true);
    this.error.set(null);
    try {
      await this.api.blockOrder(order.id, order.version ?? 0);
      await this.api.payOrder(order.id, {
        cash_shift_id: this.cash.shift()!.id,
        discount: totals.discount,
        tax: totals.tax,
        tip: 0,
        payments,
      });
      const tableId = this.selectedTableId();
      this.lastSale.set({ total: totals.total, customer: this.customerName() || 'Cliente' });
      this.successOpen.set(true);
      await this.reload();
      // Libera la mesa si ya no le quedan órdenes activas.
      if (tableId && this.ordersOfTable(tableId).length === 0) {
        try {
          await this.api.releaseTable(tableId);
          await this.tableService.loadTables();
        } catch {
          /* la mesa puede tener otras órdenes; se ignora */
        }
      }
      this.cancelSelection();
    } catch (err) {
      this.toast.error(this.api.extractError(err, 'No se pudo cobrar el pedido.'));
    } finally {
      this.submitting.set(false);
    }
  }

  private buildPayments(total: number): PaymentLine[] | null {
    const method = this.paymentMethod();
    if (method === 'mixto') {
      const lines = this.mixedLines()
        .filter((l) => l.payment_method_id && Number(l.amount) > 0)
        .map((l) => ({ payment_method_id: l.payment_method_id, amount: Number(l.amount) }));
      if (lines.reduce((s, l) => s + l.amount, 0) < total) {
        this.toast.error('Los pagos no cubren el total.');
        return null;
      }
      return lines;
    }
    if (!method) return null;
    // Método único: se cobra exactamente el total (el cambio se entrega en efectivo).
    return [{ payment_method_id: method, amount: total }];
  }

  closeSuccess(): void {
    this.successOpen.set(false);
  }
  printReceipt(): void {
    window.print();
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  fmt(n: number): string {
    return '$ ' + Math.round(n || 0).toLocaleString('es-CO');
  }

  private orderSubtotal(o: DiningOrder): number {
    return (o.items ?? [])
      .filter((i) => i.estado_cocina !== 'anulado')
      .reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0);
  }

  private deriveStatus(orders: DiningOrder[]): TableDisplayStatus {
    if (orders.length === 0) return 'libre';
    if (orders.some((o) => o.status === 'bloqueada')) return 'pago_pendiente';
    const items = orders.flatMap((o) => (o.items ?? []).filter((i) => i.estado_cocina !== 'anulado'));
    if (items.some((i) => NOT_READY.includes(i.estado_cocina))) return 'en_preparacion';
    if (items.length > 0 && items.every((i) => i.estado_cocina === 'listo' || i.estado_cocina === 'entregado')) {
      return 'listo';
    }
    return 'ocupada';
  }

  private elapsedLabel(ts: number | null): string {
    if (!ts) return '—';
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return 'ahora';
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }

  setTableStatus(id: string, status: TableStatus): Promise<boolean> {
    return this.tableService.setStatus(id, status);
  }
}
