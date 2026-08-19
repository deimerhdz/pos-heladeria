import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { PendingOrdersPanelComponent } from './pending-orders-panel.component';
import { DiningOrder } from '../interfaces/dining.interface';
import { PromotionService } from '../../promotions/services/promotion.service';

const API = environment.apiBaseUrl;

/** spec 026, FR-001: la orden todavía no tiene pago confirmado — este panel
 *  ya no ofrece ningún botón "Confirmar" para enviarla a cocina a mano. */
function order(id: string): DiningOrder {
  return {
    id,
    channel: 'qr',
    status: 'recibida',
    created_at: '2026-08-18T23:09:00',
    customer_name: 'Deimer',
    items: [
      { id: `${id}-i1`, product_variant_id: 'v1', quantity: 1, unit_price: '4000' },
    ],
  } as DiningOrder;
}

describe('PendingOrdersPanelComponent', () => {
  let fixture: ComponentFixture<PendingOrdersPanelComponent>;
  let panel: PendingOrdersPanelComponent;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PendingOrdersPanelComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // Evita la petición real de promociones activas (irrelevante aquí,
        // spec 026 no toca el cálculo de total ni promociones).
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [] } },
      ],
    });
    fixture = TestBed.createComponent(PendingOrdersPanelComponent);
    panel = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function render(orders: DiningOrder[]): void {
    fixture.componentRef.setInput('orders', orders);
    fixture.componentRef.setInput('categories', []);
    fixture.detectChanges();
    // `payment-attempt-review-panel` embebido dispara su propia carga de
    // intentos por cada pedido — se responde vacío: sin intento pendiente ni
    // resuelto, no es parte de lo que este spec verifica.
    for (const o of orders) {
      http.expectOne(`${API}/orders/${o.id}/payment-attempts`).flush([]);
    }
    fixture.detectChanges();
  }

  it('no ofrece ningún botón "Confirmar" — confirmar el pago ya envía a cocina (spec 026, FR-001)', () => {
    render([order('o1')]);

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    const confirmar = buttons.find((b) => b.textContent?.trim() === 'Confirmar');
    expect(confirmar).toBeUndefined();
  });

  it('sigue permitiendo rechazar (cancelar) el pedido', () => {
    render([order('o1')]);

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    const rechazar = buttons.find((b) => b.textContent?.trim() === 'Rechazar');
    expect(rechazar).toBeDefined();

    rechazar!.click();
    fixture.detectChanges();

    const req = http.expectOne(`${API}/orders/o1/cancel`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ motivo: 'Rechazado por el personal' });
    req.flush({ ...order('o1'), status: 'cancelada' });
  });

  it('muestra el estado vacío cuando no hay pedidos pendientes de pago', () => {
    render([]);
    expect(fixture.nativeElement.textContent).toContain('No hay pagos esperando revisión');
  });
});
