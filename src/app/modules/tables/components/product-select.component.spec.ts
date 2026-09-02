import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProductSelectComponent } from './product-select.component';
import {
  MenuProduct,
  MenuVariant,
  MenuVariantPromotion,
} from '../../products/interfaces/product.interface';

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
