import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import { PendingPaymentsPanelComponent } from './pending-payments-panel.component';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PromotionService } from '../../promotions/services/promotion.service';
import { TableService } from '../services/table.service';
import { Table } from '../interfaces/table.interface';
import { DiningOrder, DiningOrderItem, PaymentAttempt } from '../interfaces/dining.interface';
import { CashService } from '../../cash-register/services/cash.service';
import { CashShift } from '../../cash-register/interfaces/cash.interface';

const API = environment.apiBaseUrl;

/** Cede un microtask (misma técnica que payment-attempt-review-panel.component.spec.ts):
 *  `flush()` resuelve el observable, pero el `finally`/segundo `await` del
 *  método que lo consume corre en un microtask aparte. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function table(partial: Partial<Table>): Table {
  return { id: 't1', number: 1, name: null, qr_token: 'tok', active: true, status: 'ocupada', ...partial };
}

function order(id: string, tableId: string, customerName: string | null = null): DiningOrder {
  return {
    id,
    channel: 'qr',
    status: 'recibida',
    dining_table_id: tableId,
    customer_name: customerName,
    created_at: '2026-08-18T23:09:00',
    items: [
      { id: `${id}-i1`, product_variant_id: 'v1', quantity: 1, unit_price: '8000', estado_cocina: 'pendiente' },
    ] as DiningOrderItem[],
  } as DiningOrder;
}

function attempt(partial: Partial<PaymentAttempt>): PaymentAttempt {
  return {
    id: 'a1',
    order_id: 'o1',
    payment_method_id: 'pm1',
    payment_method_name: 'Efectivo',
    is_cash: true,
    status: 'pendiente',
    amount_received: null,
    change_amount: null,
    receipt_file_url: null,
    rejection_reason: null,
    resolved_by_user_id: null,
    resolved_at: null,
    created_at: '2026-08-18T23:09:00',
    ...partial,
  };
}

function cashShift(): CashShift {
  return {
    id: 'shift-1',
    cash_register_id: 'r1',
    user_id: 'u1',
    opening_amount: '0',
    opened_at: '2026-08-20T08:00:00',
    status: 'open',
  } as CashShift;
}

/** Spec 036, Historia 1: sección "Pagos por confirmar" — agrega TODOS los
 *  pagos pendientes de revisión (no solo los de la mesa seleccionada). */
