import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { MenuApiService } from './menu-api.service';
import { MenuProductResponse, Page } from '../interfaces/table.interface';

const base = `${environment.apiBaseUrl}/menu`;

function productPage(items: MenuProductResponse[]): Page<MenuProductResponse> {
  return { items, total: items.length, page: 1, size: 100, pages: 1 };
}

describe('MenuApiService', () => {
  let service: MenuApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [MenuApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MenuApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('opens a session and stores the token', async () => {
    const promise = service.openSession('QR-MESA-1', 'Juan');
    const req = http.expectOne(`${base}/sessions`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ qr_code: 'QR-MESA-1', customer_name: 'Juan' });
    req.flush({
      session_token: 'tok-123',
      customer_name: 'Juan',
      table_id: 't1',
      table_name: 'Mesa 1',
      capacity: 4,
    });
    const session = await promise;

    expect(session.table_name).toBe('Mesa 1');
    expect(service.sessionToken()).toBe('tok-123');
  });

  it('lists categories sending the X-Menu-Session header', async () => {
    service.sessionToken.set('tok-123');
    const promise = service.getCategories();
    const req = http.expectOne(`${base}/categories`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('X-Menu-Session')).toBe('tok-123');
    req.flush([{ id: 'c1', name: 'Bebidas', description: null }]);
    const categories = await promise;

    expect(categories).toEqual([{ id: 'c1', name: 'Bebidas', products: [] }]);
  });

  it('lists products by category (page size 100), maps price to number and drops images', async () => {
    service.sessionToken.set('tok-123');
    const promise = service.getProducts('c1');
    const req = http.expectOne(
      r => r.url === `${base}/products` && r.params.get('category_id') === 'c1',
    );
    expect(req.request.headers.get('X-Menu-Session')).toBe('tok-123');
    expect(req.request.params.get('size')).toBe('100');
    req.flush(
      productPage([
        { id: 'p1', name: 'Coca-Cola', description: 'Fría', price: '2500.00', category_id: 'c1' },
      ]),
    );
    const products = await promise;

    expect(products).toEqual([
      { id: 'p1', name: 'Coca-Cola', description: 'Fría', price: 2500, image_url: null },
    ]);
  });

  it('maps a FastAPI array detail error to the first message', () => {
    const err = new HttpErrorResponse({
      status: 422,
      error: { detail: [{ msg: 'qr_code requerido', loc: ['body', 'qr_code'] }] },
    });
    expect(service.extractError(err)).toBe('qr_code requerido');
  });

  it('falls back for non-HTTP errors', () => {
    expect(service.extractError(new Error('x'), 'fallback')).toBe('fallback');
  });

  // ── Cart & orders ────────────────────────────────────────────────────────

  it('gets the table cart with the session header', async () => {
    service.sessionToken.set('tok-123');
    const promise = service.getCart();
    const req = http.expectOne(`${base}/cart`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('X-Menu-Session')).toBe('tok-123');
    req.flush({ table_id: 't1', items: [], total: '0' });
    expect((await promise).table_id).toBe('t1');
  });

  it('adds a cart item', async () => {
    service.sessionToken.set('tok-123');
    const promise = service.addCartItem('p1', 2);
    const req = http.expectOne(`${base}/cart/items`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ product_id: 'p1', quantity: 2 });
    expect(req.request.headers.get('X-Menu-Session')).toBe('tok-123');
    req.flush({ table_id: 't1', items: [], total: '0' });
    await promise;
  });

  it('updates a cart item quantity', async () => {
    service.sessionToken.set('tok-123');
    const promise = service.updateCartItem('i1', 3);
    const req = http.expectOne(`${base}/cart/items/i1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ quantity: 3 });
    req.flush({ table_id: 't1', items: [], total: '0' });
    await promise;
  });

  it('removes a cart item', async () => {
    service.sessionToken.set('tok-123');
    const promise = service.removeCartItem('i1');
    const req = http.expectOne(`${base}/cart/items/i1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ table_id: 't1', items: [], total: '0' });
    await promise;
  });

  it('creates an order with the chosen scope', async () => {
    service.sessionToken.set('tok-123');
    const promise = service.createOrder('table');
    const req = http.expectOne(`${base}/orders`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ scope: 'table' });
    expect(req.request.headers.get('X-Menu-Session')).toBe('tok-123');
    req.flush({
      id: 'o1',
      table_id: 't1',
      scope: 'table',
      status: 'pending',
      total: '5000.00',
      created_at: '2026-01-01',
    });
    expect((await promise).scope).toBe('table');
  });

  it('lists active orders with the session header', async () => {
    service.sessionToken.set('tok-123');
    const promise = service.getActiveOrders();
    const req = http.expectOne(`${base}/orders/active`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('X-Menu-Session')).toBe('tok-123');
    req.flush([
      { id: 'o1', table_id: 't1', scope: 'individual', status: 'pending', total: '2500.00', created_at: '2026-01-01' },
    ]);
    const orders = await promise;
    expect(orders.length).toBe(1);
    expect(orders[0].id).toBe('o1');
  });
});
