import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProductSelectComponent, ProductSelection } from './product-select.component';
import {
  MenuOption,
  MenuOptionGroup,
  MenuProduct,
  MenuVariant,
  MenuVariantPromotion,
} from '../../products/interfaces/product.interface';

function makeOption(partial: Partial<MenuOption> = {}): MenuOption {
  return { id: 'o1', name: 'Opción', extra_price: 0, available: true, ...partial };
}

function makeGroup(partial: Partial<MenuOptionGroup> = {}): MenuOptionGroup {
  return {
    id: 'g1', name: 'Grupo', min_select: 0, max_select: 1, consume: false,
    selection_mode: 'conteo', max_quantity_per_option: null, max_total_quantity: null,
    options: [],
    ...partial,
  };
}

function makeVariant(partial: Partial<MenuVariant> = {}): MenuVariant {
  return {
    id: 'v1', name: 'Única', price: 15000, available: true, option_groups: [],
    ...partial,
  };
}

function makeProduct(partial: Partial<MenuProduct> = {}): MenuProduct {
  return {
    id: 'p1', name: 'Producto', description: null, image_url: null,
    variants: [makeVariant()], option_groups: [], available: true,
    ...partial,
  };
}

describe('ProductSelectComponent', () => {
  let fixture: ComponentFixture<ProductSelectComponent>;
  let component: ProductSelectComponent;

  function create(product: MenuProduct): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ProductSelectComponent] });
    fixture = TestBed.createComponent(ProductSelectComponent);
    component = fixture.componentInstance;
    component.product = product;
    fixture.detectChanges(); // ngOnInit
  }

  function stepperButtons(optionName: string): { minus: HTMLButtonElement; plus: HTMLButtonElement; qty: string } {
    const rows = Array.from(fixture.nativeElement.querySelectorAll('[data-testid="cantidad-row"]')) as HTMLElement[];
    const row = rows.find((r) => r.textContent?.includes(optionName));
    if (!row) throw new Error(`No se encontró la fila de "${optionName}"`);
    return {
      minus: row.querySelector('[data-testid="qty-minus"]') as HTMLButtonElement,
      plus: row.querySelector('[data-testid="qty-plus"]') as HTMLButtonElement,
      qty: (row.querySelector('[data-testid="qty-value"]') as HTMLElement).textContent!.trim(),
    };
  }

  // ── Grupo "conteo" (comportamiento existente, sin regresión) ───────────────

  it('un grupo "conteo" muestra el toggle de siempre, no el stepper', () => {
    const bobombun = makeOption({ id: 'b1', name: 'Bobombún' });
    const group = makeGroup({ selection_mode: 'conteo', max_select: 2, options: [bobombun] });
    create(makeProduct({ variants: [makeVariant({ option_groups: [group] })] }));

    const toggleButtons = fixture.nativeElement.querySelectorAll('[data-testid="conteo-option"]');
    expect(toggleButtons.length).toBeGreaterThan(0);
  });

  it('confirmar un grupo "conteo" emite quantity: 1 por opción elegida', () => {
    const bobombun = makeOption({ id: 'b1', name: 'Bobombún' });
    const group = makeGroup({ selection_mode: 'conteo', min_select: 1, max_select: 1, options: [bobombun] });
    create(makeProduct({ variants: [makeVariant({ option_groups: [group] })] }));

    component.toggleOption(group, bobombun);
    fixture.detectChanges();

    let emitted: ProductSelection | undefined;
    component.added.subscribe((sel) => (emitted = sel));
    component.confirm();

    expect(emitted?.options).toEqual([{ option: bobombun, quantity: 1 }]);
  });

  // ── Grupo "cantidad" (spec 065, US2) ────────────────────────────────────────

  it('un grupo "cantidad" muestra el stepper +/- por opción, no el toggle', () => {
    const bobombun = makeOption({ id: 'b1', name: 'Bobombún' });
    const group = makeGroup({ selection_mode: 'cantidad', options: [bobombun] });
    create(makeProduct({ variants: [makeVariant({ option_groups: [group] })] }));
    component.toggleGroup(group.id); // "cantidad" arranca plegado: isComplete() siempre true
    fixture.detectChanges();

    const { minus, plus, qty } = stepperButtons('Bobombún');
    expect(minus).toBeTruthy();
    expect(plus).toBeTruthy();
    expect(qty).toBe('0');
  });

  it('incrementar dos opciones distintas de un grupo "cantidad" queda reflejado en ProductSelection.options', () => {
    const bobombun = makeOption({ id: 'b1', name: 'Bobombún' });
    const gomitas = makeOption({ id: 'g1o', name: 'Gomitas' });
    const group = makeGroup({ selection_mode: 'cantidad', options: [bobombun, gomitas] });
    create(makeProduct({ variants: [makeVariant({ option_groups: [group] })] }));

    component.incrementOption(group, bobombun);
    component.incrementOption(group, bobombun);
    component.incrementOption(group, gomitas);
    fixture.detectChanges();

    let emitted: ProductSelection | undefined;
    component.added.subscribe((sel) => (emitted = sel));
    component.confirm();

    expect(emitted?.options.length).toBe(2);
    expect(emitted?.options.find((c) => c.option.id === bobombun.id)?.quantity).toBe(2);
    expect(emitted?.options.find((c) => c.option.id === gomitas.id)?.quantity).toBe(1);
  });

  it('bajar una opción a 0 la retira de la selección', () => {
    const bobombun = makeOption({ id: 'b1', name: 'Bobombún' });
    const group = makeGroup({ selection_mode: 'cantidad', options: [bobombun] });
    create(makeProduct({ variants: [makeVariant({ option_groups: [group] })] }));

    component.incrementOption(group, bobombun);
    component.decrementOption(group, bobombun);
    fixture.detectChanges();

    expect(component.optionQuantity(group.id, bobombun.id)).toBe(0);
  });

  it('canConfirm() nunca se bloquea por un grupo "cantidad" en 0, incluso con min_select heredado', () => {
    const bobombun = makeOption({ id: 'b1', name: 'Bobombún' });
    // min_select=1 no debería importar en modo "cantidad" (regresión del backend, FR-003).
    const group = makeGroup({ selection_mode: 'cantidad', min_select: 1, options: [bobombun] });
    create(makeProduct({ variants: [makeVariant({ option_groups: [group] })] }));

    expect(component.canConfirm()).toBe(true);
    expect(component.blockingLabel()).toBeNull();
  });

  it('el precio de línea multiplica extra_price por la cantidad elegida', () => {
    const bobombun = makeOption({ id: 'b1', name: 'Bobombún', extra_price: 1000 });
    const group = makeGroup({ selection_mode: 'cantidad', options: [bobombun] });
    create(makeProduct({ variants: [makeVariant({ price: 15000, option_groups: [group] })] }));

    component.incrementOption(group, bobombun);
    component.incrementOption(group, bobombun);
    fixture.detectChanges();

    expect(component.lineTotal()).toBe(17000); // 15000 + 2*1000
  });

  // ── Precio de línea con promoción de paquete (bug fix) ──────────────────────

  it('el precio de línea NO aplica el precio de paquete si la cantidad no alcanza min_qty de la promoción', () => {
    const promo: MenuVariantPromotion = {
      condition_text: 'Llevando 2 Pequeño 8oz pagas $12.000',
      short_condition: '2 x $12.000',
      unit_equivalent: 6000,
      unit_equivalent_approx: false,
      unit_equivalent_text: '$6.000 c/u',
      display_text: '2 x $12.000 · $6.000 c/u',
      type: 'package_price',
      min_qty: 2,
      value: 12000,
    };
    create(makeProduct({
      variants: [makeVariant({
        price: 8000, discounted_price: 6000, discount_kind: 'package_price', promotion: promo,
      })],
    }));

    // Cantidad arranca en 1: no alcanza el min_qty=2 de la promoción -> precio normal.
    expect(component.lineTotal()).toBe(8000);

    component.inc(); // Cantidad = 2: ahora sí califica para el precio de paquete.
    expect(component.lineTotal()).toBe(12000); // 6000 * 2
  });

  // ── Topes de cantidad (spec 065, US4) ───────────────────────────────────────

  it('el botón "+" de una opción se deshabilita al alcanzar max_quantity_per_option', () => {
    const bobombun = makeOption({ id: 'b1', name: 'Bobombún' });
    const group = makeGroup({ selection_mode: 'cantidad', max_quantity_per_option: 2, options: [bobombun] });
    create(makeProduct({ variants: [makeVariant({ option_groups: [group] })] }));
    component.toggleGroup(group.id);

    component.incrementOption(group, bobombun);
    component.incrementOption(group, bobombun);
    fixture.detectChanges();

    expect(component.optionQuantity(group.id, bobombun.id)).toBe(2);
    expect(component.canIncrement(group, bobombun)).toBe(false);
    const { plus } = stepperButtons('Bobombún');
    expect(plus.disabled).toBe(true);
  });

  it('al alcanzar max_total_quantity se deshabilitan todos los "+" del grupo, aunque ninguna opción llegue a su propio tope', () => {
    const bobombun = makeOption({ id: 'b1', name: 'Bobombún' });
    const gomitas = makeOption({ id: 'g1o', name: 'Gomitas' });
    const group = makeGroup({
      selection_mode: 'cantidad', max_quantity_per_option: 3, max_total_quantity: 2,
      options: [bobombun, gomitas],
    });
    create(makeProduct({ variants: [makeVariant({ option_groups: [group] })] }));

    component.incrementOption(group, bobombun);
    component.incrementOption(group, gomitas);
    fixture.detectChanges();

    expect(component.canIncrement(group, bobombun)).toBe(false);
    expect(component.canIncrement(group, gomitas)).toBe(false);
  });

  it('sin topes configurados, el botón "+" nunca se deshabilita por cuenta propia', () => {
    const bobombun = makeOption({ id: 'b1', name: 'Bobombún' });
    const group = makeGroup({ selection_mode: 'cantidad', options: [bobombun] });
    create(makeProduct({ variants: [makeVariant({ option_groups: [group] })] }));

    for (let i = 0; i < 10; i++) component.incrementOption(group, bobombun);
    fixture.detectChanges();

    expect(component.optionQuantity(group.id, bobombun.id)).toBe(10);
    expect(component.canIncrement(group, bobombun)).toBe(true);
  });
});

