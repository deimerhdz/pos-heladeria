import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { PromotionsPageComponent } from './promotions-page.component';

/**
 * spec 063 — el formulario pasó a "vigencia + una o varias reglas" (partición
 * `Promoción`/`Regla`, revisión 2026-09-01, decisión de negocio A-58…A-65).
 * Estos tests cubren el formulario en el cliente; el motor de evaluación y el
 * bloqueo de solape los prueba el backend.
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

  it('el resumen (FR-005) describe el conjunto de una regla en lenguaje llano', () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    const rule = c.form.rules[0];
    rule.type = 'package_price';
    rule.value = 12000;
    rule.min_qty = 2;
    rule.variantIds = ['a', 'b', 'c'];
    expect(c.ruleConditionPreview(rule)).toContain('Llevando 2 de estas 3 variantes');

    rule.type = 'percent';
    rule.value = 10;
    rule.min_qty = 1;
    expect(c.ruleConditionPreview(rule)).toBe('10% en estas 3 variantes');
  });

  it('FR-018: en una promoción activa las reglas no son editables', () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.editingSource.set({
      id: 'p1',
      name: 'activa',
      description: null,
      status: 'active',
      starts_at: null,
      ends_at: null,
      days_of_week: null,
      start_time: null,
      end_time: null,
      closed_by_refactor_at: null,
      rules: [
        {
          id: 'r1', type: 'percent', value: '10', min_qty: 1,
          condition_text: null, variants: [],
        },
      ],
    });

    expect(c.canEditShape()).toBe(false);
  });

  it('el conjunto vacío de una regla invalida el formulario (FR-001)', () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.openNew();
    c.form.name = 'x';
    c.form.rules[0].value = 10;
    c.form.rules[0].variantIds = [];
    expect(c.formValid()).toBe(false);

    c.form.rules[0].variantIds = ['a'];
    expect(c.formValid()).toBe(true);
  });

  it('FR-001: creación por lote — agregar y quitar reglas', () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.openNew();
    expect(c.form.rules.length).toBe(1);

    c.addRule();
    c.addRule();
    expect(c.form.rules.length).toBe(3);
    expect(c.ruleFilters.length).toBe(3);

    c.removeRule(1);
    expect(c.form.rules.length).toBe(2);
    expect(c.ruleFilters.length).toBe(2);
  });

  it('FR-001a: una variante repetida entre dos reglas se detecta en el cliente', () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.openNew();
    c.addRule();
    c.form.rules[0].variantIds = ['a', 'b'];
    c.form.rules[1].variantIds = ['b', 'c'];

    const conflict = c.sharedVariantConflict();
    expect(conflict).not.toBeNull();
    expect(conflict?.a).toBe(0);
    expect(conflict?.b).toBe(1);

    c.form.name = 'x';
    expect(c.formValid()).toBe(false);
  });
});
