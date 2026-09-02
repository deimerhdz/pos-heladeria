import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { PublicMenuComponent } from './public-menu.component';
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
});
