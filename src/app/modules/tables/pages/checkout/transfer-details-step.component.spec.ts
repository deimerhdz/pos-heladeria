import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { vi } from 'vitest';
import { TransferDetailsStepComponent } from './transfer-details-step.component';
import { CheckoutProgressStore } from './checkout-progress.store';
import { DinerService } from '../../services/diner.service';
import { DinerTokenStore } from '../../services/diner-token.store';
import { DiningCartService } from '../../services/dining-cart.service';
import { ToastService } from '../../../../shared/feedback/toast.service';
import { DinerPaymentMethod, PaymentMethodField } from '../../interfaces/diner.interface';

/**
 * Primer archivo de test de este componente (spec 060, research.md D5) — el
 * harness base (mocks de routing/servicios + `buildMethod`) es compartido por
 * las historias 1 (copiar) y 2 (descargar).
 */
function buildMethod(fields: PaymentMethodField[], paymentInfo: Record<string, string>): DinerPaymentMethod {
  return {
    id: 'm1',
    name: 'Nequi',
    type: 'transfer',
    is_cash: false,
    payment_info: paymentInfo,
    fields,
  };
}

/** Igual que `table-qr.component.spec.ts`: sondea la condición en vez de un
 *  número fijo de `await Promise.resolve()`, porque `ngOnInit` es async. */
