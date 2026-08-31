import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { PromotionsPageComponent } from './promotions-page.component';

/**
 * spec 063 — el formulario pasó a "dos tipos + conjunto de variantes"
 * (decisión de negocio A-58…A-65). Estos tests cubren el formulario en el
 * cliente; el motor de evaluación y el bloqueo de solape los prueba el backend.
 */
describe('PromotionsPageComponent', () => {
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

  it('la ventana de vigencia (date) va string-a-string, sin corrimiento de día', () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();

    const { form } = fixture.componentInstance;
    form.starts_at = '2026-08-24';
    form.ends_at = '2026-09-01';

    expect(form.starts_at).toBe('2026-08-24');
    expect(form.ends_at).toBe('2026-09-01');
  });

  it('el resumen (FR-005) describe el conjunto en lenguaje llano', () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.form.type = 'package_price';
    c.form.value = 12000;
    c.form.min_qty = 2;
    c.form.variantIds = ['a', 'b', 'c'];
    expect(c.conditionPreview()).toContain('Llevando 2 de estas 3 variantes');

    c.form.type = 'percent';
    c.form.value = 10;
    c.form.min_qty = 1;
    expect(c.conditionPreview()).toBe('10% en estas 3 variantes');
  });

  it('FR-018: en una promoción activa el tipo/valor no son editables', () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.editingSource.set({
      id: 'p1',
      name: 'activa',
      description: null,
      type: 'percent',
      value: '10',
      status: 'active',
      starts_at: null,
      ends_at: null,
      days_of_week: null,
      start_time: null,
      end_time: null,
      min_qty: 1,
      closed_by_refactor_at: null,
      condition_text: null,
      variants: [],
    });

    expect(c.canEditShape()).toBe(false);
    expect(c.canEditValue()).toBe(false);
  });

  it('el conjunto vacío invalida el formulario (FR-001)', () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.openNew();
    c.form.name = 'x';
    c.form.value = 10;
    c.form.variantIds = [];
    expect(c.formValid()).toBe(false);

    c.form.variantIds = ['a'];
    expect(c.formValid()).toBe(true);
  });
});
