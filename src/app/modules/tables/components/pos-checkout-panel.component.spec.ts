import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import { PosCheckoutPanelComponent } from './pos-checkout-panel.component';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PromotionService } from '../../promotions/services/promotion.service';
import { CashService } from '../../cash-register/services/cash.service';
import { PaymentMethodService } from '../../sales/services/payment-method.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { ConfirmService } from '../../../shared/feedback/confirm.service';
import { DiningOrder } from '../interfaces/dining.interface';
import { CashShift } from '../../cash-register/interfaces/cash.interface';
import { PaymentMethod, PaymentMethodCheckoutOption, Sale } from '../../sales/interfaces/sales.interface';

const API = environment.apiBaseUrl;

/** Pedido de mostrador ya creado con `hold_for_payment` (T023), esperando
 *  cobro (T024/T025). */
function manualOrder(): DiningOrder {
  return {
    id: 'o1',
    channel: 'POS',
    status: 'recibida',
    version: 1,
    dining_table_id: 't1',
    customer_name: null,
    created_at: '2026-08-20T10:00:00',
    items: [{ id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '10000', estado_cocina: 'pendiente' }],
  } as DiningOrder;
}

const methods: PaymentMethod[] = [
  { id: 'pm-cash', catalog_id: null, name: 'Efectivo', type: 'cash', is_cash: true, active: true, is_complete: true },
  { id: 'pm-transfer', catalog_id: null, name: 'Datáfono', type: 'card', is_cash: false, active: true, is_complete: true },
];

/** Spec 032: lo que ve el checkout es el listado ya filtrado y sin
 * `payment_info` — mismo `id`/`name`/`is_cash` que `methods`, forma reducida. */
const checkoutOptions: PaymentMethodCheckoutOption[] = methods.map(
  ({ id, name, is_cash }) => ({ id, name, is_cash }),
);

/** Feature 028, T024/T026/T032/T033/T035: panel de cobro editable de un
 *  pedido de mostrador (modo `terminal-pos`, canal `counter`/`waiter`). */
