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
  { id: 'pm1', name: 'Efectivo', is_cash: true },
  { id: 'pm2', name: 'Tarjeta', is_cash: false },
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

  const select = (): HTMLSelectElement =>
    fixture.nativeElement.querySelector('select') as HTMLSelectElement;

  const cashInput = (): HTMLInputElement | null =>
    fixture.nativeElement.querySelector('#cash-received') as HTMLInputElement | null;

  const chargeButton = (): HTMLButtonElement =>
    Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Cobrar'),
    )!;

  /** Elige un método por el `<select>` real y espera al binding de ngModel. */
  async function chooseMethod(methodId: string): Promise<void> {
    const el = select();
    el.value = methodId;
    el.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('no deja cobrar mientras no se elige método de pago', () => {
    expect(panel.ready()).toBe(false);
    expect(chargeButton().disabled).toBe(true);
  });

  it('habilita el cobro al elegir método en la cuenta única', async () => {
    // Por el `<select>` real: el fallo era que el `computed` leía un campo normal
    // en vez de una señal, así que elegir método no volvía a evaluarlo nunca.
    await chooseMethod('pm2');

    expect(panel.unifiedMethod()).toBe('pm2');
    expect(panel.ready()).toBe(true);
    expect(chargeButton().disabled).toBe(false);
  });

  it('olvida el método elegido al cambiar de mesa', async () => {
    await chooseMethod('pm2');
    expect(panel.ready()).toBe(true);

    setBill({ ...bill, table_session_id: 'ts9', dining_table_id: 't9' });

    expect(panel.unifiedMethod()).toBe('');
    expect(panel.ready()).toBe(false);
  });

  it('reevalúa si la cuenta se puede dividir al cambiar de mesa', () => {
    expect(panel.canSplit()).toBe(false);

    setBill(splitBill);

    // Antes `canSplit` no leía ninguna señal: se quedaba congelado en el primer valor.
    expect(panel.canSplit()).toBe(true);
  });

  // ── Efectivo: monto recibido y vuelto ────────────────────────────────────

  it('pide el monto recibido solo cuando el método es efectivo', async () => {
    await chooseMethod('pm2');
    expect(cashInput()).toBeNull();

    await chooseMethod('pm1');
    expect(cashInput()).not.toBeNull();
    // Arranca en el importe justo, así el vuelto se ve desde el primer momento.
    expect(panel.cashReceived()).toBe(12000);
    expect(panel.changeDue()).toBe(0);
  });

  it('calcula el vuelto con lo que entrega el cliente', async () => {
    await chooseMethod('pm1');

    panel.setCashReceived(50000);
    fixture.detectChanges();

    expect(panel.changeDue()).toBe(38000);
    expect(panel.missing()).toBe(0);
    expect(chargeButton().disabled).toBe(false);
  });

  it('no deja cobrar si el efectivo no cubre la cuenta', async () => {
    await chooseMethod('pm1');

    panel.setCashReceived(10000);
    fixture.detectChanges();

    expect(panel.missing()).toBe(2000);
    expect(panel.ready()).toBe(false);
    expect(chargeButton().disabled).toBe(true);
  });

  it('cobra enviando el efectivo recibido, no el total', async () => {
    await chooseMethod('pm1');
    panel.setCashReceived(50000);
    fixture.detectChanges();

    const done = panel.charge();
    const req = http.expectOne(`${API}/table-sessions/ts1/close`);
    const body = req.request.body as CloseSessionPayload;

    // El backend deriva `paid_amount` y `change_given` de este importe.
    expect(body.payments?.[0]).toEqual({ payment_method_id: 'pm1', amount: 50000 });

    req.flush({ table_session: {}, sale_ids: ['s1'] });
    await done;
  });

  it('cobra el importe justo cuando el método no es efectivo', async () => {
    await chooseMethod('pm2');

    const done = panel.charge();
    const req = http.expectOne(`${API}/table-sessions/ts1/close`);
    const body = req.request.body as CloseSessionPayload;

    expect(body.payments?.[0]).toEqual({ payment_method_id: 'pm2', amount: 12000 });

    req.flush({ table_session: {}, sale_ids: ['s1'] });
    await done;
  });

  it('exige cubrir el subtotal de cada comensal que paga en efectivo', () => {
    setBill(splitBill);
    panel.mode.set('split');
    panel.setSplitMethod('p1', 'pm1');
    panel.setSplitMethod('p2', 'pm2');
    fixture.detectChanges();

    // Cada fila arranca con su importe justo.
    expect(panel.ready()).toBe(true);

    panel.setSplitReceived('p1', 5000);
    expect(panel.ready()).toBe(false);

    panel.setSplitReceived('p1', 20000);
    expect(panel.ready()).toBe(true);
  });
});
