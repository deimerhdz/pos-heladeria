import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { SessionBillPanelComponent } from './session-bill-panel.component';
import { CloseSessionPayload, SessionBill } from '../interfaces/dining.interface';
import { PaymentMethod } from '../../sales/interfaces/sales.interface';
import { emptyPaymentDraft } from '../services/payment-draft.util';

const API = environment.apiBaseUrl;

/** Cuenta de una mesa con un solo comensal: no se puede dividir. */
const bill: SessionBill = {
  table_session_id: 'ts1',
  dining_table_id: 't1',
  total: '12000',
  order_ids: ['o1'],
  split: [{ participant_id: 'p1', display_label: 'Ana', subtotal: '12000' }],
};

/** Dos comensales con consumo: habilita el modo dividido. */
const splitBill: SessionBill = {
  table_session_id: 'ts2',
  dining_table_id: 't2',
  total: '20000',
  order_ids: ['o2'],
  split: [
    { participant_id: 'p1', display_label: 'Ana', subtotal: '12000' },
    { participant_id: 'p2', display_label: 'Luis', subtotal: '8000' },
  ],
};

const methods = [
  { id: 'pm1', name: 'Efectivo', type: 'cash', is_cash: true, active: true },
  { id: 'pm2', name: 'Tarjeta', type: 'card', is_cash: false, active: true },
] as PaymentMethod[];

describe('SessionBillPanelComponent', () => {
  let fixture: ComponentFixture<SessionBillPanelComponent>;
  let panel: SessionBillPanelComponent;
  let http: HttpTestingController;

  beforeEach(() => {
    // Ver nota en `diner.service.spec.ts`: los specs comparten entorno.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SessionBillPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(SessionBillPanelComponent);
    panel = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    // `setInput` (y no asignar el campo) es lo que dispara `ngOnChanges`, que es
    // donde el panel toma la cuenta.
    setBill(bill);
    fixture.componentRef.setInput('methods', methods);
    fixture.componentRef.setInput('cashShiftId', 'shift-1');
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function setBill(value: SessionBill): void {
    fixture.componentRef.setInput('bill', value);
    fixture.detectChanges();
  }

  const selects = (): HTMLSelectElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('select'));

  const amounts = (): HTMLInputElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('input[type="number"]'));

  const combineBox = (): HTMLInputElement | null =>
    fixture.nativeElement.querySelector('input[type="checkbox"]');

  const chargeButton = (): HTMLButtonElement =>
    Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Cobrar'),
    )!;

  /** Escribe en un control real y espera al binding de ngModel. */
  async function fill(el: HTMLSelectElement | HTMLInputElement, value: string): Promise<void> {
    el.value = value;
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const chooseMethod = (methodId: string): Promise<void> => fill(selects()[0], methodId);

  /** Cobra y devuelve el cuerpo del `POST .../close`. */
  async function charge(): Promise<CloseSessionPayload> {
    const done = panel.charge();
    const req = http.expectOne(`${API}/table-sessions/ts1/close`);
    const body = req.request.body as CloseSessionPayload;
    req.flush({ table_session: {}, sale_ids: ['s1'] });
    await done;
    return body;
  }

  it('no deja cobrar mientras no se elige método de pago', () => {
    expect(panel.ready()).toBe(false);
    expect(chargeButton().disabled).toBe(true);
  });

  it('habilita el cobro al elegir método en la cuenta única', async () => {
    await chooseMethod('pm2');

    expect(panel.ready()).toBe(true);
    expect(chargeButton().disabled).toBe(false);
  });

  it('olvida el pago al cambiar de mesa', async () => {
    await chooseMethod('pm2');
    expect(panel.ready()).toBe(true);

    setBill({ ...bill, table_session_id: 'ts9', dining_table_id: 't9' });

    expect(panel.unifiedPayment()).toEqual(emptyPaymentDraft());
    expect(panel.ready()).toBe(false);
  });

  it('reevalúa si la cuenta se puede dividir al cambiar de mesa', () => {
    expect(panel.canSplit()).toBe(false);

    setBill(splitBill);

    // Antes `canSplit` no leía ninguna señal: se quedaba congelado en el primer valor.
    expect(panel.canSplit()).toBe(true);
  });

  // ── Efectivo: monto recibido y vuelto ────────────────────────────────────

  it('precarga el importe justo al elegir método', async () => {
    await chooseMethod('pm1');

    expect(amounts()[0].value).toBe('12000');
    expect(panel.unifiedPayment().amount).toBe(12000);
  });

  it('cobra enviando el efectivo recibido, no el total', async () => {
    await chooseMethod('pm1');
    await fill(amounts()[0], '50000');

    expect(chargeButton().disabled).toBe(false);
    // El backend deriva `paid_amount` y `change_given` de este importe.
    expect((await charge()).payments).toEqual([
      { payment_method_id: 'pm1', amount: 50000 },
    ]);
  });

  it('no deja cobrar si el pago no cubre la cuenta', async () => {
    await chooseMethod('pm1');
    await fill(amounts()[0], '10000');

    expect(panel.ready()).toBe(false);
    expect(chargeButton().disabled).toBe(true);
  });

  // ── Pago mixto ────────────────────────────────────────────────────────────

  /** Marca la casilla «Combinar con otro método». */
  async function combine(): Promise<void> {
    const box = combineBox()!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('cobra con dos métodos y reparte el resto en el segundo', async () => {
    await chooseMethod('pm1');
    await fill(amounts()[0], '5000');
    await combine();
    await fill(selects()[1], 'pm2');

    // El segundo método cubre lo que falta sin que el cajero tenga que restar.
    expect(panel.unifiedPayment().secondAmount).toBe(7000);
    expect(panel.ready()).toBe(true);

    expect((await charge()).payments).toEqual([
      { payment_method_id: 'pm1', amount: 5000 },
      { payment_method_id: 'pm2', amount: 7000 },
    ]);
  });

  it('no ofrece dos veces el mismo método', async () => {
    await chooseMethod('pm1');
    await combine();

    const opciones = Array.from(selects()[1].options).map((o) => o.value);
    expect(opciones).not.toContain('pm1');
    expect(opciones).toContain('pm2');
  });

  it('exige que cada comensal cubra su parte', () => {
    setBill(splitBill);
    panel.mode.set('split');
    // Antes de asignar los pagos: al montarse, cada control emite su estado
    // vacío y pisaría lo que se pusiera antes.
    fixture.detectChanges();

    panel.setSplitPayment('p1', { ...emptyPaymentDraft(), methodId: 'pm1', amount: 12000 });
    panel.setSplitPayment('p2', { ...emptyPaymentDraft(), methodId: 'pm2', amount: 8000 });

    expect(panel.ready()).toBe(true);

    panel.setSplitPayment('p1', { ...emptyPaymentDraft(), methodId: 'pm1', amount: 5000 });
    expect(panel.ready()).toBe(false);
  });
});
