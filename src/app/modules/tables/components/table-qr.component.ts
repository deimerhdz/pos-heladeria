import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { Table } from '../interfaces/table.interface';
import { TableService } from '../services/table.service';
import { buildTableQr } from '../services/table-qr.util';

@Component({
  selector: 'app-table-qr',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 class="text-lg font-semibold text-gray-900">QR — Mesa {{ table.number }}</h2>
          <button type="button" (click)="onClose()" class="text-gray-400 hover:text-gray-600 transition-colors">
            ✕
          </button>
        </div>

        <div class="px-6 py-5 flex flex-col items-center gap-4">
          @if (loading()) {
            <div class="flex items-center justify-center h-64 w-64">
              <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          } @else if (error()) {
            <div class="flex flex-col items-center justify-center h-64 w-64 text-center">
              <div class="text-4xl mb-2">🚫</div>
              <p class="text-sm text-red-600">{{ error() }}</p>
            </div>
          } @else {
            <img [src]="qrDataUrl()" alt="Código QR de la mesa" class="rounded-xl w-64 h-64" />
            <p class="text-xs text-gray-400 text-center break-all">{{ menuUrl() }}</p>
          }

          <div class="flex gap-3 w-full">
            <button
              type="button"
              (click)="onClose()"
              class="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cerrar
            </button>
            <button
              type="button"
              (click)="downloadPng()"
              [disabled]="loading() || !!error()"
              class="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Descargar PNG
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class TableQrComponent implements OnInit {
  @Input() table!: Table;
  @Output() closed = new EventEmitter<void>();

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly menuUrl = signal<string>('');
  readonly qrDataUrl = signal<string>('');

  private readonly tables = inject(TableService);

  async ngOnInit(): Promise<void> {
    try {
      // El QR codifica un token **firmado** que el backend emite para esta mesa;
      // lleva el tenant dentro, así que no depende del dominio ni de cabeceras.
      const { menuUrl, dataUrl } = await buildTableQr(this.tables, this.table.id);
      this.menuUrl.set(menuUrl);
      this.qrDataUrl.set(dataUrl);
      this.loading.set(false);
    } catch {
      this.error.set('No se pudo generar el código QR de la mesa.');
      this.loading.set(false);
    }
  }

  downloadPng(): void {
    const a = document.createElement('a');
    a.href = this.qrDataUrl();
    a.download = `qr-mesa-${this.table.number}.png`;
    a.click();
  }

  onClose(): void {
    this.closed.emit();
  }
}