async function waitUntil(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitUntil: tiempo de espera agotado');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('TransferDetailsStepComponent', () => {
  let fixture: ComponentFixture<TransferDetailsStepComponent>;
  let component: TransferDetailsStepComponent;
  let toast: ToastService;

  async function createComponent(method: DinerPaymentMethod): Promise<void> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TransferDetailsStepComponent],
      providers: [
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'test-token' } } } },
        {
          provide: DinerService,
          useValue: {
            getPaymentMethods: vi.fn().mockResolvedValue([method]),
            extractError: vi.fn((_err: unknown, fallback: string) => fallback),
          },
        },
        { provide: DinerTokenStore, useValue: { clear: vi.fn() } },
        { provide: DiningCartService, useValue: { clear: vi.fn(), clearDiner: vi.fn() } },
        {
          provide: CheckoutProgressStore,
          useValue: {
            read: vi.fn().mockReturnValue({
              step: 'transfer',
              payment_method_id: method.id,
              receipt_file_url: null,
              saved_at: new Date().toISOString(),
            }),
            paymentMethods: signal<DinerPaymentMethod[]>([method]),
            activeOrder: signal(null),
            write: vi.fn(),
            clearMethod: vi.fn(),
            clear: vi.fn(),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(TransferDetailsStepComponent);
    component = fixture.componentInstance;
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
    await waitUntil(() => component.method() !== null);
    fixture.detectChanges();
  }

  afterEach(() => vi.restoreAllMocks());

  const buttons = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('button'));
  const copyButtons = (): HTMLButtonElement[] =>
    buttons().filter((b) => (b.title || b.getAttribute('aria-label')) === 'Copiar');
  /** Lee el toast realmente pintado en pantalla (`role="status"`), no solo si
   *  se llamó al servicio — el propio `<app-toast-container>` debe estar
   *  montado dentro de este componente para que algo aparezca aquí (bug real
   *  encontrado en producción: el servicio se llamaba, pero nada se veía). */
  const visibleToastTexts = (): string[] =>
    Array.from(fixture.nativeElement.querySelectorAll('[role="status"]')).map(
      (el) => (el as HTMLElement).textContent?.trim() ?? '',
    );

  // ── Historia 1 — copiar el número de cuenta/celular ─────────────────────

  it('muestra un botón de copiar junto a cada campo de texto con valor (FR-002, FR-010)', async () => {
    await createComponent(
      buildMethod(
        [
          { key: 'numero_celular', label: 'Número de celular', format: 'text' },
          { key: 'titular', label: 'Titular', format: 'text' },
        ],
        { numero_celular: '3106448749', titular: 'Deimer Hernandez' },
      ),
    );

    expect(copyButtons().length).toBe(2);
  });

  it('copia el valor exacto del campo al portapapeles y notifica éxito por 5000 ms (FR-001, FR-003, FR-007)', async () => {
    await createComponent(
      buildMethod([{ key: 'numero_celular', label: 'Número de celular', format: 'text' }], {
        numero_celular: '3106448749',
      }),
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const successSpy = vi.spyOn(toast, 'success');

    copyButtons()[0].click();
    await waitUntil(() => writeText.mock.calls.length > 0);
    await waitUntil(() => successSpy.mock.calls.length > 0);
    fixture.detectChanges();

    expect(writeText).toHaveBeenCalledWith('3106448749');
    expect(successSpy).toHaveBeenCalledWith(expect.any(String), 5000);
    expect(visibleToastTexts().some((t) => t.includes('Copiado'))).toBe(true);
  });

  it('si el portapapeles falla, notifica error por 5000 ms y no notifica éxito (FR-008, FR-007)', async () => {
    await createComponent(
      buildMethod([{ key: 'numero_celular', label: 'Número de celular', format: 'text' }], {
        numero_celular: '3106448749',
      }),
    );
    const writeText = vi.fn().mockRejectedValue(new Error('denegado'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const successSpy = vi.spyOn(toast, 'success');
    const errorSpy = vi.spyOn(toast, 'error');

    copyButtons()[0].click();
    await waitUntil(() => errorSpy.mock.calls.length > 0);

    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), 5000);
    expect(successSpy).not.toHaveBeenCalled();
  });

  it('sin ningún campo de texto con valor, no muestra ningún botón de copiar (FR-011)', async () => {
    await createComponent(
      buildMethod([{ key: 'codigo_qr', label: 'Código QR', format: 'image' }], {
        codigo_qr: 'https://cdn.example.com/qr.png',
      }),
    );

    expect(copyButtons().length).toBe(0);
  });

  // ── Historia 2 — descargar la imagen del QR ──────────────────────────────

  const downloadButtons = (): HTMLButtonElement[] =>
    buttons().filter((b) => (b.title || b.getAttribute('aria-label')) === 'Descargar');

  /** Mismo patrón que `table-qr.component.spec.ts`: intercepta `document.createElement('a')`
   *  para espiar el `click()` de la ancla temporal de descarga, sin tocar el resto del DOM. */
  function installAnchorSpy(): { clicks: () => { download: string }[] } {
    const clicks: { download: string }[] = [];
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreateElement(tag);
      if (tag === 'a') {
        vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(() => {
          clicks.push({ download: (el as HTMLAnchorElement).download });
        });
      }
      return el;
    });
    return { clicks: () => clicks };
  }

  it('muestra un botón de descargar junto al campo de imagen con valor (FR-004, FR-010)', async () => {
    await createComponent(
      buildMethod([{ key: 'codigo_qr', label: 'Código QR', format: 'image' }], {
        codigo_qr: 'https://cdn.example.com/qr.png',
      }),
    );

    expect(downloadButtons().length).toBe(1);
  });

  it('descarga la imagen (fetch + blob) y notifica éxito por 5000 ms (FR-004, FR-006, FR-007)', async () => {
    await createComponent(
      buildMethod([{ key: 'codigo_qr', label: 'Código QR', format: 'image' }], {
        codigo_qr: 'https://cdn.example.com/qr.png',
      }),
    );
    const blob = new Blob(['fake'], { type: 'image/png' });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });
    vi.stubGlobal('fetch', fetchMock);
    const createObjectURL = vi.fn().mockReturnValue('blob:fake');
    const revokeObjectURL = vi.fn();
    (URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: typeof revokeObjectURL }).revokeObjectURL = revokeObjectURL;
    const { clicks } = installAnchorSpy();
    const successSpy = vi.spyOn(toast, 'success');

    downloadButtons()[0].click();
    await waitUntil(() => clicks().length > 0);
    await waitUntil(() => successSpy.mock.calls.length > 0);
    fixture.detectChanges();

    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example.com/qr.png');
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicks()[0].download).toContain('qr-nequi');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    expect(successSpy).toHaveBeenCalledWith(expect.any(String), 5000);
    expect(visibleToastTexts().some((t) => t.includes('descargada'))).toBe(true);
  });

  it('si la descarga falla, notifica error por 5000 ms y no crea ninguna URL de objeto (FR-009, FR-007)', async () => {
    await createComponent(
      buildMethod([{ key: 'codigo_qr', label: 'Código QR', format: 'image' }], {
        codigo_qr: 'https://cdn.example.com/qr.png',
      }),
    );
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const createObjectURL = vi.fn().mockReturnValue('blob:fake');
    (URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL = createObjectURL;
    const successSpy = vi.spyOn(toast, 'success');
    const errorSpy = vi.spyOn(toast, 'error');

    downloadButtons()[0].click();
    await waitUntil(() => errorSpy.mock.calls.length > 0);

    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), 5000);
    expect(successSpy).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('sin ningún campo de imagen con valor, no muestra ningún botón de descargar (FR-011)', async () => {
    await createComponent(
      buildMethod([{ key: 'numero_celular', label: 'Número de celular', format: 'text' }], {
        numero_celular: '3106448749',
      }),
    );

    expect(downloadButtons().length).toBe(0);
  });
});