describe('PosCheckoutPanelComponent — modo terminal-pos', () => {
  let fixture: ComponentFixture<PosCheckoutPanelComponent>;
  let store: PosTerminalStore;
  let http: HttpTestingController;
  let toast: ToastService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosCheckoutPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });

    fixture = TestBed.createComponent(PosCheckoutPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);

    TestBed.inject(CashService).shift.set({
      id: 'shift-1',
      cash_register_id: 'r1',
      user_id: 'u1',
      opening_amount: '0',
      opened_at: '2026-08-20T08:00:00',
      status: 'open',
    } as CashShift);
    TestBed.inject(PaymentMethodService).methods.set(methods);
    TestBed.inject(PaymentMethodService).checkoutOptions.set(checkoutOptions);

    store.orders.set([manualOrder()]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  const selects = (): HTMLSelectElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('select'));
  const numberInputs = (): HTMLInputElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('input[type="number"]'));
  const textInputs = (): HTMLInputElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('input[type="text"]'));

  async function fill(el: HTMLSelectElement | HTMLInputElement, value: string): Promise<void> {
    el.value = value;
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('el nombre de facturación va por defecto "Consumidor Final" (T024)', () => {
    const billingInput = textInputs().find((i) => i.placeholder === 'Consumidor Final');
    expect(billingInput).toBeDefined();
    expect(billingInput!.value).toBe('Consumidor Final');
  });

  it('en efectivo muestra el vuelto calculado antes de cobrar (T026)', async () => {
    await fill(selects()[0], 'pm-cash');
    await fill(numberInputs()[0], '15000');

    expect(fixture.nativeElement.textContent).toContain('Vuelto');
    expect(fixture.nativeElement.textContent).toContain('5.000');
  });

  it('con datáfono/transferencia no hay ningún paso de comprobante ni revisión (T026)', async () => {
    await fill(selects()[0], 'pm-transfer');

    expect(fixture.nativeElement.querySelector('input[type="file"]')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('comprobante');
    expect(fixture.nativeElement.textContent).not.toContain('Pendiente de revisión');
  });

  it('cobra, factura y envía a cocina con "checkout-and-send" (T025)', async () => {
    await fill(selects()[0], 'pm-cash');
    await fill(numberInputs()[0], '10000');

    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Cobrar, Facturar y Enviar a Cocina'),
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(false);

    button.click();
    const req = http.expectOne(`${API}/orders/o1/checkout-and-send`);
    expect(req.request.body.version).toBe(1);
    expect(req.request.body.cash_shift_id).toBe('shift-1');
    expect(req.request.body.billing_customer_name).toBe('Consumidor Final');
    req.flush({ id: 's1', total: '10000', customer_name: 'Consumidor Final', status: 'paid', sold_at: '2026-08-20T10:05:00', items: [], payments: [] } as unknown as Sale);
    await fixture.whenStable();
  });

  // El click real dispara `printReceiptHtml` (iframe + `window.print`), que
  // en jsdom deja un listener asíncrono colgado y hace que el runner de esta
  // suite (Angular + Vitest, sin soporte de `vi.mock` para imports relativos)
  // rompa el siguiente test al recomputar señales sobre un injector ya
  // destruido — por eso, igual que "Imprimir Pre-cuenta" (T032) aquí abajo,
  // este test solo comprueba la presencia del botón; la lógica real de
  // caché/red/toast (T033) se prueba sin pasar por el DOM ni por
  // `printReceiptHtml`, directamente sobre `PosTerminalStore.resolveSaleForOrder`
  // en `pos-terminal.store.spec.ts`.
  it('T033/spec 029: ofrece "Imprimir Factura" para el pedido seleccionado, con cuenta de sesión', () => {
    const reprintButton = (): HTMLButtonElement | undefined =>
      Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
        (b as HTMLButtonElement).textContent?.includes('Imprimir Factura'),
      ) as HTMLButtonElement | undefined;

    expect(reprintButton()).toBeUndefined(); // sin `sessionBill`, todavía no hay dónde anclarlo

    store.sessionBill.set({
      table_session_id: 'ts1',
      dining_table_id: 't1',
      total: '10000',
      order_ids: ['o1'],
      split: [],
    });
    fixture.detectChanges();

    expect(reprintButton()).toBeDefined();
  });

  it('spec 046, FR-005/FR-006/SC-004: "Dividir la cuenta entre varias personas" ya no existe en el panel de mostrador', () => {
    // Sin sessionBill: rama "+ Crear pedido nuevo" / cobro editable sin cuenta todavía.
    expect(fixture.nativeElement.textContent).not.toContain('Dividir la cuenta entre varias personas');

    // Con sessionBill: hoy ahí vivía el botón, junto a "Liberar Mesa"/"Imprimir Factura".
    store.sessionBill.set({
      table_session_id: 'ts1',
      dining_table_id: 't1',
      total: '10000',
      order_ids: ['o1'],
      split: [
        { participant_id: 'p1', display_label: 'Ana', subtotal: '5000', items: [], discount: '0' },
        { participant_id: 'p2', display_label: 'Luis', subtotal: '5000', items: [], discount: '0' },
      ],
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Dividir la cuenta entre varias personas');
  });

  it('spec 046, FR-001/SC-001: "Liberar Mesa" no se muestra mientras la mesa tiene un pago pendiente de confirmar', () => {
    store.sessionBill.set({
      table_session_id: 'ts1',
      dining_table_id: 't1',
      total: '10000',
      order_ids: ['o1'],
      split: [],
    });
    // Pedido QR 'recibida' en la misma mesa: pone a centralState() en 'validar-pago'.
    store.orders.set([manualOrder(), { ...manualOrder(), id: 'o2', channel: 'QR_MENU', status: 'recibida' }]);
    fixture.detectChanges();

    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Liberar Mesa'),
    );
    expect(button).toBeUndefined();
  });

  it('spec 046, FR-002/SC-003: "Liberar Mesa" reaparece de inmediato al confirmarse el pago pendiente', () => {
    store.sessionBill.set({
      table_session_id: 'ts1',
      dining_table_id: 't1',
      total: '10000',
      order_ids: ['o1'],
      split: [],
    });
    store.orders.set([manualOrder(), { ...manualOrder(), id: 'o2', channel: 'QR_MENU', status: 'recibida' }]);
    fixture.detectChanges();
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
        (b as HTMLButtonElement).textContent?.includes('Liberar Mesa'),
      ),
    ).toBeUndefined();

    // Confirmar el pago pendiente: la orden QR ya no queda 'recibida' para esa mesa.
    store.orders.set([manualOrder()]);
    fixture.detectChanges();

    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Liberar Mesa'),
    ) as HTMLButtonElement;
    expect(button).toBeDefined();
  });

  it('T035: "Liberar Mesa" pide la liberación y muestra el motivo del 409 si falla', async () => {
    store.sessionBill.set({
      table_session_id: 'ts1',
      dining_table_id: 't1',
      total: '10000',
      order_ids: ['o1'],
      split: [],
    });
    fixture.detectChanges();

    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Liberar Mesa'),
    ) as HTMLButtonElement;
    expect(button).toBeDefined();

    button.click();
    const req = http.expectOne(`${API}/table-sessions/ts1/release`);
    req.flush({ detail: { error: 'Quedan ítems sin terminar en cocina' } }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();

    expect(toast.toasts().some((t) => t.kind === 'error' && t.text.includes('Quedan ítems sin terminar'))).toBe(
      true,
    );
  });

  it('T032: ofrece "Imprimir Pre-cuenta" cuando hay cuenta de sesión', () => {
    store.sessionBill.set({
      table_session_id: 'ts1',
      dining_table_id: 't1',
      total: '10000',
      order_ids: ['o1'],
      split: [],
    });
    fixture.detectChanges();

    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Imprimir Pre-cuenta'),
    );
    expect(button).toBeDefined();
  });

  it('spec 029 hotfix #4: "Rechazar pedido" pide confirmación y cancela sin venta ni movimiento de caja', async () => {
    const confirm = TestBed.inject(ConfirmService);

    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Rechazar pedido'),
    ) as HTMLButtonElement;
    expect(button).toBeDefined();

    button.click();
    confirm.respond(true);
    await Promise.resolve();

    const req = http.expectOne(`${API}/orders/o1/cancel`);
    expect(req.request.body).toEqual({ motivo: 'Rechazado desde terminal' });
    req.flush({ detail: 'boom' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
  });
});

