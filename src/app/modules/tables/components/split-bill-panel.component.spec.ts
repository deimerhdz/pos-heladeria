import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { SplitBillPanelComponent } from './split-bill-panel.component';
import { DiningOrder, SessionBill, TableSession } from '../interfaces/dining.interface';

const API = environment.apiBaseUrl;

/** spec 026, Historia 3: verifica que el reparto de esta pantalla es
 *  exclusivamente por ítem/unidad (nunca porcentual, spec 010 FR-005) y que
 *  el cobro combinado ya vigente (spec 011) sigue disponible al guardar. */
function session(): TableSession {
  return {
    id: 'ts1',
    dining_table_id: 't1',
    status: 'active',
    participants: [],
  } as unknown as TableSession;
}

function orderWithItems(): DiningOrder {
  return {
    id: 'o1',
    channel: 'qr',
    status: 'abierta',
    created_at: '2026-08-18T23:09:00',
    items: [
      { id: 'i1', product_variant_id: 'v1', quantity: 2, unit_price: '4000', estado_cocina: 'listo' },
    ],
  } as DiningOrder;
}

describe('SplitBillPanelComponent', () => {
  let fixture: ComponentFixture<SplitBillPanelComponent>;
  let panel: SplitBillPanelComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SplitBillPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(SplitBillPanelComponent);
    panel = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('sessionId', 'ts1');
    fixture.componentRef.setInput('orders', [orderWithItems()]);
    fixture.componentRef.setInput('categories', []);

    fixture.detectChanges(); // dispara ngOnInit -> loadPeople()
    http.expectOne(`${API}/table-sessions/ts1`).flush(session());
    await Promise.resolve();
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('no permite guardar mientras haya productos sin repartir, y nunca ofrece una división porcentual', () => {
    expect(panel.blocker()).toBe('Agrega al menos una persona');
    // Ninguna opción de "repartir a partes iguales" existe en el template:
    // la única forma de asignar es por unidad, vía `assignUnit`/`assignAll`.
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).not.toContain('%');
    expect(texto).not.toContain('partes iguales');
  });

  it('asigna cada unidad a una persona concreta, nunca una fracción', async () => {
    const persona = await addPerson('Ana');

    panel.assignAll('i1', persona.id);
    fixture.detectChanges();

    expect(panel.countFor(persona.id)).toBe(2); // las 2 unidades del ítem
    expect(panel.totalFor(persona.id)).toBe(8000);
    expect(panel.pending()).toBe(0);
    expect(panel.blocker()).toBeNull();
  });

  it('permite repartir las unidades de una misma línea entre personas distintas', async () => {
    const ana = await addPerson('Ana');
    const luis = await addPerson('Luis');

    panel.toggleExpand('i1');
    panel.assignUnit('i1', 0, ana.id);
    panel.assignUnit('i1', 1, luis.id);
    fixture.detectChanges();

    expect(panel.countFor(ana.id)).toBe(1);
    expect(panel.countFor(luis.id)).toBe(1);
    expect(panel.pending()).toBe(0);
  });

  it('guarda el reparto como asignaciones por ítem/cantidad, no como porcentajes', async () => {
    const ana = await addPerson('Ana');
    panel.assignAll('i1', ana.id);
    fixture.detectChanges();

    const done = panel.save();
    const req = http.expectOne(`${API}/table-sessions/ts1/assignments`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      assignments: [{ order_item_id: 'i1', participant_id: ana.id, quantity: 2 }],
    });
    req.flush({
      table_session_id: 'ts1',
      dining_table_id: 't1',
      total: '8000',
      order_ids: ['o1'],
      split: [{ participant_id: ana.id, display_label: 'Ana', subtotal: '8000', items: [], discount: '0' }],
    } as SessionBill);
    await done;
  });

  async function addPerson(nombre: string): Promise<{ id: string }> {
    panel.newName.set(nombre);
    const done = panel.addPerson();
    const req = http.expectOne(`${API}/table-sessions/ts1/participants`);
    const created = { id: `p-${nombre}`, display_name: nombre, display_label: nombre };
    req.flush(created);
    await done;
    fixture.detectChanges();
    return created;
  }
});
