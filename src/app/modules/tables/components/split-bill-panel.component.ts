import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { DiningOrder, SessionBill, SessionParticipant } from '../interfaces/dining.interface';
import { TableSessionService } from '../services/table-session.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { buildMenuLookup } from '../services/menu-lookup';
import { MenuCategory } from '../../products/interfaces/product.interface';

/**
 * Una línea de la mesa, con **una entrada por unidad**.
 *
 * `units[i]` es quién paga la unidad i. Plegada, todas comparten valor y se editan de
 * golpe; desplegada, cada una tiene su selector. Guardar unidades y no una sola
 * persona por línea es lo que permite repartir un "2× Cono" entre dos.
 */
interface AssignRow {
  itemId: string;
  label: string;
  quantity: number;
  unitPrice: number;
  units: (string | null)[];
  expanded: boolean;
}

/**
 * Reparto de la cuenta cuando **no todos escanearon el QR**.
 *
 * El cobro dividido ya existía, pero solo funcionaba si cada comensal había pedido
 * desde su móvil: la asignación vive en `order_items.participant_id` y solo se
 * poblaba al escanear. Si una persona pedía por todos, el desglose tenía una única
 * línea y "Dividir por comensal" quedaba deshabilitado para siempre.
 *
 * Aquí el cajero crea a las personas y reparte los productos; a partir de ahí el
 * cobro dividido de siempre funciona sin cambios.
 */
