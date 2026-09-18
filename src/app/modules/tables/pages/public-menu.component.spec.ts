import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { PublicMenuComponent } from './public-menu.component';
import { DinerService } from '../services/diner.service';
import { DinerTokenStore } from '../services/diner-token.store';
import { DiningCartService } from '../services/dining-cart.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import type { MenuProduct, MenuVariant } from '../../products/interfaces/product.interface';

/**
 * spec 084 (bug 1, FR-012–FR-015): la tarjeta de producto muestra un precio de
 * promoción también cuando la única regla vigente es de paquete (o
 * porcentaje) con `min_qty >= 2` -- antes solo mostraba la insignia genérica.
 * Cubre `minPromoPrice()`/`productDiscount()`/`priceLabel()` directamente
 * sobre la instancia, sin `fixture.detectChanges()`: este componente resuelve
 * la mesa/el menú reales en `ngOnInit()` (llamadas HTTP + websocket), fuera
 * del alcance de este bug -- las tres son funciones puras sobre
 * `product.variants` que no dependen de ese ciclo de vida.
 */
function variant(overrides: Partial<MenuVariant> = {}): MenuVariant {
  return {
    id: 'v1', name: 'Única', price: 8000, option_groups: [], available: true,
    ...overrides,
  };
}

function product(variants: MenuVariant[]): MenuProduct {
  return {
    id: 'p1', name: 'Granizado', description: null, image_url: null,
    variants, option_groups: [], available: true,
  };
}

describe('PublicMenuComponent — precio de promoción en la tarjeta (spec 084, bug 1)', () => {
  let component: PublicMenuComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PublicMenuComponent],
      providers: [
        { provide: DinerService, useValue: {} },
        { provide: DinerTokenStore, useValue: {} },
        { provide: DiningCartService, useValue: { dinerName: signal('') } },
        { provide: RealtimeService, useValue: { status: signal('idle') } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({}) } } },
        { provide: Router, useValue: {} },
      ],
    });
    // Sin fixture.detectChanges(): no dispara ngOnInit (carga real de mesa/menú).
    component = TestBed.createComponent(PublicMenuComponent).componentInstance;
  });

  it('FR-012: precio de paquete con min_qty >= 2 se muestra (antes solo insignia)', () => {
    const p = product([
      variant({
        promotion: {
          condition_text: '2 x $15.000', short_condition: '2 x $15.000',
          unit_equivalent: 7500, unit_equivalent_approx: false,
          unit_equivalent_text: '$7.500 c/u', display_text: '2 x $15.000 · $7.500 c/u',
          type: 'package_price', min_qty: 2, value: 15000,
        },
      }),
    ]);

    expect(component.productDiscount(p)).toBeNull(); // FR-014: sin precio unitario con descuento
    expect(component.minPromoPrice(p)).toEqual({
      displayText: '2 x $15.000 · $7.500 c/u',
      isMinimum: false,
    });
  });

  it('FR-013: varias variantes cubiertas por reglas de precios distintos → "Desde" el más barato por unidad', () => {
    const p = product([
      variant({
        id: 'v1',
        promotion: {
          condition_text: '2 x $15.000', short_condition: '2 x $15.000',
          unit_equivalent: 7500, unit_equivalent_approx: false,
          unit_equivalent_text: '$7.500 c/u', display_text: '2 x $15.000 · $7.500 c/u',
          type: 'package_price', min_qty: 2, value: 15000,
        },
      }),
      variant({
        id: 'v2', name: 'Grande', price: 10000,
        promotion: {
          condition_text: '2 x $12.000', short_condition: '2 x $12.000',
          unit_equivalent: 6000, unit_equivalent_approx: false,
          unit_equivalent_text: '$6.000 c/u', display_text: '2 x $12.000 · $6.000 c/u',
          type: 'package_price', min_qty: 2, value: 12000,
        },
      }),
    ]);

    expect(component.minPromoPrice(p)).toEqual({
      displayText: '2 x $12.000 · $6.000 c/u',
      isMinimum: true,
    });
  });

  it('FR-015 (spec 066 FR-013, sin cambio): ninguna variante cubierta → sin insignia ni precio de promoción', () => {
    const p = product([variant(), variant({ id: 'v2' })]);

    expect(component.hasPromotion(p)).toBe(false);
    expect(component.productDiscount(p)).toBeNull();
    expect(component.minPromoPrice(p)).toBeNull();
  });

  it('caso ya cubierto por spec 066 FR-015 (min_qty=1): sigue mostrando precio tachado + vigente, sin cambio', () => {
    const p = product([
      variant({
        price: 8000,
        discounted_price: 6000,
        discount_kind: 'fixed',
        promotion: {
          condition_text: 'Cada Única a $6.000', short_condition: '1 x $6.000',
          unit_equivalent: 6000, unit_equivalent_approx: false,
          unit_equivalent_text: '$6.000 c/u', display_text: '1 x $6.000 · $6.000 c/u',
          type: 'package_price', min_qty: 1, value: 6000,
        },
      }),
    ]);

    const disc = component.productDiscount(p);
    expect(disc?.original).toBe(8000);
    expect(disc?.discounted).toBe(6000);
  });
});
