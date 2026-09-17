import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { vi } from 'vitest';
import { PromotionsPageComponent } from './promotions-page.component';
import { MenuService } from '../../../core/services/menu.service';
import type { Promotion } from '../interfaces/promotion.interface';

/**
 * spec 083 (US3): rediseño de las tres pantallas (listado, creación mínima,
 * configuración) — el tipo se fija una vez en la pantalla de creación
 * (FR-010) y cada fila de regla se agrega ya completa desde el Paso 1/Paso 2
 * ("Agregar a la lista"), sin edición in-situ. Estos tests reemplazan a los
 * de spec 071 (acordeón de reglas editables in-situ, retirado) que cubrían
 * la misma intención bajo la API anterior; el motor de evaluación y el
 * bloqueo de solape los sigue probando el backend.
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

  function seedGranizados(menu: MenuService): void {
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
              { id: 'a', name: '8oz', price: 8000, option_groups: [], available: true },
              { id: 'b', name: '12oz', price: 10000, option_groups: [], available: true },
              { id: 'c', name: '16oz', price: 12000, option_groups: [], available: true },
            ],
          },
          {
            id: 'p2',
            name: 'Granizado de mora',
            description: null,
            image_url: null,
            option_groups: [],
            available: true,
            variants: [
              { id: 'd', name: '8oz', price: 8500, option_groups: [], available: true },
              { id: 'e', name: '12oz', price: 10500, option_groups: [], available: true },
            ],
          },
          {
            id: 'p3',
            name: 'Agua',
            description: null,
            image_url: null,
            option_groups: [],
            available: true,
            variants: [{ id: 'f', name: 'Presentación única', price: 3000, option_groups: [], available: true }],
          },
        ],
      },
    ]);
  }

  it('la ventana de vigencia (date) va string-a-string, sin corrimiento de día', () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();

    const { form } = fixture.componentInstance;
    form.starts_at = '2026-08-24';
    form.ends_at = '2026-09-01';

    expect(form.starts_at).toBe('2026-08-24');
    expect(form.ends_at).toBe('2026-09-01');
  });

  describe('continueToConfigure (pantalla de creación)', () => {
    it('spec 083 (FR-020, A-75): crea de inmediato en Borrador y arranca sin reglas', async () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      c.openNew();
      c.createName.set('2x1 Granizados');
      c.createType.set('package_price');

      const fakeResult = { id: 'new-id', rules: [] } as unknown as Promotion;
      const createSpy = vi.spyOn(c.svc, 'create').mockResolvedValue(fakeResult);

      await c.continueToConfigure();

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: '2x1 Granizados', type: 'package_price', rules: [] }),
        'draft',
      );
      expect(c.screen()).toBe('configure');
      expect(c.editingId()).toBe('new-id');
      expect(c.form.name).toBe('2x1 Granizados');
      expect(c.form.type).toBe('package_price');
      expect(c.form.rules).toEqual([]);
      // FR-011: fecha de inicio con valor por defecto (hoy), requerida al guardar.
      expect(c.form.starts_at).toBeTruthy();
    });

    it('si el backend rechaza la creación, se queda en la pantalla de creación con el error visible', async () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      c.openNew();
      c.createName.set('2x1 Granizados');
      vi.spyOn(c.svc, 'create').mockResolvedValue(null);
      c.svc.otherError.set('Ya existe una promoción con ese nombre');

      await c.continueToConfigure();

      expect(c.screen()).toBe('create');
      expect(c.formError()).toBe('Ya existe una promoción con ese nombre');
    });

    it('no avanza sin nombre', () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      c.openNew();
      c.createName.set('   ');
      c.continueToConfigure();

      expect(c.screen()).toBe('create');
    });
  });

  describe('FR-013: variantLabel / availableLabels (etiqueta de presentación)', () => {
    it('un producto con una sola variante se etiqueta "Presentación única"', () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      const agua = c.catalogVariants().find((v) => v.id === 'f')!;
      expect(c.variantLabel(agua)).toBe('Presentación única');
    });

    it('un producto con varias variantes usa el nombre propio de cada una', () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      const ocho = c.catalogVariants().find((v) => v.id === 'a')!;
      expect(c.variantLabel(ocho)).toBe('8oz');
    });

    it('availableLabels es la unión de etiquetas de los productos candidatos', () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      c.toggleProductCandidate('p1'); // café: 8oz/12oz/16oz
      c.toggleProductCandidate('p2'); // mora: 8oz/12oz
      expect(c.availableLabels()).toEqual(['12oz', '16oz', '8oz']);
    });

    it('resolvedVariantIdsForLabel junta la variante de cada producto candidato que coincide', () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      c.toggleProductCandidate('p1');
      c.toggleProductCandidate('p2');
      // "16oz" solo existe en café (p1) -- mora (p2) no aporta variante.
      expect(c.resolvedVariantIdsForLabel('16oz')).toEqual(['c']);
      // "8oz" existe en ambos.
      expect(new Set(c.resolvedVariantIdsForLabel('8oz'))).toEqual(new Set(['a', 'd']));
    });
  });

  describe('addRuleRow / removeRuleRow (Paso 1 + Paso 2)', () => {
    it('agrega una fila con el type fijado en creación, y la limpia del picker', async () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      c.openNew();
      c.createName.set('2x1');
      c.createType.set('package_price');
      vi.spyOn(c.svc, 'create').mockResolvedValue({ id: 'p1', rules: [] } as unknown as Promotion);
      await c.continueToConfigure();

      c.toggleProductCandidate('p1');
      c.toggleProductCandidate('p2');
      c.pickerLabel.set('8oz');
      c.pickerQty.set(2);
      c.pickerValue.set(12000); // menor a 2 * 8000 (la más barata) -- sí es descuento.

      c.addRuleRow();

      expect(c.form.rules.length).toBe(1);
      expect(c.form.rules[0]).toEqual({
        type: 'package_price',
        value: 12000,
        min_qty: 2,
        variantIds: expect.arrayContaining(['a', 'd']),
      });
      expect(c.pickerLabel()).toBeNull();
      expect(c.pickerError()).toBeNull();
    });

    it('FR-026: rechaza un precio de paquete que no representa ahorro frente a la suma regular (espejo del guard del backend)', async () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      c.openNew();
      c.createName.set('2x1');
      c.createType.set('package_price');
      vi.spyOn(c.svc, 'create').mockResolvedValue({ id: 'p1', rules: [] } as unknown as Promotion);
      await c.continueToConfigure();

      c.toggleProductCandidate('p1'); // 8oz cuesta 8000
      c.pickerLabel.set('8oz');
      c.pickerQty.set(2);
      c.pickerValue.set(20000); // 2 * 8000 = 16000 < 20000 -- no es descuento.

      c.addRuleRow();

      expect(c.form.rules.length).toBe(0);
      expect(c.pickerError()).toContain('debe ser menor a la suma');
    });

    it('FR-025: una regla de precio de paquete no admite menos de 2 unidades', async () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      c.openNew();
      c.createName.set('2x1');
      c.createType.set('package_price');
      vi.spyOn(c.svc, 'create').mockResolvedValue({ id: 'p1', rules: [] } as unknown as Promotion);
      await c.continueToConfigure();

      expect(c.pickerQty()).toBe(2); // arranca en 2 para precio de paquete (FR-025)

      c.toggleProductCandidate('p1');
      c.pickerLabel.set('8oz');
      c.onPickerQtyChange(1);
      expect(c.pickerQty()).toBe(2); // no baja de 2
      expect(c.pickerError()).toContain('mínimo es de 2 unidades');

      c.pickerValue.set(12000);
      c.addRuleRow();
      expect(c.form.rules[0].min_qty).toBe(2);
    });

    it('remueve una fila ya agregada', async () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      c.openNew();
      c.createName.set('2x1');
      vi.spyOn(c.svc, 'create').mockResolvedValue({ id: 'p1', rules: [] } as unknown as Promotion);
      await c.continueToConfigure();
      c.toggleProductCandidate('p1');
      c.pickerLabel.set('8oz');
      c.pickerQty.set(2);
      c.pickerValue.set(12000);
      c.addRuleRow();
      expect(c.form.rules.length).toBe(1);

      c.removeRuleRow(0);
      expect(c.form.rules.length).toBe(0);
    });
  });

  it('FR-018: en una promoción activa las reglas no son editables (canEditRuleSet false)', () => {
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
        { id: 'r1', type: 'percent', value: '10', min_qty: 1, condition_text: null, variants: [] },
      ],
    });

    expect(c.canEditRuleSet()).toBe(false);
  });

  it('openEdit: una promoción pausada habilita agregar/quitar reglas (FR-014) y fija el type de la primera regla existente', () => {
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

    expect(c.screen()).toBe('configure');
    expect(c.isPaused()).toBe(true);
    expect(c.canEditRuleSet()).toBe(true);
    expect(c.form.type).toBe('percent');
    expect(c.form.rules[0].variantIds).toEqual(['a']);
  });

  it('spec 063 (FR-014): saveConfigure() actualiza las reglas (updateShape) también cuando la promoción está pausada', async () => {
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

    await c.saveConfigure();

    expect(updateShapeSpy).toHaveBeenCalledWith('p1', c.form);
    expect(updateSpy).toHaveBeenCalledWith('p1', c.form);
    expect(updateShapeSpy.mock.invocationCallOrder[0]).toBeLessThan(
      updateSpy.mock.invocationCallOrder[0],
    );
  });

  it('spec 083 (A-75): saveConfigure() nunca crea -- la promoción ya existe desde "Continuar"', async () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.openNew();
    c.createName.set('Nueva');
    const created = { id: 'new-id', status: 'draft', rules: [] } as unknown as Promotion;
    const createSpy = vi.spyOn(c.svc, 'create').mockResolvedValue(created);
    await c.continueToConfigure();
    expect(createSpy).toHaveBeenCalledTimes(1);
    createSpy.mockClear();

    // Sin catálogo cargado no hay presentaciones que elegir -- se agrega la
    // regla directo sobre `form.rules` para aislar el guardado del picker.
    c.form.rules.push({ type: 'package_price', value: 12000, min_qty: 2, variantIds: ['a'] });

    const updateShapeSpy = vi.spyOn(c.svc, 'updateShape').mockResolvedValue(created);
    const updateSpy = vi.spyOn(c.svc, 'update').mockResolvedValue(created);

    await c.saveConfigure();

    expect(createSpy).not.toHaveBeenCalled();
    expect(updateShapeSpy).toHaveBeenCalledWith('new-id', c.form);
    expect(updateSpy).toHaveBeenCalledWith('new-id', c.form);
    expect(c.screen()).toBe('list');
  });

  it('el conjunto vacío de una regla invalida el formulario (FR-001)', async () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.openNew();
    c.createName.set('x');
    vi.spyOn(c.svc, 'create').mockResolvedValue({ id: 'p1', rules: [] } as unknown as Promotion);
    await c.continueToConfigure();
    expect(c.formValid()).toBe(false); // sin reglas todavía.

    c.form.rules.push({ type: 'package_price', value: 10, min_qty: 1, variantIds: [] });
    expect(c.formValid()).toBe(false); // regla sin variantes.

    c.form.rules[0].variantIds = ['a'];
    expect(c.formValid()).toBe(true);
  });

  it('FR-001a: una variante repetida entre dos reglas se detecta en el cliente y bloquea el formulario', async () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.openNew();
    c.createName.set('x');
    vi.spyOn(c.svc, 'create').mockResolvedValue({ id: 'p1', rules: [] } as unknown as Promotion);
    await c.continueToConfigure();
    c.form.rules.push({ type: 'package_price', value: 10, min_qty: 1, variantIds: ['a', 'b'] });
    c.form.rules.push({ type: 'package_price', value: 10, min_qty: 1, variantIds: ['b', 'c'] });

    const conflict = c.sharedVariantConflict();
    expect(conflict).not.toBeNull();
    expect(conflict?.a).toBe(0);
    expect(conflict?.b).toBe(1);
    expect(c.formValid()).toBe(false);
  });

  describe('FR-021: canDelete (habilitación de "Eliminar")', () => {
    it('habilitado para Borrador, En pausa y Finalizada; bloqueado solo para Activa', () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      const base = { id: 'p1', name: 'x', rules: [] } as unknown as Promotion;
      expect(c.canDelete({ ...base, status: 'draft' } as Promotion)).toBe(true);
      expect(c.canDelete({ ...base, status: 'paused' } as Promotion)).toBe(true);
      expect(c.canDelete({ ...base, status: 'finished' } as Promotion)).toBe(true);
      expect(c.canDelete({ ...base, status: 'active' } as Promotion)).toBe(false);
    });
  });

  describe('FR-017: promotionTypeLabel (columna "Reglas" simplificada)', () => {
    it('muestra únicamente el tipo cuando todas las reglas comparten uno', () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      const p = {
        rules: [
          { type: 'package_price' },
          { type: 'package_price' },
        ],
      } as unknown as Promotion;
      expect(c.promotionTypeLabel(p)).toBe('Precio de paquete');
    });

    it('sin reglas todavía (Borrador recién creado, A-75)', () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      expect(c.promotionTypeLabel({ rules: [] } as unknown as Promotion)).toBe('Sin reglas');
    });
  });
});
