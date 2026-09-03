import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { SalesPageComponent } from './sales-page.component';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import { Sale } from '../interfaces/sales.interface';

/**
 * Spec 030, Historia 5 (FR-006): el filtro Desde/Hasta de Ventas es
 * string-a-string vía `ngModel` — nunca pasa por un `new Date(string)`
 * intermedio que pudiera correr el día por el offset del navegador. Test de
 * regresión preventivo (research.md Decisión 11): no hay defecto activo hoy,
 * solo se fija el comportamiento correcto.
 */
describe('SalesPageComponent — filtro Desde/Hasta (FR-006)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.match(() => true); // vacía las peticiones que el test no necesitó
    http.verify();
  });

  it('el valor elegido en "Desde" vuelve idéntico, sin corrimiento de día', () => {
    const fixture = TestBed.createComponent(SalesPageComponent);
    fixture.detectChanges(); // ngOnInit: dispara las cargas iniciales

    fixture.componentInstance.onDateFromChange('2026-08-24');

    expect(fixture.componentInstance.svc.dateFrom()).toBe('2026-08-24');
  });

  it('el valor elegido en "Hasta" vuelve idéntico, sin corrimiento de día', () => {
    const fixture = TestBed.createComponent(SalesPageComponent);
    fixture.detectChanges();

    fixture.componentInstance.onDateToChange('2026-01-01');

    expect(fixture.componentInstance.svc.dateTo()).toBe('2026-01-01');
  });

  it('un rango que cruza fin/inicio de año conserva ambos extremos tal cual', () => {
    const fixture = TestBed.createComponent(SalesPageComponent);
    fixture.detectChanges();

    fixture.componentInstance.onDateFromChange('2025-12-31');
    fixture.componentInstance.onDateToChange('2026-01-01');

    expect(fixture.componentInstance.svc.dateFrom()).toBe('2025-12-31');
    expect(fixture.componentInstance.svc.dateTo()).toBe('2026-01-01');
  });
});

/**
 * spec 073, FR-011a/SC-009 (T032b/T032c): el detalle de venta muestra el
 * instante congelado de vigencia cuando la venta llevó descuento — para
 * distinguir un descuento de una promoción hoy vencida de una falla.
 */
describe('SalesPageComponent — instante de vigencia en el detalle (spec 073)', () => {
  let http: HttpTestingController;

  function saleBase(over: Partial<Sale> = {}): Sale {
    return {
      id: 's1',
      cash_shift_id: 'cs1',
      user_id: 'u1',
      customer_name: 'Ana',
      subtotal: '16000',
      discount: '8000',
      tax: '0',
      tip: '0',
      total: '8000',
      status: 'paid',
      sold_at: '2026-09-03T01:05:00Z',
      // 19:59 hora de Bogotá (el pedido se tomó dentro de la franja) = 00:59 UTC.
      promotion_evaluated_at: '2026-09-03T00:59:00Z',
      items: [],
      payments: [],
      ...over,
    } as Sale;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })),
        { provide: TenantInfoService, useValue: { info: () => ({ timezone: 'America/Bogota' }), load: () => Promise.resolve(), businessName: () => 'H', logoUrl: () => null, receiptMessage: () => '' } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.match(() => true);
    http.verify();
  });

  it('con descuento + promotion_evaluated_at, el detalle pinta la fila "Promociones evaluadas con la vigencia del …"', () => {
    const fixture = TestBed.createComponent(SalesPageComponent);
    fixture.detectChanges();

    fixture.componentInstance.selected.set(saleBase());
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Promociones evaluadas con la vigencia del');
    expect(text).toContain('02/09/2026 19:59');
  });

  it('sin descuento no pinta la fila, aunque haya promotion_evaluated_at', () => {
    const fixture = TestBed.createComponent(SalesPageComponent);
    fixture.detectChanges();

    fixture.componentInstance.selected.set(saleBase({ discount: '0', total: '16000' }));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Promociones evaluadas con la vigencia del');
  });

  it('con descuento pero sin promotion_evaluated_at (venta anterior a la spec) no pinta la fila', () => {
    const fixture = TestBed.createComponent(SalesPageComponent);
    fixture.detectChanges();

    fixture.componentInstance.selected.set(saleBase({ promotion_evaluated_at: null }));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Promociones evaluadas con la vigencia del');
  });
});
