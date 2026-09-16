import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { PROMOTIONS_TAB_ID, PublicMenuComponent } from './public-menu.component';
import { DinerService } from '../services/diner.service';
import { DinerTokenStore } from '../services/diner-token.store';
import { DiningCartService } from '../services/dining-cart.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import {
  MenuCategory,
  MenuProduct,
  MenuVariantPromotion,
} from '../../products/interfaces/product.interface';
import { ResolvedBusiness } from '../services/diner.service';
import { DiningOrder } from '../interfaces/dining.interface';

/**
 * `DinerService` es transporte HTTP real (`inject(HttpClient)`); lo que este
 * spec verifica es la máquina de estados de `view()` alrededor del acceso
 * cerrado (Bug 1), no la resolución del menú en sí — un fake basta y evita
 * tener que simular la API completa.
 */
class FakeDinerService {
  categories: MenuCategory[] = [];
  business: ResolvedBusiness | null = null;
  async resolveByToken() {
    return {
      table: { id: 't1', number: 1, name: null },
      business: this.business,
      categories: this.categories,
    };
  }
  async leave(): Promise<void> {}
  async myOrders() {
    return [];
  }
}

class FakeDiningCartService {
  readonly dinerName = signal('');
  readonly count = signal(0);
  readonly isEmpty = signal(true);
  readonly lines = signal<{ productVariantId: string; optionKey: string; quantity: number }[]>([]);
  indexMenu(): void {}
  async load(): Promise<void> {}
  clear(): void {}
  clearDiner(): void {}
}

class FakeRealtimeService {
  readonly status = signal<'idle' | 'open' | 'closed'>('idle');
  on(): () => void {
    return () => {};
  }
  connectDiner(): void {}
  disconnect(): void {}
}

