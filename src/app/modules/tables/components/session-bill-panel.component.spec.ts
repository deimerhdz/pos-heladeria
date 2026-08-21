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
  split: [{ participant_id: 'p1', display_label: 'Ana', subtotal: '12000', items: [], discount: '0' }],
};

/** Dos comensales con consumo: habilita el modo dividido. */
const splitBill: SessionBill = {
  table_session_id: 'ts2',
  dining_table_id: 't2',
  total: '20000',
  order_ids: ['o2'],
  split: [
    { participant_id: 'p1', display_label: 'Ana', subtotal: '12000', items: [], discount: '0' },
    { participant_id: 'p2', display_label: 'Luis', subtotal: '8000', items: [], discount: '0' },
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

  it('avisa cuando la mesa tiene consumo pero no hay sesión que cobrar', () => {
    fixture.componentRef.setInput('bill', null);
    fixture.componentRef.setInput('orphan', true);
    fixture.detectChanges();

    const texto = fixture.nativeElement.textContent as string;
    // Antes decía "Selecciona una mesa con consumo", que era falso y dejaba al
    // cajero sin saber por qué no puede cobrar.
    expect(texto).toContain('No se puede cobrar esta mesa');
    expect(texto).not.toContain('Selecciona una mesa con consumo');
  });

  it('no deja cobrar mientras no se elige método de pago', () => {
    expect(panel.ready()).toBe(false);
    expect(chargeButton().disabled).toBe(true);
  });

  // ── feature 028, T004/T009: modo `resumen` (pedido de canal `qr`) ────────
  describe('readOnly (T009 — el bug de origen)', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('readOnly', true);
      fixture.detectChanges();
    });

    it('no muestra el botón "Cobrar y cerrar mesa"', () => {
      const buttons = Array.from<HTMLButtonElement>(
        fixture.nativeElement.querySelectorAll('button'),
      );
      expect(buttons.some((b) => b.textContent?.includes('Cobrar'))).toBe(false);
    });

    it('no muestra el selector de método de pago', () => {
      expect(fixture.nativeElement.querySelectorAll('select').length).toBe(0);
      expect(fixture.nativeElement.querySelectorAll('input[type="number"]').length).toBe(0);
    });

    it('sigue mostrando el desglose de la cuenta (no se pierde información)', () => {
      expect(fixture.nativeElement.textContent).toContain('Ana');
      expect(fixture.nativeElement.textContent).toContain('12,000.00');
    });
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

  it('NO borra el pago tecleado si cambia otro @Input', async () => {
    await chooseMethod('pm2');
    expect(panel.ready()).toBe(true);

    // Regresión: `ngOnChanges` reseteaba el pago ante cualquier @Input, así que
    // un cambio en los métodos, el turno de caja o el nombre del cliente le
    // borraba al cajero lo que estaba tecleando.
    fixture.componentRef.setInput('customerName', 'Ana Pérez');
    fixture.componentRef.setInput('cashShiftId', 'shift-2');
    fixture.detectChanges();

    expect(panel.ready()).toBe(true);
    expect(panel.unifiedPayment()).not.toEqual(emptyPaymentDraft());
  });

  it('sí reinicia el pago cuando la cuenta cambia de importe', async () => {
    await chooseMethod('pm2');
    expect(panel.ready()).toBe(true);

    // Es lo que llega al pulsar "Actualizar" tras entrar otro pedido. Reiniciar
    // aquí es lo correcto: cobrar 12000 de una cuenta de 18000 descuadraría el
    // turno. Por eso el evento marca la cuenta obsoleta en vez de recargarla, y
    // la recarga la decide el cajero.
    setBill({ ...bill, total: '18000' });

    expect(panel.total()).toBe(18000);
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

  // ── Nombre de la factura ──────────────────────────────────────────────────

  it('manda el nombre del cliente al cobrar la cuenta única', async () => {
    fixture.componentRef.setInput('customerName', '  Panadería El Trigo  ');
    await chooseMethod('pm2');

    // Sin esto la factura de una cuenta unificada quedaba sin nombre.
    expect((await charge()).customer_name).toBe('Panadería El Trigo');
  });

  it('no manda nombre vacío: lo resuelve el backend', async () => {
    fixture.componentRef.setInput('customerName', '   ');
    await chooseMethod('pm2');

    expect((await charge()).customer_name).toBeUndefined();
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
