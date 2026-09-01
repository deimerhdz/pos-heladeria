import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { OptionGroupFormComponent } from './option-group-form.component';
import { ConfirmService } from '../../../shared/feedback/confirm.service';
import { OptionGroup } from '../../products/interfaces/product.interface';

const API = environment.apiBaseUrl;
const GROUPS = `${API}/option-groups`;

function makeGroup(partial: Partial<OptionGroup> = {}): OptionGroup {
  return {
    id: 'g1',
    name: 'Sabores',
    min_select: 1,
    max_select: 1,
    active: true,
    pricing_type: 'con_recargo',
    options: [],
    ...partial,
  };
}

describe('OptionGroupFormComponent', () => {
  let fixture: ComponentFixture<OptionGroupFormComponent>;
  let component: OptionGroupFormComponent;
  let http: HttpTestingController;

  async function create(group: OptionGroup | null): Promise<void> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [OptionGroupFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(OptionGroupFormComponent);
    component = fixture.componentInstance;
    component.group = group;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // ngOnInit
  }

  afterEach(() => http.verify());

  const submitButton = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('button[type="submit"]');

  /**
   * `OptionGroupService.submit()` siempre recarga la lista (`loadGroups()`) tras un
   * guardado exitoso -- flushea la petición de escritura Y el `GET` de recarga que le
   * sigue, en ese orden, para que la promesa de `onSubmit()` pueda resolver.
   */
  async function flushWrite(
    method: 'POST' | 'PATCH',
    url: string,
    body: Partial<OptionGroup>,
  ): Promise<void> {
    const req = http.expectOne(url);
    expect(req.request.method).toBe(method);
    req.flush(makeGroup(body));
    await Promise.resolve();
    http.expectOne(GROUPS).flush([]);
  }

  it('FR-001: no permite enviar un grupo nuevo sin elegir un tipo de precio', async () => {
    await create(null);
    component.form.patchValue({ name: 'Toppings', min_select: 0, max_select: 2 });
    fixture.detectChanges();

    expect(component.form.invalid).toBe(true);
    expect(submitButton().disabled).toBe(true);
  });

  it('crea un grupo "incluido" con normalidad', async () => {
    await create(null);
    component.form.setValue({ name: 'Sabores', min_select: 1, max_select: 1, pricing_type: 'incluido' });
    fixture.detectChanges();

    const submitPromise = component.onSubmit();
    const req = http.expectOne(GROUPS);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.pricing_type).toBe('incluido');
    req.flush(makeGroup({ pricing_type: 'incluido' }));
    await Promise.resolve();
    http.expectOne(GROUPS).flush([]);
    await submitPromise;
  });

  it('crea un grupo "con_recargo" con normalidad', async () => {
    await create(null);
    component.form.setValue({ name: 'Toppings', min_select: 0, max_select: 2, pricing_type: 'con_recargo' });
    fixture.detectChanges();

    const submitPromise = component.onSubmit();
    const req = http.expectOne(GROUPS);
    expect(req.request.body.pricing_type).toBe('con_recargo');
    req.flush(makeGroup({ name: 'Toppings', pricing_type: 'con_recargo' }));
    await Promise.resolve();
    http.expectOne(GROUPS).flush([]);
    await submitPromise;
  });

  it('editar un grupo precarga su pricing_type actual', async () => {
    await create(makeGroup({ pricing_type: 'incluido' }));

    expect(component.form.value.pricing_type).toBe('incluido');
  });

  // ── FR-004: confirmación al reclasificar "con_recargo" -> "incluido" ──────

  it('cambiar a "incluido" SIN precios configurados no pide confirmación', async () => {
    await create(makeGroup({ pricing_type: 'con_recargo', options: [] }));
    component.form.patchValue({ pricing_type: 'incluido' });

    const confirm = TestBed.inject(ConfirmService);
    const submitPromise = component.onSubmit();

    expect(confirm.state()).toBeNull();
    await flushWrite('PATCH', `${GROUPS}/g1`, { pricing_type: 'incluido' });
    await submitPromise;
  });

  it('cambiar a "incluido" CON precios configurados pide confirmación explícita', async () => {
    await create(
      makeGroup({
        pricing_type: 'con_recargo',
        options: [{ id: 'o1', option_group_id: 'g1', name: 'Maní', extra_price: 500, inventory_item_id: null, item_quantity: 0, active: true }],
      }),
    );
    component.form.patchValue({ pricing_type: 'incluido' });

    const confirm = TestBed.inject(ConfirmService);
    const submitPromise = component.onSubmit();
    await Promise.resolve();

    expect(confirm.state()).not.toBeNull();
    expect(confirm.state()?.title).toContain('Incluido');

    confirm.respond(true);
    await Promise.resolve();
    await flushWrite('PATCH', `${GROUPS}/g1`, { pricing_type: 'incluido' });
    await submitPromise;
  });

  it('cancelar la confirmación no envía el PATCH y restaura pricing_type al valor anterior', async () => {
    await create(
      makeGroup({
        pricing_type: 'con_recargo',
        options: [{ id: 'o1', option_group_id: 'g1', name: 'Maní', extra_price: 500, inventory_item_id: null, item_quantity: 0, active: true }],
      }),
    );
    component.form.patchValue({ pricing_type: 'incluido' });

    const confirm = TestBed.inject(ConfirmService);
    const submitPromise = component.onSubmit();
    await Promise.resolve();
    confirm.respond(false);
    await submitPromise;

    http.expectNone(`${GROUPS}/g1`);
    expect(component.form.value.pricing_type).toBe('con_recargo');
  });

  it('cambiar de "incluido" a "con_recargo" nunca pide confirmación', async () => {
    await create(makeGroup({ pricing_type: 'incluido', options: [] }));
    component.form.patchValue({ pricing_type: 'con_recargo' });

    const confirm = TestBed.inject(ConfirmService);
    const submitPromise = component.onSubmit();

    expect(confirm.state()).toBeNull();
    await flushWrite('PATCH', `${GROUPS}/g1`, { pricing_type: 'con_recargo' });
    await submitPromise;
  });
});
