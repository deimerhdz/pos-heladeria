import { TestBed } from '@angular/core/testing';
import { BillSummaryComponent } from './bill-summary.component';

describe('BillSummaryComponent — ícono de domicilio (spec 082)', () => {
  function crear(showDeliveryIcon: boolean) {
    TestBed.configureTestingModule({ imports: [BillSummaryComponent] });
    const fixture = TestBed.createComponent(BillSummaryComponent);
    fixture.componentRef.setInput('total', 20000);
    fixture.componentRef.setInput('deliveryFee', 5000);
    fixture.componentRef.setInput('showDeliveryIcon', showDeliveryIcon);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('ya no renderiza el ícono de domicilio como SVG artesanal', () => {
    const el = crear(true);
    expect(el.querySelector('svg')).toBeNull();
    const icon = el.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('delivery_dining');
  });

  it('no renderiza el ícono cuando showDeliveryIcon es false', () => {
    const el = crear(false);
    expect(el.querySelector('app-mi-icon')).toBeNull();
  });
});
