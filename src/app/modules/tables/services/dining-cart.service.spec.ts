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
});
