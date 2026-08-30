import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import { ProductService } from './product.service';
import { ProductDraft } from '../interfaces/product.interface';

const API = environment.apiBaseUrl;
const PRODUCTS = `${API}/products`;
const VARIANTS = `${API}/variants`;
const PID = 'p1';

/** Drain pending microtasks so the next request in a chained flow gets dispatched. */
const tick = () => new Promise((r) => setTimeout(r, 0));

function productResponse() {
  return {
    id: PID,
    category_id: 'c1',
    name: 'Banana Split',
    description: null,
    preparation_type: 'prepared',
    image_url: null,
    active: true,
    available: true,
    created_at: '2026-08-06T00:00:00',
  };
}

function variantResponse(partial: Partial<Record<string, unknown>>) {
  return {
    id: 'v1',
    product_id: PID,
    name: 'Única',
    sku: null,
    price: '10000',
    active: true,
    ...partial,
  };
}

function draft(partial: Partial<ProductDraft> = {}): ProductDraft {
  return {
    id: PID,
    name: 'Banana Split',
    category_id: 'c1',
    description: '',
    preparation_type: 'prepared',
    image_url: '',
    active: true,
    hasSizes: false,
    tracks_inventory: false,
    variants: [],
    deactivated: [],
    ...partial,
  };
}

