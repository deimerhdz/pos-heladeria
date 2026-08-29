import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

/**
 * Bugfix (spec 050): antes de esto, cada llamada a `push()` agregaba una
 * tarjeta nueva sin mirar las ya visibles — un error que se repite (p. ej.
 * "Liberar Mesa" fallando varias veces seguidas) apilaba una copia idéntica
 * por cada intento.
 */
describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
  });

  it('dos llamadas seguidas con el mismo texto dejan un único toast', () => {
    service.error('Hay ítems sin terminar en cocina; anúlalos o espera a que estén listos.');
    service.error('Hay ítems sin terminar en cocina; anúlalos o espera a que estén listos.');

    expect(service.toasts().length).toBe(1);
  });

  it('un texto distinto sí agrega una tarjeta aparte', () => {
    service.error('Error uno');
    service.error('Error dos');

    expect(service.toasts().length).toBe(2);
  });

  it('el mismo texto con un tipo distinto sí agrega una tarjeta aparte', () => {
    service.error('Mesa liberada');
    service.success('Mesa liberada');

    expect(service.toasts().length).toBe(2);
    expect(service.toasts().map((t) => t.kind)).toEqual(['error', 'success']);
  });

  it('tras descartar el original, el mismo texto vuelve a mostrarse', () => {
    service.error('Mismo error');
    const id = service.toasts()[0].id;

    service.dismiss(id);
    service.error('Mismo error');

    expect(service.toasts().length).toBe(1);
  });
});
