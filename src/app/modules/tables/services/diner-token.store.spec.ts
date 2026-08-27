import { TestBed } from '@angular/core/testing';
import { DinerTokenStore, DINER_TOKEN_PARAM } from './diner-token.store';

const STORAGE_KEY = 'pos.diner.session_token';
const EXITED_STORAGE_KEY = 'pos.diner.exited_token';

describe('DinerTokenStore', () => {
  function create(): DinerTokenStore {
    // Ver nota en `diner.service.spec.ts`: los specs comparten entorno.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [DinerTokenStore] });
    return TestBed.inject(DinerTokenStore);
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, '', '/menu/t/abc');
  });
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('línea base (sin cambios)', () => {
    it('arranca sin token si no hay nada guardado', () => {
      expect(create().token()).toBeNull();
    });

    it('lee el token de localStorage si ya existe', () => {
      localStorage.setItem(STORAGE_KEY, 'tok-1');
      expect(create().token()).toBe('tok-1');
    });

    it('el query param gana sobre localStorage', () => {
      localStorage.setItem(STORAGE_KEY, 'tok-viejo');
      history.replaceState(null, '', `/menu/t/abc?${DINER_TOKEN_PARAM}=tok-nuevo`);

      const store = create();

      expect(store.token()).toBe('tok-nuevo');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('tok-nuevo');
    });

    it('set() persiste en localStorage y actualiza el signal', () => {
      const store = create();
      store.set('tok-2');

      expect(store.token()).toBe('tok-2');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('tok-2');
    });

    it('clear() descarta el token del signal y de localStorage', () => {
      const store = create();
      store.set('tok-3');

      store.clear();

      expect(store.token()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe('marca de acceso cerrado (Bug 1, FR-001)', () => {
    it('markExited(token) persiste en sessionStorage', () => {
      create().markExited('tok-cerrado');

      expect(sessionStorage.getItem(EXITED_STORAGE_KEY)).toBe('tok-cerrado');
    });

    it('isExited(token) devuelve true solo para el token marcado', () => {
      const store = create();
      store.markExited('tok-cerrado');

      expect(store.isExited('tok-cerrado')).toBe(true);
    });

    it('isExited(otroToken) devuelve false', () => {
      const store = create();
      store.markExited('tok-cerrado');

      expect(store.isExited('otro-token')).toBe(false);
    });

    it('sin ninguna marca, isExited() devuelve false para cualquier token', () => {
      expect(create().isExited('cualquiera')).toBe(false);
    });
  });
});
