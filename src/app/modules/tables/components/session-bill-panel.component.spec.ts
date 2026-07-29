import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { SessionBillPanelComponent } from './session-bill-panel.component';
import { SessionBill } from '../interfaces/dining.interface';
import { PaymentMethod } from '../../sales/interfaces/sales.interface';

/** Cuenta de una mesa con un solo comensal: no se puede dividir. */
const bill: SessionBill = {
  table_session_id: 'ts1',
  dining_table_id: 't1',
  total: '12000',
  order_ids: ['o1'],
  split: [{ participant_id: 'p1', display_label: 'Ana', subtotal: '12000' }],
};

const methods = [
  { id: 'pm1', name: 'Efectivo', is_cash: true },
  { id: 'pm2', name: 'Tarjeta', is_cash: false },
] as PaymentMethod[];

describe('SessionBillPanelComponent', () => {
  let fixture: ComponentFixture<SessionBillPanelComponent>;
  let panel: SessionBillPanelComponent;

  beforeEach(() => {
    // Ver nota en `diner.service.spec.ts`: los specs comparten entorno.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SessionBillPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(SessionBillPanelComponent);
    panel = fixture.componentInstance;
    panel.bill = bill;
    panel.methods = methods;
    panel.cashShiftId = 'shift-1';
    fixture.detectChanges();
  });

  const select = (): HTMLSelectElement =>
    fixture.nativeElement.querySelector('select') as HTMLSelectElement;

  const chargeButton = (): HTMLButtonElement =>
    Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Cobrar'),
    )!;

  it('no deja cobrar mientras no se elige método de pago', () => {
    expect(panel.ready()).toBe(false);
    expect(chargeButton().disabled).toBe(true);
  });

  it('habilita el cobro al elegir método en la cuenta única', async () => {
    // Por el `<select>` real: el fallo era que el `computed` leía un campo normal
    // en vez de una señal, así que elegir método no volvía a evaluarlo nunca.
    const el = select();
    el.value = el.options[1].value;
    el.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(panel.unifiedMethod()).toBe('pm1');
    expect(panel.ready()).toBe(true);
    expect(chargeButton().disabled).toBe(false);
  });

  it('olvida el método elegido al cambiar de mesa', async () => {
    panel.unifiedMethod.set('pm1');
    await fixture.whenStable();
    expect(panel.ready()).toBe(true);

    panel.bill = { ...bill, table_session_id: 'ts2', dining_table_id: 't2' };
    panel.ngOnChanges();
    await fixture.whenStable();

    expect(panel.unifiedMethod()).toBe('');
    expect(panel.ready()).toBe(false);
  });
});
