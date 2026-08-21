import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { PaymentAttemptReviewPanelComponent } from './payment-attempt-review-panel.component';
import { DiningOrder, DiningOrderItem, PaymentAttempt } from '../interfaces/dining.interface';

const API = environment.apiBaseUrl;

function order(id = 'o1', items: DiningOrderItem[] = []): DiningOrder {
  return {
    id,
    channel: 'qr',
    status: 'recibida',
    created_at: '2026-08-18T23:09:00',
    items,
  } as DiningOrder;
}

function item(unitPrice: string, quantity = 1, estadoCocina: DiningOrderItem['estado_cocina'] = 'pendiente'): DiningOrderItem {
  return {
    id: `i-${unitPrice}-${quantity}`,
    product_variant_id: 'v1',
    quantity,
    unit_price: unitPrice,
    estado_cocina: estadoCocina,
  } as DiningOrderItem;
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

describe('PaymentAttemptReviewPanelComponent', () => {
  let fixture: ComponentFixture<PaymentAttemptReviewPanelComponent>;
  let panel: PaymentAttemptReviewPanelComponent;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PaymentAttemptReviewPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(PaymentAttemptReviewPanelComponent);
    panel = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Deja el panel listo mostrando exactamente los intentos dados, llamando
   *  `load()` directamente (evita depender de `ngOnChanges` + estabilidad
   *  del zoneless change detection para una petición HTTP async). */
  async function renderWith(attempts: PaymentAttempt[], forOrder: DiningOrder = order()): Promise<void> {
    panel.order = forOrder;
    const done = panel.load();
    http.expectOne(`${API}/orders/o1/payment-attempts`).flush(attempts);
    await done;
    fixture.detectChanges();
  }

  it('muestra el monto recibido y el cambio de forma permanente al confirmar en efectivo (spec 026, FR-004/FR-005)', async () => {
    await renderWith([attempt({ status: 'pendiente' })]);

    panel.cashShiftId = 'shift-1';
    panel.amountReceived = 20000;
    const current = panel.current()!;
    const done = panel.confirmCash(current);

    http
      .expectOne((r) => r.url === `${API}/orders/payment-attempts/a1/confirm-cash` && r.body?.cash_shift_id === 'shift-1')
      .flush(attempt({ status: 'confirmado', amount_received: '20000.00', change_amount: '2000.00' }));
    // Deja correr los microtasks pendientes (resolución de `firstValueFrom` +
    // continuación de `confirmCash` hasta su segundo `await`) antes de que
    // la petición de recarga exista.
    await new Promise((resolve) => setTimeout(resolve, 0));
    // confirmCash() vuelve a listar los intentos antes de resolver.
    http
      .expectOne(`${API}/orders/o1/payment-attempts`)
      .flush([attempt({ status: 'confirmado', amount_received: '20000.00', change_amount: '2000.00' })]);
    await done;
    fixture.detectChanges();

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('✓ Pago confirmado');
    expect(texto).toContain('Recibido: $ 20000.00');
    expect(texto).toContain('Cambio: $ 2000.00');
  });

  it('sin turno de caja abierto, no confirma ni aprueba (feature 028: aprobar/confirmar ya factura, y necesita un turno)', async () => {
    await renderWith([attempt({ status: 'pendiente', is_cash: true })]);
    panel.cashShiftId = null;
    panel.amountReceived = 20000;
    fixture.detectChanges();

    const confirmButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Confirmar efectivo'),
    ) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
    expect(fixture.nativeElement.textContent as string).toContain('Abre un turno de caja');

    await panel.confirmCash(panel.current()!);
    http.expectNone(`${API}/orders/payment-attempts/a1/confirm-cash`);
  });

  it('muestra una vista previa del cambio mientras escribe, antes de confirmar (feature 028)', async () => {
    const conCuenta = order('o1', [item('8000', 1)]); // total $8.000
    await renderWith([attempt({ status: 'pendiente' })], conCuenta);

    panel.amountReceived = 10000;
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent as string).toContain('Cambio');
    expect(fixture.nativeElement.textContent as string).toContain('2000.00');
  });

  it('no muestra vista previa de cambio mientras el monto todavía no alcanza el total', async () => {
    const conCuenta = order('o1', [item('8000', 1)]); // total $8.000
    await renderWith([attempt({ status: 'pendiente' })], conCuenta);

    panel.amountReceived = 5000;
    fixture.detectChanges();

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).not.toContain('Cambio');
  });

  it('muestra el cambio como "0.00" explícitamente cuando el monto es exacto, no lo omite', async () => {
    await renderWith([attempt({ status: 'confirmado', amount_received: '18000.00', change_amount: '0.00' })]);

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Cambio: $ 0.00');
  });

  it('mantiene visible el monto y el cambio al volver a renderizar el mismo intento ya confirmado (reabrir el pedido más tarde)', async () => {
    await renderWith([attempt({ status: 'confirmado', amount_received: '20000.00', change_amount: '2000.00' })]);
    let texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Recibido: $ 20000.00');
    expect(texto).toContain('Cambio: $ 2000.00');

    // Simula reabrir: una nueva carga sobre el mismo pedido.
    await renderWith([attempt({ status: 'confirmado', amount_received: '20000.00', change_amount: '2000.00' })]);

    texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Recibido: $ 20000.00');
    expect(texto).toContain('Cambio: $ 2000.00');
  });
});
