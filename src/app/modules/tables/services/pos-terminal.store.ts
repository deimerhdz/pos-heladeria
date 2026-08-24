import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  MenuCategory,
  MenuOption,
  MenuProduct,
  MenuVariant,
} from '../../products/interfaces/product.interface';
import { PaymentMethod, Sale } from '../../sales/interfaces/sales.interface';
import { MenuService } from '../../../core/services/menu.service';
import { Promotion } from '../../promotions/interfaces/promotion.interface';
import { PromotionService } from '../../promotions/services/promotion.service';
import {
  bestProductDiscount,
  discountedUnitPrice,
  isPromoActiveNow,
} from '../../promotions/services/promotion-pricing.util';
import { PaymentMethodService } from '../../sales/services/payment-method.service';
import { CashService } from '../../cash-register/services/cash.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { ConfirmService } from '../../../shared/feedback/confirm.service';
import { SoundService } from '../../../shared/feedback/sound.service';
import { PrinterSettingsStore } from '../../../core/printing/printer-settings.store';
import { VisibleInterval, startVisibleInterval } from '../../../core/realtime/visible-interval';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { Table, TableStatus } from '../interfaces/table.interface';
import {
  CloseSessionResponse,
  DiningOrder,
  DiningOrderItem,
  KitchenStatus,
  PaymentLine,
  SessionBill,
} from '../interfaces/dining.interface';
import { KITCHEN_NOT_READY } from '../../orders/order-status.util';
import { ProductSelection } from '../components/product-select.component';
import { buildMenuLookup, MenuLookup } from './menu-lookup';
import { TableService } from './table.service';
import { DiningSessionService } from './dining-session.service';
import { TableSessionService } from './table-session.service';
import { SalesService } from '../../sales/services/sales.service';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import {
  ReceiptContext,
  ReceiptData,
  buildReceiptHtml,
  formatMoney,
  printReceiptHtml,
  saleToReceipt,
  sessionBillToReceipt,
} from './receipt.util';

/** Una línea de pedido nueva sin guardar (draft del staff): producto o combo. */
interface ProductDraftLine {
  kind: 'product';
  key: string;
  product: MenuProduct;
  variant: MenuVariant;
  options: MenuOption[];
  quantity: number;
  notes: string | null;
  unitPrice: number;
}

/**
 * Selección explícita de un combo. `unitPrice` es el precio del bundle (solo
 * para el total en pantalla): al guardar se manda `combo_id` y el backend lo
 * expande en sus componentes reales a precio normal, calculando el ahorro
 * recién al cobrar — el draft nunca reescribe precios de producto.
 */
interface ComboDraftLine {
  kind: 'combo';
  key: string;
  comboId: string;
  comboName: string;
  quantity: number;
  notes: string | null;
  unitPrice: number;
}

type DraftLine = ProductDraftLine | ComboDraftLine;

/** Estado de mesa derivado para la vista. */
type TableDisplayStatus =
  | 'libre'
  | 'por_confirmar'
  | 'en_preparacion'
  | 'listo'
  | 'pago_pendiente'
  | 'ocupada'
  | 'reservada';

type TableFilter = 'todas' | 'libres' | 'ocupadas' | 'pendientes';

const STATUS_META: Record<TableDisplayStatus, { label: string; chip: string }> = {
  libre: { label: 'Libre', chip: 'bg-gray-100 text-gray-600' },
  por_confirmar: { label: 'Por confirmar', chip: 'bg-violet-600 text-white' },
  en_preparacion: { label: 'En preparación', chip: 'bg-amber-100 text-amber-700' },
  listo: { label: 'Listo', chip: 'bg-green-100 text-green-700' },
  pago_pendiente: { label: 'Pago pendiente', chip: 'bg-indigo-600 text-white' },
  ocupada: { label: 'Ocupada', chip: 'bg-blue-100 text-blue-700' },
  reservada: { label: 'Reservada', chip: 'bg-slate-200 text-slate-700' },
};

/** Estados que reclaman que el personal haga algo ya. */
const NEEDS_STAFF: TableDisplayStatus[] = ['por_confirmar', 'listo', 'pago_pendiente'];

/**
 * Estado de una línea de combo: el **menos avanzado** de sus componentes.
 *
 * Un combo son N `order_items` que se pintan como una sola línea, así que
 * mostrarlo listo mientras a uno le falta prepararse mentiría al cajero.
 */
function leastAdvanced(items: DiningOrderItem[]): KitchenStatus | null {
  const orden: KitchenStatus[] = ['pendiente', 'en_preparacion', 'listo'];
  const estados = items.map((i) => i.estado_cocina);
  return orden.find((e) => estados.includes(e)) ?? null;
}

/** Sondeo de respaldo cuando el stream de tiempo real está caído. */
const ORDERS_POLL_MS = 10_000;
/** Con el stream sano basta un latido lento: es red de seguridad, no la fuente. */
const ORDERS_POLL_SSE_MS = 60_000;
/** Agrupa la ráfaga de una misma acción (y el replay al reconectar). */
const RELOAD_DEBOUNCE_MS = 250;

/**
 * Ids de pedidos por confirmar que aún no se habían visto.
 *
 * Se comparan **ids y no cantidades**: si un pedido entra y el personal lo
 * confirma dentro de la misma ventana de sondeo, el contador vuelve a su sitio
 * pero el aviso sí debe haber sonado.
 */
export function newPendingIds(seen: ReadonlySet<string>, orders: DiningOrder[]): string[] {
  return orders.filter((o) => o.status === 'recibida' && !seen.has(o.id)).map((o) => o.id);
}

/**
 * Estado que se pinta en la tarjeta de la mesa, por orden de urgencia.
 *
 * `orders` son los pedidos vivos de la mesa **incluidos los `recibida`**: un
 * pedido esperando confirmación ocupa la mesa igual que cualquier otro, y
 * dejarlo fuera era lo que hacía que toda mesa con pedido del QR se viera libre.
 *
 * Cuando no hay ningún pedido manda `tableStatus`, el estado que guarda el
 * backend: un comensal puede haber escaneado el QR y no haber pedido todavía.
 */
