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
import { DiningOrder } from '../interfaces/dining.interface';
import { CashShift } from '../../cash-register/interfaces/cash.interface';
import { PaymentMethod, Sale } from '../../sales/interfaces/sales.interface';

const API = environment.apiBaseUrl;

/** Pedido de mostrador ya creado con `hold_for_payment` (T023), esperando
 *  cobro (T024/T025). */
function manualOrder(): DiningOrder {
  return {
    id: 'o1',
    channel: 'counter',
    status: 'recibida',
    version: 1,
    dining_table_id: 't1',
    customer_name: null,
    created_at: '2026-08-20T10:00:00',
    items: [{ id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '10000', estado_cocina: 'pendiente' }],
  } as DiningOrder;
}

const methods: PaymentMethod[] = [
  { id: 'pm-cash', name: 'Efectivo', type: 'cash', is_cash: true, active: true },
  { id: 'pm-transfer', name: 'Datáfono', type: 'card', is_cash: false, active: true },
];

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
  it('T033: ofrece "Reimprimir Factura POS" para el pedido seleccionado, con cuenta de sesión', () => {
    const reprintButton = (): HTMLButtonElement | undefined =>
      Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
        (b as HTMLButtonElement).textContent?.includes('Reimprimir Factura POS'),
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
});
