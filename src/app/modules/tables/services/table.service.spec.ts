import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { TableService } from './table.service';
import { Table } from '../interfaces/table.interface';

const base = `${environment.apiBaseUrl}/orders/tables`;

function table(partial: Partial<Table>): Table {
  return {
    id: 't1',
    number: 1,
    name: null,
    qr_token: 'uuid-1',
    active: true,
    status: 'libre',
    ...partial,
  };
}

/** Drain pending microtasks so a chained `loadTables()` reload dispatches its GET. */
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('TableService', () => {
  let service: TableService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TableService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TableService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads tables sorted by number', async () => {
    const promise = service.loadTables();
    const req = http.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([table({ id: 'b', number: 3 }), table({ id: 'a', number: 1 })]);
    await promise;
    expect(service.tables().map((t) => t.number)).toEqual([1, 3]);
  });

  it('creates a table sending number + name (no client qr_token)', async () => {
    const promise = service.createTable({ number: 5, name: 'Terraza' });
    const req = http.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ number: 5, name: 'Terraza' });
    expect('qr_token' in req.request.body).toBe(false);
    req.flush(table({ id: 't5', number: 5, name: 'Terraza' }));
    await tick(); // let loadTables() dispatch the reload GET
    http.expectOne(base).flush([]);
    await promise;
    expect(service.error()).toBeNull();
  });

  it('normalizes an empty name to null on create', async () => {
    const promise = service.createTable({ number: 2, name: '  ' });
    const req = http.expectOne(base);
    expect(req.request.body).toEqual({ number: 2, name: null });
    req.flush(table({ id: 't2', number: 2 }));
    await tick();
    http.expectOne(base).flush([]);
    await promise;
  });

  it('toggles active via PATCH', async () => {
    const promise = service.toggleActive('t1', true);
    const req = http.expectOne(`${base}/t1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ active: false });
    req.flush(table({ id: 't1', active: false }));
    await tick();
    http.expectOne(base).flush([]);
    await promise;
  });

  it('fetches the signed qr token', async () => {
    const promise = service.getQrToken('t1');
    const req = http.expectOne(`${base}/t1/qr-token`);
    expect(req.request.method).toBe('GET');
    req.flush({ table_id: 't1', number: 1, qr_token: 'signed', menu_path: '/menu/qr-token/signed' });
    const res = await promise;
    expect(res.menu_path).toBe('/menu/qr-token/signed');
  });

  it('maps an error to the error signal', async () => {
    const promise = service.loadTables();
    http.expectOne(base).flush({ detail: 'Boom' }, { status: 500, statusText: 'Err' });
    await promise;
    expect(service.error()).toBe('Boom');
  });
});