export function deriveTableStatus(
  orders: DiningOrder[],
  tableStatus: TableStatus,
): TableDisplayStatus {
  // Solo el canal QR pasa por revisión de pago del cajero (feature 028): un
  // pedido de mostrador `hold_for_payment` también vive en `recibida` mientras
  // se arma, y ese no es un pago por confirmar — es el cajero armando su
  // propio pedido, y mostrarlo como "Por confirmar" sería una falsa alarma.
  if (orders.some((o) => o.status === 'recibida' && o.channel === 'qr')) return 'por_confirmar';
  if (orders.some((o) => o.status === 'bloqueada')) return 'pago_pendiente';

  const items = orders.flatMap((o) => (o.items ?? []).filter((i) => i.estado_cocina !== 'anulado'));
  if (items.some((i) => KITCHEN_NOT_READY.includes(i.estado_cocina))) return 'en_preparacion';
  if (items.length > 0 && items.every((i) => i.estado_cocina === 'listo')) {
    // Spec 029, Historia 3: "Listo" exige pago Y cocina, las dos a la vez —
    // no basta con que cocina termine. Los caminos QR/mostrador vigentes
    // nunca llegan a `status === 'pagada'` (dejan la orden en 'abierta' con
    // la Sale ya emitida), así que la señal real es `order.paid` (D2 de
    // research.md), no `status`. Mientras falte el pago, se muestra
    // "Pago pendiente" — el mismo estado que ya usa la rama 'bloqueada' de
    // arriba, para no inventar una insignia nueva casi idéntica.
    const conConsumo = orders.filter((o) =>
      (o.items ?? []).some((i) => i.estado_cocina !== 'anulado'),
    );
    return conConsumo.every((o) => o.paid === true) ? 'listo' : 'pago_pendiente';
  }
  if (orders.length > 0) return 'ocupada';

  if (tableStatus === 'ocupada') return 'ocupada';
  if (tableStatus === 'reservada') return 'reservada';
  return 'libre';
}

/**
 * Hora a usar para evaluar vigencia de promociones en el POS de staff (A-09):
 * la del servidor, sincronizada por `PromotionService`, nunca el reloj del
 * dispositivo. Devuelve `null` mientras no haya sync (arranque en frío, corte
 * de red) — los cuatro puntos de invocación deben degradar explícito en ese
 * caso (sin insignias/descuento de previsualización), no usar `new Date()`
 * como fallback: eso reintroduciría exactamente el defecto que A-09 corrige.
 */
