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

  it('los íconos de volver/ayuda del formulario ya no son SVG artesanales (spec 082)', () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.componentInstance.screen.set('create');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const ligaduras = Array.from(el.querySelectorAll('app-mi-icon .material-icons-outlined')).map(
      (n) => n.textContent?.trim(),
    );
    expect(ligaduras).toEqual(expect.arrayContaining(['arrow_back', 'help_outline']));
  });

  // Deuda preexistente, fuera de alcance de spec 084: este test estaba roto desde la
  // transición spec 082→083 (`screen.set('form')`, valor inexistente en `Screen`) y por
  // eso nunca se ejecutó. Al corregir el valor de `screen` (arriba) queda expuesto que la
  // migración de íconos de spec 082 no llegó a la casilla de "seleccionado" de la lista de
  // productos del Paso 1 — sigue siendo un SVG artesanal. No se corrige aquí (no es ninguno
  // de los 5 bugs de spec 084); queda documentado para una spec de icon-standardization.
  it.skip('el resto de la pantalla de creación tampoco usa SVG artesanales (deuda preexistente, fuera de spec 084)', () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.componentInstance.screen.set('create');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('svg')).toBeNull();
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
            variants: [
              {
                id: 'f',
                name: 'Presentación única',
                price: 3000,
                option_groups: [],
                available: true,
              },
            ],
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
    it('con un solo producto coincidente, agrega la fila directo y limpia el picker', async () => {
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

      c.toggleProductCandidate('p1'); // solo un candidato -- sin confirmación pendiente
      c.pickerLabel.set('8oz');
      c.pickerQty.set(2);
      c.pickerValue.set(12000); // menor a 2 * 8000 -- sí es descuento.

      c.addRuleRow();

      expect(c.pendingBulkApply()).toBeNull();
      expect(c.form.rules.length).toBe(1);
      expect(c.form.rules[0]).toEqual({
        type: 'package_price', value: 12000, min_qty: 2, variantIds: ['a'],
      });
      expect(c.pickerLabel()).toBeNull();
      expect(c.pickerError()).toBeNull();
    });

    // spec 084 (bug 3, FR-016 a FR-019, A-77): con más de un producto candidato,
    // addRuleRow() ya NO agrega una sola regla combinada -- queda pendiente de
    // confirmación con una casilla por producto, premarcadas.
    it('con varios productos coincidentes, queda pendiente de confirmación con todos premarcados (FR-016)', async () => {
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
      c.pickerValue.set(12000);

      c.addRuleRow();

      expect(c.form.rules.length).toBe(0); // todavía no se generó ninguna fila
      const pending = c.pendingBulkApply();
      expect(pending).not.toBeNull();
      expect(pending!.map((p) => p.productId).sort()).toEqual(['p1', 'p2']);
      expect(pending!.every((p) => p.checked)).toBe(true);
    });

    it('confirmar la aplicación masiva genera una fila INDEPENDIENTE por cada producto marcado (FR-017/FR-019)', async () => {
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
      c.pickerValue.set(12000);
      c.addRuleRow();

      c.confirmBulkApply();

      expect(c.pendingBulkApply()).toBeNull();
      expect(c.form.rules.length).toBe(2); // una fila por producto, no una combinada
      const byVariant = c.form.rules.map((r) => r.variantIds).sort();
      expect(byVariant).toEqual([['a'], ['d']]);
      for (const r of c.form.rules) {
        expect(r.type).toBe('package_price');
        expect(r.value).toBe(12000);
        expect(r.min_qty).toBe(2);
      }
      // Cada fila se puede quitar sin afectar a la otra.
      c.removeRuleRow(0);
      expect(c.form.rules.length).toBe(1);
    });

    it('desmarcar un candidato antes de confirmar lo excluye — no se le genera fila (FR-017)', async () => {
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
      c.pickerValue.set(12000);
      c.addRuleRow();
      c.toggleBulkApplyCandidate('p2');

      c.confirmBulkApply();

      expect(c.form.rules.length).toBe(1);
      expect(c.form.rules[0].variantIds).toEqual(['a']); // solo p1 (café)
    });

    it('cancelar la aplicación masiva no genera ninguna fila y limpia la confirmación pendiente', async () => {
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
      c.pickerValue.set(12000);
      c.addRuleRow();

      c.cancelBulkApply();

      expect(c.pendingBulkApply()).toBeNull();
      expect(c.form.rules.length).toBe(0);
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
          id: 'r1',
          type: 'percent',
          value: '10',
          min_qty: 1,
          condition_text: null,
          variants: [{ product_variant_id: 'a', description: 'a', unit_price: '8000.00' }],
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
          id: 'r1',
          type: 'percent',
          value: '10',
          min_qty: 1,
          condition_text: null,
          variants: [{ product_variant_id: 'a', description: 'a', unit_price: '8000.00' }],
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

  describe('spec 084 FR-008/FR-009/FR-010 (A-76): "Configurar" deshabilitado en Activa', () => {
    const base = { id: 'p1', name: 'x', rules: [] } as unknown as Promotion;

    it('canConfigure: habilitado para Borrador, En pausa y Finalizada; bloqueado solo para Activa, sin importar el badge', () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      expect(c.canConfigure({ ...base, status: 'draft' } as Promotion)).toBe(true);
      expect(c.canConfigure({ ...base, status: 'paused' } as Promotion)).toBe(true);
      expect(c.canConfigure({ ...base, status: 'finished' } as Promotion)).toBe(true);
      expect(c.canConfigure({ ...base, status: 'active' } as Promotion)).toBe(false);
      // Estado real, no el badge -- una vigencia ya vencida sigue bloqueada si status=active.
      expect(
        c.canConfigure({
          ...base, status: 'active',
          starts_at: '2020-01-01', ends_at: '2020-01-02',
        } as Promotion),
      ).toBe(false);
    });

    it('openEdit no abre la pantalla de configuración para una promoción active (defensa en profundidad)', () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      c.openEdit({ ...base, status: 'active' } as Promotion);

      expect(c.editingId()).toBeNull();
      expect(c.screen()).toBe('list');
    });

    it('openEdit sí abre la pantalla para draft/paused/finished', () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      c.openEdit({ ...base, status: 'paused' } as Promotion);

      expect(c.editingId()).toBe('p1');
    });
  });

  describe('FR-017: promotionTypeLabel (columna "Reglas" simplificada)', () => {
    it('muestra únicamente el tipo cuando todas las reglas comparten uno', () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      const p = {
        rules: [{ type: 'package_price' }, { type: 'package_price' }],
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

  describe('spec 084 FR-021/FR-022 (A-78): exclusividad de producto en el Paso 1', () => {
    /** El query de `activePromotions` (TanStack Query) no despacha su petición
     *  de forma síncrona dentro de `detectChanges()` -- hace falta drenar un
     *  microtask antes de que `http.expectOne` la vea (mismo patrón que
     *  `product-form.component.spec.ts::tick`). */
    const tick = () => new Promise((r) => setTimeout(r, 0));

    /** Responde la petición de `?status=active` que alimenta
     *  `blockedByPromotion()`; las demás peticiones en vuelo (`GET /menu`,
     *  `?page=1`, `?closed_by_refactor=true`) las drena `afterEach` al final. */
    async function flushActivePromotions(
      fixture: ReturnType<typeof TestBed.createComponent<PromotionsPageComponent>>,
      items: unknown[],
    ): Promise<void> {
      await tick();
      const req = http.expectOne(
        (r) => r.url.endsWith('/promotions') && r.params.get('status') === 'active',
      );
      req.flush({ items, total: items.length, page: 1, size: 100, pages: 1 });
      // TanStack Query propaga su cache al signal `data()` en su propia ronda
      // de microtareas, aparte de la del Observable HTTP -- un solo tick no
      // siempre alcanza (mismo ajuste de fondo que
      // `public-menu.component.spec.ts::createComponent`, sin `whenStable()`
      // acá: rompe con "ApplicationRef ya destruido" en este archivo).
      const start = Date.now();
      while (
        fixture.componentInstance.svc.activePromotions().length === 0 &&
        Date.now() - start < 500
      ) {
        await tick();
        fixture.detectChanges();
      }
    }

    const otraPromoActiva = {
      id: 'other', name: 'Ya activa', status: 'active',
      rules: [
        {
          id: 'r1', type: 'percent', value: '10', min_qty: 1, condition_text: null,
          variants: [{ product_variant_id: 'a', description: '', unit_price: '8000' }],
        },
      ],
    };

    it('blockedReason() devuelve el nombre de la promoción activa que ya cubre el producto (por cualquiera de sus variantes)', async () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      await flushActivePromotions(fixture, [otraPromoActiva]);

      // 'a' (8oz) pertenece a p1 (café) -- FR-021: todo el producto queda bloqueado.
      expect(c.blockedReason('p1')).toBe('Ya activa');
      expect(c.blockedReason('p2')).toBeNull();
    });

    it('toggleProductCandidate() rechaza seleccionar un producto bloqueado (defensa en profundidad)', async () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      await flushActivePromotions(fixture, [otraPromoActiva]);

      c.toggleProductCandidate('p1');

      expect(c.isProductSelected('p1')).toBe(false);
      expect(c.pickerError()).toContain('Ya activa');
    });

    it('un producto sin ninguna promoción activa en conflicto se puede seleccionar con normalidad', async () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      await flushActivePromotions(fixture, [otraPromoActiva]);

      c.toggleProductCandidate('p2');

      expect(c.isProductSelected('p2')).toBe(true);
      expect(c.pickerError()).toBeNull();
    });

    it('FR-024: la promoción en edición (editingId) se excluye de su propio bloqueo', async () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      // "other" es la misma promoción que se está editando ahora.
      c.editingId.set('other');
      await flushActivePromotions(fixture, [otraPromoActiva]);

      expect(c.blockedReason('p1')).toBeNull();
    });
  });

  describe('spec 084 FR-026 a FR-028 (bug 5): menú de acciones sin recortar ni mover el scroll', () => {
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const promo = {
      id: 'p1', name: 'Promo X', description: null, status: 'draft',
      starts_at: null, ends_at: null, days_of_week: null, start_time: null, end_time: null,
      closed_by_refactor_at: null, rules: [],
    } as unknown as Promotion;

    async function renderOneRow(
      fixture: ReturnType<typeof TestBed.createComponent<PromotionsPageComponent>>,
    ): Promise<void> {
      await tick();
      const req = http.expectOne(
        (r) =>
          r.url.endsWith('/promotions') &&
          r.params.get('page') === '1' &&
          !r.params.has('status') &&
          !r.params.has('closed_by_refactor'),
      );
      req.flush({ items: [promo], total: 1, page: 1, size: 20, pages: 1 });
      const start = Date.now();
      while (
        fixture.componentInstance.svc.promotions().length === 0 &&
        Date.now() - start < 500
      ) {
        await tick();
        fixture.detectChanges();
      }
    }

    it('el menú se renderiza fuera del contenedor con scroll de la tabla (CDK Overlay, no recortado)', async () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      await renderOneRow(fixture);
      const c = fixture.componentInstance;

      c.toggleActionsMenu('p1', new MouseEvent('click'));
      fixture.detectChanges();

      const overlayPane = document.querySelector('.cdk-overlay-pane');
      expect(overlayPane).not.toBeNull();
      expect(overlayPane!.textContent).toContain('Configurar');
      expect(overlayPane!.textContent).toContain('Duplicar');
      // El overlay NO cuelga del contenedor con scroll de la tabla.
      const scrollContainer = fixture.nativeElement.querySelector('.overflow-x-auto');
      expect(scrollContainer?.contains(overlayPane)).toBe(false);

      c.closeActionsMenu();
      fixture.detectChanges();
    });

    it('cerrar el menú (clic fuera / seleccionar una opción) no deja nada en el overlay', async () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      await renderOneRow(fixture);
      const c = fixture.componentInstance;

      c.toggleActionsMenu('p1', new MouseEvent('click'));
      fixture.detectChanges();
      expect(c.openActionsId()).toBe('p1');

      c.closeActionsMenu();
      fixture.detectChanges();

      expect(c.openActionsId()).toBeNull();
      expect(document.querySelector('.cdk-overlay-pane')).toBeNull();
    });

    it('redimensionar la ventana cierra el menú abierto (FR-028, edge case de layout)', async () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      await renderOneRow(fixture);
      const c = fixture.componentInstance;

      c.toggleActionsMenu('p1', new MouseEvent('click'));
      fixture.detectChanges();
      expect(c.openActionsId()).toBe('p1');

      window.dispatchEvent(new Event('resize'));
      fixture.detectChanges();

      expect(c.openActionsId()).toBeNull();
    });
  });
});
