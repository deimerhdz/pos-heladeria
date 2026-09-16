import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { DinerService } from './diner.service';
import { DinerTokenStore } from './diner-token.store';
import { DiningCartService } from './dining-cart.service';

const API = environment.apiBaseUrl;

/** Respuesta mínima de `GET /cart`: sin líneas, con el nombre del comensal. */
const emptyCart = (displayLabel: string | null) => ({
  id: 'c1',
  participant_id: 'p1',
  display_name: 'Ana',
  display_label: displayLabel,
  status: 'abierto',
  total: '0',
  items: [],
});

describe('DiningCartService', () => {
  let cart: DiningCartService;
  let http: HttpTestingController;

  beforeEach(() => {
    // Ver nota en `diner.service.spec.ts`: los specs comparten entorno.
    TestBed.resetTestingModule();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        DiningCartService,
        DinerService,
        DinerTokenStore,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    cart = TestBed.inject(DiningCartService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  /** Carga el carrito y responde con `body`. */
  const load = async (body: object): Promise<void> => {
    const promise = cart.load();
    http.expectOne(`${API}/cart`).flush(body);
    await promise;
  };

  it('restaura el nombre del comensal desde GET /cart', async () => {
    await load(emptyCart('Ana (2)'));

    // Es lo que hace que el saludo sobreviva a una recarga de la página: el
    // nombre no se guarda en el navegador, viene con el carrito.
    expect(cart.dinerName()).toBe('Ana (2)');
  });

  it('usa display_name cuando no hay label desambiguado', async () => {
    await load(emptyCart(null));

    expect(cart.dinerName()).toBe('Ana');
  });

  it('conserva el nombre al limpiar las líneas tras enviar el pedido', async () => {
    await load(emptyCart('Ana (2)'));

    cart.clear();

    // El comensal sigue en la mesa: solo se vacía el carrito.
    expect(cart.isEmpty()).toBe(true);
    expect(cart.dinerName()).toBe('Ana (2)');
  });

  it('olvida el nombre al salir de la mesa', async () => {
    await load(emptyCart('Ana (2)'));

    cart.clearDiner();

    expect(cart.dinerName()).toBe('');
  });

  // ── spec 081 (US2) — paso de cantidad por variante+opciones ───────────────

  it('CartLine expone productVariantId y optionKey, derivados de CartResponse.items[] (data-model.md)', async () => {
    await load({
      ...emptyCart('Ana'),
      items: [
        {
          id: 'i1', product_variant_id: 'v1', quantity: 2, unit_price: '5000', line_total: '10000',
          notes: null,
          options: [
            { id: 'o1', option_id: 'opt-b', quantity: 1 },
            { id: 'o2', option_id: 'opt-a', quantity: 1 },
          ],
        },
      ],
    });

    const [line] = cart.lines();
    expect(line.productVariantId).toBe('v1');
    expect(line.optionKey).toBe('opt-a,opt-b'); // ordenado, no en el orden de llegada
  });

  it('stepFor(line) devuelve 1 para cualquier línea sin stepQuantity registrado (flujo de categoría normal, FR-010)', async () => {
    await load({
      ...emptyCart('Ana'),
      items: [
        { id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '5000', line_total: '5000', notes: null, options: [] },
      ],
    });

    expect(cart.stepFor(cart.lines()[0])).toBe(1);
  });

  it('add() con stepQuantity registra el paso, tras una respuesta exitosa, para la línea resultante (research.md D3)', async () => {
    const product = {
      id: 'p1', name: 'Producto', description: null, image_url: null,
      variants: [{ id: 'v1', name: 'Único', price: 8000, option_groups: [], available: true }],
      option_groups: [], available: true,
    };
    const variant = product.variants[0];

    const promise = cart.add(product, variant, [], 2, null, 2);
    http.expectOne(`${API}/cart/items`).flush({
      ...emptyCart('Ana'),
      items: [
        { id: 'i1', product_variant_id: 'v1', quantity: 2, unit_price: '8000', line_total: '16000', notes: null, options: [] },
      ],
    });
    await promise;

    expect(cart.stepFor(cart.lines()[0])).toBe(2);
  });

  it('add() sin stepQuantity (agregado desde una categoría normal) deja la línea en paso libre (FR-010)', async () => {
    const product = {
      id: 'p1', name: 'Producto', description: null, image_url: null,
      variants: [{ id: 'v1', name: 'Único', price: 8000, option_groups: [], available: true }],
      option_groups: [], available: true,
    };
    const variant = product.variants[0];

    const promise = cart.add(product, variant, [], 1, null);
    http.expectOne(`${API}/cart/items`).flush({
      ...emptyCart('Ana'),
      items: [
        { id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '8000', line_total: '8000', notes: null, options: [] },
      ],
    });
    await promise;

    expect(cart.stepFor(cart.lines()[0])).toBe(1);
  });
});