@Component({
  selector: 'app-split-bill-panel',
  standalone: true,
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 z-40" (click)="close.emit()"></div>
    <div class="fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-xl z-50 flex flex-col">
      <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
        <div>
          <h2 class="text-base font-bold text-gray-900">
            Dividir la cuenta @if (tableLabel) { <span class="text-gray-400 font-normal">· {{ tableLabel }}</span> }
          </h2>
          <p class="text-xs text-gray-400">Asigna cada producto a quien lo va a pagar.</p>
        </div>
        <button (click)="close.emit()" class="text-gray-400 hover:text-gray-600 text-lg">✕</button>
      </div>

      <div class="flex-1 overflow-y-auto p-5 space-y-5">
        <!-- Personas -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-xs font-semibold text-gray-700 uppercase tracking-wide">Personas</h3>
          </div>

          <div class="space-y-1.5 mb-2">
            @for (p of people(); track p.id) {
              <div class="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-gray-200">
                <span class="text-sm font-medium text-gray-800 truncate">{{ p.display_label || p.display_name }}</span>
                <span class="flex items-center gap-2 shrink-0">
                  <span class="text-xs text-gray-400">{{ countFor(p.id) }} producto(s)</span>
                  <span class="text-sm font-semibold text-gray-900">$ {{ totalFor(p.id) | number: '1.2-2' }}</span>
                  <button (click)="removePerson(p)" [disabled]="busy()"
                    class="text-gray-300 hover:text-red-500 disabled:opacity-40 transition-colors"
                    title="Quitar">✕</button>
                </span>
              </div>
            }
          </div>

          <div class="flex items-center gap-2">
            <input
              type="text"
              [value]="newName()"
              (input)="newName.set($any($event.target).value)"
              (keyup.enter)="addPerson()"
              placeholder="Nombre de la persona"
              maxlength="255"
              class="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button (click)="addPerson()" [disabled]="!newName().trim() || busy()"
              class="px-3 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors">
              Agregar
            </button>
          </div>
        </div>

        <!-- Lo que falta por repartir: bloque aparte, no una persona más de la lista.
             Desaparece al terminar, que es la señal de que ya se puede guardar. -->
        @if (pending() > 0) {
          <div class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-amber-900 uppercase tracking-wide">Todavía sin repartir</span>
              <span class="text-sm font-semibold text-amber-900">$ {{ totalFor(null) | number: '1.2-2' }}</span>
            </div>
            <p class="text-xs text-amber-700 mt-0.5">
              {{ pending() }} producto(s). Elige abajo quién paga cada uno.
            </p>
          </div>
        }

        <!-- Productos -->
        <div>
          <h3 class="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Productos de la mesa</h3>
          @if (rows().length === 0) {
            <p class="text-sm text-gray-400 py-4 text-center">Esta mesa no tiene productos que cobrar.</p>
          }
          <div class="space-y-1.5">
            @for (row of rows(); track row.itemId) {
              <div class="px-3 py-2 rounded-lg border border-gray-100">
                <div class="flex items-center gap-2">
                  <span class="flex-1 min-w-0">
                    <span class="text-sm text-gray-800">{{ row.quantity }}× {{ row.label }}</span>
                    <span class="block text-xs text-gray-400">$ {{ row.quantity * row.unitPrice | number: '1.2-2' }}</span>
                  </span>

                  @if (row.expanded) {
                    <button (click)="toggleExpand(row.itemId)"
                      class="shrink-0 text-xs font-medium text-gray-500 hover:text-gray-700">
                      Volver a unir
                    </button>
                  } @else {
                    <select
                      [value]="ownerOf(row) ?? ''"
                      (change)="assignAll(row.itemId, $any($event.target).value)"
                      class="shrink-0 w-36 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="">— ¿Quién paga? —</option>
                      @for (p of people(); track p.id) {
                        <option [value]="p.id">{{ p.display_label || p.display_name }}</option>
                      }
                    </select>
                  }
                </div>

                <!-- Solo tiene sentido en líneas de más de una unidad. -->
                @if (row.quantity > 1 && !row.expanded) {
                  <button (click)="toggleExpand(row.itemId)"
                    class="mt-1 text-xs font-medium text-indigo-600 hover:text-indigo-800">
                    Repartir entre varias personas →
                  </button>
                }

                @if (row.expanded) {
                  <div class="mt-2 space-y-1.5 pl-3 border-l-2 border-indigo-100">
                    @for (unit of row.units; track $index) {
                      <div class="flex items-center gap-2">
                        <span class="flex-1 min-w-0">
                          <span class="text-xs text-gray-600">Unidad {{ $index + 1 }} de {{ row.quantity }}</span>
                          <span class="block text-xs text-gray-400">$ {{ row.unitPrice | number: '1.2-2' }}</span>
                        </span>
                        <select
                          [value]="unit ?? ''"
                          (change)="assignUnit(row.itemId, $index, $any($event.target).value)"
                          class="shrink-0 w-36 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="">— ¿Quién paga? —</option>
                          @for (p of people(); track p.id) {
                            <option [value]="p.id">{{ p.display_label || p.display_name }}</option>
                          }
                        </select>
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </div>
        </div>

        @if (error(); as e) {
          <p class="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{{ e }}</p>
        }
      </div>

      <div class="px-5 py-4 border-t border-gray-100 shrink-0">
        <button (click)="save()" [disabled]="busy() || !!blocker()"
          class="w-full py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {{ busy() ? 'Guardando…' : (blocker() ?? 'Guardar reparto') }}
        </button>
      </div>
    </div>
  `,
})
export class SplitBillPanelComponent implements OnInit {
  @Input({ required: true }) sessionId!: string;
  /** "Mesa 1": sin esto no se puede confirmar de un vistazo de qué mesa es la lista. */
  @Input() tableLabel = '';
  @Input() orders: DiningOrder[] = [];
  @Input() categories: MenuCategory[] = [];
  @Output() close = new EventEmitter<void>();
  /** Emite la cuenta recalculada para que el panel de cobro la use sin pedirla otra vez. */
  @Output() saved = new EventEmitter<SessionBill>();

  private readonly api = inject(TableSessionService);
  private readonly toast = inject(ToastService);

  readonly people = signal<SessionParticipant[]>([]);
  readonly rows = signal<AssignRow[]>([]);
  readonly newName = signal('');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.loadPeople();
    this.buildRows();
  }

  private async loadPeople(): Promise<void> {
    try {
      const session = await this.api.get(this.sessionId);
      this.people.set(session.participants ?? []);
    } catch (err) {
      this.error.set(this.api.extractError(err, 'No se pudieron cargar los comensales.'));
    }
  }

  /** Las líneas cobrables de la mesa; las anuladas no se cobran, así que no se reparten. */
  private buildRows(): void {
    const lookup = buildMenuLookup(this.categories);
    const rows: AssignRow[] = [];
    for (const order of this.orders) {
      for (const item of order.items ?? []) {
        if (item.estado_cocina === 'anulado') continue;
        const dueno = item.participant_id ?? null;
        rows.push({
          itemId: item.id,
          label: lookup.variantLabel(item.product_variant_id),
          quantity: item.quantity,
          unitPrice: Number(item.unit_price),
          units: Array.from({ length: item.quantity }, () => dueno),
          expanded: false,
        });
      }
    }
    this.rows.set(rows);
  }

  /** Productos que todavía no tienen quién los pague. */
  readonly pending = computed(() =>
    this.rows().reduce((n, r) => n + r.units.filter((u) => u === null).length, 0),
  );

  /**
   * Qué impide guardar, o `null` si se puede. El texto va en el propio botón: un
   * botón atenuado y mudo obliga a adivinar qué falta.
   *
   * No se admite guardar con productos sueltos porque al cobrar se emitiría una
   * factura extra a nombre de la mesa que nadie pidió y alguien tendría que pagar.
   */
  readonly blocker = computed<string | null>(() => {
    if (this.rows().length === 0) return 'No hay productos que repartir';
    if (this.people().length === 0) return 'Agrega al menos una persona';
    const faltan = this.pending();
    if (faltan > 0) {
      return faltan === 1
        ? 'Falta 1 producto por repartir'
        : `Faltan ${faltan} productos por repartir`;
    }
    return null;
  });

  /** Cuenta UNIDADES, no líneas: un "2× Cono" de Ana son dos productos suyos. */
  countFor(participantId: string | null): number {
    return this.rows().reduce(
      (n, r) => n + r.units.filter((u) => u === participantId).length,
      0,
    );
  }

  totalFor(participantId: string | null): number {
    return this.rows().reduce(
      (s, r) => s + r.units.filter((u) => u === participantId).length * r.unitPrice,
      0,
    );
  }

  /** Quién paga la línea cuando está plegada (todas las unidades van juntas). */
  ownerOf(row: AssignRow): string | null {
    return row.units[0] ?? null;
  }

  /**
   * El reparto es local hasta "Guardar": se puede desplegar, cambiar y volver a plegar
   * sin tocar la base.
   */
  assignAll(itemId: string, participantId: string): void {
    const id = participantId || null;
    this.rows.update((rows) =>
      rows.map((r) => (r.itemId === itemId ? { ...r, units: r.units.map(() => id) } : r)),
    );
  }

  assignUnit(itemId: string, index: number, participantId: string): void {
    const id = participantId || null;
    this.rows.update((rows) =>
      rows.map((r) =>
        r.itemId === itemId
          ? { ...r, units: r.units.map((u, i) => (i === index ? id : u)) }
          : r,
      ),
    );
  }

  toggleExpand(itemId: string): void {
    this.rows.update((rows) =>
      rows.map((r) => {
        if (r.itemId !== itemId) return r;
        // Al volver a unir, mandan todas al dueño de la primera: si no, quedarían
        // repartos invisibles bajo una fila que se ve con un solo selector.
        return r.expanded
          ? { ...r, expanded: false, units: r.units.map(() => r.units[0] ?? null) }
          : { ...r, expanded: true };
      }),
    );
  }

  async addPerson(): Promise<void> {
    const nombre = this.newName().trim();
    if (!nombre || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      // El alta sí va al backend en el acto: necesita el id real para poder
      // asignarle productos, y el desambiguado de nombres lo hace allá.
      const creado = await this.api.addParticipant(this.sessionId, nombre);
      this.people.update((ps) => [...ps, creado]);
      this.newName.set('');
    } catch (err) {
      this.error.set(this.api.extractError(err, 'No se pudo agregar a la persona.'));
    } finally {
      this.busy.set(false);
    }
  }

  async removePerson(p: SessionParticipant): Promise<void> {
    if (this.busy()) return;
    // El backend rechaza quitar a alguien con consumo ya guardado; esto evita el
    // viaje cuando el propio reparto en pantalla ya le tiene productos puestos.
    if (this.countFor(p.id) > 0) {
      this.error.set(
        `${p.display_label || p.display_name} tiene productos asignados. Pásalos a otra persona primero.`,
      );
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.removeParticipant(this.sessionId, p.id);
      this.people.update((ps) => ps.filter((x) => x.id !== p.id));
    } catch (err) {
      this.error.set(this.api.extractError(err, 'No se pudo quitar a la persona.'));
    } finally {
      this.busy.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      // Una entrada por (línea, persona) con su número de unidades. El backend exige
      // que la suma por línea sea su cantidad exacta, que es lo que impide inventar o
      // perder unidades y descuadrar el inventario.
      const assignments = this.rows().flatMap((r) => {
        const porPersona = new Map<string | null, number>();
        for (const u of r.units) porPersona.set(u, (porPersona.get(u) ?? 0) + 1);
        return [...porPersona].map(([participant_id, quantity]) => ({
          order_item_id: r.itemId,
          participant_id,
          quantity,
        }));
      });
      const bill = await this.api.setAssignments(this.sessionId, assignments);
      this.toast.success('Cuenta repartida');
      this.saved.emit(bill);
      this.close.emit();
    } catch (err) {
      this.error.set(this.api.extractError(err, 'No se pudo guardar el reparto.'));
    } finally {
      this.busy.set(false);
    }
  }
}