describe('ProductService', () => {
  let service: ProductService;
  let http: HttpTestingController;

  beforeEach(() => {
    // Los ficheros de spec comparten entorno: resetear hace este spec independiente
    // del orden de ejecución (mismo motivo que en diner.service.spec.ts).
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ProductService,
        provideHttpClient(),
        provideHttpClientTesting(),
        // QueryClient fresco por test (sin retry, gcTime 0) para que no haya
        // caché ni reintentos que crucen entre tests.
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
      ],
    });
    service = TestBed.inject(ProductService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('getProductDraft', () => {
    it('separa las desactivadas y no les pide receta ni grupos', async () => {
      const promise = service.getProductDraft(PID);

      http.expectOne(`${PRODUCTS}/${PID}`).flush(productResponse());
      await tick();

      // Sin `?active=`: una sola lectura que trae ambos estados.
      const list = http.expectOne(`${PRODUCTS}/${PID}/variants`);
      expect(list.request.params.has('active')).toBe(false);
      list.flush([
        variantResponse({ id: 'viva', name: 'Mediana', price: '9000', active: true }),
        variantResponse({ id: 'muerta', name: 'Pequeña', price: '6000', active: false }),
      ]);
      await tick();

      // Solo la viva pide su configuración; la desactivada no se edita.
      http.expectOne(`${VARIANTS}/viva/recipe`).flush([]);
      http.expectOne(`${VARIANTS}/viva/option-groups`).flush([]);
      http.expectOne(`${API}/option-groups`).flush([]);

      const result = await promise;
      expect(result!.variants.map((v) => v.name)).toEqual(['Mediana']);
      expect(result!.deactivated).toEqual([{ id: 'muerta', name: 'Pequeña', price: 6000 }]);
      // Una sola presentación viva: el toggle de tamaños queda apagado.
      expect(result!.hasSizes).toBe(false);
    });
  });

  describe('saveProduct sobre un producto existente', () => {
    it('reconcilia solo contra las activas y no re-borra las desactivadas', async () => {
      const promise = service.saveProduct(
        draft({
          variants: [
            { id: 'viva', localId: 'viva', name: 'Mediana', price: 9000, presentationId: null, recipe: [], optionGroups: [] },
          ],
          deactivated: [{ id: 'muerta', name: 'Pequeña', price: 6000 }],
        }),
      );

      http.expectOne(`${PRODUCTS}/${PID}`).flush(productResponse());
      await tick();

      const list = http.expectOne((r) => r.url === `${PRODUCTS}/${PID}/variants`);
      expect(list.request.params.get('active')).toBe('true');
      list.flush([variantResponse({ id: 'viva', name: 'Mediana', active: true })]);
      await tick();

      http.expectOne(`${VARIANTS}/viva`).flush(variantResponse({ id: 'viva' }));
      await tick();
      http.expectOne(`${VARIANTS}/viva/recipe`).flush({});
      await tick();
      http.expectOne(`${VARIANTS}/viva/option-groups`).flush({});
      await tick();

      // `muerta` no está en el draft, pero tampoco debe recibir un DELETE: ya está
      // desactivada y el usuario no la quitó en esta edición.
      http.expectNone(`${VARIANTS}/muerta`);

      // spec 042: el orden (aquí trivial, una sola presentación) se persiste al
      // final, como un paso más de este mismo guardado.
      const reorder = http.expectOne(`${PRODUCTS}/${PID}/variants/reorder`);
      expect(reorder.request.method).toBe('PATCH');
      expect(reorder.request.body).toEqual({ variant_ids: ['viva'] });
      reorder.flush({ variants: [{ id: 'viva', display_order: 1 }] });

      // `saveProduct` invalida la query paginada de productos al terminar, pero
      // este test nunca la activó (no llamó `loadProducts()`), así que no hay
      // ningún observer activo al que refrescar — invalidar una query inactiva
      // no dispara petición alguna.
      expect(await promise).toBe(PID);
    });

    it('traduce el 409 de nombre tomado por una desactivada en un mensaje accionable', async () => {
      const promise = service.saveProduct(
        draft({
          variants: [
            { id: null, localId: 'l1', name: 'Pequeña', price: 6000, presentationId: null, recipe: [], optionGroups: [] },
          ],
        }),
      );

      http.expectOne(`${PRODUCTS}/${PID}`).flush(productResponse());
      await tick();
      http.expectOne((r) => r.url === `${PRODUCTS}/${PID}/variants`).flush([]);
      await tick();

      http.expectOne((r) => r.method === 'POST' && r.url === `${PRODUCTS}/${PID}/variants`).flush(
        {
          detail: {
            error: 'Ya existe una variante «Pequeña» desactivada en este producto. Reactívala en vez de crear otra.',
            variant_id: 'muerta',
            active: false,
          },
        },
        { status: 409, statusText: 'Conflict' },
      );

      expect(await promise).toBeNull();
      expect(service.lastVariantConflict()?.variant_id).toBe('muerta');
      // Sin el parseo del detalle-objeto, el banner mostraría '[object Object]'.
      expect(service.error()).toContain('«Pequeña» desactivada');
      expect(service.error()).toContain('Presentaciones desactivadas');
    });
  });

  describe('orden de presentaciones al guardar (spec 042)', () => {
    it('envía los IDs en el mismo orden que draft.variants, incluida una recién creada', async () => {
      const promise = service.saveProduct(
        draft({
          variants: [
            { id: 'v2', localId: 'v2', name: 'Grande', price: 8000, presentationId: null, recipe: [], optionGroups: [] },
            { id: null, localId: 'nueva', name: 'Mediana', price: 6500, presentationId: null, recipe: [], optionGroups: [] },
            { id: 'v1', localId: 'v1', name: 'Pequeña', price: 5000, presentationId: null, recipe: [], optionGroups: [] },
          ],
        }),
      );

      http.expectOne(`${PRODUCTS}/${PID}`).flush(productResponse());
      await tick();
      http.expectOne((r) => r.url === `${PRODUCTS}/${PID}/variants`).flush([
        variantResponse({ id: 'v1', name: 'Pequeña' }),
        variantResponse({ id: 'v2', name: 'Grande' }),
      ]);
      await tick();

      // v2 (ya existe)
      http.expectOne(`${VARIANTS}/v2`).flush(variantResponse({ id: 'v2' }));
      await tick();
      http.expectOne(`${VARIANTS}/v2/recipe`).flush({});
      await tick();
      http.expectOne(`${VARIANTS}/v2/option-groups`).flush({});
      await tick();

      // "nueva" (sin id): se crea, y el nuevo id resuelto ('v3') es el que debe
      // aparecer en el orden enviado, no ningún id local del draft.
      http.expectOne((r) => r.method === 'POST' && r.url === `${PRODUCTS}/${PID}/variants`).flush(
        variantResponse({ id: 'v3', name: 'Mediana' }),
      );
      await tick();
      http.expectOne(`${VARIANTS}/v3/recipe`).flush({});
      await tick();
      http.expectOne(`${VARIANTS}/v3/option-groups`).flush({});
      await tick();

      // v1 (ya existe)
      http.expectOne(`${VARIANTS}/v1`).flush(variantResponse({ id: 'v1' }));
      await tick();
      http.expectOne(`${VARIANTS}/v1/recipe`).flush({});
      await tick();
      http.expectOne(`${VARIANTS}/v1/option-groups`).flush({});
      await tick();

      const reorder = http.expectOne(`${PRODUCTS}/${PID}/variants/reorder`);
      expect(reorder.request.body).toEqual({ variant_ids: ['v2', 'v3', 'v1'] });
      reorder.flush({
        variants: [
          { id: 'v2', display_order: 1 },
          { id: 'v3', display_order: 2 },
          { id: 'v1', display_order: 3 },
        ],
      });

      expect(await promise).toBe(PID);
    });
  });

  it('restoreVariant reactiva la presentación', async () => {
    const promise = service.restoreVariant('muerta');
    const req = http.expectOne(`${VARIANTS}/muerta`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ active: true });
    req.flush(variantResponse({ id: 'muerta', active: true }));
    expect(await promise).toBe(true);
  });

  it('loadDeactivated pide solo las inactivas', async () => {
    const promise = service.loadDeactivated(PID);
    const req = http.expectOne((r) => r.url === `${PRODUCTS}/${PID}/variants`);
    expect(req.request.params.get('active')).toBe('false');
    req.flush([variantResponse({ id: 'muerta', name: 'Pequeña', price: '6000', active: false })]);
    expect(await promise).toEqual([{ id: 'muerta', name: 'Pequeña', price: 6000 }]);
  });

  describe('mensajes de error del backend', () => {
    // FastAPI manda `detail` en tres formas y las tres tienen que llegar legibles al
    // usuario: texto, la lista de pydantic (422) y el objeto de los 409 con datos.
    const casos: [string, Record<string, unknown>, string][] = [
      ['texto', { detail: 'Product not found' }, 'Product not found'],
      ['lista de pydantic', { detail: [{ msg: 'El precio no puede ser negativo' }] }, 'El precio no puede ser negativo'],
      ['objeto con error', { detail: { error: 'El grupo está en uso', variantes_en_uso: [] } }, 'El grupo está en uso'],
    ];

    for (const [nombre, body, esperado] of casos) {
      it(`entiende un detail en ${nombre}`, async () => {
        const promise = service.updateVariant('v1', { price: 1 });
        http.expectOne(`${VARIANTS}/v1`).flush(body, { status: 409, statusText: 'Conflict' });
        expect(await promise).toBe(false);
        expect(service.error()).toBe(esperado);
      });
    }
  });
});
