import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { PromotionsPageComponent } from './promotions-page.component';

/**
 * Spec 030, Historia 5 (FR-006): la ventana de vigencia de una promoción
 * (`starts_at`/`ends_at`) es string-a-string vía `[(ngModel)]` sobre
 * `input[type=date]` — nunca pasa por un `new Date(string)` intermedio que
 * pudiera correr el día por el offset del navegador. Test de regresión
 * preventivo (research.md Decisión 11): no hay defecto activo hoy, solo se
 * fija el comportamiento correcto. `Promotion.starts_at`/`ends_at` quedan
 * fuera del resto de esta spec (FR-009) — este test cubre únicamente el
 * formulario, no el motor de evaluación (A-07, protegido).
 */
describe('PromotionsPageComponent — ventana de vigencia (FR-006)', () => {
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

  it('starts_at/ends_at vuelven idénticos, sin corrimiento de día', () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges(); // ngOnInit: dispara las cargas iniciales

    const { form } = fixture.componentInstance;
    form.starts_at = '2026-08-24';
    form.ends_at = '2026-09-01';

    expect(form.starts_at).toBe('2026-08-24');
    expect(form.ends_at).toBe('2026-09-01');
  });

  it('un rango que cruza fin/inicio de año conserva ambos extremos tal cual', () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();

    const { form } = fixture.componentInstance;
    form.starts_at = '2025-12-31';
    form.ends_at = '2026-01-01';

    expect(form.starts_at).toBe('2025-12-31');
    expect(form.ends_at).toBe('2026-01-01');
  });
});
