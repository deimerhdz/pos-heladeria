import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Presentation } from '../interfaces/presentation.interface';
import { PresentationService } from '../services/presentation.service';

@Component({
  selector: 'app-presentations-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Presentaciones</h1>
          <p class="text-gray-500 text-sm mt-1">
            Tamaños compartidos del catálogo (8oz, 16oz…). Una variante sin presentación no
            participa de promociones por presentación.
          </p>
        </div>
        <button
          (click)="openCreate()"
          class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
        >
          <span>+</span> Nueva Presentación
        </button>
      </div>

      @if (service.error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {{ service.error() }}
        </div>
      }

      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        @if (service.presentations().length === 0 && !service.loading()) {
          <div class="flex flex-col items-center justify-center py-16 text-center px-4">
            <div class="text-5xl mb-4">📏</div>
            <p class="text-gray-600 font-medium">Aún no hay presentaciones</p>
          </div>
        } @else {
          <table class="w-full">
            <thead>
              <tr class="border-b border-gray-100 bg-gray-50">
                <th class="text-left text-xs font-semibold text-gray-500 uppercase px-5 py-3">Nombre</th>
                <th class="text-left text-xs font-semibold text-gray-500 uppercase px-5 py-3">Productos aplicables</th>
                <th class="text-left text-xs font-semibold text-gray-500 uppercase px-5 py-3">Estado</th>
                <th class="text-right text-xs font-semibold text-gray-500 uppercase px-5 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              @for (p of service.presentations(); track p.id) {
                <tr [class.opacity-50]="!p.active" class="hover:bg-gray-50 transition-colors">
                  <td class="px-5 py-4 text-sm font-medium text-gray-900">{{ p.name }}</td>
                  <td class="px-5 py-4 text-sm text-gray-500">{{ p.applicable_variant_count }}</td>
                  <td class="px-5 py-4">
                    <span
                      class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                      [class]="p.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'"
                    >
                      {{ p.active ? 'Activa' : 'Inactiva' }}
                    </span>
                  </td>
                  <td class="px-5 py-4">
                    <div class="flex items-center justify-end gap-2">
                      <button (click)="openRename(p)" title="Renombrar"
                        class="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg">✏️</button>
                      <button (click)="onToggle(p)" [title]="p.active ? 'Desactivar' : 'Activar'"
                        class="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg">
                        {{ p.active ? '🔴' : '🟢' }}
                      </button>
                      <button (click)="onDelete(p)" title="Eliminar"
                        class="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">🗑️</button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>

    <!-- Crear / renombrar -->
    @if (formOpen()) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
          <h2 class="text-lg font-bold text-gray-900">
            {{ editing() ? 'Renombrar presentación' : 'Nueva presentación' }}
          </h2>
          <input
            type="text" [(ngModel)]="nameValue" placeholder="8oz"
            class="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <div class="flex justify-end gap-2">
            <button (click)="closeForm()"
              class="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl">Cancelar</button>
            <button (click)="save()" [disabled]="service.isSubmitting() || !nameValue.trim()"
              class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50">
              Guardar
            </button>
          </div>
        </div>
      </div>
    }

    <!-- FR-020: baja bloqueada por promociones activas -->
    @if (service.inUseError(); as inUse) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
          <h2 class="text-lg font-bold text-red-700">{{ inUse.error }}</h2>
          <p class="text-sm text-gray-600">
            Edita o pausa estas promociones antes de continuar:
          </p>
          <ul class="text-sm text-gray-800 list-disc pl-5 space-y-1">
            @for (promo of inUse.promotions; track promo.id) {
              <li>
                <a [routerLink]="['/dashboard/promotions']" [queryParams]="{ id: promo.id }"
                  class="text-indigo-600 hover:underline">{{ promo.name }}</a>
              </li>
            }
          </ul>
          <div class="flex justify-end">
            <button (click)="service.inUseError.set(null)"
              class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700">
              Entendido
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class PresentationsPageComponent implements OnInit {
  readonly service = inject(PresentationService);

  readonly formOpen = signal(false);
  readonly editing = signal<Presentation | null>(null);
  nameValue = '';

  ngOnInit(): void {
    void this.service.loadPresentations();
  }

  openCreate(): void {
    this.editing.set(null);
    this.nameValue = '';
    this.formOpen.set(true);
  }

  openRename(p: Presentation): void {
    this.editing.set(p);
    this.nameValue = p.name;
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
  }

  async save(): Promise<void> {
    const name = this.nameValue.trim();
    if (!name) return;
    const editing = this.editing();
    const ok = editing
      ? await this.service.renamePresentation(editing.id, name)
      : await this.service.createPresentation({ name });
    if (ok) this.formOpen.set(false);
  }

  async onToggle(p: Presentation): Promise<void> {
    await this.service.toggleActive(p.id, p.active);
  }

  async onDelete(p: Presentation): Promise<void> {
    if (!confirm(`¿Eliminar la presentación "${p.name}"?`)) return;
    await this.service.deletePresentation(p.id);
  }
}
