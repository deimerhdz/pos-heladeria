// Tipos de VISTA del Módulo de Caja (SkeiloPOS). Modelan lo que las pantallas
// necesitan para renderizar; los DTOs del backend viven en `cash.interface.ts`.

import { MovementKind } from './cash.interface';

/** Pantalla activa del módulo. */
export type CashScreen = 'apertura' | 'dashboard' | 'report';

/** Modal abierto (o `null`). */
export type CashModal = MovementKind | 'arqueo' | null;

/** Vista de la línea de tiempo de movimientos. */
export type MovementView = 'tabla' | 'timeline';

/** Estilo del tag según el tipo de movimiento. */
export type TagVariant = 'accent' | 'neutral' | 'outline';

/** Movimiento preparado para render (etiquetas, formato y estilo ya resueltos). */
export interface MovementRow {
  id: string;
  hora: string;
  label: string;
  tagVariant: TagVariant;
  montoFmt: string;
  usuario: string;
  nota: string;
}

/** Una denominación de efectivo (COP) con su conteo actual, lista para render. */
export interface Denomination {
  value: number;
  label: string;
  cantidad: number;
  subtotal: number;
  subtotalFmt: string;
}

/** Indicadores agregados del turno (derivados de la reconciliación del servidor). */
export interface Indicadores {
  ventasEfectivo: number;
  ventasTarjeta: number;
  ventasTransferencia: number;
  ingresos: number;
  egresos: number;
  retiros: number;
  efectivoEsperado: number;
  countVentasEfectivo: number;
  countVentasTarjeta: number;
  countVentasTransferencia: number;
  countIngresos: number;
  countEgresos: number;
  countRetiros: number;
}
