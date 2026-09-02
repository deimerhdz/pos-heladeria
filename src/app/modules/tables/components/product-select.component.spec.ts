import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProductSelectComponent, ProductSelection } from './product-select.component';
import { MenuOption, MenuOptionGroup, MenuProduct, MenuVariant } from '../../products/interfaces/product.interface';

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
    const rows = Array.from(fixture.nativeElement.querySelectorAll('.px-4.pb-4 > div > div')) as HTMLElement[];
    const row = rows.find((r) => r.textContent?.includes(optionName));
    if (!row) throw new Error(`No se encontró la fila de "${optionName}"`);
    const buttons = row.querySelectorAll('button');
    return {
      minus: buttons[0] as HTMLButtonElement,
      plus: buttons[1] as HTMLButtonElement,
      qty: (row.querySelector('span.w-5') as HTMLElement).textContent!.trim(),
    };
  }

  // ── Grupo "conteo" (comportamiento existente, sin regresión) ───────────────

  it('un grupo "conteo" muestra el toggle de siempre, no el stepper', () => {
    const bobombun = makeOption({ id: 'b1', name: 'Bobombún' });
    const group = makeGroup({ selection_mode: 'conteo', max_select: 2, options: [bobombun] });
    create(makeProduct({ variants: [makeVariant({ option_groups: [group] })] }));

    const toggleButtons = fixture.nativeElement.querySelectorAll('.grid.grid-cols-2 button');
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
