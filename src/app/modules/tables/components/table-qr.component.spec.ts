import { ComponentFixture, TestBed } from '@angular/core/testing';
import QRCode from 'qrcode';
import { vi } from 'vitest';
import { TableQrComponent } from './table-qr.component';
import { TableService } from '../services/table.service';
import { Table } from '../interfaces/table.interface';

/**
 * Mismos dobles mínimos de canvas/`Image` que `table-qr.util.spec.ts`: jsdom
 * no implementa `getContext('2d')` ni la carga real de imágenes, y agregar
 * una librería de canvas solo para el test violaría el Principio IX.
 */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = '';
  set src(value: string) {
    this._src = value;
    queueMicrotask(() => this.onload?.());
  }
  get src(): string {
    return this._src;
  }
}

function installCanvasDoubles(): { texts: () => string[] } {
  const texts: string[] = [];
  vi.stubGlobal('Image', FakeImage as unknown as typeof Image);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    return {
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      fillText: vi.fn((text: string) => texts.push(text)),
    } as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    return `data:image/png;fake;w=${this.width};h=${this.height}`;
  });
  return { texts: () => texts };
}

/**
 * `QRCode.toDataURL` no resuelve en un solo microtask/tick(0) (encola trabajo
 * real de generación de imagen) — se sondea la condición en vez de asumir un
 * número fijo de `await Promise.resolve()`.
 */
async function waitUntil(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitUntil: tiempo de espera agotado');
    await new Promise((r) => setTimeout(r, 10));
  }
}

function table(partial: Partial<Table>): Table {
  return { id: 't1', number: 1, name: null, qr_token: 'tok', active: true, status: 'libre', ...partial };
}

describe('TableQrComponent', () => {
  let fixture: ComponentFixture<TableQrComponent>;
  let component: TableQrComponent;

  async function createComponent(t: Table): Promise<void> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableQrComponent],
      providers: [
        {
          provide: TableService,
          useValue: { getQrToken: vi.fn().mockResolvedValue({ qr_token: t.qr_token }) },
        },
      ],
    });
    fixture = TestBed.createComponent(TableQrComponent);
    component = fixture.componentInstance;
    component.table = t;
    fixture.detectChanges();
    await waitUntil(() => !component.loading());
    fixture.detectChanges();
  }

  afterEach(() => vi.restoreAllMocks());

  const buttons = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('button'));

  it('el modal muestra dos opciones "Mostrador"/"Sticker" en vez de un único botón "Descargar PNG"', async () => {
    installCanvasDoubles();
    await createComponent(table({ number: 3, name: 'Terraza', qr_token: 'signed-3' }));

    const labels = buttons().map((b) => b.textContent?.trim());
    expect(labels).toContain('Mostrador');
    expect(labels).toContain('Sticker');
    expect(labels).not.toContain('Descargar PNG');
  });

  it('"Mostrador" compone el PNG con el number/name reales de la mesa, no un índice de lista', async () => {
    const { texts } = installCanvasDoubles();
    await createComponent(table({ number: 5, name: 'Salón', qr_token: 'signed-5' }));

    const btn = buttons().find((b) => b.textContent?.trim() === 'Mostrador')!;
    btn.click();
    await waitUntil(() => !component.downloading());
    fixture.detectChanges();

    expect(texts().join(' ')).toContain('Mesa 5 · Salón');
  });

  it('"Sticker" compone el PNG con el token firmado real de esta mesa (mismo destino codificado)', async () => {
    installCanvasDoubles();
    const spy = vi.spyOn(QRCode, 'toDataURL');
    await createComponent(table({ number: 2, name: null, qr_token: 'signed-2' }));

    const btn = buttons().find((b) => b.textContent?.trim() === 'Sticker')!;
    btn.click();
    await waitUntil(() => !component.downloading());
    fixture.detectChanges();

    const menuUrlCall = spy.mock.calls.find((c) => (c[0] as string).includes('/menu/t/signed-2'));
    expect(menuUrlCall).toBeDefined();
  });

  it('el nombre del archivo descargado sigue incluyendo el identificador de la mesa', async () => {
    installCanvasDoubles();
    await createComponent(table({ number: 7, name: null, qr_token: 'signed-7' }));
    const clicks: string[] = [];
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreateElement(tag);
      if (tag === 'a') {
        vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(() => {
          clicks.push((el as HTMLAnchorElement).download);
        });
      }
      return el;
    });

    const btn = buttons().find((b) => b.textContent?.trim() === 'Mostrador')!;
    btn.click();
    await waitUntil(() => !component.downloading());
    fixture.detectChanges();

    expect(clicks[0]).toContain('7');
  });
});
