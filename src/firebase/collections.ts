/**
 * Nombres de colecciones y esquemas de Cloud Firestore para Lavadero eLeGe.
 * Preparadas para persistencia desacoplada y sincronización futura con storage.ts.
 */

export const FIRESTORE_COLLECTIONS = {
  CLIENTES: 'clientes',
  PEDIDOS: 'pedidos',
  PRENDAS: 'prendas',
  PAGOS: 'pagos',
  MOVIMIENTOS_CAJA: 'movimientos_caja',
  SESIONES_CAJA: 'sesiones_caja',
  AVISOS_WHATSAPP: 'avisos_whatsapp',
  CONFIGURACION: 'configuracion',
  AUDITORIA: 'auditoria',
} as const;

export type FirestoreCollectionName =
  (typeof FIRESTORE_COLLECTIONS)[keyof typeof FIRESTORE_COLLECTIONS];

export type FaseAuditoria = 'INICIADA' | 'CONFIRMADA' | 'FALLIDA';

/**
 * Modelo de registro de auditoría reforzado para trazabilidad de cambios en Firestore.
 * Diferencia fases de operaciones críticas para máxima fiabilidad contable y operativa.
 */
export interface RegistroAuditoria {
  id?: string;
  accion:
    | 'CREATE'
    | 'UPDATE'
    | 'DELETE'
    | 'STATUS_CHANGE'
    | 'PAYMENT'
    | 'PAYMENT_CANCEL'
    | 'ORDER_CANCEL'
    | 'RESTORE'
    | 'DEACTIVATE'
    | 'CASH_MOVEMENT'
    | 'CASH_CORRECTION'
    | 'CASH_CANCEL'
    | 'CASH_OPEN'
    | 'CASH_CLOSE';
  fase: FaseAuditoria;
  entidad:
    | 'cliente'
    | 'pedido'
    | 'prenda'
    | 'pago'
    | 'movimiento_caja'
    | 'sesion_caja'
    | 'configuracion'
    | 'sistema';
  entidadId: string;
  detalles: string;
  usuarioUid: string;
  usuarioEmail?: string;
  timestamp: any; // FieldValue serverTimestamp o string ISO
  datosPrevios?: any;
  datosNuevos?: any;
}

/**
 * Estructura de Pago en Firestore con soporte para inmutabilidad y anulación auditada
 */
export interface PagoFirestore {
  id: string;
  pedidoId: string;
  clienteId: string;
  monto: number;
  metodo: 'efectivo' | 'transferencia' | 'debito' | 'credito' | 'otro';
  fecha: string;
  esSenia?: boolean;
  nota?: string;
  anulado?: boolean;
  motivoAnulacion?: string;
  anuladoAt?: any;
  anuladoPor?: string;
  registradoAt?: any;
  registradoPor?: string;
}

export interface MovimientoCajaFirestore {
  id: string;
  tipo: 'ingreso' | 'egreso';
  categoria:
    | 'cobro_pedido'
    | 'senia_pedido'
    | 'ingreso_manual'
    | 'ajuste_positivo'
    | 'productos_limpieza'
    | 'insumos'
    | 'servicios'
    | 'sueldos'
    | 'mantenimiento'
    | 'otros_gastos';
  concepto: string;
  monto: number;
  fecha: string;
  metodo: 'efectivo' | 'transferencia' | 'debito' | 'credito' | 'otro';
  pedidoId?: string;
  codigoPedido?: string;
  clienteId?: string;
  clienteNombre?: string;
  pagoIdRelacionado?: string;
  observaciones?: string;
  origen: 'pedido_pago' | 'manual';
  anulado?: boolean;
  motivoAnulacion?: string;
  anuladoAt?: any;
  anuladoPor?: string;
  historialCambios?: any[];
  creadoEn: string;
  actualizadoEn?: string;
  createdAt?: any;
  createdBy?: string;
  updatedAt?: any;
  updatedBy?: string;
}

export interface SesionCajaFirestore {
  id: string;
  fecha: string;
  horaApertura: string;
  saldoInicialEfectivo: number;
  saldoInicialDigital?: number;
  notasApertura?: string;
  cerrada: boolean;
  horaCierre?: string;
  arqueoRealEfectivo?: number;
  diferenciaArqueo?: number;
  observacionesCierre?: string;
  resumenCierre?: {
    ingresosEfectivo: number;
    egresosEfectivo: number;
    efectivoEsperado: number;
    totalIngresos: number;
    totalEgresos: number;
    balanceNeto: number;
    saldoTotalFinal: number;
  };
  historialAjustes?: any[];
  createdAt?: any;
  createdBy?: string;
  updatedAt?: any;
  updatedBy?: string;
}
