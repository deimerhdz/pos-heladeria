import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { PaymentValidationBlockComponent } from './payment-validation-block.component';
import { DiningOrder, PaymentAttempt } from '../interfaces/dining.interface';
import { PromotionService } from '../../promotions/services/promotion.service';

const API = environment.apiBaseUrl;

function order(id: string): DiningOrder {
  return {
    id,
    channel: 'QR_MENU',
    status: 'recibida',
    created_at: '2026-08-20T10:00:00',
    customer_name: `Comensal ${id}`,
    items: [{ id: `${id}-i1`, product_variant_id: 'v1', quantity: 1, unit_price: '4000' }],
  } as DiningOrder;
}

function attempt(orderId: string): PaymentAttempt {
  return {
    id: `att-${orderId}`,
    order_id: orderId,
    payment_method_id: 'pm1',
    payment_method_name: 'Transferencia',
    is_cash: false,
    status: 'pendiente',
    amount_received: null,
    change_amount: null,
    receipt_file_url: 'https://example.com/r.jpg',
    rejection_reason: null,
    resolved_by_user_id: null,
    resolved_at: null,
    created_at: '2026-08-20T10:00:00',
  };
}

/** Feature 028, T005/T011: reemplaza el contenido combinado de las antiguas
 *  pestañas "Pedido de la mesa" / "Pagos por confirmar" — una tarjeta
 *  independiente por pedido, cada una con su propio panel de revisión. */
describe('PaymentValidationBlockComponent', () => {
  let fixture: ComponentFixture<PaymentValidationBlockComponent>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PaymentValidationBlockComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [] } },
      ],
    });
    fixture = TestBed.createComponent(PaymentValidationBlockComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /**
   * `payment-attempt-review-panel.load()` es `async`: el `flush()` resuelve el
   * observable, pero `this.attempts.set(...)` no corre hasta el siguiente
   * microtask (la promesa que envuelve `firstValueFrom`). Un `setTimeout(0)`
   * de por medio garantiza que esa cola de microtasks se vacíe antes de que
   * `whenStable()` + `detectChanges()` pinten el resultado.
   */
  async function tick(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function render(orders: DiningOrder[]): Promise<void> {
    fixture.componentRef.setInput('orders', orders);
    fixture.componentRef.setInput('categories', []);
    fixture.componentRef.setInput('cashShiftId', 'shift-1');
    fixture.detectChanges();
    for (const o of orders) {
      http.expectOne(`${API}/orders/${o.id}/payment-attempts`).flush([attempt(o.id)]);
    }
    await tick();
  }

  it('muestra el estado vacío cuando no hay pagos por validar', async () => {
    await render([]);
    expect(fixture.nativeElement.textContent).toContain('No hay pagos esperando revisión');
  });

  it('pinta una tarjeta independiente por pedido, sin botón "Rechazar" a nivel de pedido (T007)', async () => {
    await render([order('o1'), order('o2')]);

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    // El único "Rechazar" que puede quedar es el del intento de pago dentro de
    // `payment-attempt-review-panel` (con motivo obligatorio) — no uno que
    // cancele el pedido entero como hacía el extinto pending-orders-panel.
    const rechazarPedido = buttons.find(
      (b) => b.textContent?.trim() === 'Rechazar' && !b.closest('app-payment-attempt-review-panel'),
    );
    expect(rechazarPedido).toBeUndefined();

    expect(fixture.nativeElement.textContent).toContain('Comensal o1');
    expect(fixture.nativeElement.textContent).toContain('Comensal o2');
  });

  it('aprobar el comprobante de un pedido no toca el estado del otro (tarjetas independientes)', async () => {
    await render([order('o1'), order('o2')]);

    const approveButtons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    const aprobarO1 = approveButtons.find((b) => b.textContent?.trim() === 'Aprobar');
    expect(aprobarO1).toBeDefined();
    aprobarO1!.click();
    fixture.detectChanges();

    const req = http.expectOne(`${API}/orders/payment-attempts/att-o1/approve`);
    req.flush({ ...attempt('o1'), status: 'confirmado' });
    await tick();
    // El load posterior de la tarjeta o1 tras resolver.
    http.expectOne(`${API}/orders/o1/payment-attempts`).flush([{ ...attempt('o1'), status: 'confirmado' }]);
    await tick();

    // La tarjeta de o2 sigue teniendo su botón "Aprobar" propio, intacto.
    const stillThere = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    const aprobarO2 = stillThere.find((b) => b.textContent?.trim() === 'Aprobar');
    expect(aprobarO2).toBeDefined();
    expect(aprobarO2!.disabled).toBe(false);
  });
});
