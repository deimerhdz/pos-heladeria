import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import QRCode from 'qrcode';
import { Table } from '../interfaces/table.interface';

@Component({
  selector: 'app-table-qr',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 class="text-lg font-semibold text-gray-900">QR — {{ table.name }}</h2>
          <button type="button" (click)="onClose()" class="text-gray-400 hover:text-gray-600 transition-colors">
            ✕
          </button>
        </div>

        <div class="px-6 py-5 flex flex-col items-center gap-4">
          <canvas #qrCanvas class="rounded-xl"></canvas>

          <p class="text-xs text-gray-400 text-center break-all">{{ menuUrl }}</p>

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
              class="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              Descargar PNG
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class TableQrComponent implements AfterViewInit {
  @Input() table!: Table;
  @Output() closed = new EventEmitter<void>();

  @ViewChild('qrCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  get menuUrl(): string {
    return `${window.location.origin}/menu/${this.table.qr_code}`;
  }

  ngAfterViewInit(): void {
    QRCode.toCanvas(this.canvasRef.nativeElement, this.menuUrl, {
      width: 256,
      margin: 2,
    });
  }

  downloadPng(): void {
    QRCode.toDataURL(this.menuUrl, { width: 256, margin: 2 }, (_, url) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = `qr-mesa-${this.table.name.replace(/\s+/g, '-').toLowerCase()}.png`;
      a.click();
    });
  }

  onClose(): void {
    this.closed.emit();
  }
}