/**
 * Spec 029, hotfix #3: un pedido de mesero que ya se envió a cocina
 * (`status !== 'recibida'`) no se puede cobrar con checkout-and-send — el
 * backend lo rechaza con 409 ("Solo se cobra y envía pedidos en
 * 'recibida'"), dejándolo `abierta` para siempre sin factura. Debe cobrarse
 * cerrando la sesión de mesa (`app-session-bill-panel`, `readOnly=false`),
 * el mismo mecanismo que el modo `resumen` ya usa en solo lectura.
 */
describe('PosCheckoutPanelComponent — pedido ya en cocina, cobro por sesión de mesa', () => {
  let fixture: ComponentFixture<PosCheckoutPanelComponent>;
  let store: PosTerminalStore;
  let http: HttpTestingController;

  function abiertaOrder(estado: 'listo' | 'pendiente' = 'listo'): DiningOrder {
    return {
      id: 'o1',
      channel: 'POS',
      status: 'abierta',
      version: 1,
      dining_table_id: 't1',
      customer_name: null,
      created_at: '2026-08-21T10:00:00',
      items: [{ id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '10000', estado_cocina: estado }],
    } as DiningOrder;
  }

  const bill = {
    table_session_id: 'ts1',
    dining_table_id: 't1',
    total: '10000',
    order_ids: ['o1'],
    split: [{ participant_id: null, display_label: null, subtotal: '10000', discount: '0', items: [] }],
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosCheckoutPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });

    fixture = TestBed.createComponent(PosCheckoutPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);

    TestBed.inject(CashService).shift.set({
      id: 'shift-1',
      cash_register_id: 'r1',
      user_id: 'u1',
      opening_amount: '0',
      opened_at: '2026-08-20T08:00:00',
      status: 'open',
    } as CashShift);
    TestBed.inject(PaymentMethodService).methods.set(methods);
    TestBed.inject(PaymentMethodService).checkoutOptions.set(checkoutOptions);

    store.orders.set([abiertaOrder()]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    store.sessionBill.set(bill as unknown as ReturnType<PosTerminalStore['sessionBill']>);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('muestra el panel de cobro por sesión ("Cobrar y cerrar mesa"), no el de checkout-and-send', () => {
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Cobrar y cerrar mesa');
    expect(texto).not.toContain('Cobrar, Facturar y Enviar a Cocina');
  });

  it('spec 046, FR-005/FR-006/SC-004: no ofrece "Dividir la cuenta entre varias personas" en el cobro por sesión de mesa', () => {
    expect(fixture.nativeElement.textContent).not.toContain('Dividir la cuenta entre varias personas');
  });

  it('al cobrar, llama primero a ensureReadyToCharge (beforeCharge conectado) y luego cierra la sesión', async () => {
    const spy = vi.spyOn(store, 'ensureReadyToCharge').mockResolvedValue(true);

    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = 'pm-cash';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input[type="number"]') as HTMLInputElement;
    input.value = '10000';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();

    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Cobrar y cerrar mesa'),
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(false);

    button.click();
    await Promise.resolve();
    expect(spy).toHaveBeenCalled();

    // Se prueba con un 409 (igual que "Liberar Mesa", T035 arriba) para
    // aislar la conexión beforeCharge → close() sin encadenar todo el
    // reload posterior a un cierre exitoso (`onCharged`), que no es lo que
    // este test verifica.
    const req = http.expectOne(`${API}/table-sessions/ts1/close`);
    expect(req.request.body.cash_shift_id).toBe('shift-1');
    req.flush({ detail: { error: 'Quedan ítems sin terminar en cocina' } }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
  });

  it('si ensureReadyToCharge devuelve false (cajero canceló), no cierra la sesión', async () => {
    vi.spyOn(store, 'ensureReadyToCharge').mockResolvedValue(false);

    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = 'pm-cash';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input[type="number"]') as HTMLInputElement;
    input.value = '10000';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();

    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Cobrar y cerrar mesa'),
    ) as HTMLButtonElement;
    button.click();
    await fixture.whenStable();

    http.expectNone(`${API}/table-sessions/ts1/close`);
  });

  it('spec 029 hotfix #4: también ofrece "Rechazar pedido" junto al cobro por sesión de mesa', async () => {
    const confirm = TestBed.inject(ConfirmService);

    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Rechazar pedido'),
    ) as HTMLButtonElement;
    expect(button).toBeDefined();

    button.click();
    confirm.respond(true);
    await Promise.resolve();

    const req = http.expectOne(`${API}/orders/o1/cancel`);
    expect(req.request.body).toEqual({ motivo: 'Rechazado desde terminal' });
    req.flush({ detail: 'boom' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
  });

  it('spec 029 hotfix #7: un pedido ya pagado (paid) pasa a solo lectura, sin dividir cuenta, método de pago ni "Rechazar pedido"', () => {
    store.orders.set([{ ...abiertaOrder(), paid: true }]);
    fixture.detectChanges();

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('nada que cobrar aquí');
    expect(texto).not.toContain('Dividir la cuenta entre varias personas');
    expect(texto).not.toContain('Cuenta única');
    expect(texto).not.toContain('Método de pago');

    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Rechazar pedido'),
    );
    expect(button).toBeUndefined();
  });
});
