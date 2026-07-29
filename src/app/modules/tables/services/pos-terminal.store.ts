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
import {
  CloseSessionResponse,
  DiningOrder,
  DiningOrderItem,
  PaymentLine,
  SessionBill,
} from '../interfaces/dining.interface';
import { ProductSelection } from '../components/product-select.component';
import { buildMenuLookup, MenuLookup } from './menu-lookup';
import { TableService } from './table.service';
import { DiningSessionService } from './dining-session.service';
import { TableSessionService } from './table-session.service';
import { SalesService } from '../../sales/services/sales.service';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import {
  ReceiptData,
  buildReceiptHtml,
  formatMoney,
  printReceiptHtml,
} from './receipt.util';

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
 * pedido (draft + ítems persistidos), y la cuenta de la mesa. El cobro lo cierra
 * `SessionBillPanelComponent` contra la **sesión de mesa**, no pedido a pedido.
 * Se provee a nivel de la página.
 */
@Injectable()
export class PosTerminalStore {
  private readonly tableService = inject(TableService);
  private readonly api = inject(DiningSessionService);
  private readonly menuService = inject(MenuService);
  private readonly tableSessions = inject(TableSessionService);
  private readonly paymentMethodService = inject(PaymentMethodService);
  private readonly cash = inject(CashService);
  private readonly sales = inject(SalesService);
  private readonly tenantInfo = inject(TenantInfoService);
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

  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  readonly successOpen = signal(false);
  readonly lastSale = signal<{ total: number; customer: string } | null>(null);
  /** Facturas del último cobro (una por venta) listas para imprimir. */
  readonly lastReceipts = signal<ReceiptData[]>([]);

  private readonly nowTick = signal(Date.now());
  private timer?: ReturnType<typeof setInterval>;

  // ─── Derivados ───────────────────────────────────────────────────────────────
  readonly tables = this.tableService.tables;
  readonly paymentMethods = this.paymentMethodService.methods;
  readonly categories = this.menuService.categories;

  private readonly lookup = computed<MenuLookup>(() => buildMenuLookup(this.menuService.categories()));

  /**
   * Pedidos que el comensal envió y esperan que el personal los acepte.
   *
   * Se excluyen del flujo del terminal (`activeOrders`) porque todavía no han
   * descontado inventario ni están en cocina: no se pueden editar ni cobrar
   * hasta confirmarlos.
   */
  readonly pendingOrders = computed(() => this.orders().filter((o) => o.status === 'recibida'));

