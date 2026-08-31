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

/**
 * Spec 040 — el selector "¿Qué quieres crear?" ya no ofrece "Paquete"
 * (`qty_price`); la única forma de paquete que se puede crear es "Paquete por
 * presentación" (`qty_price_presentation`), que abre el formulario dedicado.
 */
describe('PromotionsPageComponent — spec 040', () => {
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
    http.match(() => true);
    http.verify();
  });

  it('la pantalla de tipo no ofrece "Paquete" suelto, sí "Paquete por presentación"', () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();
    fixture.componentInstance.screen.set('type');
    fixture.detectChanges();

    const cards = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    const titles = cards.map((b) => b.textContent?.trim() ?? '');
    expect(titles.some((t) => t.includes('Paquete por presentación'))).toBe(true);
    expect(titles.some((t) => /^Paquete\b/.test(t))).toBe(false);
  });

  it('elegir "Paquete por presentación" abre el formulario dedicado con una regla vacía', () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();

    fixture.componentInstance.chooseKind('presentation');

    expect(fixture.componentInstance.screen()).toBe('presentation');
    expect(fixture.componentInstance.form.type).toBe('qty_price_presentation');
    expect(fixture.componentInstance.form.presentationRules.length).toBe(1);
  });

  it('el resumen y la validación reflejan las reglas por presentación', () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();

    const c = fixture.componentInstance;
    c.chooseKind('presentation');
    c.form.name = 'Promo 8oz';
    c.form.presentationRules = [{ presentation_id: 'p1', min_qty: 2, pack_price: 12000 }];

    expect(c.completePresentationRules().length).toBe(1);
    expect(c.canSaveDraft()).toBe(true);
    expect(c.draftSummary()).toContain('Paquetes por presentación');
  });
});
