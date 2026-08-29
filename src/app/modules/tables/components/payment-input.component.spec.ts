import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PaymentInputComponent } from './payment-input.component';
import { PaymentMethodCheckoutOption } from '../../sales/interfaces/sales.interface';

/** spec 057: el importe de un cobro no efectivo no se puede editar — el
 *  campo `<app-money-input>` queda `disabled` en cuanto el método elegido no
 *  es efectivo, con `isCash()` (ya existente) como única señal. */
describe('PaymentInputComponent', () => {
  let fixture: ComponentFixture<PaymentInputComponent>;
  let component: PaymentInputComponent;

  const methods: PaymentMethodCheckoutOption[] = [
    { id: 'pm-cash', name: 'Efectivo', is_cash: true },
    { id: 'pm-transfer', name: 'Nequi', is_cash: false },
  ];

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [PaymentInputComponent] });
    fixture = TestBed.createComponent(PaymentInputComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('total', 12000);
    fixture.componentRef.setInput('methods', methods);
    fixture.detectChanges();
  });

  function selectEl(): HTMLSelectElement {
    return fixture.nativeElement.querySelector('select');
  }

  function amountEl(): HTMLInputElement {
    return fixture.nativeElement.querySelector('input[inputmode="decimal"]');
  }

  async function chooseMethod(methodId: string): Promise<void> {
    const select = selectEl();
    select.value = methodId;
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('con efectivo elegido, el importe sigue editable (no regresión, FR-002)', async () => {
    await chooseMethod('pm-cash');

    expect(amountEl().disabled).toBe(false);
    expect(amountEl().value).toBe('12.000');
  });

  it('con un método no efectivo elegido, el importe queda deshabilitado en el total exacto (FR-001)', async () => {
    await chooseMethod('pm-transfer');

    expect(amountEl().disabled).toBe(true);
    expect(amountEl().value).toBe('12.000');
    expect(component.draft().amount).toBe(12000);
  });

  it('al volver de un método no efectivo a efectivo, el importe vuelve a ser editable (FR-004)', async () => {
    await chooseMethod('pm-transfer');
    expect(amountEl().disabled).toBe(true);

    await chooseMethod('pm-cash');
    expect(amountEl().disabled).toBe(false);
  });

  it('al volver de efectivo a un método no efectivo, el importe vuelve a quedar fijo (FR-004)', async () => {
    await chooseMethod('pm-cash');
    expect(amountEl().disabled).toBe(false);

    await chooseMethod('pm-transfer');
    expect(amountEl().disabled).toBe(true);
    expect(component.draft().amount).toBe(12000);
  });
});