describe('PendingPaymentsPanelComponent', () => {
  let fixture: ComponentFixture<PendingPaymentsPanelComponent>;
  let store: PosTerminalStore;
  let tableService: TableService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PendingPaymentsPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        {
          provide: PromotionService,
          useValue: {
            loadActive: () => {},
            activePromotions: () => [],
            ready: () => false,
            now: () => new Date(),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(PendingPaymentsPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    tableService = TestBed.inject(TableService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sin pagos pendientes muestra un mensaje claro, no una lista en blanco', () => {
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No hay pagos esperando revisión');
  });

  it('renderiza una tarjeta por pago pendiente con mesa, cliente, método y total', async () => {
    tableService.tables.set([table({ id: 't1', number: 2 })]);
    store.orders.set([order('o1', 't1', 'Ana')]);
    fixture.detectChanges();

    http.expectOne(`${API}/orders/o1/payment-attempts`).flush([attempt({})]);
    await tick();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Mesa 2');
    expect(text).toContain('Ana');
    expect(text).toContain('Efectivo');
    expect(text).toContain('Pendiente de revisión');
    expect(text).toContain('$ 8.000');
  });

  it('seleccionar la tarjeta (fuera del panel de revisión) invoca store.selectTable()', async () => {
    tableService.tables.set([table({ id: 't1', number: 2 })]);
    store.orders.set([order('o1', 't1')]);
    fixture.detectChanges();
    http.expectOne(`${API}/orders/o1/payment-attempts`).flush([attempt({})]);
    await tick();
    fixture.detectChanges();

    const cardButton = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    cardButton.click();

    // selectTable() dispara la carga de la cuenta de la mesa (comportamiento
    // ya existente, sin cambios) — se resuelve para no dejar la petición abierta.
    http.expectOne(`${API}/table-sessions`).flush([]);
    expect(store.selectedTableId()).toBe('t1');
  });

  it('confirmar efectivo desde la tarjeta llama al mismo endpoint que el panel de la mesa y refresca el store', async () => {
    tableService.tables.set([table({ id: 't1', number: 2 })]);
    store.orders.set([order('o1', 't1')]);
    TestBed.inject(CashService).shift.set(cashShift());
    const reloadSpy = vi.spyOn(store, 'reload').mockResolvedValue(undefined);
    fixture.detectChanges();
    http.expectOne(`${API}/orders/o1/payment-attempts`).flush([attempt({ status: 'pendiente', is_cash: true })]);
    await tick();
    fixture.detectChanges();

    const amountInput = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    amountInput.value = '10000';
    amountInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const confirmButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Confirmar efectivo'),
    ) as HTMLButtonElement;
    confirmButton.click();

    http
      .expectOne((r) => r.url === `${API}/orders/payment-attempts/a1/confirm-cash`)
      .flush(attempt({ status: 'confirmado', amount_received: '10000.00', change_amount: '2000.00' }));
    await tick();
    http
      .expectOne(`${API}/orders/o1/payment-attempts`)
      .flush([attempt({ status: 'confirmado', amount_received: '10000.00', change_amount: '2000.00' })]);
    await tick();

    expect(reloadSpy).toHaveBeenCalled();
  });

  it('aprobar transferencia desde la tarjeta llama al mismo endpoint que el panel de la mesa y refresca el store', async () => {
    tableService.tables.set([table({ id: 't1', number: 2 })]);
    store.orders.set([order('o1', 't1')]);
    TestBed.inject(CashService).shift.set(cashShift());
    const reloadSpy = vi.spyOn(store, 'reload').mockResolvedValue(undefined);
    fixture.detectChanges();
    http
      .expectOne(`${API}/orders/o1/payment-attempts`)
      .flush([
        attempt({
          status: 'pendiente',
          is_cash: false,
          payment_method_name: 'Transferencia',
          receipt_file_url: 'https://x/comprobante.png',
        }),
      ]);
    await tick();
    fixture.detectChanges();

    const approveButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.trim() === 'Aprobar',
    ) as HTMLButtonElement;
    approveButton.click();

    http
      .expectOne((r) => r.url === `${API}/orders/payment-attempts/a1/approve`)
      .flush(attempt({ status: 'confirmado' }));
    await tick();
    http.expectOne(`${API}/orders/o1/payment-attempts`).flush([attempt({ status: 'confirmado' })]);
    await tick();

    expect(reloadSpy).toHaveBeenCalled();
  });

  it('rechazar transferencia desde la tarjeta llama al mismo endpoint que el panel de la mesa y refresca el store', async () => {
    tableService.tables.set([table({ id: 't1', number: 2 })]);
    store.orders.set([order('o1', 't1')]);
    TestBed.inject(CashService).shift.set(cashShift());
    const reloadSpy = vi.spyOn(store, 'reload').mockResolvedValue(undefined);
    fixture.detectChanges();
    http
      .expectOne(`${API}/orders/o1/payment-attempts`)
      .flush([
        attempt({
          status: 'pendiente',
          is_cash: false,
          payment_method_name: 'Transferencia',
          receipt_file_url: 'https://x/comprobante.png',
        }),
      ]);
    await tick();
    fixture.detectChanges();

    const rejectToggle = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.trim() === 'Rechazar',
    ) as HTMLButtonElement;
    rejectToggle.click();
    fixture.detectChanges();

    const reasonInput = fixture.nativeElement.querySelector(
      'input[placeholder*="Motivo"]',
    ) as HTMLInputElement;
    reasonInput.value = 'Comprobante ilegible';
    reasonInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const confirmRejectButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.trim() === 'Confirmar rechazo',
    ) as HTMLButtonElement;
    confirmRejectButton.click();

    http
      .expectOne((r) => r.url === `${API}/orders/payment-attempts/a1/reject`)
      .flush(attempt({ status: 'rechazado', rejection_reason: 'Comprobante ilegible' }));
    await tick();
    http
      .expectOne(`${API}/orders/o1/payment-attempts`)
      .flush([attempt({ status: 'rechazado', rejection_reason: 'Comprobante ilegible' })]);
    await tick();

    expect(reloadSpy).toHaveBeenCalled();
  });
});
