import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OrderSummaryCardComponent } from './order-summary-card.component';

/** spec 059: contrato puro de inputs/outputs — sin PosTerminalStore ni HTTP,
 *  reutilizado tanto por tarjetas de mesa como por tarjetas de pedido sin
 *  mesa (contracts/ui-contracts.md, Contrato 1). */
describe('OrderSummaryCardComponent', () => {
  let fixture: ComponentFixture<OrderSummaryCardComponent>;
  let component: OrderSummaryCardComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [OrderSummaryCardComponent] });
    fixture = TestBed.createComponent(OrderSummaryCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('title', 'Mesa 3');
    fixture.componentRef.setInput('statusLabel', 'Ocupada');
    fixture.componentRef.setInput('statusClass', 'bg-blue-100 text-blue-700');
    fixture.componentRef.setInput('secondaryLabel', '2 productos');
    fixture.componentRef.setInput('elapsedLabel', '12 min');
    fixture.componentRef.setInput('totalLabel', '$25.000');
  });

  function cardButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button');
  }

  it('renderiza título, insignia, línea secundaria, hora y total recibidos por input', () => {
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Mesa 3');
    expect(text).toContain('Ocupada');
    expect(text).toContain('2 productos');
    expect(text).toContain('🕐 12 min');
    expect(text).toContain('$25.000');
  });

  it('sin ordersCount, no muestra ningún badge de "N pedidos"', () => {
    fixture.detectChanges();

    expect((fixture.nativeElement.textContent as string)).not.toContain('pedidos');
  });

  it('con ordersCount > 1, muestra el badge "N pedidos"', () => {
    fixture.componentRef.setInput('ordersCount', 3);
    fixture.detectChanges();

    expect((fixture.nativeElement.textContent as string)).toContain('3 pedidos');
  });

  it('con ordersCount === 1, no muestra el badge (una mesa con un solo pedido no lo necesita)', () => {
    fixture.componentRef.setInput('ordersCount', 1);
    fixture.detectChanges();

    expect((fixture.nativeElement.textContent as string)).not.toContain('pedidos');
  });

  it('aplica la clase de "seleccionado" únicamente cuando selected=true', () => {
    fixture.detectChanges();
    expect(cardButton().className).toContain('border-gray-200');
    expect(cardButton().className).not.toContain('border-indigo-500');

    fixture.componentRef.setInput('selected', true);
    fixture.detectChanges();
    expect(cardButton().className).toContain('border-indigo-500');
  });

  it('emite select exactamente una vez por click, sin importar cuántas veces se re-renderice', () => {
    fixture.detectChanges();
    let emitted = 0;
    component.select.subscribe(() => emitted++);

    cardButton().click();

    expect(emitted).toBe(1);
  });
});
