import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { vi } from 'vitest';
import { PromotionsPageComponent } from './promotions-page.component';
import { MenuService } from '../../../core/services/menu.service';
import type { Promotion } from '../interfaces/promotion.interface';

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
    // spec 066 (A-66, FR-018): la vista previa **nombra** las variantes
    // seleccionadas. La firma pasa a `ruleConditionPreview($index)` porque necesita
    // el índice para resolver esos nombres con `selectedVariantsForRule`.
    const menu = TestBed.inject(MenuService);
    menu.categories.set([
      {
        id: 'c1',
        name: 'Granizados',
        products: [
          {
            id: 'p1',
            name: 'Granizado de café',
            description: null,
            image_url: null,
            option_groups: [],
            available: true,
            variants: [
              { id: 'a', name: 'Pequeño 8oz', price: 8000, option_groups: [], available: true },
              { id: 'b', name: 'Mediano 12oz', price: 10000, option_groups: [], available: true },
              { id: 'c', name: 'Grande 16oz', price: 12000, option_groups: [], available: true },
            ],
          },
        ],
      },
    ]);

    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    const rule = c.form.rules[0];
    rule.type = 'package_price';
    rule.value = 12000;
    rule.min_qty = 2;
    rule.variantIds = ['a', 'b', 'c'];
    // Orden alfabético (FR-002), no el de selección.
    expect(c.ruleConditionPreview(0)).toBe(
      'Llevando 2 entre Grande 16oz, Mediano 12oz y Pequeño 8oz pagas $12.000',
    );

    rule.type = 'percent';
    rule.value = 10;
    rule.min_qty = 1;
    expect(c.ruleConditionPreview(0)).toBe('10% en Grande 16oz, Mediano 12oz y Pequeño 8oz');
  });

  it('spec 071 (FR-001 a FR-005): ruleSummaryText nombra el producto de la tarjeta colapsada', () => {
    const menu = TestBed.inject(MenuService);
    menu.categories.set([
      {
        id: 'c1',
        name: 'Bebidas',
        products: [
          {
            id: 'p1',
            name: 'Gaseosa',
            description: null,
            image_url: null,
            option_groups: [],
            available: true,
            variants: [{ id: 'a', name: 'Gaseosa - Única', price: 3500, option_groups: [], available: true }],
          },
          {
            id: 'p2',
            name: 'Banana Split Especial',
            description: null,
            image_url: null,
            option_groups: [],
            available: true,
            variants: [
              { id: 'b', name: 'Banana Split Especial - Pequeña', price: 15000, option_groups: [], available: true },
            ],
          },
          {
            id: 'p3',
            name: 'Cono sencillo',
            description: null,
            image_url: null,
            option_groups: [],
            available: true,
            variants: [{ id: 'c', name: 'Cono sencillo - Única', price: 4000, option_groups: [], available: true }],
          },
        ],
      },
      {
        id: 'c2',
        name: 'Granizados',
        products: [
          {
            id: 'p4',
            name: 'Granizado',
            description: null,
            image_url: null,
            option_groups: [],
            available: true,
            variants: [
              { id: 'd', name: 'Pequeño 8oz', price: 8000, option_groups: [], available: true },
              { id: 'e', name: 'Mediano 12oz', price: 10000, option_groups: [], available: true },
              { id: 'f', name: 'Grande 16oz', price: 12000, option_groups: [], available: true },
              { id: 'g', name: 'Jumbo 20oz', price: 14000, option_groups: [], available: true },
              { id: 'h', name: 'Familiar 24oz', price: 16000, option_groups: [], available: true },
            ],
          },
        ],
      },
    ]);

    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    const rule = c.form.rules[0];

    // Caso 1: precio de paquete, un solo producto (contracts/resumen-de-regla.md §3, fila 1).
    rule.type = 'package_price';
    rule.value = 12000;
    rule.min_qty = 2;
    rule.variantIds = ['a'];
    expect(c.ruleSummaryText(0)).toBe('Paga $ 12.000 llevando 2 unidades Gaseosa - Única.');

    // Caso 2: mismo tipo, otro producto (fila 2).
    rule.variantIds = ['b'];
    expect(c.ruleSummaryText(0)).toBe('Paga $ 12.000 llevando 2 unidades Banana Split Especial - Pequeña.');

    // Caso 3: descuento % con cantidad mínima 1 (fila 3).
    rule.type = 'percent';
    rule.value = 10;
    rule.min_qty = 1;
    rule.variantIds = ['c'];
    expect(c.ruleSummaryText(0)).toBe('10% en Cono sencillo - Única.');

    // Caso 4: descuento % con cantidad mínima > 1 y tres nombres distintos (fila 4).
    rule.value = 15;
    rule.min_qty = 3;
    rule.variantIds = ['f', 'e', 'd'];
    expect(c.ruleSummaryText(0)).toBe(
      '15% llevando 3 unidades entre Grande 16oz, Mediano 12oz y Pequeño 8oz.',
    );

    // Caso 5: precio de paquete con cinco nombres distintos — tope de tres + "y N más" (fila 5).
    rule.type = 'package_price';
    rule.value = 15000;
    rule.min_qty = 2;
    rule.variantIds = ['d', 'e', 'f', 'g', 'h'];
    expect(c.ruleSummaryText(0)).toBe(
      'Paga $ 15.000 llevando 2 unidades entre Familiar 24oz, Grande 16oz, Jumbo 20oz y 2 más.',
    );

    // Caso 6: conjunto vacío (fila 6).
    rule.variantIds = [];
    expect(c.ruleSummaryText(0)).toBe('Sin productos seleccionados.');
  });

  it('spec 071 (FR-006 a FR-008): searchResultsForRule no lista el catálogo completo por defecto', () => {
    const menu = TestBed.inject(MenuService);
    menu.categories.set([
      {
        id: 'c1',
        name: 'Bebidas',
        products: [
          {
            id: 'p1',
            name: 'Gaseosa',
            description: null,
            image_url: null,
            option_groups: [],
            available: true,
            variants: [{ id: 'a', name: 'Gaseosa - Única', price: 3500, option_groups: [], available: true }],
          },
        ],
      },
      {
        id: 'c2',
        name: 'Postres',
        products: [
          {
            id: 'p2',
            name: 'Banana Split',
            description: null,
            image_url: null,
            option_groups: [],
            available: true,
            variants: [
              { id: 'b', name: 'Banana Split Especial - Pequeña', price: 15000, option_groups: [], available: true },
            ],
          },
          {
            id: 'p3',
            name: 'Helado',
            description: null,
            image_url: null,
            option_groups: [],
            available: true,
            variants: [{ id: 'c', name: 'Helado - Grande', price: 9000, option_groups: [], available: true }],
          },
        ],
      },
    ]);

    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    // Caso 1: "Todas las categorías" + sin texto -> vacío (FR-008), no el catálogo completo.
    c.ruleFilters[0] = { category: '', text: '' };
    expect(c.searchResultsForRule(0)).toEqual([]);

    // Caso 2: sin categoría, con texto -> coincide en todo el catálogo (FR-007).
    c.ruleFilters[0] = { category: '', text: 'gaseosa' };
    expect(c.searchResultsForRule(0).map((v) => v.id)).toEqual(['a']);

    // Caso 3: categoría específica, sin texto -> toda la categoría (FR-007).
    c.ruleFilters[0] = { category: 'c2', text: '' };
    expect(c.searchResultsForRule(0).map((v) => v.id).sort()).toEqual(['b', 'c']);

    // Caso 4: categoría + texto -> intersección.
    c.ruleFilters[0] = { category: 'c2', text: 'banana' };
    expect(c.searchResultsForRule(0).map((v) => v.id)).toEqual(['b']);

    // El listado de seleccionados no depende del filtro activo (FR-006).
    c.form.rules[0].variantIds = ['a'];
    c.ruleFilters[0] = { category: 'c2', text: '' };
    expect(c.selectedVariantsForRule(0).map((v) => v.id)).toEqual(['a']);
  });

  it('spec 066: sin nombres que resolver la vista previa conserva el conteo (FR-006)', () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    const rule = c.form.rules[0];
    rule.type = 'package_price';
    rule.value = 12000;
    rule.min_qty = 2;
    // Ids que no están en el catálogo cargado: no hay nombre que resolver.
    rule.variantIds = ['x', 'y', 'z'];

    expect(c.ruleConditionPreview(0)).toBe('Llevando 2 de estas 3 variantes pagas $12.000');
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

    expect(c.canEditRuleSet()).toBe(false);
    expect(c.canEditRuleTypeValue(c.form.rules[0])).toBe(false);
  });

  it('spec 071 (A-69, FR-013 a FR-018): una promoción pausada habilita el conjunto y agregar/quitar reglas, no el tipo/valor de una regla ya existente', () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.openEdit({
      id: 'p1',
      name: 'pausada',
      description: null,
      status: 'paused',
      starts_at: null,
      ends_at: null,
      days_of_week: null,
      start_time: null,
      end_time: null,
      closed_by_refactor_at: null,
      rules: [
        {
          id: 'r1', type: 'percent', value: '10', min_qty: 1,
          condition_text: null, variants: [{ product_variant_id: 'a', description: 'a', unit_price: '8000.00' }],
        },
      ],
    });

    // El conjunto y agregar/quitar reglas se habilitan en Pausada (FR-014).
    expect(c.isPaused()).toBe(true);
    expect(c.canEditRuleSet()).toBe(true);
    // Tipo/valor/cantidad mínima de la regla que ya existía siguen bloqueados (FR-015).
    expect(c.form.rules[0].isExisting).toBe(true);
    expect(c.canEditRuleTypeValue(c.form.rules[0])).toBe(false);

    // Una regla agregada en esta sesión de edición sí es editable por completo.
    c.addRule();
    expect(c.form.rules[0].isExisting).toBe(false);
    expect(c.canEditRuleTypeValue(c.form.rules[0])).toBe(true);
  });

  it('spec 071 (FR-014): save() actualiza las reglas (updateShape) también cuando la promoción está pausada', async () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.openEdit({
      id: 'p1',
      name: 'pausada',
      description: null,
      status: 'paused',
      starts_at: '2026-08-01',
      ends_at: null,
      days_of_week: null,
      start_time: null,
      end_time: null,
      closed_by_refactor_at: null,
      rules: [
        {
          id: 'r1', type: 'percent', value: '10', min_qty: 1,
          condition_text: null, variants: [{ product_variant_id: 'a', description: 'a', unit_price: '8000.00' }],
        },
      ],
    });
    c.form.name = 'pausada';

    const fakeResult = { id: 'p1' } as Promotion;
    const updateShapeSpy = vi.spyOn(c.svc, 'updateShape').mockResolvedValue(fakeResult);
    const updateSpy = vi.spyOn(c.svc, 'update').mockResolvedValue(fakeResult);

    await c.save('draft');

    expect(updateShapeSpy).toHaveBeenCalledWith('p1', c.form);
    expect(updateSpy).toHaveBeenCalledWith('p1', c.form);
    // El conjunto de reglas se manda antes que los escalares (mismo orden que en `draft`).
    expect(updateShapeSpy.mock.invocationCallOrder[0]).toBeLessThan(
      updateSpy.mock.invocationCallOrder[0],
    );
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

  it('spec 071 (FR-012): una regla nueva se agrega al principio del listado, no al final', () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.openNew();
    c.form.rules[0].value = 1; // "Regla 1" original.
    c.ruleFilters[0].text = 'r1';

    c.addRule();
    // La nueva regla ("Regla 2") ocupa la posición 0; la original se corre a la 1.
    expect(c.form.rules.map((r) => r.value)).toEqual([0, 1]);
    expect(c.ruleFilters.map((f) => f.text)).toEqual(['', 'r1']);
    expect(c.expandedRuleIndex()).toBe(0);
    c.form.rules[0].value = 2;
    c.ruleFilters[0].text = 'r2';

    c.addRule();
    // Una tercera regla ("Regla 3") vuelve a entrar en la posición 0; el orden
    // relativo de las dos anteriores (r2, r1) no cambia.
    expect(c.form.rules.map((r) => r.value)).toEqual([0, 2, 1]);
    expect(c.ruleFilters.map((f) => f.text)).toEqual(['', 'r2', 'r1']);
    expect(c.expandedRuleIndex()).toBe(0);
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
