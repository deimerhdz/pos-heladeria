import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { DiningSessionService } from './dining-session.service';

const api = environment.apiBaseUrl;

describe('DiningSessionService', () => {
  let service: DiningSessionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DiningSessionService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DiningSessionService);
    http = TestBed.inject(HttpTestingController);
    sessionStorage.clear();
  });

  afterEach(() => http.verify());

  it('resolves a QR token (uuid) into table + menu', async () => {
    const promise = service.resolveByToken('uuid-4');
    const req = http.expectOne(`${api}/menu/qr/uuid-4`);
    expect(req.request.method).toBe('GET');
    req.flush({
      table: { id: 't1', number: 4, name: 'Barra' },
      menu: [
        {
          id: 'c1',
          name: 'Helados',
          products: [
            {
              id: 'p1',
              name: 'Cono',
              variants: [{ id: 'v1', name: 'Simple', price: '3000.00' }],
              option_groups: [
                {
                  id: 'g1',
                  name: 'Sabores',
                  min_select: 1,
                  max_select: 2,
                  options: [{ id: 'o1', name: 'Vainilla', extra_price: '0.00' }],
                },
              ],
            },
          ],
        },
      ],
    });
    const res = await promise;
    expect(res.table.id).toBe('t1');
    expect(res.table.number).toBe(4);
    expect(res.categories[0].products[0].variants[0].price).toBe(3000);
    expect(res.categories[0].products[0].option_groups[0].max_select).toBe(2);
  });

  it('opens a session with qr_token + customer_name', async () => {
    const promise = service.openSession('uuid-4', 'Ana');
    const req = http.expectOne(`${api}/orders/sessions`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ qr_token: 'uuid-4', customer_name: 'Ana' });
    req.flush({
      id: 's1',
      dining_table_id: 't1',
      customer_name: 'Ana',
      status: 'open',
      opened_at: '2026-01-01T00:00:00Z',
    });
    expect((await promise).id).toBe('s1');
  });

  it('closes a session', async () => {
    const promise = service.closeSession('s1');
    const req = http.expectOne(`${api}/orders/sessions/s1/close`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 's1', dining_table_id: 't1', customer_name: 'Ana', status: 'closed', opened_at: 'x' });
    expect((await promise).status).toBe('closed');
  });

  it('creates an order with items', async () => {
    const promise = service.createOrder({
      channel: 'qr',
      dining_session_id: 's1',
      items: [{ product_variant_id: 'v1', quantity: 2, option_ids: ['o1'], notes: null }],
    });
    const req = http.expectOne(`${api}/orders`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.dining_session_id).toBe('s1');
    expect(req.request.body.items[0].product_variant_id).toBe('v1');
    req.flush({ id: 'ord1', channel: 'qr', status: 'pending', created_at: 'x', items: [] });
    expect((await promise).id).toBe('ord1');
  });

  it('lists orders and filters by status', async () => {
    const promise = service.listOrders('pending');
    const req = http.expectOne((r) => r.url === `${api}/orders`);
    expect(req.request.params.get('status')).toBe('pending');
    req.flush([]);
    await promise;
  });

  it('persists and restores a session by token', () => {
    service.storeSession('tok', { sessionId: 's1', customerName: 'Ana' });
    expect(service.restoreSession('tok')).toEqual({ sessionId: 's1', customerName: 'Ana' });
    service.clearSession('tok');
    expect(service.restoreSession('tok')).toBeNull();
  });

  it('extracts FastAPI array-detail errors', () => {
    const err = new HttpErrorResponse({ error: { detail: [{ msg: 'campo inválido' }] }, status: 422 });
    expect(service.extractError(err)).toBe('campo inválido');
  });
});
