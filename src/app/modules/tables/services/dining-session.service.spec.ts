import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { DiningSessionService } from './dining-session.service';

const API = environment.apiBaseUrl;

/**
 * Lado **staff**. El flujo del comensal (menú por QR, sesión, carrito, pedidos
 * propios) se prueba en `diner.service.spec.ts`: son rutas públicas con otro
 * modelo de auth.
 */
describe('DiningSessionService', () => {
  let service: DiningSessionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DiningSessionService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DiningSessionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lista comandas y filtra por estado', async () => {
    const promise = service.listOrders('recibida');
    const req = http.expectOne((r) => r.url === `${API}/orders`);

    expect(req.request.params.get('status')).toBe('recibida');
    req.flush([]);
    await promise;
  });

  /**
   * Confirmar es el único punto que descuenta inventario en el flujo de mesa:
   * ni el carrito, ni el envío del comensal, ni el cobro lo tocan.
   */
  it('confirma un pedido recibido', async () => {
    const promise = service.confirmOrder('o1');
    const req = http.expectOne(`${API}/orders/o1/confirm`);

    expect(req.request.method).toBe('POST');
    req.flush({ id: 'o1', status: 'abierta', channel: 'qr', created_at: '2026-07-28' });

    const order = await promise;
    expect(order.status).toBe('abierta');
  });

  it('cancela un pedido con motivo', async () => {
    const promise = service.cancelOrder('o1', 'Rechazado por el personal');
    const req = http.expectOne(`${API}/orders/o1/cancel`);

    expect(req.request.body).toEqual({ motivo: 'Rechazado por el personal' });
    req.flush({ id: 'o1', status: 'cancelada', channel: 'qr', created_at: '2026-07-28' });
    await promise;
  });

  it('avanza el estado de cocina de un ítem', async () => {
    const promise = service.updateItemKitchen('i1', 'listo');
    const req = http.expectOne(`${API}/orders/items/i1/kitchen`);

    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ estado_cocina: 'listo' });
    req.flush({ id: 'i1', estado_cocina: 'listo' });
    await promise;
  });

  it('traduce el detail en array (422) de FastAPI', async () => {
    const promise = service.getOrder('nope').catch((e: unknown) => e);
    http
      .expectOne(`${API}/orders/nope`)
      .flush({ detail: [{ msg: 'Campo requerido' }] }, { status: 422, statusText: 'Unprocessable' });

    expect(service.extractError(await promise)).toBe('Campo requerido');
  });

  it('traduce el detail como objeto (bloqueo por cocina)', async () => {
    const promise = service.getOrder('x').catch((e: unknown) => e);
    http.expectOne(`${API}/orders/x`).flush(
      { detail: { error: 'Hay ítems sin terminar en cocina', items: [] } },
      { status: 409, statusText: 'Conflict' },
    );

    expect(service.extractError(await promise)).toBe('Hay ítems sin terminar en cocina');
  });
});