/**
 * spec 066 — `ProductSelectComponent` es el modal de presentaciones y está
 * **compartido** por el menú QR del comensal (`public-menu.component.ts`) y por las
 * dos superficies del cajero (`manual-order-page`, `pos-catalog-drawer`). Por eso
 * el cambio de FR-007 y el de FR-016 son **uno solo**, sin ramas por superficie:
 * SC-005 se cumple por construcción (research.md D-9).
 *
 * Lo que este spec protege:
 *  - la línea informativa aparece solo cuando el backend pobló `promotion`;
 *  - el tachado sale de **comparar** dos importes que ya llegaron, no de recalcular
 *    ninguno (FR-015, research.md D-7);
 *  - un precio de paquete no fabrica una insignia de porcentaje (research.md D-13).
 *
 * El componente no tenía spec: nace con esta spec.
 */
function variante(over: Partial<MenuVariant> = {}): MenuVariant {
  return {
    id: 'v1',
    name: 'Pequeño 8oz',
    price: 8000,
    discounted_price: null,
    discount_kind: null,
    promotion: null,
    option_groups: [],
    available: true,
    ...over,
  };
}

function promocion(over: Partial<MenuVariantPromotion> = {}): MenuVariantPromotion {
  return {
    condition_text: 'Llevando 2 Pequeño 8oz pagas $12.000',
    short_condition: '2 x $12.000',
    unit_equivalent: 6000,
    unit_equivalent_approx: false,
    unit_equivalent_text: '$6.000 c/u',
    display_text: '2 x $12.000 · $6.000 c/u',
    type: 'package_price',
    min_qty: 2,
    value: 12000,
    ...over,
  };
}