describe('PublicMenuComponent', () => {
  /**
   * Crea una instancia nueva del componente para `token`, como si fuera un
   * acceso nuevo a `/menu/t/:token` (primera carga, recarga, "Atrás"/
   * "Adelante" o reapertura de la URL — Angular no distingue el disparador,
   * todos pasan por el mismo `ngOnInit`). `DinerTokenStore` es `providedIn:
   * 'root'`: al no sobreescribirlo, cada `resetTestingModule()` crea una
   * instancia nueva que sigue leyendo la misma `sessionStorage` real del
   * navegador — así es como la marca de "acceso cerrado" sobrevive entre
   * instancias, igual que sobrevive entre pestañas reales.
   */
  async function createComponent(
    token: string,
    categories: MenuCategory[] = [],
    opts: { withSession?: boolean; business?: ResolvedBusiness | null } = {},
  ): Promise<{ fixture: ComponentFixture<PublicMenuComponent>; component: PublicMenuComponent }> {
    TestBed.resetTestingModule();
    // `DinerTokenStore` lee `localStorage` al construirse: fijar el
    // `session_token` **antes** de crear el componente simula un comensal que
    // ya tiene sesión abierta, para llegar a `view() === 'menu'`.
    if (opts.withSession) localStorage.setItem('pos.diner.session_token', 'session-tok');
    const diner = new FakeDinerService();
    diner.categories = categories;
    diner.business = opts.business ?? null;
    TestBed.configureTestingModule({
      imports: [PublicMenuComponent],
      providers: [
        { provide: DinerService, useValue: diner },
        { provide: DiningCartService, useClass: FakeDiningCartService },
        { provide: RealtimeService, useClass: FakeRealtimeService },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ token }) },
            queryParamMap: of(convertToParamMap({})),
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(PublicMenuComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    // Con sesión ya abierta, `ngOnInit` encadena `Promise.all([cart.load(),
    // refreshOrders()])` tras resolver el token — un solo `whenStable()` no
    // siempre alcanza a drenar esa segunda ronda de microtareas.
    const start = Date.now();
    while (fixture.componentInstance.view() === 'loading' && Date.now() - start < 2000) {
      await new Promise((r) => setTimeout(r, 5));
      fixture.detectChanges();
    }
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('un primer acceso (sin marca de cierre) muestra la pantalla de nombre', async () => {
    const { component } = await createComponent('tok-1');
    expect(component.view()).toBe('name');
  });

  it('tras cerrar sesión, un acceso posterior con el mismo :token muestra "acceso finalizado" en vez de la pantalla de nombre — cubre recarga, "Atrás" y "Adelante" (FR-002 a FR-005)', async () => {
    const { component: first } = await createComponent('tok-1');
    expect(first.view()).toBe('name');

    await first.exit();
    expect(first.view()).toBe('exited');

    // Simula un ngOnInit posterior en la misma pestaña con el mismo :token:
    // recarga (F5), "Atrás" o "Adelante" invocan exactamente este mismo flujo.
    const { component: second, fixture: fixture2 } = await createComponent('tok-1');

    expect(second.view()).toBe('exited');
    const texto = (fixture2.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Acceso finalizado');
    expect(texto).toContain('Gracias por tu visita');
    expect(texto).not.toContain('🍦');
    expect(texto).not.toContain('Continuar');
  });

  it('la pantalla de "acceso finalizado" muestra el logo del negocio (no el emoji) y agradece por su nombre cuando hay branding disponible', async () => {
    const business: ResolvedBusiness = { name: 'Heladería Polar', logo_url: 'https://cdn.example/logo.png' };
    const { component, fixture } = await createComponent('tok-1', [], { business });
    await component.exit();
    fixture.detectChanges();

    const img = fixture.nativeElement.querySelector('img') as HTMLImageElement | null;
    expect(img?.src).toBe('https://cdn.example/logo.png');
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Gracias por tu visita a Heladería Polar');
  });

  it('reabrir la misma URL sin la marca de cierre (:token distinto, equivalente a un escaneo físico nuevo) sí muestra la pantalla de nombre (FR-006)', async () => {
    const { component: first } = await createComponent('tok-1');
    await first.exit();
    expect(first.view()).toBe('exited');

    const { component: second } = await createComponent('tok-2');

    expect(second.view()).toBe('name');
  });

  // ── Bug 3 — placeholder neutro en el catálogo (FR-016 a FR-020) ───────────

  function product(partial: Partial<MenuProduct>): MenuProduct {
    return {
      id: 'p1',
      name: 'Producto',
      description: null,
      image_url: null,
      variants: [{ id: 'v1', name: 'Único', price: 5000, option_groups: [], available: true }],
      option_groups: [],
      available: true,
      ...partial,
    };
  }

  it('un producto sin image_url renderiza <app-icon name="image-off">, no el emoji 🍦 (FR-016 a FR-018)', async () => {
    const categories: MenuCategory[] = [
      { id: 'c1', name: 'Helados', products: [product({ id: 'p1', name: 'Sin foto', image_url: null })] },
    ];
    const { fixture } = await createComponent('tok-1', categories, { withSession: true });

    expect(fixture.componentInstance.view()).toBe('menu');
    expect(fixture.nativeElement.querySelector('app-icon[name="image-off"]')).not.toBeNull();
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).not.toContain('🍦');
  });

  it('un producto con image_url sigue mostrando su imagen real, sin cambios (FR-018)', async () => {
    const categories: MenuCategory[] = [
      {
        id: 'c1',
        name: 'Helados',
        products: [product({ id: 'p2', name: 'Con foto', image_url: 'https://cdn.example/p2.jpg' })],
      },
    ];
    const { fixture } = await createComponent('tok-1', categories, { withSession: true });

    const img = fixture.nativeElement.querySelector('img[alt="Con foto"]') as HTMLImageElement | null;
    expect(img?.src).toBe('https://cdn.example/p2.jpg');
    expect(fixture.nativeElement.querySelector('app-icon[name="image-off"]')).toBeNull();
  });

  // ── Notas del ítem en "Mis pedidos" (spec 061, FR-001 a FR-003) ───────────

  it('una nota de ítem se muestra en "Mis pedidos", asociada solo a la línea que la tiene (FR-001 a FR-003)', async () => {
    const order: DiningOrder = {
      id: 'o1',
      channel: 'QR_MENU',
      status: 'recibida',
      created_at: new Date().toISOString(),
      items: [
        {
          id: 'it1',
          product_variant_id: 'v1',
          quantity: 1,
          unit_price: '5000',
          estado_cocina: 'pendiente',
          notes: 'sin banana',
        },
        {
          id: 'it2',
          product_variant_id: 'v1',
          quantity: 1,
          unit_price: '5000',
          estado_cocina: 'pendiente',
          notes: null,
        },
      ],
    };
    const { fixture, component } = await createComponent('tok-1', [], { withSession: true });
    component.myOrders.set([order]);
    component.section.set('pedidos');
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('sin banana');
    expect(texto.split('sin banana').length - 1).toBe(1);
  });

  // ── Precio, promoción y total del pedido en "Mis pedidos" ─────────────────

  it('muestra el precio de cada línea y el total del pedido', async () => {
    const order: DiningOrder = {
      id: 'o1',
      channel: 'QR_MENU',
      status: 'recibida',
      created_at: new Date().toISOString(),
      items: [
        { id: 'it1', product_variant_id: 'v1', quantity: 2, unit_price: '5000', estado_cocina: 'pendiente' },
        { id: 'it2', product_variant_id: 'v1', quantity: 1, unit_price: '3000', estado_cocina: 'pendiente' },
      ],
    };
    const { fixture } = await createComponent('tok-1', [], { withSession: true });
    fixture.componentInstance.myOrders.set([order]);
    fixture.componentInstance.section.set('pedidos');
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('$ 10.000'); // 2 × 5.000
    expect(texto).toContain('$ 3.000');
    expect(texto).toContain('$ 13.000'); // total del pedido
  });

  it('tacha el precio de lista y muestra el descontado cuando la línea tiene promoción', async () => {
    const order: DiningOrder = {
      id: 'o1',
      channel: 'QR_MENU',
      status: 'recibida',
      created_at: new Date().toISOString(),
      items: [
        {
          id: 'it1',
          product_variant_id: 'v1',
          quantity: 2,
          unit_price: '5000',
          discounted_unit_price: '4000',
          discounted_line_total: '8000',
          estado_cocina: 'pendiente',
        },
      ],
    };
    const { fixture } = await createComponent('tok-1', [], { withSession: true });
    fixture.componentInstance.myOrders.set([order]);
    fixture.componentInstance.section.set('pedidos');
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('$ 10.000'); // tachado: precio de lista sin descuento
    expect(texto).toContain('$ 8.000'); // total con descuento
    const lineThrough = (fixture.nativeElement as HTMLElement).querySelector('.line-through');
    expect(lineThrough?.textContent).toContain('10.000');
  });

  // ── spec 066 (A-67, FR-013 a FR-015) — insignia genérica en la tarjeta ────

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

  async function carta(variants: MenuProduct['variants']): Promise<HTMLElement> {
    const categories: MenuCategory[] = [
      { id: 'c1', name: 'Granizados', products: [product({ variants })] },
    ];
    const { fixture } = await createComponent('tok-1', categories, { withSession: true });
    return fixture.nativeElement as HTMLElement;
  }

  it('CA1: una promoción de paquete vigente produce insignia — hoy no produce ninguna señal', async () => {
    const el = await carta([
      {
        id: 'v1', name: 'Pequeño 8oz', price: 8000, option_groups: [], available: true,
        promotion: promocion(),
      },
    ]);

    expect(el.textContent).toContain('🎉 Promo');
  });

  it('CA2: una regla de porcentaje produce la MISMA insignia, no una distinta por tipo', async () => {
    const el = await carta([
      {
        id: 'v1', name: 'Pequeño 8oz', price: 8000, option_groups: [], available: true,
        promotion: promocion({
          type: 'percent', min_qty: 3, value: 15,
          short_condition: '3 x -15%', display_text: '3 x -15% · $6.800 c/u',
        }),
      },
    ]);

    expect(el.textContent).toContain('🎉 Promo');
    // La insignia por tipo que gobernaba antes ya no se pinta en la tarjeta.
    expect(el.textContent).not.toContain('🏷️');
  });

  it('CA3: un producto sin presentaciones cubiertas no lleva insignia', async () => {
    const el = await carta([
      { id: 'v1', name: 'Pequeño 8oz', price: 8000, option_groups: [], available: true },
    ]);

    expect(el.textContent).not.toContain('🎉 Promo');
  });

  it('CA4: fuera de su ventana el backend no pobló promotion -> sin insignia', async () => {
    // La vigencia la resolvió el backend; la tarjeta solo lee lo que llegó (FR-013).
    const el = await carta([
      {
        id: 'v1', name: 'Pequeño 8oz', price: 8000, option_groups: [], available: true,
        promotion: null,
      },
    ]);

    expect(el.textContent).not.toContain('🎉 Promo');
  });

  it('CA5: con porcentaje de cantidad mínima 1 se conserva el tachado Y ADEMÁS hay insignia (FR-015)', async () => {
    const el = await carta([
      {
        id: 'v1', name: 'Pequeño 8oz', price: 8000, discounted_price: 7200,
        discount_kind: 'percent', option_groups: [], available: true,
        promotion: promocion({
          type: 'percent', min_qty: 1, value: 10,
          short_condition: '1 x -10%', display_text: '1 x -10% · $7.200 c/u',
        }),
      },
    ]);

    expect(el.textContent).toContain('🎉 Promo');
    expect(el.querySelector('.line-through')).not.toBeNull();
  });

  // ── spec 081 (US1) — pestaña dedicada de "Promociones" ────────────────────

  it('FR-001/FR-008: la pestaña "Promociones" aparece en la navegación aunque no haya ninguna promoción vigente', async () => {
    const categories: MenuCategory[] = [
      { id: 'c1', name: 'Helados', products: [product({ id: 'p1' })] },
    ];
    const { fixture } = await createComponent('tok-1', categories, { withSession: true });

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Promociones');
  });

  it('FR-002: seleccionar "Promociones" filtra a solo los productos con alguna variante en promoción vigente, sin importar la categoría', async () => {
    const categories: MenuCategory[] = [
      {
        id: 'c1', name: 'Helados',
        products: [
          product({ id: 'p1', name: 'Con promo', variants: [{ id: 'v1', name: 'Único', price: 8000, option_groups: [], available: true, promotion: promocion() }] }),
          product({ id: 'p2', name: 'Sin promo' }),
        ],
      },
      {
        id: 'c2', name: 'Bebidas',
        products: [
          product({ id: 'p3', name: 'Otra con promo', variants: [{ id: 'v3', name: 'Único', price: 6000, option_groups: [], available: true, promotion: promocion() }] }),
        ],
      },
    ];
    const { fixture, component } = await createComponent('tok-1', categories, { withSession: true });

    component.selectCategory(PROMOTIONS_TAB_ID);
    fixture.detectChanges();

    const nombres = component.visibleProducts().map((p) => p.name);
    expect(nombres).toEqual(['Con promo', 'Otra con promo']);
  });

  it('FR-003: una tarjeta de producto dentro de "Promociones" conserva la insignia y la condición, igual que en su categoría original', async () => {
    const categories: MenuCategory[] = [
      {
        id: 'c1', name: 'Helados',
        products: [
          product({ id: 'p1', name: 'Con promo', variants: [{ id: 'v1', name: 'Único', price: 8000, option_groups: [], available: true, promotion: promocion() }] }),
        ],
      },
    ];
    const { fixture, component } = await createComponent('tok-1', categories, { withSession: true });

    component.selectCategory(PROMOTIONS_TAB_ID);
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('🎉 Promo');
  });

  it('FR-008: sin ninguna promoción vigente, "Promociones" muestra un aviso en vez de una grilla vacía sin explicación', async () => {
    const categories: MenuCategory[] = [
      { id: 'c1', name: 'Helados', products: [product({ id: 'p1' })] },
    ];
    const { fixture, component } = await createComponent('tok-1', categories, { withSession: true });

    component.selectCategory(PROMOTIONS_TAB_ID);
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('No hay promociones activas en este momento');
  });

  it('FR-009: seleccionar una categoría normal después de "Promociones" sigue mostrando todos sus productos, con o sin promoción', async () => {
    const categories: MenuCategory[] = [
      {
        id: 'c1', name: 'Helados',
        products: [
          product({ id: 'p1', name: 'Con promo', variants: [{ id: 'v1', name: 'Único', price: 8000, option_groups: [], available: true, promotion: promocion() }] }),
          product({ id: 'p2', name: 'Sin promo' }),
        ],
      },
    ];
    const { fixture, component } = await createComponent('tok-1', categories, { withSession: true });

    component.selectCategory(PROMOTIONS_TAB_ID);
    component.selectCategory('c1');
    fixture.detectChanges();

    const nombres = component.visibleProducts().map((p) => p.name);
    expect(nombres).toEqual(['Con promo', 'Sin promo']);
  });

  // ── spec 081 (US3) — regresión: fuera de "Promociones" nada cambia ────────

  it('FR-010: openProduct() fuera de "Promociones" no marca fromPromotions, aunque el producto tenga promoción', async () => {
    const categories: MenuCategory[] = [
      {
        id: 'c1', name: 'Helados',
        products: [
          product({ id: 'p1', name: 'Con promo', variants: [{ id: 'v1', name: 'Único', price: 8000, option_groups: [], available: true, promotion: promocion() }] }),
        ],
      },
    ];
    const { component } = await createComponent('tok-1', categories, { withSession: true });

    component.selectCategory('c1');
    component.openProduct(component.visibleProducts()[0]);

    expect(component.selectedProductFromPromotions()).toBe(false);
  });

  it('FR-002/FR-011: openProduct() desde "Promociones" sí marca fromPromotions == true', async () => {
    const categories: MenuCategory[] = [
      {
        id: 'c1', name: 'Helados',
        products: [
          product({ id: 'p1', name: 'Con promo', variants: [{ id: 'v1', name: 'Único', price: 8000, option_groups: [], available: true, promotion: promocion() }] }),
        ],
      },
    ];
    const { component } = await createComponent('tok-1', categories, { withSession: true });

    component.selectCategory(PROMOTIONS_TAB_ID);
    component.openProduct(component.visibleProducts()[0]);

    expect(component.selectedProductFromPromotions()).toBe(true);
  });

  // ── Ajustes tras probar en un entorno real (2026-09-12) ───────────────────

  it('con "Promociones" activa, activeCategory() es null — no se resalta ninguna categoría a la vez que "Promociones"', async () => {
    const categories: MenuCategory[] = [
      { id: 'c1', name: 'Helados', products: [product({ id: 'p1' })] },
    ];
    const { component } = await createComponent('tok-1', categories, { withSession: true });

    component.selectCategory(PROMOTIONS_TAB_ID);

    expect(component.activeCategory()).toBeNull();
  });

  it('FR-014: al ingresar con al menos una promoción vigente, "Promociones" queda seleccionada por defecto, sin que el comensal presione nada', async () => {
    const categories: MenuCategory[] = [
      {
        id: 'c1', name: 'Helados',
        products: [product({ id: 'p1', name: 'Con promo', variants: [{ id: 'v1', name: 'Único', price: 8000, option_groups: [], available: true, promotion: promocion() }] })],
      },
    ];
    const { component } = await createComponent('tok-1', categories, { withSession: true });

    expect(component.activeCategoryId()).toBe(PROMOTIONS_TAB_ID);
  });

  it('FR-014: sin ninguna promoción vigente, la primera categoría queda seleccionada, igual que antes de esta spec', async () => {
    const categories: MenuCategory[] = [
      { id: 'c1', name: 'Helados', products: [product({ id: 'p1' })] },
    ];
    const { component } = await createComponent('tok-1', categories, { withSession: true });

    expect(component.activeCategoryId()).toBeNull();
    expect(component.activeCategory()?.id).toBe('c1');
  });
});
