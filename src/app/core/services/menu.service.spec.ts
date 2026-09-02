import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MenuService } from './menu.service';

/**
 * spec 066 — **test de no-regresión de importes de la terminal** (FR-017,
 * research.md D-10). El servicio no tenía spec: nace con esta spec.
 *
 * `ProductSelectComponent` está compartido por el menú QR del comensal y por las
 * dos superficies del cajero (research.md D-9). Ese componente pinta
 * `effectivePrice(variant.price, variant.discounted_price)`, así que si `MenuService`
 * empezara a mapear `discounted_price` —cosa que hoy **no** hace— la terminal
 * pasaría a mostrar precios con descuento del menú.
 *
 * Eso sería: expansión de alcance no pedida, choque con FR-017 y con la spec 063
 * FR-023 (el importe de la terminal lo resuelve el preview del cobro), y un cambio
 * de comportamiento **sin decisión de negocio registrada** — A-66, A-67 y A-68 no
 * lo cubren.
 *
 * Este test existe para que ese cambio no se cuele "ya que estamos".
 */
describe('MenuService — la terminal gana la condición, ningún importe (spec 066)', () => {
  let http: HttpTestingController;
  let service: MenuService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(MenuService);
  });

  afterEach(() => {
    http.verify();
  });

  /** Respuesta de `GET /menu` con promoción **y** precio con descuento poblados. */
  function responderConPromocionYDescuento(): void {
    const req = http.expectOne((r) => r.url.endsWith('/menu'));
    req.flush([
      {
        id: 'c1',
        name: 'Granizados',
        products: [
          {
            id: 'p1',
            name: 'Granizado de café',
            description: null,
            image_url: null,
            available: true,
            option_groups: [],
            variants: [
              {
                id: 'v1',
                name: 'Pequeño 8oz',
                price: '8000',
                // El backend los envía; la terminal debe descartarlos.
                discounted_price: '6000',
                discount_kind: 'package_price',
                promotion: {
                  condition_text: 'Cada Pequeño 8oz a $6.000',
                  short_condition: '1 x $6.000',
                  unit_equivalent: 6000,
                  unit_equivalent_approx: false,
                  unit_equivalent_text: '$6.000 c/u',
                  display_text: '1 x $6.000 · $6.000 c/u',
                  type: 'package_price',
                  min_qty: 1,
                  value: 6000,
                },
                option_groups: [],
                available: true,
              },
            ],
          },
        ],
      },
    ]);
  }

  it('mapea `promotion`: la terminal gana la condición en lenguaje llano (FR-016)', async () => {
    const cargando = service.loadMenu();
    responderConPromocionYDescuento();
    await cargando;

    const variant = service.categories()[0].products[0].variants[0];
    expect(variant.promotion?.condition_text).toBe('Cada Pequeño 8oz a $6.000');
    expect(variant.promotion?.display_text).toBe('1 x $6.000 · $6.000 c/u');
  });

  it('NO mapea `discounted_price` ni `discount_kind`: el modal sigue mostrando $8.000 (FR-017)', async () => {
    const cargando = service.loadMenu();
    responderConPromocionYDescuento();
    await cargando;

    const variant = service.categories()[0].products[0].variants[0];
    expect(variant.price).toBe(8000);
    // Si alguno de estos dos deja de ser nulo, la terminal empezó a mostrar
    // precios con descuento del menú: eso es lo que este test impide.
    expect(variant.discounted_price ?? null).toBeNull();
    expect(variant.discount_kind ?? null).toBeNull();
  });
});
