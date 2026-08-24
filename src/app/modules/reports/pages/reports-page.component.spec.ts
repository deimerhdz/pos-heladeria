import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { ReportsPageComponent } from './reports-page.component';

/**
 * Spec 030, Historia 5 (FR-006): el filtro "Fecha exacta" de Reportes es
 * string-a-string vía `(change)` sobre `input[type=date]` — nunca pasa por
 * un `new Date(string)` intermedio que pudiera correr el día por el offset
 * del navegador. Test de regresión preventivo (research.md Decisión 11).
 */
describe('ReportsPageComponent — filtro de fecha exacta (FR-006)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
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

  function changeEvent(value: string): Event {
    const input = document.createElement('input');
    input.type = 'date';
    input.value = value;
    return { target: input } as unknown as Event;
  }

  it('la fecha elegida vuelve idéntica, sin corrimiento de día', () => {
    const fixture = TestBed.createComponent(ReportsPageComponent);
    fixture.detectChanges();

    fixture.componentInstance.onDateChange(changeEvent('2026-08-24'));

    expect(fixture.componentInstance.svc.selectedDate()).toBe('2026-08-24');
  });

  it('una fecha de fin/inicio de año conserva el valor exacto elegido', () => {
    const fixture = TestBed.createComponent(ReportsPageComponent);
    fixture.detectChanges();

    fixture.componentInstance.onDateChange(changeEvent('2025-12-31'));
    expect(fixture.componentInstance.svc.selectedDate()).toBe('2025-12-31');

    fixture.componentInstance.onDateChange(changeEvent('2026-01-01'));
    expect(fixture.componentInstance.svc.selectedDate()).toBe('2026-01-01');
  });
});