  /** Órdenes activas por mesa: ni terminales ni pendientes de confirmar. */
  private readonly activeOrders = computed(() =>
    this.orders().filter(
      (o) => o.status !== 'pagada' && o.status !== 'cancelada' && o.status !== 'recibida',
    ),
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

  /**
   * Refresca mesas, pedidos **y la cuenta de la mesa seleccionada**.
   *
   * La cuenta tiene que ir aquí: es el embudo por el que pasan guardar el pedido,
   * anular ítems, marcarlo listo y confirmar/rechazar desde el panel de pendientes.
   * Si no, se cobraría con un total viejo y el backend responde
   * "El pago no cubre el total".
   */
  async reload(): Promise<void> {
    await Promise.all([this.tableService.loadTables(), this.reloadOrders()]);
    await this.loadSessionBill(this.selectedTableId());
  }

  // ─── Selección de mesa / pedido ───────────────────────────────────────────────
  selectTable(tableId: string): void {
    const list = this.ordersOfTable(tableId);
    this.selectedTableId.set(tableId);
    void this.loadSessionBill(tableId);
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
  }

  newOrderOnTable(): void {
    this.selectedOrderId.set(null);
    this.draftLines.set([]);
    const table = this.selectedTable();
    this.customerName.set(`Cliente · Mesa ${table?.number ?? ''}`.trim());
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

  // ─── Cuenta y cobro por sesión de mesa ────────────────────────────────────────

  /** Turno de caja abierto, o `null` si no hay: sin él no se puede cobrar. */
  readonly cashShiftId = computed(() =>
    this.cash.isOpen() ? (this.cash.shift()?.id ?? null) : null,
  );

  /** Cuenta de la sesión de la mesa seleccionada (total + desglose por comensal). */
  readonly sessionBill = signal<SessionBill | null>(null);
  readonly billLoading = signal(false);

  /**
   * Carga la cuenta de la mesa seleccionada.
   *
   * La unidad de cobro ya no es el pedido sino la **sesión de mesa**: cerrarla
   * cobra todos sus pedidos, cierra a los comensales y libera la mesa en una
   * sola operación, en vez del antiguo `block` → `pay` → `release` por orden.
   */
  async loadSessionBill(tableId: string | null): Promise<void> {
    if (!tableId) {
      this.sessionBill.set(null);
      return;
    }
    this.billLoading.set(true);
    try {
      const sessions = await this.tableSessions.list();
      const session = sessions.find((s) => s.dining_table_id === tableId);
      this.sessionBill.set(session ? await this.tableSessions.bill(session.id) : null);
    } catch (err) {
      this.sessionBill.set(null);
      this.error.set(this.tableSessions.extractError(err, 'No se pudo cargar la cuenta.'));
    } finally {
      this.billLoading.set(false);
    }
  }

  /** Tras cobrar: arma las facturas, refresca todo y suelta la selección. */
  async onCharged(closed: CloseSessionResponse): Promise<void> {
    const total = Number(this.sessionBill()?.total ?? 0);
    this.lastSale.set({ total, customer: this.customerName() || 'Mesa' });
    // La etiqueta de la mesa hay que capturarla aquí: `cancelSelection()` la borra.
    const tableLabel = this.tableLabel(this.selectedTable());
    this.successOpen.set(true);
    this.sessionBill.set(null);
    await Promise.all([this.loadReceipts(closed, tableLabel), this.reload()]);
    this.cancelSelection();
  }

  /**
   * Trae las ventas recién emitidas para poder imprimirlas.
   *
   * Un fallo aquí **no invalida el cobro** —ya está registrado—: solo deja el
   * diálogo sin botón de imprimir.
   */
  private async loadReceipts(closed: CloseSessionResponse, tableLabel: string): Promise<void> {
    this.lastReceipts.set([]);
    try {
      const sales = await Promise.all(closed.sale_ids.map((id) => this.sales.get(id)));
      this.lastReceipts.set(
        sales.map((sale) => ({
          businessName: this.tenantInfo.businessName(),
          logoUrl: this.tenantInfo.logoUrl(),
          tableLabel,
          soldAt: sale.sold_at,
          cashier: sale.user_name ?? null,
          customerName: sale.customer_name ?? null,
          saleId: sale.id,
          lines: (sale.items ?? []).map((it) => ({
            quantity: it.quantity,
            description: it.description,
            lineTotal: Number(it.line_total),
          })),
          subtotal: Number(sale.subtotal),
          discount: Number(sale.discount),
          tax: Number(sale.tax),
          tip: Number(sale.tip),
          total: Number(sale.total),
          payments: (sale.payments ?? []).map((p) => ({
            name: this.methodName(p.payment_method_id),
            amount: Number(p.amount),
          })),
          change: sale.change_given != null ? Number(sale.change_given) : null,
          message: this.tenantInfo.receiptMessage(),
        })),
      );
    } catch {
      this.toast.error('El cobro se registró, pero no se pudo preparar la factura.');
    }
  }

  closeSuccess(): void {
    this.successOpen.set(false);
  }

  /** Imprime la factura de 58 mm: una por venta (en cuenta dividida, una por comensal). */
  printReceipt(): void {
    const receipts = this.lastReceipts();
    if (receipts.length === 0) return;
    printReceiptHtml(buildReceiptHtml(receipts));
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  fmt(n: number): string {
    return formatMoney(n);
  }

  private methodName(id: string): string {
    return this.paymentMethods().find((m) => m.id === id)?.name ?? 'Pago';
  }

  private tableLabel(table: Table | null): string {
    if (!table) return '';
    return table.name ? `Mesa ${table.number} · ${table.name}` : `Mesa ${table.number}`;
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