function producto(variants: MenuVariant[]): MenuProduct {
  return {
    id: 'p1',
    name: 'Granizado de café',
    description: null,
    image_url: null,
    variants,
    option_groups: [],
    available: true,
  };
}

describe('ProductSelectComponent — información de promoción (spec 066)', () => {
  let fixture: ComponentFixture<ProductSelectComponent>;

  function render(variants: MenuVariant[]): HTMLElement {
    fixture = TestBed.createComponent(ProductSelectComponent);
    fixture.componentInstance.product = producto(variants);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ProductSelectComponent] }).compileComponents();
  });

  it('FR-008: la fila con promoción pinta el texto compuesto por el backend', () => {
    const el = render([variante({ promotion: promocion() })]);

    expect(el.textContent).toContain('2 x $12.000 · $6.000 c/u');
  });

  it('FR-008: la fila sin promoción no pinta ninguna línea informativa', () => {
    const el = render([variante()]);

    expect(el.textContent).not.toContain('c/u');
  });

  it('FR-016: la condición completa de la presentación elegida se muestra bajo la lista', () => {
    const el = render([variante({ promotion: promocion() })]);

    expect(el.textContent).toContain('Llevando 2 Pequeño 8oz pagas $12.000');
  });

  it('precio vigente menor que el normal: tachado + precio vigente', () => {
    const el = render([
      variante({ discounted_price: 6000, discount_kind: 'package_price' }),
    ]);

    expect(el.querySelector('.line-through')).not.toBeNull();
  });

  it('FR-015: precio vigente mayor o igual que el normal -> sin tachado ni señal de descuento', () => {
    // El caso de research.md D-6: la regla se activó cuando $6.000 sí era descuento y
    // después el catálogo bajó a $5.000. El importe mostrado sigue siendo el que el
    // cobro aplica, pero no se anuncia como ahorro.
    const el = render([
      variante({ price: 5000, discounted_price: 6000, discount_kind: 'package_price' }),
    ]);

    expect(el.querySelector('.line-through')).toBeNull();
    expect(el.querySelector('.bg-rose-100')).toBeNull();
  });

  it('D-13: un precio de paquete no fabrica insignia de porcentaje', () => {
    const el = render([
      variante({ discounted_price: 6000, discount_kind: 'package_price' }),
    ]);

    expect(el.querySelector('.bg-rose-100')).toBeNull();
    expect(el.textContent).not.toContain('-25%');
  });

  it('un porcentaje sí conserva su insignia (no-regresión)', () => {
    const el = render([variante({ discounted_price: 7200, discount_kind: 'percent' })]);

    expect(el.querySelector('.bg-rose-100')).not.toBeNull();
    expect(el.textContent).toContain('-10%');
  });

  it('Agotado gana a todo, incluida la información de promoción', () => {
    const el = render([
      variante({ available: false, discounted_price: 6000, discount_kind: 'package_price' }),
    ]);

    expect(el.textContent).toContain('Agotado');
    expect(el.querySelector('.line-through')).toBeNull();
  });

  it('solo la presentación cubierta lleva línea informativa', () => {
    const el = render([
      variante({ id: 'v1', name: 'Pequeño 8oz', promotion: promocion() }),
      variante({ id: 'v2', name: 'Mediano 12oz', price: 10000 }),
    ]);

    const lineas = el.textContent?.match(/c\/u/g) ?? [];
    expect(lineas.length).toBe(1);
  });
});