export function currentNow(promotionService: { ready(): boolean; now(): Date }): Date | null {
  return promotionService.ready() ? promotionService.now() : null;
}

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
  private readonly promotionService = inject(PromotionService);
  private readonly tableSessions = inject(TableSessionService);
  private readonly paymentMethodService = inject(PaymentMethodService);
  private readonly cash = inject(CashService);
  private readonly sales = inject(SalesService);
  private readonly tenantInfo = inject(TenantInfoService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly printer = inject(PrinterSettingsStore);
  private readonly realtime = inject(RealtimeService);
  readonly sound = inject(SoundService);

  constructor() {
    // El sondeo se relaja con el stream sano y vuelve al ritmo de antes al caerse.
    effect(() => {
      const abierto = this.realtime.status() === 'open';
      this.pollHandle?.setPeriod(abierto ? ORDERS_POLL_SSE_MS : ORDERS_POLL_MS);
    });
  }

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

  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  readonly successOpen = signal(false);
  readonly lastSale = signal<{ total: number; customer: string } | null>(null);
  /** Facturas del último cobro (una por venta) listas para imprimir. */
  readonly lastReceipts = signal<ReceiptData[]>([]);

  /**
   * Mesa libre / sin pedido: el cajero pulsó "+ Crear Orden Manual" (o F3) y
   * está armando el pedido con el catálogo, pero todavía no existe en el
   * backend (feature 028, T021-T023). Se crea de una vez con
   * `createManualOrderFromDraft()` cuando termina.
   */
  readonly manualOrderBuilding = signal(false);

  /** A nombre de quién se factura el cobro de mostrador; el cajero puede
   *  cambiarlo, pero por defecto va sin identificar (feature 028, T024). */
  readonly billingCustomerName = signal('Consumidor Final');

  readonly checkoutSubmitting = signal(false);
  /**
   * Ventas de pedidos de mostrador cobrados en esta sesión de pantalla, para
   * poder reimprimir la factura (T033) sin que el backend exponga un
   * "venta por pedido" — solo se guarda lo que esta pestaña cobró.
   */
  readonly checkoutSaleByOrderId = signal<Record<string, Sale>>({});

  private readonly nowTick = signal(Date.now());
  private timer?: VisibleInterval;
  private pollHandle: VisibleInterval | null = null;
  private rtOff: (() => void)[] = [];
  private reloadHandle: ReturnType<typeof setTimeout> | null = null;
  /** Pedidos por confirmar ya conocidos: lo que llegue de más suena. */
  private seenPending = new Set<string>();
  /** La primera carga no avisa; solo deja constancia de lo que ya había. */
  private pendingSeeded = false;

  // ─── Derivados ───────────────────────────────────────────────────────────────
  readonly tables = this.tableService.tables;
  /** Listado completo (todos los estados) — usado por `methodName()` para
   * resolver el nombre de un método ya usado en una venta, aunque ya no esté
   * disponible para cobros nuevos (Principio VII: el histórico no cambia). */
  readonly paymentMethods = this.paymentMethodService.methods;
  /** Solo los disponibles para cobrar ahora mismo (activos, completos, con el
   * catálogo activo) y sin datos de integración — lo que consume el panel de
   * cobro (spec 032, FR-012/FR-012a). */
  readonly paymentMethodsAvailable = this.paymentMethodService.checkoutOptions;
  readonly categories = this.menuService.categories;

  /** Combos activos y vigentes ahora mismo, disponibles para vender (el staff ya tiene token de sesión). */
  readonly combos = computed<Promotion[]>(() => {
    const now = currentNow(this.promotionService);
    if (now === null) return []; // A-09: sin hora sincronizada aún, degrada sin combos
    return this.promotionService
      .activePromotions()
      .filter((p) => p.type === 'combo' && isPromoActiveNow(p, now));
  });

  /**
   * Insignia de descuento (ej. "-50%") por producto, para las promociones
   * `percent`/`fixed` vigentes en este instante — el catálogo no mostraba
   * ninguna señal de que un producto tenía descuento activo, a diferencia de
   * los combos que sí tienen su propia sección. Solo decide si se muestra la
   * insignia; el monto real que se cobra lo sigue calculando el backend.
   */
  readonly productDiscountBadges = computed<Map<string, string>>(() => {
    const now = currentNow(this.promotionService);
    if (now === null) return new Map<string, string>(); // A-09: sin hora sincronizada aún
    const promos = this.promotionService.activePromotions();
    const result = new Map<string, string>();

    for (const c of this.categories()) {
      for (const prod of c.products) {
        const price = prod.variants.length ? Math.min(...prod.variants.map((v) => v.price)) : 0;
        const match = bestProductDiscount(promos, now, prod.id, c.id, price);
        if (!match) continue;
        const label =
          match.promo.type === 'percent'
            ? `-${Number(match.promo.value)}%`
            : `-${this.fmt(Number(match.promo.value))}`;
        result.set(prod.id, label);
      }
    }
    return result;
  });

  private readonly lookup = computed<MenuLookup>(() =>
    buildMenuLookup(this.menuService.categories()),
  );

  /**
   * Pedidos QR que el comensal envió y esperan que el cajero valide su pago.
   *
   * Se excluyen del flujo del terminal (`activeOrders`) porque todavía no han
   * descontado inventario ni están en cocina: no se pueden editar ni cobrar
   * hasta confirmarlos.
   *
   * **Solo canal `qr`** (feature 028, T010): un pedido de mostrador creado con
   * `hold_for_payment` también vive en `recibida` mientras el cajero lo arma,
   * pero no tiene ningún intento de pago que revisar — no debe aparecer en el
   * bloque de validación de pagos.
   */
  readonly pendingOrders = computed(() =>
    this.orders().filter((o) => o.status === 'recibida' && o.channel === 'qr'),
  );

  /**
   * Órdenes activas por mesa: ni terminales ni QR sin confirmar. Un pedido de
   * mostrador `hold_for_payment` también vive en `'recibida'` mientras se arma
   * (ver `pendingOrders` arriba) pero SÍ es editable/seleccionable — solo el
   * canal `qr` necesita `confirmOrder()` antes de entrar aquí. Sin esto,
   * `selectTable()` no auto-seleccionaba un pedido de mostrador recién creado
   * tras recargar la página (el store se recrea y pierde la selección en
   * memoria de `createManualOrderFromDraft()`).
   */
  private readonly activeOrders = computed(() =>
    this.orders().filter(
      (o) =>
        o.status !== 'pagada' &&
        o.status !== 'cancelada' &&
        (o.status !== 'recibida' || o.channel !== 'qr'),
    ),
  );

  /** Pedidos editables/cobrables de la mesa: los `recibida` aún no lo son. */
  private ordersOfTable(tableId: string): DiningOrder[] {
    return this.activeOrders().filter((o) => o.dining_table_id === tableId);
  }

  /**
   * Todo lo que la mesa tiene vivo, **incluidos los pedidos por confirmar**.
   *
   * Es lo que alimenta el tablero: una mesa con un pedido del QR esperando
   * confirmación no está libre, y su consumo tampoco es cero.
   */
  private tableOrders(tableId: string): DiningOrder[] {
    return this.orders().filter(
      (o) => o.dining_table_id === tableId && o.status !== 'pagada' && o.status !== 'cancelada',
    );
  }

  /** Pedidos QR por confirmar de la mesa seleccionada. */
  readonly pendingOfSelectedTable = computed(() => {
    const id = this.selectedTableId();
    return id ? this.pendingOrders().filter((o) => o.dining_table_id === id) : [];
  });

  /**
   * Estado de la columna central de la terminal (feature 028, T003): reemplaza
   * las dos pestañas por una sola vista que se decide sola según lo que tiene
   * la mesa, en vez de que el cajero tenga que ir a buscarla.
   *
   * - `'validar-pago'`: hay al menos un pedido QR esperando que el cajero
   *   apruebe/rechace su comprobante o confirme el efectivo. Tiene prioridad
   *   sobre todo lo demás: es lo más urgente en pantalla.
   * - `'mesa-libre'`: la mesa no tiene ningún pedido vivo y el cajero no ha
   *   empezado a armar uno manual todavía — CTA "+ Crear Orden Manual".
   * - `'armando-pedido'` / `'pedido-activo'`: se sigue mostrando el panel de
   *   carrito existente (`app-pos-order-panel`), que ya distingue internamente
   *   entre un draft sin guardar y un pedido persistido.
   */
  readonly centralState = computed<'validar-pago' | 'mesa-libre' | 'pedido'>(() => {
    if (this.pendingOfSelectedTable().length > 0) return 'validar-pago';
    const tableId = this.selectedTableId();
    if (!tableId) return 'pedido'; // nada seleccionado: pos-order-panel pinta su placeholder
    const hasTableConsumption = this.tableOrders(tableId).length > 0;
    if (!hasTableConsumption && !this.manualOrderBuilding() && !this.hasDraft()) {
      return 'mesa-libre';
    }
    return 'pedido';
  });

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
        const status = deriveTableStatus(this.tableOrders(t.id), t.status);
        if (f === 'libres' && status !== 'libre') return false;
        if (f === 'ocupadas' && status === 'libre') return false;
        if (f === 'pendientes' && !NEEDS_STAFF.includes(status)) return false;
        if (term && !String(t.number).includes(term)) return false;
        return true;
      })
      .map((t) => {
        const list = this.tableOrders(t.id);
        const status = deriveTableStatus(list, t.status);
        const meta = STATUS_META[status];
        const items = list.reduce(
          (n, o) =>
            n +
            (o.items ?? [])
              .filter((i) => i.estado_cocina !== 'anulado')
              .reduce((x, i) => x + i.quantity, 0),
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
    const syncedNow = currentNow(this.promotionService);
    // A-09: sin hora sincronizada aún, sin descuento de previsualización —
    // `promos` vacío hace que discountedUnitPrice devuelva el precio normal
    // sin tocar `now` (el placeholder nunca se evalúa contra ninguna promo).
    const now = syncedNow ?? new Date(0);
    const promos = syncedNow === null ? [] : this.promotionService.activePromotions();
    const order = this.selectedOrder();
    const items = (order?.items ?? []).filter((i) => i.estado_cocina !== 'anulado');

    const plainItems = items.filter((i) => !i.combo_id);
    const persistedPlain = plainItems.map((i) => {
      const unitPrice = discountedUnitPrice(
        promos,
        now,
        lk.productId(i.product_variant_id),
        lk.categoryId(i.product_variant_id),
        Number(i.unit_price),
        i.quantity,
      );
      return {
        kind: 'persisted' as const,
        key: i.id,
        comboId: undefined as string | undefined,
        qty: i.quantity,
        name: lk.variantLabel(i.product_variant_id),
        bullets: [
          ...(i.options ?? []).map((o) => lk.optionLabel(o.option_id)).filter(Boolean),
          ...(i.notes ? [i.notes] : []),
        ],
        unitPrice,
        subtotal: unitPrice * i.quantity,
        ready: !KITCHEN_NOT_READY.includes(i.estado_cocina),
        kitchenStatus: i.estado_cocina as KitchenStatus | null,
        pendingItemIds: KITCHEN_NOT_READY.includes(i.estado_cocina) ? [i.id] : [],
      };
    });

    // Un combo son N order_items reales (uno por componente) que comparten
    // combo_id: se agrupan en una sola línea de carrito, como lo ve el cajero.
    const comboGroups = this.groupByCombo(items);
    const persistedCombos = [...comboGroups.entries()].map(([comboId, its]) => {
      const promo = this.combos().find((p) => p.id === comboId);
      const units = this.comboUnitsPresent(comboId, its);
      const subtotal = this.comboDisplaySubtotal(promo, its, units);
      return {
        kind: 'persisted' as const,
        key: 'combo:' + comboId,
        comboId,
        qty: units > 0 ? units : 1,
        name: `🎁 ${promo?.name ?? 'Combo'}`,
        bullets: its.map((it) => `${it.quantity}x ${lk.variantLabel(it.product_variant_id)}`),
        unitPrice: units > 0 ? subtotal / units : subtotal,
        subtotal,
        ready: its.every((it) => !KITCHEN_NOT_READY.includes(it.estado_cocina)),
        kitchenStatus: leastAdvanced(its),
        pendingItemIds: its
          .filter((it) => KITCHEN_NOT_READY.includes(it.estado_cocina))
          .map((it) => it.id),
      };
    });

    const draft = this.draftLines().map((l) => {
      if (l.kind === 'combo') {
        return {
          kind: 'draft' as const,
          key: l.key,
          comboId: l.comboId,
          qty: l.quantity,
          name: `🎁 ${l.comboName}`,
          bullets: this.comboBullets(l.comboId),
          unitPrice: l.unitPrice,
          subtotal: l.unitPrice * l.quantity,
          ready: true,
          kitchenStatus: null,
          pendingItemIds: [] as string[],
        };
      }
      const unitPrice = discountedUnitPrice(
        promos,
        now,
        lk.productId(l.variant.id),
        lk.categoryId(l.variant.id),
        l.unitPrice,
        l.quantity,
      );
      return {
        kind: 'draft' as const,
        key: l.key,
        comboId: undefined as string | undefined,
        qty: l.quantity,
        name: l.product.name,
        bullets: [...l.options.map((o) => o.name), ...(l.notes ? [l.notes] : [])],
        unitPrice,
        subtotal: unitPrice * l.quantity,
        ready: true,
        kitchenStatus: null,
        pendingItemIds: [] as string[],
      };
    });
    return [...persistedPlain, ...persistedCombos, ...draft];
  });

  readonly cartEmpty = computed(() => this.cartView().length === 0);
  readonly hasDraft = computed(() => this.draftLines().length > 0);

  readonly subtotal = computed(() => this.cartView().reduce((s, i) => s + i.subtotal, 0));

  readonly totals = computed(() => {
    const subtotal = this.subtotal();
    // Spec 029, Historia 2: sin descuento manual — el único descuento
    // posible es el de promociones/combos, ya reflejado línea por línea en
    // `cartView()` (`discountedUnitPrice`), no como un monto aparte aquí.
    const discount = 0;
    const tax = 0; // Impuestos deprecado: se guarda/calcula siempre en 0.
    const total = Math.max(0, Math.round(subtotal - discount + tax));
    return { subtotal, discount, tax, total };
  });

  /** ¿Todos los ítems persistidos están listos para cobrar? */
  readonly kitchenReady = computed(() => {
    const order = this.selectedOrder();
    const items = (order?.items ?? []).filter((i) => i.estado_cocina !== 'anulado');
    return items.length > 0 && items.every((i) => !KITCHEN_NOT_READY.includes(i.estado_cocina));
  });

  readonly catalogProducts = computed<MenuProduct[]>(() => {
    const cat = this.menuService.categories().find((c) => c.id === this.catalogCategoryId());
    return cat?.products ?? [];
  });

  // ─── Ciclo de vida ───────────────────────────────────────────────────────────
  async init(): Promise<void> {
    this.timer ??= startVisibleInterval(() => this.nowTick.set(Date.now()), 30000);
    this.loading.set(true);
    this.error.set(null);
    try {
      await Promise.all([
        this.tableService.loadTables(),
        this.reloadOrders(),
        this.paymentMethodService.methods().length === 0 ? this.paymentMethodService.load() : null,
        this.paymentMethodService.checkoutOptions().length === 0
          ? this.paymentMethodService.loadAvailableForCheckout()
          : null,
        this.menuService.categories().length === 0 ? this.menuService.loadMenu() : null,
        this.promotionService.loadActive(),
        this.cash.shift() ? null : this.cash.restoreShift(),
      ]);
      const cats = this.menuService.categories();
      if (cats.length && !this.catalogCategoryId()) this.catalogCategoryId.set(cats[0].id);
    } catch (err) {
      this.error.set(this.api.extractError(err, 'No se pudo cargar la terminal.'));
    } finally {
      this.loading.set(false);
    }
    this.startPolling();
    // Después de la carga REST a propósito: `pendingSeeded` ya es `true`, así
    // que la primera ráfaga de eventos no hace sonar la campana.
    this.connectRealtime();
  }

  stop(): void {
    this.timer?.stop();
    this.timer = undefined;
    this.stopPolling();
    this.disconnectRealtime();
  }

  /**
   * Sondea los pedidos: sin esto la terminal no se entera de que un comensal
   * envió algo desde el QR hasta que el cajero toca cualquier otra cosa.
   *
   * Recarga **solo los pedidos**, no la cuenta: `SessionBillPanelComponent`
   * resetea el método de pago y el efectivo recibido cada vez que cambia el
   * objeto `bill`, así que refrescarla cada 10 s le borraría al cajero lo que
   * está tecleando. El tablero de mesas se actualiza igual porque su estado se
   * deriva de los pedidos.
   *
   * El intervalo se pausa con la pestaña oculta: un cajero que cambia de
   * ventana no tiene por qué seguir trayéndose todos los pedidos del local.
   */
  private startPolling(): void {
    this.stopPolling();
    this.pollHandle = startVisibleInterval(
      () => {
        // Un fallo de red pasajero no debe pintar un error sobre la terminal.
        void this.reloadOrders().catch(() => undefined);
        // También las mesas: su `status` es lo que delata a un comensal que
        // escaneó el QR y todavía no ha pedido nada.
        void this.tableService.loadTables().catch(() => undefined);
      },
      this.realtime.status() === 'open' ? ORDERS_POLL_SSE_MS : ORDERS_POLL_MS,
    );
  }

  private stopPolling(): void {
    this.pollHandle?.stop();
    this.pollHandle = null;
  }

  // ── Tiempo real ───────────────────────────────────────────────────────────

  /**
   * Conecta el stream del staff.
   *
   * **Los eventos nunca tocan la campana directamente**: `order.created` dispara
   * una recarga, y es `reloadOrders()` → `announcePending()` quien decide si
   * suena, comparando ids contra `seenPending`. Alimentar la campana desde el
   * evento haría que el replay tras reconectar volviera a sonar por pedidos que
   * el cajero ya vio.
   *
   * Por eso `init()` conecta **después** de la primera carga REST: así
   * `pendingSeeded` ya es `true` y la primera ráfaga no suena.
   */
  private connectRealtime(): void {
    const recargar = () => this.scheduleReload();
    this.rtOff.push(
      this.realtime.on('order.created', recargar),
      this.realtime.on('order.confirmed', recargar),
      this.realtime.on('order.cancelled', recargar),
      this.realtime.on('order.item_kitchen_changed', recargar),
      this.realtime.on('order.item_voided', recargar),
      this.realtime.on('table.status_changed', recargar),
      this.realtime.on('session.closed', recargar),
      this.realtime.on('payment.completed', recargar),
      this.realtime.on('resync', recargar),
      this.realtime.on('reconnected', recargar),
      // La cuenta se marca obsoleta, JAMÁS se recarga sola (ver `billStale`).
      this.realtime.on('session.bill_changed', (ev) => {
        if (ev.table_session_id === this.sessionBill()?.table_session_id) {
          this.billStale.set(true);
        }
      }),
    );
    this.realtime.connectStaff();
  }

  private disconnectRealtime(): void {
    for (const off of this.rtOff) off();
    this.rtOff = [];
    this.realtime.disconnect();
    if (this.reloadHandle !== null) {
      clearTimeout(this.reloadHandle);
      this.reloadHandle = null;
    }
  }

  /** Agrupa la ráfaga de una misma acción (y el replay al reconectar). */
  private scheduleReload(): void {
    if (this.reloadHandle !== null) return;
    this.reloadHandle = setTimeout(() => {
      this.reloadHandle = null;
      void this.reloadOrders().catch(() => undefined);
      void this.tableService.loadTables().catch(() => undefined);
    }, RELOAD_DEBOUNCE_MS);
  }

  /** Recarga la cuenta a petición del cajero, tras un `session.bill_changed`. */
  async refreshBill(): Promise<void> {
    await this.loadSessionBill(this.selectedTableId());
  }

  private async reloadOrders(): Promise<void> {
    // Spec 029, hotfix: `activeSessionsOnly` evita que un pedido ya cobrado
    // de una visita anterior (mesa ya liberada y reabierta por QR) vuelva a
    // mezclarse con la sesión activa de la misma mesa física.
    const orders = await this.api.listOrders(undefined, true);
    this.orders.set(orders);
    this.announcePending(orders);
  }

  /**
   * Suena la campana si hay pedidos por confirmar que no se habían visto.
   *
   * La primera carga solo siembra el conjunto: al abrir la pantalla con pedidos
   * viejos esperando, avisar sería ruido, no información.
   */
  private announcePending(orders: DiningOrder[]): void {
    const nuevos = newPendingIds(this.seenPending, orders);
    this.seenPending = new Set(orders.filter((o) => o.status === 'recibida').map((o) => o.id));
    if (nuevos.length > 0 && this.pendingSeeded) this.sound.bell();
    this.pendingSeeded = true;
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
      this.selectedOrderId.set(null);
      // Vacío a propósito: lo que haya aquí se graba como nombre en la factura,
      // así que un relleno tipo "Cliente Mesa 3" quedaría en el documento fiscal
      // en vez de los comensales reales. La pista va en el `placeholder`.
      this.customerName.set('');
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
    this.customerName.set('');
  }

  /**
   * "+ Crear Orden Manual" (o F3) en una mesa libre (feature 028, T021/T022).
   *
   * Solo abre el catálogo para empezar a armar el draft: el pedido no existe
   * en el backend hasta `createManualOrderFromDraft()`, así que nada se manda
   * a cocina ni descuenta inventario todavía.
   */
  startManualOrder(): void {
    if (!this.selectedTableId()) return;
    this.manualOrderBuilding.set(true);
    this.selectedOrderId.set(null);
    this.draftLines.set([]);
    this.openCatalog();
  }

  /**
   * Crea el pedido de mostrador armado en `draftLines`, en una sola llamada
   * (feature 028, T023) — a diferencia de `saveOrder()` (que usa
   * `addTableItem`, un POST por línea, y descuenta inventario al toque), este
   * pedido se manda con `hold_for_payment: true`: no llega a cocina ni toca
   * inventario hasta que se cobre con `checkoutAndSend()`.
   */
  async createManualOrderFromDraft(): Promise<boolean> {
    const tableId = this.selectedTableId();
    if (!tableId || this.draftLines().length === 0) return false;
    this.submitting.set(true);
    this.error.set(null);
    try {
      const items = this.draftLines().map((l) =>
        l.kind === 'combo'
          ? { combo_id: l.comboId, quantity: l.quantity, notes: l.notes }
          : {
              product_variant_id: l.variant.id,
              quantity: l.quantity,
              option_ids: l.options.map((o) => o.id),
              notes: l.notes,
            },
      );
      const order = await this.api.createManualOrder({
        channel: 'counter',
        dining_table_id: tableId,
        customer_name: this.customerName().trim() || null,
        items,
        hold_for_payment: true,
      });
      this.draftLines.set([]);
      this.manualOrderBuilding.set(false);
      await this.reload();
      this.selectedOrderId.set(order.id);
      this.toast.success('Pedido creado — cóbralo desde el panel de la derecha.');
      return true;
    } catch (err) {
      this.error.set(this.api.extractError(err, 'No se pudo crear el pedido.'));
      this.toast.error(this.error()!);
      return false;
    } finally {
      this.submitting.set(false);
    }
  }

  /** Pista del campo Cliente. No se guarda: solo orienta al cajero. */
  readonly customerPlaceholder = computed(() => {
    const table = this.selectedTable();
    return table ? `Cliente · Mesa ${table.number}` : 'Cliente';
  });

  cancelSelection(): void {
    this.selectedTableId.set(null);
    this.selectedOrderId.set(null);
    this.resetTransient();
  }

  private resetTransient(): void {
    this.draftLines.set([]);
    this.catalogOpen.set(false);
    this.configuringProduct.set(null);
    this.error.set(null);
    this.manualOrderBuilding.set(false);
    this.billingCustomerName.set('Consumidor Final');
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
      sel.variant.id +
      '|' +
      sel.options
        .map((o) => o.id)
        .sort()
        .join(',') +
      '|' +
      (sel.notes ?? '');
    this.draftLines.update((lines) => {
      const existing = lines.find((l) => l.key === key);
      if (existing) {
        return lines.map((l) =>
          l.key === key ? { ...l, quantity: l.quantity + sel.quantity } : l,
        );
      }
      const line: ProductDraftLine = {
        kind: 'product',
        key,
        product: sel.product,
        variant: sel.variant,
        options: sel.options,
        quantity: sel.quantity,
        notes: sel.notes,
        unitPrice,
      };
      return [...lines, line];
    });
    this.configuringProduct.set(null);
    this.catalogOpen.set(false);
  }

  /** Selección explícita de un combo (paralelo a `addDraftFromSelection`). */
  addComboDraft(promo: Promotion, quantity: number): void {
    const key = 'combo:' + promo.id;
    this.draftLines.update((lines) => {
      const existing = lines.find((l) => l.key === key);
      if (existing) {
        return lines.map((l) => (l.key === key ? { ...l, quantity: l.quantity + quantity } : l));
      }
      const line: ComboDraftLine = {
        kind: 'combo',
        key,
        comboId: promo.id,
        comboName: promo.name,
        quantity,
        notes: null,
        unitPrice: Number(promo.value),
      };
      return [...lines, line];
    });
    this.configuringProduct.set(null);
    this.catalogOpen.set(false);
  }

  /** Productos incluidos en un combo, para mostrarlos como bullets del carrito. */
  private comboBullets(comboId: string): string[] {
    const promo = this.combos().find((p) => p.id === comboId);
    const lk = this.lookup();
    return (promo?.combo_items ?? []).map(
      (ci) => `${ci.quantity}x ${lk.variantLabel(ci.product_variant_id)}`,
    );
  }

  /** Agrupa ítems de pedido por `combo_id`: sus componentes reales comparten uno. */
  private groupByCombo(items: DiningOrderItem[]): Map<string, DiningOrderItem[]> {
    const groups = new Map<string, DiningOrderItem[]>();
    for (const it of items) {
      if (!it.combo_id) continue;
      const arr = groups.get(it.combo_id) ?? [];
      arr.push(it);
      groups.set(it.combo_id, arr);
    }
    return groups;
  }

  /**
   * Cuántas unidades completas del combo hay presentes entre sus componentes ya
   * guardados (mínimo por componente, igual que `combo_discount_for_lines` del
   * backend) — para mostrar "2x Combo X" en vez de una línea por componente.
   */
  private comboUnitsPresent(comboId: string, items: DiningOrderItem[]): number {
    const promo = this.combos().find((p) => p.id === comboId);
    const recipe = promo?.combo_items ?? [];
    if (recipe.length === 0) return 0;
    const qtyByVariant = new Map<string, number>();
    for (const it of items) {
      qtyByVariant.set(
        it.product_variant_id,
        (qtyByVariant.get(it.product_variant_id) ?? 0) + it.quantity,
      );
    }
    return Math.min(
      ...recipe.map((ci) =>
        Math.floor((qtyByVariant.get(ci.product_variant_id) ?? 0) / ci.quantity),
      ),
    );
  }

  /**
   * Subtotal a mostrar para un combo ya guardado: las unidades que forman un
   * combo completo se muestran al precio del bundle, y solo el remanente que
   * no alcanza a formarlo (por una anulación parcial en cocina) se muestra a
   * precio normal — mismo criterio que `combo_discount_for_lines` del backend,
   * para que el número que ve el cajero coincida con lo que se cobrará.
   */
  private comboDisplaySubtotal(
    promo: Promotion | undefined,
    its: DiningOrderItem[],
    units: number,
  ): number {
    const normalTotal = its.reduce((s, it) => s + Number(it.unit_price) * it.quantity, 0);
    if (units <= 0 || !promo) return normalTotal;

    const priceByVariant = new Map<string, number>();
    for (const it of its) priceByVariant.set(it.product_variant_id, Number(it.unit_price));
    const coveredNormalTotal = promo.combo_items.reduce(
      (s, ci) => s + (priceByVariant.get(ci.product_variant_id) ?? 0) * ci.quantity * units,
      0,
    );
    return Number(promo.value) * units + (normalTotal - coveredNormalTotal);
  }

  incDraft(key: string): void {
    this.draftLines.update((l) =>
      l.map((x) => (x.key === key ? { ...x, quantity: x.quantity + 1 } : x)),
    );
  }
  decDraft(key: string): void {
    this.draftLines.update((l) =>
      l
        .map((x) => (x.key === key ? { ...x, quantity: x.quantity - 1 } : x))
        .filter((x) => x.quantity > 0),
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
        order = await this.api.addTableItem(
          tableId,
          l.kind === 'combo'
            ? { combo_id: l.comboId, quantity: l.quantity, notes: l.notes }
            : {
                product_variant_id: l.variant.id,
                quantity: l.quantity,
                option_ids: l.options.map((o) => o.id),
                notes: l.notes,
              },
        );
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

  /** Anula todos los componentes reales de un combo agrupado en una sola acción. */
  async voidPersistedCombo(comboId: string): Promise<void> {
    const order = this.selectedOrder();
    if (!order) return;
    const ids = (order.items ?? [])
      .filter((i) => i.combo_id === comboId && i.estado_cocina !== 'anulado')
      .map((i) => i.id);
    if (ids.length === 0) return;
    const ok = await this.confirm.ask({
      title: 'Anular combo',
      message:
        '¿Anular todos los productos de este combo? Se revierte el inventario de lo que aún no se preparó.',
      confirmText: 'Anular',
    });
    if (!ok) return;
    this.submitting.set(true);
    try {
      for (const id of ids) await this.api.voidItem(id, 'Combo anulado desde terminal');
      await this.reload();
    } catch (err) {
      this.toast.error(this.api.extractError(err, 'No se pudo anular el combo.'));
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

  /**
   * Marca listo el pedido entero, en una sola petición.
   *
   * Antes recorría los ítems encadenando dos PATCH por cada uno para respetar
   * el paso intermedio; ahora `POST /orders/{id}/ready` lo resuelve del lado
   * del servidor y emite sus eventos.
   */
  async marcarListo(): Promise<void> {
    const order = this.selectedOrder();
    if (!order) return;
    this.submitting.set(true);
    try {
      await this.api.markOrderReady(order.id);
      await this.reload();
    } catch (err) {
      this.toast.error(this.api.extractError(err, 'No se pudo marcar como listo.'));
    } finally {
      this.submitting.set(false);
    }
  }

  /**
   * Marca listo lo que hay detrás de **una línea** del carrito.
   *
   * Una línea de combo son varios `order_items`, de ahí que sea una lista. Solo
   * se tocan los que siguen en curso: mandar un PATCH sobre uno ya `listo` lo
   * rechazaría el backend con un `409` y tumbaría el combo entero. El salto
   * directo desde `pendiente` es legal, así que es un PATCH por ítem y no dos.
   */
  async avanzarItem(key: string): Promise<void> {
    const linea = this.cartView().find((l) => l.key === key);
    if (!linea || linea.kind !== 'persisted') return;
    if (linea.pendingItemIds.length === 0) return;
    this.submitting.set(true);
    try {
      for (const id of linea.pendingItemIds) {
        await this.api.updateItemKitchen(id, 'listo');
      }
      await this.reload();
    } catch (err) {
      this.toast.error(this.api.extractError(err, 'No se pudo marcar el producto como listo.'));
    } finally {
      this.submitting.set(false);
    }
  }

  /**
   * Deja la mesa en condiciones de cobrarse. Devuelve `false` si el cajero
   * decide no cobrar todavía.
   *
   * El backend rechaza cerrar una sesión con ítems sin terminar. Mandar al
   * cajero a marcarlos uno a uno para poder cobrar era justo la fricción que
   * obligaba a tener una pantalla de cocina aparte: aquí se le pregunta una vez
   * y se resuelven todos de golpe.
   *
   * Refresca **solo los pedidos**, nunca la cuenta: llega con el efectivo ya
   * tecleado, y un `bill` nuevo se lo borraría justo antes de cobrar.
   */
  readonly ensureReadyToCharge = async (): Promise<boolean> => {
    const pedidos = this.ordersToCharge().filter((o) =>
      (o.items ?? []).some((i) => KITCHEN_NOT_READY.includes(i.estado_cocina)),
    );
    const n = pedidos.reduce(
      (total, o) =>
        total + (o.items ?? []).filter((i) => KITCHEN_NOT_READY.includes(i.estado_cocina)).length,
      0,
    );
    if (n === 0) return true;

    const ok = await this.confirm.ask({
      title: 'Quedan productos sin marcar',
      message:
        `${n} ${n === 1 ? 'producto sigue' : 'productos siguen'} sin marcar como ` +
        `${n === 1 ? 'listo' : 'listos'}. Se ${n === 1 ? 'marcará' : 'marcarán'} y se cobrará la mesa.`,
      confirmText: 'Marcar y cobrar',
    });
    if (!ok) return false;

    try {
      for (const o of pedidos) {
        await this.api.markOrderReady(o.id);
      }
      await this.reloadOrders();
      return true;
    } catch (err) {
      this.toast.error(this.api.extractError(err, 'No se pudieron marcar los productos.'));
      return false;
    }
  };

  /**
   * Los pedidos que entran en el cobro en curso.
   *
   * `sessionBill().order_ids` sale de la misma `compute_bill` que produce el
   * desglose, así que marcar listo y cobrar no pueden discrepar. Sin cuenta
   * cargada se cae a los pedidos activos de la mesa.
   */
  private ordersToCharge(): DiningOrder[] {
    const bill = this.sessionBill();
    if (bill) {
      const ids = new Set(bill.order_ids);
      return this.orders().filter((o) => ids.has(o.id));
    }
    const tableId = this.selectedTableId();
    return tableId ? this.ordersOfTable(tableId) : [];
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
   * La mesa tiene consumo pero no hay sesión activa de la que colgar la cuenta.
   *
   * Es un descuadre: sin esto el panel decía "Selecciona una mesa con consumo"
   * —que es falso— y el cajero se quedaba sin saber por qué no puede cobrar.
   */
  readonly billOrphan = signal(false);
  /**
   * La cuenta cambió en el servidor y lo que se ve está desactualizado.
   *
   * **Solo marca, nunca recarga.** `SessionBillPanelComponent` resetea el método
   * de pago y el efectivo recibido cada vez que cambia la identidad del objeto
   * `bill`, así que recargar al recibir el evento le borraría al cajero lo que
   * está tecleando —justo cuando entra un pedido nuevo, que es cuando más ocupado
   * está—. La recarga la decide él con el botón "Actualizar".
   */
  readonly billStale = signal(false);

  /**
   * Carga la cuenta de la mesa seleccionada.
   *
   * La unidad de cobro ya no es el pedido sino la **sesión de mesa**: cerrarla
   * cobra todos sus pedidos, cierra a los comensales y libera la mesa en una
   * sola operación, en vez del antiguo `block` → `pay` → `release` por orden.
   */
  async loadSessionBill(tableId: string | null): Promise<void> {
    this.billStale.set(false);
    if (!tableId) {
      this.sessionBill.set(null);
      this.billOrphan.set(false);
      return;
    }
    this.billLoading.set(true);
    try {
      const sessions = await this.tableSessions.list();
      const session = sessions.find((s) => s.dining_table_id === tableId);
      this.sessionBill.set(session ? await this.tableSessions.bill(session.id) : null);
      // Sin sesión pero con pedidos vivos SIN PAGAR: la mesa no se puede
      // cobrar y hay que decirlo, no dejar el panel como si estuviera vacía.
      // Spec 029 hotfix: antes contaba cualquier pedido no terminal, sin
      // mirar `paid` — un pedido QR/mostrador ya pagado nunca llega a
      // `status === 'pagada'` (research.md D2), así que se marcaba huérfano
      // aunque ya estuviera resuelto.
      this.billOrphan.set(!session && this.tableOrders(tableId).some((o) => !o.paid));
    } catch (err) {
      this.sessionBill.set(null);
      this.billOrphan.set(false);
      this.error.set(this.tableSessions.extractError(err, 'No se pudo cargar la cuenta.'));
    } finally {
      this.billLoading.set(false);
    }
  }

  /** Tras cobrar: arma las facturas, refresca todo y suelta la selección. */
  async onCharged(closed: CloseSessionResponse): Promise<void> {
    const total = Number(this.sessionBill()?.total ?? 0);
    this.lastSale.set({ total, customer: this.customerName() || 'Mesa' });
    this.successOpen.set(true);
    this.sessionBill.set(null);
    await Promise.all([this.loadReceipts(closed), this.reload()]);
    this.cancelSelection();
  }

  /**
   * Trae las ventas recién emitidas para poder imprimirlas.
   *
   * Un fallo aquí **no invalida el cobro** —ya está registrado—: solo deja el
   * diálogo sin botón de imprimir. Desde Ventas se puede reimprimir después.
   */
  private async loadReceipts(closed: CloseSessionResponse): Promise<void> {
    this.lastReceipts.set([]);
    try {
      const sales = await Promise.all(closed.sale_ids.map((id) => this.sales.get(id)));
      this.lastReceipts.set(sales.map((sale) => saleToReceipt(sale, this.receiptContext())));
    } catch {
      this.toast.error('El cobro se registró, pero no se pudo preparar la factura.');
    }
  }

  private receiptContext(): ReceiptContext {
    return {
      businessName: this.tenantInfo.businessName(),
      logoUrl: this.tenantInfo.logoUrl(),
      message: this.tenantInfo.receiptMessage(),
      methodName: (id) => this.methodName(id),
    };
  }

  closeSuccess(): void {
    this.successOpen.set(false);
  }

  /**
   * Cobra, factura y envía a cocina un pedido de mostrador (feature 028,
   * T024/T025). A diferencia de `SessionBillPanelComponent.charge()` (que
   * cierra la **sesión de mesa** completa, unified/split), esto paga **un
   * pedido** — el que crea `createManualOrderFromDraft()` — con
   * `POST /orders/{id}/checkout-and-send`.
   *
   * `version` viaja siempre: es el backstop del backend contra doble clic si
   * el guardado del botón deshabilitado fallara por lo que sea.
   */
  async checkoutAndSend(payments: PaymentLine[]): Promise<boolean> {
    const order = this.selectedOrder();
    const shiftId = this.cashShiftId();
    if (!order || !shiftId) {
      this.error.set('No hay un turno de caja abierto.');
      return false;
    }
    this.checkoutSubmitting.set(true);
    this.error.set(null);
    try {
      // Spec 029, Historia 2: sin descuento manual — `discount` ni se envía,
      // el backend lo exige en 0 (`CheckoutAndSendIn.discount`, `le=0`).
      const sale = await this.api.checkoutAndSend(order.id, {
        version: order.version ?? 0,
        cash_shift_id: shiftId,
        payments,
        billing_customer_name: this.billingCustomerName().trim() || 'Consumidor Final',
      });
      this.lastSale.set({ total: Number(sale.total), customer: sale.customer_name || 'Mostrador' });
      this.lastReceipts.set([saleToReceipt(sale, this.receiptContext())]);
      this.checkoutSaleByOrderId.update((m) => ({ ...m, [order.id]: sale }));
      this.successOpen.set(true);
      this.toast.success('Pedido cobrado, facturado y enviado a cocina');
      await this.reload();
      this.cancelSelection();
      return true;
    } catch (err) {
      this.error.set(this.api.extractError(err, 'No se pudo cobrar el pedido.'));
      this.toast.error(this.error()!);
      return false;
    } finally {
      this.checkoutSubmitting.set(false);
    }
  }

  /**
   * Rechaza el pedido seleccionado en vez de cobrarlo (spec 029, hotfix #4):
   * no genera venta ni movimiento de caja — `checkout.cancel_order` en el
   * backend, que ya garantiza eso por diseño y ahora además rechaza con 409
   * si el pedido ya tiene una `Sale` asociada. Mismo patrón de confirmación
   * con motivo fijo que `voidPersistedItem`/`voidPersistedCombo`.
   */
  async rejectOrder(): Promise<void> {
    const order = this.selectedOrder();
    if (!order) return;
    const ok = await this.confirm.ask({
      title: 'Rechazar pedido',
      message: '¿Rechazar este pedido? No se registrará venta ni movimiento de caja.',
      confirmText: 'Rechazar',
    });
    if (!ok) return;
    this.submitting.set(true);
    try {
      await this.api.cancelOrder(order.id, 'Rechazado desde terminal');
      this.selectedOrderId.set(null);
      await this.reload();
    } catch (err) {
      this.toast.error(this.api.extractError(err, 'No se pudo rechazar el pedido.'));
    } finally {
      this.submitting.set(false);
    }
  }

  /**
   * Libera una mesa ya cobrada por completo, sin cobrar nada (feature 028,
   * T034/T035) — reemplaza tener que pasar por "Cobrar y cerrar mesa" en una
   * mesa que ya no debe nada, que era justo el botón que fallaba con un error
   * en una orden QR ya pagada (el bug de origen de esta pantalla).
   */
  async releaseTable(): Promise<void> {
    const bill = this.sessionBill();
    if (!bill) return;
    this.submitting.set(true);
    try {
      await this.tableSessions.release(bill.table_session_id);
      this.toast.success('Mesa liberada');
      await this.reload();
      this.cancelSelection();
    } catch (err) {
      this.toast.error(this.tableSessions.extractError(err, 'No se pudo liberar la mesa.'));
    } finally {
      this.submitting.set(false);
    }
  }

  /**
   * Imprime la factura. Sin argumento salen todas; con índice, solo la de ese
   * comensal — que es como se pide en el mostrador cuando la cuenta va dividida.
   */
  printReceipt(index?: number): void {
    const todas = this.lastReceipts();
    const receipts = index == null ? todas : todas.slice(index, index + 1);
    if (receipts.length === 0) return;
    printReceiptHtml(buildReceiptHtml(receipts, { paperWidthMm: this.printer.paperWidthMm() }));
  }

  /** "Mesa 4", para el encabezado del ticket de pre-cuenta y de la factura. */
  private tableLabel(): string {
    const t = this.selectedTable();
    return t ? `Mesa ${t.number}${t.name ? ' · ' + t.name : ''}` : '';
  }

  /**
   * Resuelve la venta ya facturada de un pedido, sea de origen QR o de
   * mostrador (feature 028, T033; FR-012 — "cualquier orden que ya tenga un
   * documento de venta emitido", sin importar quién la cobró ni en qué
   * pestaña). Primero mira la caché local (`checkoutSaleByOrderId`, la venta
   * que esta misma pantalla acaba de cobrar) para no golpear la red de
   * inmediato después de cobrar; si no está ahí —pedido QR, recarga de
   * página, u otra caja— la busca en el backend
   * (`DiningSessionService.findSaleForOrder`, que resuelve `order_id` →
   * factura → venta completa). Separado de `printOrderInvoice` para poder
   * probar esta parte (caché/red/errores) sin disparar el mecanismo real de
   * impresión (iframe + `window.print`), que ningún test de esta pantalla
   * ejercita de punta a punta.
   */
  async resolveSaleForOrder(orderId: string): Promise<Sale | null> {
    const cached = this.checkoutSaleByOrderId()[orderId];
    if (cached) return cached;
    try {
      const found = await this.api.findSaleForOrder(orderId);
      if (!found) {
        this.toast.error('Este pedido todavía no tiene una factura emitida.');
        return null;
      }
      this.checkoutSaleByOrderId.update((m) => ({ ...m, [orderId]: found }));
      return found;
    } catch (err) {
      this.toast.error(this.api.extractError(err, 'No se pudo buscar la factura.'));
      return null;
    }
  }

  /** Reimprime la factura de un pedido ya facturado (feature 028, T033) —
   *  ver `resolveSaleForOrder` para cómo se consigue la venta. */
  async printOrderInvoice(orderId: string): Promise<void> {
    const sale = await this.resolveSaleForOrder(orderId);
    if (!sale) return;
    printReceiptHtml(
      buildReceiptHtml([saleToReceipt(sale, this.receiptContext())], {
        paperWidthMm: this.printer.paperWidthMm(),
      }),
    );
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  fmt(n: number): string {
    return formatMoney(n);
  }

  private methodName(id: string): string {
    return this.paymentMethods().find((m) => m.id === id)?.name ?? 'Pago';
  }

  private orderSubtotal(o: DiningOrder): number {
    const lk = this.lookup();
    const syncedNow = currentNow(this.promotionService);
    // A-09: mismo criterio que cartView — sin sync, sin descuento de previsualización.
    const now = syncedNow ?? new Date(0);
    const promos = syncedNow === null ? [] : this.promotionService.activePromotions();
    const items = (o.items ?? []).filter((i) => i.estado_cocina !== 'anulado');
    const plain = items.filter((i) => !i.combo_id);
    let total = plain.reduce((s, i) => {
      const unitPrice = discountedUnitPrice(
        promos,
        now,
        lk.productId(i.product_variant_id),
        lk.categoryId(i.product_variant_id),
        Number(i.unit_price),
        i.quantity,
      );
      return s + unitPrice * i.quantity;
    }, 0);
    for (const [comboId, its] of this.groupByCombo(items)) {
      const promo = this.combos().find((p) => p.id === comboId);
      const units = this.comboUnitsPresent(comboId, its);
      total += this.comboDisplaySubtotal(promo, its, units);
    }
    return total;
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
