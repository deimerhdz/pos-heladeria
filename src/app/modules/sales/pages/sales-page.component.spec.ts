import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { SalesPageComponent } from './sales-page.component';

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
