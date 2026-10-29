/**
 * Nombres de colecciones y esquemas de Cloud Firestore para Lavadero eLeGe.
 * Preparadas para persistencia desacoplada y sincronización futura con storage.ts.
 */

export const FIRESTORE_COLLECTIONS = {
  CLIENTES: 'clientes',
  PEDIDOS: 'pedidos',
  PRENDAS: 'prendas',
  PAGOS: 'pagos',
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
    | 'DEACTIVATE';
  fase: FaseAuditoria;
  entidad: 'cliente' | 'pedido' | 'prenda' | 'pago' | 'configuracion' | 'sistema';
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
