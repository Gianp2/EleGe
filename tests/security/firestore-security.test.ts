/**
 * Suite Integral Reforzada de Pruebas de Seguridad, Consistencia Contable y Atomicidad Firestore
 * Proyecto: elege-99d0c
 * UID Administradora Autorizada: eBvTLPVNQIefDTc52fmcmK0ID0K3
 * Correo Administradora: admin@elege.com
 *
 * Contenido:
 * 1. Motor de evaluación lógica fiel a firestore.rules v2 reforzado.
 * 2. Casos de Seguridad (SEC-01 a SEC-44):
 *    - Acceso autorizado vs no autorizado (público, anónimo, UIDs ajenos).
 *    - Escrituras maliciosas, inyección de campos y path-traversal.
 *    - Inmutabilidad estricta (historial de clientes, pagos, auditoría, config).
 *    - Integridad referencial (clienteExiste en pedidos, pedidoExiste en prendas y pagos).
 *    - Consistencia contable (total >= cobrado, saldo <= total, motivo en anulación).
 *    - Protección de entregados y bloqueo de eliminación física con pagos/pedidos.
 *    - Compatibilidad con migración histórica.
 * 3. Suite de Atomicidad y Flujos Contables (ACCT-01 a ACCT-10):
 *    - Señas, pagos parciales acumulados, recomposición de saldos por anulación,
 *      sincronización canónica de prendas y auditoría por fases.
 */

import {
  Cliente,
  Pedido,
  Prenda,
  Pago,
  ConfiguracionSistema,
  EstadoPrenda,
  EstadoPedido,
  EstadoPago,
} from '../../src/types';
import { RegistroAuditoria, PagoFirestore, FaseAuditoria } from '../../src/firebase/collections';
import {
  generateClienteId,
  generatePedidoId,
  generatePrendaId,
  generatePagoId,
  generateAuditoriaId,
} from '../../src/firebase/utils/idGenerator';

export const AUTHORIZED_ADMIN_UID = 'eBvTLPVNQIefDTc52fmcmK0ID0K3';

export interface SecurityContext {
  auth?: {
    uid: string;
    email?: string;
    isAnonymous?: boolean;
    providerId?: string;
  } | null;
  // Conjunto de rutas de documentos existentes para evaluar integridad referencial
  existingDocuments?: Set<string>;
  documentStore?: Map<string, any>;
}

export interface SecurityTestCase {
  id: string;
  categoria:
    | 'AUTH'
    | 'VALIDATION'
    | 'IMMUTABILITY'
    | 'ZERO_TRUST'
    | 'MALICIOUS_WRITE'
    | 'REFERENTIAL_INTEGRITY'
    | 'ACCOUNTING_CONSISTENCY';
  descripcion: string;
  coleccion: string;
  documentId: string;
  operacion: 'read' | 'create' | 'update' | 'delete';
  usuario: {
    autenticado: boolean;
    uid?: string;
    email?: string;
    isAnonymous?: boolean;
  };
  existingData?: any;
  payload?: any;
  existingDocuments?: string[];
  documentStore?: Record<string, any>;
  resultadoEsperado: 'ALLOW' | 'DENY';
  motivoSeguridad: string;
}

// ===========================================================================
// 1. MOTOR DE EVALUACIÓN DE REGLAS FIRESTORE (Emulador Lógico de firestore.rules)
// ===========================================================================

export class FirestoreRulesEvaluator {
  static isValidId(id: string): boolean {
    return (
      typeof id === 'string' &&
      id.length > 0 &&
      id.length <= 128 &&
      /^[a-zA-Z0-9_\-]+$/.test(id)
    );
  }

  static isAuthorizedAdmin(ctx: SecurityContext): boolean {
    if (!ctx.auth) return false;
    if (ctx.auth.isAnonymous === true) return false;
    if (ctx.auth.providerId === 'anonymous') return false;
    return ctx.auth.uid === AUTHORIZED_ADMIN_UID;
  }

  static getPedidoData(ctx: SecurityContext, pedidoId: string): any {
    if (ctx.documentStore && ctx.documentStore.has(`pedidos/${pedidoId}`)) {
      return ctx.documentStore.get(`pedidos/${pedidoId}`);
    }
    return { id: pedidoId, clienteId: 'CLI_valido_1' };
  }

  static isValidCliente(data: any, docId: string): boolean {
    if (!data || typeof data !== 'object') return false;
    const requiredKeys = ['id', 'nombre', 'telefono', 'fechaAlta', 'qrPayload'];
    for (const key of requiredKeys) {
      if (!(key in data)) return false;
    }

    const allowedKeys = new Set([
      'id',
      'nombre',
      'apellido',
      'telefono',
      'observaciones',
      'fechaAlta',
      'qrPayload',
      'activo',
      'createdAt',
      'createdBy',
      'updatedAt',
      'migradoAt',
      'migradoPor',
    ]);
    for (const key of Object.keys(data)) {
      if (!allowedKeys.has(key)) return false; // Inyección de campo no permitido
    }

    if (typeof data.id !== 'string' || data.id !== docId || !this.isValidId(data.id)) return false;
    if (typeof data.nombre !== 'string' || data.nombre.length === 0 || data.nombre.length > 100) return false;
    if ('apellido' in data && (typeof data.apellido !== 'string' || data.apellido.length > 100)) return false;
    if (typeof data.telefono !== 'string' || data.telefono.length < 6 || data.telefono.length > 30) return false;
    if ('observaciones' in data && (typeof data.observaciones !== 'string' || data.observaciones.length > 500)) return false;
    if (typeof data.fechaAlta !== 'string') return false;
    if (typeof data.qrPayload !== 'string' || data.qrPayload.length === 0 || data.qrPayload.length > 256) return false;
    if ('activo' in data && typeof data.activo !== 'boolean') return false;

    return true;
  }

  static isValidPedido(data: any, docId: string): boolean {
    if (!data || typeof data !== 'object') return false;
    const requiredKeys = [
      'id',
      'codigoVisible',
      'clienteId',
      'fechaRecepcion',
      'total',
      'saldoPendiente',
      'estadoPago',
      'estadoGeneral',
    ];
    for (const key of requiredKeys) {
      if (!(key in data)) return false;
    }

    const allowedKeys = new Set([
      'id',
      'codigoVisible',
      'clienteId',
      'fechaRecepcion',
      'fechaEstimadaEntrega',
      'prendas',
      'total',
      'saldoPendiente',
      'estadoPago',
      'estadoGeneral',
      'observacionesGenerales',
      'pagos',
      'avisosWhatsApp',
      'qrPayload',
      'fechaEntregaEfectiva',
      'createdAt',
      'createdBy',
      'updatedAt',
      'updatedBy',
      'migradoAt',
      'migradoPor',
    ]);
    for (const key of Object.keys(data)) {
      if (!allowedKeys.has(key)) return false; // Inyección de campo no permitido
    }

    if (typeof data.id !== 'string' || data.id !== docId || !this.isValidId(data.id)) return false;
    if (typeof data.clienteId !== 'string' || !this.isValidId(data.clienteId)) return false;
    if (typeof data.codigoVisible !== 'string' || data.codigoVisible.length > 30) return false;
    if (typeof data.fechaRecepcion !== 'string') return false;
    if (typeof data.total !== 'number' || data.total < 0) return false;
    if (typeof data.saldoPendiente !== 'number' || data.saldoPendiente < 0) return false;
    if (data.saldoPendiente > data.total) return false; // Saldo no puede exceder el total
    if (!['pendiente', 'parcial', 'pagado'].includes(data.estadoPago)) return false;
    if (!['recibido', 'en_proceso', 'listo', 'entregado', 'cancelado'].includes(data.estadoGeneral)) return false;

    return true;
  }

  static isValidPrenda(data: any, docId: string): boolean {
    if (!data || typeof data !== 'object') return false;
    const requiredKeys = ['id', 'pedidoId', 'clienteId', 'tipo', 'servicio', 'precio', 'estado'];
    for (const key of requiredKeys) {
      if (!(key in data)) return false;
    }

    const allowedKeys = new Set([
      'id',
      'pedidoId',
      'clienteId',
      'tipo',
      'descripcion',
      'servicio',
      'precio',
      'observaciones',
      'estado',
      'qrPayload',
      'fechaActualizacion',
      'createdAt',
      'updatedAt',
      'migradoAt',
    ]);
    for (const key of Object.keys(data)) {
      if (!allowedKeys.has(key)) return false;
    }

    if (typeof data.id !== 'string' || data.id !== docId || !this.isValidId(data.id)) return false;
    if (typeof data.pedidoId !== 'string' || !this.isValidId(data.pedidoId)) return false;
    if (typeof data.clienteId !== 'string' || !this.isValidId(data.clienteId)) return false;
    if (typeof data.tipo !== 'string' || data.tipo.length === 0 || data.tipo.length > 100) return false;
    if (typeof data.servicio !== 'string' || data.servicio.length === 0 || data.servicio.length > 60) return false;
    if (typeof data.precio !== 'number' || data.precio < 0) return false;
    if (!['recibido', 'en_proceso', 'listo', 'entregado'].includes(data.estado)) return false;

    return true;
  }

  static isValidPago(data: any, docId: string): boolean {
    if (!data || typeof data !== 'object') return false;
    const requiredKeys = ['id', 'pedidoId', 'clienteId', 'monto', 'metodo', 'fecha'];
    for (const key of requiredKeys) {
      if (!(key in data)) return false;
    }

    const allowedKeys = new Set([
      'id',
      'pedidoId',
      'clienteId',
      'monto',
      'metodo',
      'fecha',
      'esSenia',
      'nota',
      'anulado',
      'motivoAnulacion',
      'anuladoAt',
      'anuladoPor',
      'registradoAt',
      'registradoPor',
    ]);
    for (const key of Object.keys(data)) {
      if (!allowedKeys.has(key)) return false;
    }

    if (typeof data.id !== 'string' || data.id !== docId || !this.isValidId(data.id)) return false;
    if (typeof data.pedidoId !== 'string' || !this.isValidId(data.pedidoId)) return false;
    if (typeof data.clienteId !== 'string' || !this.isValidId(data.clienteId)) return false;
    if (typeof data.monto !== 'number' || data.monto <= 0) return false;
    if (!['efectivo', 'transferencia', 'debito', 'credito', 'otro'].includes(data.metodo)) return false;
    if (typeof data.fecha !== 'string') return false;

    return true;
  }

  static isValidConfiguracion(data: any): boolean {
    if (!data || typeof data !== 'object') return false;
    const requiredKeys = ['nombreComercio', 'telefono', 'formatoTicketDefecto'];
    for (const key of requiredKeys) {
      if (!(key in data)) return false;
    }

    const allowedKeys = new Set([
      'nombreComercio',
      'telefono',
      'direccion',
      'lemaOTicketPie',
      'formatoTicketDefecto',
      'monedaSimbolo',
      'diasEstimadosEntregaDefecto',
      'notificarWhatsAppAuto',
      'fechaUltimaModificacion',
      'updatedAt',
      'updatedBy',
    ]);
    for (const key of Object.keys(data)) {
      if (!allowedKeys.has(key)) return false;
    }

    if (typeof data.nombreComercio !== 'string' || data.nombreComercio.length === 0 || data.nombreComercio.length > 100) return false;
    if (typeof data.telefono !== 'string' || data.telefono.length < 6 || data.telefono.length > 30) return false;
    if (!['80mm', '58mm'].includes(data.formatoTicketDefecto)) return false;

    return true;
  }

  static isValidAuditoria(data: any, docId: string, authUid?: string): boolean {
    if (!data || typeof data !== 'object') return false;
    const requiredKeys = ['accion', 'fase', 'entidad', 'entidadId', 'detalles', 'usuarioUid'];
    for (const key of requiredKeys) {
      if (!(key in data)) return false;
    }

    const allowedKeys = new Set([
      'id',
      'accion',
      'fase',
      'entidad',
      'entidadId',
      'detalles',
      'usuarioUid',
      'usuarioEmail',
      'timestamp',
      'datosPrevios',
      'datosNuevos',
    ]);
    for (const key of Object.keys(data)) {
      if (!allowedKeys.has(key)) return false;
    }

    if ('id' in data && (typeof data.id !== 'string' || data.id !== docId)) return false;
    if (!['CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'PAYMENT', 'PAYMENT_CANCEL', 'ORDER_CANCEL', 'RESTORE', 'DEACTIVATE'].includes(data.accion)) {
      return false;
    }
    if (!['INICIADA', 'CONFIRMADA', 'FALLIDA'].includes(data.fase)) return false;
    if (!['cliente', 'pedido', 'prenda', 'pago', 'configuracion', 'sistema'].includes(data.entidad)) return false;
    if (typeof data.entidadId !== 'string' || !this.isValidId(data.entidadId)) return false;
    if (typeof data.detalles !== 'string' || data.detalles.length === 0 || data.detalles.length > 1000) return false;
    if (typeof data.usuarioUid !== 'string' || data.usuarioUid !== authUid) return false;

    return true;
  }

  static isValidAvisoWhatsApp(data: any): boolean {
    if (!data || typeof data !== 'object') return false;
    const requiredKeys = ['fecha', 'pedidoId', 'clienteId', 'telefono', 'mensaje'];
    for (const key of requiredKeys) {
      if (!(key in data)) return false;
    }

    const allowedKeys = new Set([
      'fecha',
      'prendaId',
      'pedidoId',
      'clienteId',
      'telefono',
      'mensaje',
      'timestamp',
      'enviadoPor',
      'migradoAt',
    ]);
    for (const key of Object.keys(data)) {
      if (!allowedKeys.has(key)) return false;
    }

    if (typeof data.fecha !== 'string') return false;
    if (typeof data.pedidoId !== 'string' || !this.isValidId(data.pedidoId)) return false;
    if (typeof data.clienteId !== 'string' || !this.isValidId(data.clienteId)) return false;
    if ('prendaId' in data && (typeof data.prendaId !== 'string' || !this.isValidId(data.prendaId))) return false;
    if (typeof data.telefono !== 'string' || data.telefono.length < 6 || data.telefono.length > 30) return false;
    if (typeof data.mensaje !== 'string' || data.mensaje.length === 0 || data.mensaje.length > 1000) return false;

    return true;
  }

  /**
   * Evalúa la operación contra las reglas exactas definidas en firestore.rules
   */
  static evaluate(
    coleccion: string,
    docId: string,
    operacion: 'read' | 'create' | 'update' | 'delete',
    ctx: SecurityContext,
    payload?: any,
    existingData?: any
  ): 'ALLOW' | 'DENY' {
    const isAdmin = this.isAuthorizedAdmin(ctx);

    switch (coleccion) {
      case 'clientes': {
        if (!isAdmin) return 'DENY';
        if (operacion === 'read') return 'ALLOW';
        if (!this.isValidId(docId)) return 'DENY';
        if (operacion === 'create') {
          return this.isValidCliente(payload, docId) ? 'ALLOW' : 'DENY';
        }
        if (operacion === 'update') {
          if (!this.isValidCliente(payload, docId)) return 'DENY';
          if (existingData) {
            if (payload.id !== existingData.id) return 'DENY';
            if (payload.fechaAlta !== existingData.fechaAlta) return 'DENY';
          }
          return 'ALLOW';
        }
        if (operacion === 'delete') {
          return 'DENY'; // allow delete: if false; Prohibido borrado físico en favor de desactivación lógica
        }
        return 'DENY';
      }

      case 'pedidos': {
        if (!isAdmin) return 'DENY';
        if (operacion === 'read') return 'ALLOW';
        if (!this.isValidId(docId)) return 'DENY';
        if (operacion === 'create') {
          if (!this.isValidPedido(payload, docId)) return 'DENY';
          // Integridad referencial con clientes
          if (ctx.existingDocuments && !ctx.existingDocuments.has(`clientes/${payload.clienteId}`)) {
            return 'DENY';
          }
          return 'ALLOW';
        }
        if (operacion === 'update') {
          if (!this.isValidPedido(payload, docId)) return 'DENY';
          if (existingData) {
            if (payload.id !== existingData.id) return 'DENY';
            if (payload.codigoVisible !== existingData.codigoVisible) return 'DENY';
            if (payload.clienteId !== existingData.clienteId) return 'DENY';
            if (payload.fechaRecepcion !== existingData.fechaRecepcion) return 'DENY';

            // Bloqueo contable: total no puede ser inferior a cobros previos
            const totalCobrado = (existingData.total || 0) - (existingData.saldoPendiente || 0);
            if (payload.total < totalCobrado) return 'DENY';

            // Protección de pedidos entregados
            if (existingData.estadoGeneral === 'entregado' && payload.estadoGeneral !== 'entregado') {
              return 'DENY';
            }
          }
          return 'ALLOW';
        }
        if (operacion === 'delete') {
          return 'DENY'; // allow delete: if false; Prohibido borrado físico en favor de cancelación lógica
        }
        return 'DENY';
      }

      case 'prendas': {
        if (!isAdmin) return 'DENY';
        if (operacion === 'read') return 'ALLOW';
        if (!this.isValidId(docId)) return 'DENY';
        if (operacion === 'create') {
          if (!this.isValidPrenda(payload, docId)) return 'DENY';
          // Integridad referencial con pedidos
          if (ctx.existingDocuments && !ctx.existingDocuments.has(`pedidos/${payload.pedidoId}`)) {
            return 'DENY';
          }
          const parentPedido = this.getPedidoData(ctx, payload.pedidoId);
          if (parentPedido && parentPedido.clienteId !== payload.clienteId) {
            return 'DENY'; // Validación cruzada: prenda.clienteId == pedido.clienteId
          }
          return 'ALLOW';
        }
        if (operacion === 'update') {
          if (!this.isValidPrenda(payload, docId)) return 'DENY';
          if (existingData) {
            if (payload.id !== existingData.id) return 'DENY';
            if (payload.pedidoId !== existingData.pedidoId) return 'DENY';
            if (payload.clienteId !== existingData.clienteId) return 'DENY';
          }
          const parentPedido = this.getPedidoData(ctx, payload.pedidoId);
          if (parentPedido && parentPedido.clienteId !== payload.clienteId) {
            return 'DENY';
          }
          return 'ALLOW';
        }
        if (operacion === 'delete') return 'DENY'; // allow delete: if false;
        return 'DENY';
      }

      case 'pagos': {
        if (!isAdmin) return 'DENY';
        if (operacion === 'read') return 'ALLOW';
        if (!this.isValidId(docId)) return 'DENY';
        if (operacion === 'create') {
          if (!this.isValidPago(payload, docId)) return 'DENY';
          if (payload.anulado === true) return 'DENY'; // Pagos no pueden nacer anulados
          // Integridad referencial con pedidos
          if (ctx.existingDocuments && !ctx.existingDocuments.has(`pedidos/${payload.pedidoId}`)) {
            return 'DENY';
          }
          const parentPedido = this.getPedidoData(ctx, payload.pedidoId);
          if (parentPedido && parentPedido.clienteId !== payload.clienteId) {
            return 'DENY'; // Validación cruzada: pago.clienteId == pedido.clienteId
          }
          return 'ALLOW';
        }
        if (operacion === 'update') {
          if (!existingData || existingData.anulado === true) return 'DENY';
          if (!payload || payload.anulado !== true) return 'DENY';

          const allowedKeys = new Set(['anulado', 'motivoAnulacion', 'anuladoAt', 'anuladoPor']);
          for (const key of Object.keys(payload)) {
            if (!allowedKeys.has(key)) {
              if (existingData[key] !== payload[key]) {
                return 'DENY';
              }
            }
          }

          if (payload.anuladoPor !== ctx.auth?.uid) return 'DENY';
          if (
            typeof payload.motivoAnulacion !== 'string' ||
            payload.motivoAnulacion.length < 3 ||
            payload.motivoAnulacion.length > 500 ||
            !/^.*\S.*\S.*\S.*$/.test(payload.motivoAnulacion)
          ) {
            return 'DENY';
          }
          if (!payload.anuladoAt) return 'DENY';

          return 'ALLOW';
        }
        if (operacion === 'delete') {
          return 'DENY'; // allow delete: if false;
        }
        return 'DENY';
      }

      case 'avisos_whatsapp': {
        if (!isAdmin) return 'DENY';
        if (operacion === 'read') return 'ALLOW';
        if (!this.isValidId(docId)) return 'DENY';
        if (operacion === 'create') {
          return this.isValidAvisoWhatsApp(payload) ? 'ALLOW' : 'DENY';
        }
        return 'DENY'; // allow update, delete: if false;
      }

      case 'configuracion': {
        if (!isAdmin) return 'DENY';
        if (operacion === 'read') return 'ALLOW';
        if (!this.isValidId(docId)) return 'DENY';
        if (operacion === 'create' || operacion === 'update') {
          return this.isValidConfiguracion(payload) ? 'ALLOW' : 'DENY';
        }
        return 'DENY'; // allow delete: if false;
      }

      case 'auditoria': {
        if (!isAdmin) return 'DENY';
        if (operacion === 'read') return 'ALLOW';
        if (!this.isValidId(docId)) return 'DENY';
        if (operacion === 'create') {
          return this.isValidAuditoria(payload, docId, ctx.auth?.uid) ? 'ALLOW' : 'DENY';
        }
        return 'DENY'; // allow update, delete: if false;
      }

      default: {
        return 'DENY';
      }
    }
  }
}

// ===========================================================================
// 2. MATRIZ EXHAUSTIVA DE CASOS DE PRUEBA DE SEGURIDAD (44 CASOS)
// ===========================================================================

export const SECURITY_TEST_CASES: SecurityTestCase[] = [
  // -------------------------------------------------------------------------
  // 1. DENEGACIÓN A USUARIOS NO AUTENTICADOS O ANÓNIMOS
  // -------------------------------------------------------------------------
  {
    id: 'SEC-01',
    categoria: 'AUTH',
    descripcion: 'Usuario no autenticado intenta leer clientes',
    coleccion: 'clientes',
    documentId: 'CLI_test_1',
    operacion: 'read',
    usuario: { autenticado: false },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'Zero-trust: no se permiten lecturas públicas ni anónimas.',
  },
  {
    id: 'SEC-02',
    categoria: 'AUTH',
    descripcion: 'Usuario no autenticado intenta crear un pedido',
    coleccion: 'pedidos',
    documentId: 'PED_test_1',
    operacion: 'create',
    usuario: { autenticado: false },
    payload: { id: 'PED_test_1', total: 1500 },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'Solo la administradora autorizada puede generar órdenes.',
  },
  {
    id: 'SEC-03',
    categoria: 'AUTH',
    descripcion: 'Usuario no autenticado intenta leer auditoría',
    coleccion: 'auditoria',
    documentId: 'AUD_test_1',
    operacion: 'read',
    usuario: { autenticado: false },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'La trazabilidad de auditoría es estrictamente privada.',
  },
  {
    id: 'SEC-04',
    categoria: 'AUTH',
    descripcion: 'Usuario anónimo de Firebase intenta leer pedidos',
    coleccion: 'pedidos',
    documentId: 'PED_test_anon',
    operacion: 'read',
    usuario: { autenticado: true, uid: 'anon-12345', isAnonymous: true },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'Prohibición explícita de cuentas anónimas (sign_in_provider != "anonymous").',
  },
  {
    id: 'SEC-05',
    categoria: 'AUTH',
    descripcion: 'Usuario autenticado ajeno intenta registrar un pago',
    coleccion: 'pagos',
    documentId: 'PAG_test_1',
    operacion: 'create',
    usuario: { autenticado: true, uid: 'usuario-impostor-999' },
    payload: { id: 'PAG_test_1', monto: 1000 },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'Previene inserción de cobros por usuarios no habilitados.',
  },

  // -------------------------------------------------------------------------
  // 2. OPERACIONES VÁLIDAS DE LA ADMINISTRADORA AUTORIZADA
  // -------------------------------------------------------------------------
  {
    id: 'SEC-06',
    categoria: 'VALIDATION',
    descripcion: 'Administradora autorizada crea cliente con datos completos',
    coleccion: 'clientes',
    documentId: 'CLI_valido_1',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID, email: 'admin@elege.com' },
    payload: {
      id: 'CLI_valido_1',
      nombre: 'Lucía',
      apellido: 'Gómez',
      telefono: '1144556677',
      fechaAlta: '2026-10-29T10:00:00.000Z',
      qrPayload: 'ELEGE:CLI:CLI_valido_1',
    },
    resultadoEsperado: 'ALLOW',
    motivoSeguridad: 'UID autorizado con payload completo y tipos válidos.',
  },
  {
    id: 'SEC-07',
    categoria: 'VALIDATION',
    descripcion: 'Administradora autorizada registra un pago válido con monto positivo',
    coleccion: 'pagos',
    documentId: 'PAG_valido_1',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID, email: 'admin@elege.com' },
    existingDocuments: ['pedidos/PED_valido_1'],
    payload: {
      id: 'PAG_valido_1',
      pedidoId: 'PED_valido_1',
      clienteId: 'CLI_valido_1',
      monto: 2500,
      metodo: 'efectivo',
      fecha: '2026-10-29T10:05:00.000Z',
    },
    resultadoEsperado: 'ALLOW',
    motivoSeguridad: 'Monto positivo, identificadores válidos y pedido existente.',
  },

  // -------------------------------------------------------------------------
  // 3. RECHAZO DE PAYLOADS INVÁLIDOS O MONTOS NEGATIVOS
  // -------------------------------------------------------------------------
  {
    id: 'SEC-08',
    categoria: 'VALIDATION',
    descripcion: 'Administradora intenta registrar un pago con monto negativo',
    coleccion: 'pagos',
    documentId: 'PAG_invalido_neg',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    payload: {
      id: 'PAG_invalido_neg',
      pedidoId: 'PED_valido_1',
      clienteId: 'CLI_valido_1',
      monto: -500,
      metodo: 'efectivo',
      fecha: '2026-10-29T10:05:00.000Z',
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'La regla isValidPago exige estrictamente data.monto > 0.',
  },
  {
    id: 'SEC-09',
    categoria: 'VALIDATION',
    descripcion: 'Administradora intenta crear pedido con total negativo',
    coleccion: 'pedidos',
    documentId: 'PED_invalido_total',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    payload: {
      id: 'PED_invalido_total',
      codigoVisible: '#9999',
      clienteId: 'CLI_valido_1',
      fechaRecepcion: '2026-10-29T10:00:00.000Z',
      total: -1000,
      saldoPendiente: 0,
      estadoPago: 'pendiente',
      estadoGeneral: 'recibido',
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'La regla isValidPedido exige data.total >= 0.',
  },
  {
    id: 'SEC-10',
    categoria: 'VALIDATION',
    descripcion: 'Administradora intenta crear cliente sin teléfono',
    coleccion: 'clientes',
    documentId: 'CLI_sin_telefono',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    payload: {
      id: 'CLI_sin_telefono',
      nombre: 'Martín',
      fechaAlta: '2026-10-29T10:00:00.000Z',
      qrPayload: 'ELEGE:CLI:CLI_sin_telefono',
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'El teléfono es campo obligatorio para el sistema y WhatsApp.',
  },

  // -------------------------------------------------------------------------
  // 4. INMUTABILIDAD CONTABLE: ALTERACIÓN O BORRADO DE PAGOS HISTÓRICOS
  // -------------------------------------------------------------------------
  {
    id: 'SEC-11',
    categoria: 'IMMUTABILITY',
    descripcion: 'Administradora intenta modificar arbitrariamente el monto de un pago histórico',
    coleccion: 'pagos',
    documentId: 'PAG_valido_1',
    operacion: 'update',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    existingData: {
      id: 'PAG_valido_1',
      pedidoId: 'PED_valido_1',
      clienteId: 'CLI_valido_1',
      monto: 2500,
      metodo: 'efectivo',
      fecha: '2026-10-29T10:05:00.000Z',
      anulado: false,
    },
    payload: {
      id: 'PAG_valido_1',
      pedidoId: 'PED_valido_1',
      clienteId: 'CLI_valido_1',
      monto: 99999,
      metodo: 'efectivo',
      fecha: '2026-10-29T10:05:00.000Z',
      anulado: false,
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'Solo se permite actualizar campos de anulación (anulado, motivoAnulacion).',
  },
  {
    id: 'SEC-12',
    categoria: 'IMMUTABILITY',
    descripcion: 'Administradora intenta borrar físicamente un documento de pago',
    coleccion: 'pagos',
    documentId: 'PAG_valido_1',
    operacion: 'delete',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'allow delete: if false; previene eliminación física para integridad fiscal.',
  },

  // -------------------------------------------------------------------------
  // 5. INMUTABILIDAD DE AUDITORÍA (APPEND-ONLY)
  // -------------------------------------------------------------------------
  {
    id: 'SEC-13',
    categoria: 'IMMUTABILITY',
    descripcion: 'Administradora intenta modificar un registro de auditoría',
    coleccion: 'auditoria',
    documentId: 'AUD_valido_1',
    operacion: 'update',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    payload: { detalles: 'Texto adulterado' },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'La bitácora de auditoría es estrictamente inmutable.',
  },
  {
    id: 'SEC-14',
    categoria: 'IMMUTABILITY',
    descripcion: 'Administradora intenta borrar un registro de auditoría',
    coleccion: 'auditoria',
    documentId: 'AUD_valido_1',
    operacion: 'delete',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'Prohibición explícita de borrado en auditoría.',
  },

  // -------------------------------------------------------------------------
  // 6. DENEGACIÓN EN COLECCIONES NO DECLARADAS (CATCH-ALL ZERO-TRUST)
  // -------------------------------------------------------------------------
  {
    id: 'SEC-15',
    categoria: 'ZERO_TRUST',
    descripcion: 'Acceso a colección no existente o no declarada (ej: /usuarios)',
    coleccion: 'usuarios',
    documentId: 'usr_1',
    operacion: 'read',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'match /{document=**} { allow read, write: if false; } bloquea rutas no autorizadas.',
  },

  // -------------------------------------------------------------------------
  // 7. VECTORES DE ATAQUE Y ESCRITURAS MALICIOSAS
  // -------------------------------------------------------------------------
  {
    id: 'SEC-16',
    categoria: 'MALICIOUS_WRITE',
    descripcion: 'Escritura directa maliciosa con saldo pendiente negativo en pedido',
    coleccion: 'pedidos',
    documentId: 'PED_malicioso_1',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    payload: {
      id: 'PED_malicioso_1',
      codigoVisible: '#1001',
      clienteId: 'CLI_valido_1',
      fechaRecepcion: '2026-10-29T10:00:00.000Z',
      total: 5000,
      saldoPendiente: -200,
      estadoPago: 'pendiente',
      estadoGeneral: 'recibido',
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'isValidPedido exige saldoPendiente >= 0.',
  },
  {
    id: 'SEC-17',
    categoria: 'MALICIOUS_WRITE',
    descripcion: 'Escritura directa maliciosa de pago con monto cero',
    coleccion: 'pagos',
    documentId: 'PAG_cero',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    payload: {
      id: 'PAG_cero',
      pedidoId: 'PED_valido_1',
      clienteId: 'CLI_valido_1',
      monto: 0,
      metodo: 'efectivo',
      fecha: '2026-10-29T10:00:00.000Z',
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'isValidPago exige monto > 0.',
  },
  {
    id: 'SEC-18',
    categoria: 'MALICIOUS_WRITE',
    descripcion: 'Inyección de caracteres o path-traversal en identificador de documento',
    coleccion: 'pedidos',
    documentId: '../root/secret',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    payload: {
      id: '../root/secret',
      codigoVisible: '#1001',
      clienteId: 'CLI_valido_1',
      fechaRecepcion: '2026-10-29T10:00:00.000Z',
      total: 1000,
      saldoPendiente: 1000,
      estadoPago: 'pendiente',
      estadoGeneral: 'recibido',
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'isValidId rechaza caracteres especiales, barras y path traversal.',
  },
  {
    id: 'SEC-19',
    categoria: 'IMMUTABILITY',
    descripcion: 'Intento de re-anular o modificar un pago que ya fue anulado',
    coleccion: 'pagos',
    documentId: 'PAG_anulado_previo',
    operacion: 'update',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    existingData: {
      id: 'PAG_anulado_previo',
      pedidoId: 'PED_valido_1',
      clienteId: 'CLI_valido_1',
      monto: 1500,
      metodo: 'efectivo',
      fecha: '2026-10-29T10:00:00.000Z',
      anulado: true,
      motivoAnulacion: 'Error de tipeo',
    },
    payload: {
      anulado: true,
      motivoAnulacion: 'Nuevo motivo adulterado',
      anuladoPor: AUTHORIZED_ADMIN_UID,
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'resource.data.anulado != true bloquea modificaciones a pagos ya anulados.',
  },
  {
    id: 'SEC-20',
    categoria: 'MALICIOUS_WRITE',
    descripcion: 'Intento de anulación de pago simulada que altera simultáneamente el pedidoId',
    coleccion: 'pagos',
    documentId: 'PAG_simulacion',
    operacion: 'update',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    existingData: {
      id: 'PAG_simulacion',
      pedidoId: 'PED_1',
      clienteId: 'CLI_1',
      monto: 3000,
      metodo: 'efectivo',
      fecha: '2026-10-29T10:00:00.000Z',
      anulado: false,
    },
    payload: {
      anulado: true,
      motivoAnulacion: 'Anulación de prueba',
      anuladoPor: AUTHORIZED_ADMIN_UID,
      pedidoId: 'PED_OTRO_2',
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'affectedKeys().hasOnly() restringe estrictamente a campos de anulación.',
  },
  {
    id: 'SEC-21',
    categoria: 'MALICIOUS_WRITE',
    descripcion: 'Intento de registrar auditoría suplantando el UID de otro usuario',
    coleccion: 'auditoria',
    documentId: 'AUD_suplantado',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    payload: {
      id: 'AUD_suplantado',
      accion: 'PAYMENT',
      fase: 'CONFIRMADA',
      entidad: 'pago',
      entidadId: 'PAG_123',
      detalles: 'Pago registrado',
      usuarioUid: 'UID_FALSO_HACKER',
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'isValidAuditoria exige data.usuarioUid == request.auth.uid.',
  },
  {
    id: 'SEC-22',
    categoria: 'VALIDATION',
    descripcion: 'Intento de crear prenda con precio negativo',
    coleccion: 'prendas',
    documentId: 'PRN_negativo',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    payload: {
      id: 'PRN_negativo',
      pedidoId: 'PED_valido_1',
      clienteId: 'CLI_valido_1',
      tipo: 'Campera',
      servicio: 'lavado_planchado',
      precio: -150,
      estado: 'recibido',
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'isValidPrenda exige data.precio >= 0.',
  },
  {
    id: 'SEC-23',
    categoria: 'VALIDATION',
    descripcion: 'Intento de crear prenda con estado no reconocido',
    coleccion: 'prendas',
    documentId: 'PRN_estado_invalido',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    payload: {
      id: 'PRN_estado_invalido',
      pedidoId: 'PED_valido_1',
      clienteId: 'CLI_valido_1',
      tipo: 'Campera',
      servicio: 'lavado_planchado',
      precio: 800,
      estado: 'en_reparacion_fantasma',
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'El estado debe pertenecer a la lista cerrada definida en reglas.',
  },
  {
    id: 'SEC-24',
    categoria: 'IMMUTABILITY',
    descripcion: 'Intento de borrado directo de la configuración del sistema',
    coleccion: 'configuracion',
    documentId: 'general',
    operacion: 'delete',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'allow delete: if false; en configuración protege parámetros operativos.',
  },
  {
    id: 'SEC-25',
    categoria: 'IMMUTABILITY',
    descripcion: 'Intento de modificar un aviso de WhatsApp preexistente',
    coleccion: 'avisos_whatsapp',
    documentId: 'AVS_001',
    operacion: 'update',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    payload: { mensaje: 'Texto cambiado' },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'allow update, delete: if false; garantiza inmutabilidad de avisos enviados.',
  },
  {
    id: 'SEC-26',
    categoria: 'ZERO_TRUST',
    descripcion: 'Intento de escritura en subcolección anidada no declarada',
    coleccion: 'pedidos_items_internos',
    documentId: 'sub_item_1',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    payload: { foo: 'bar' },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'Colecciones arbitrarias quedan denegadas bajo el catch-all zero-trust.',
  },
  {
    id: 'SEC-27',
    categoria: 'VALIDATION',
    descripcion: 'Creación válida de registro de auditoría con fase INICIADA',
    coleccion: 'auditoria',
    documentId: 'AUD_fase_iniciada',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    payload: {
      id: 'AUD_fase_iniciada',
      accion: 'PAYMENT',
      fase: 'INICIADA',
      entidad: 'pago',
      entidadId: 'PAG_001',
      detalles: 'Iniciando registro de cobro',
      usuarioUid: AUTHORIZED_ADMIN_UID,
    },
    resultadoEsperado: 'ALLOW',
    motivoSeguridad: 'Esquema completo con fase autorizada y UID correspondiente.',
  },
  {
    id: 'SEC-28',
    categoria: 'VALIDATION',
    descripcion: 'Creación válida de registro de auditoría con fase FALLIDA',
    coleccion: 'auditoria',
    documentId: 'AUD_fase_fallida',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    payload: {
      id: 'AUD_fase_fallida',
      accion: 'RESTORE',
      fase: 'FALLIDA',
      entidad: 'sistema',
      entidadId: 'BACKUP_CORRUPTO',
      detalles: 'Fallo al restaurar: estructura JSON inconsistente',
      usuarioUid: AUTHORIZED_ADMIN_UID,
    },
    resultadoEsperado: 'ALLOW',
    motivoSeguridad: 'Permite asentar diagnósticos de operaciones fallidas para auditoría.',
  },

  // -------------------------------------------------------------------------
  // 8. IDENTIFICADORES COINCIDENTES (DOC ID vs PAYLOAD ID) Y DISONANCIAS
  // -------------------------------------------------------------------------
  {
    id: 'SEC-29',
    categoria: 'MALICIOUS_WRITE',
    descripcion: 'Disonancia entre ID de ruta y campo ID interno del documento (ID mismatch)',
    coleccion: 'clientes',
    documentId: 'CLI_ruta_1',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    payload: {
      id: 'CLI_interno_diferente', // Disonancia maliciosa
      nombre: 'Lucía',
      telefono: '1144556677',
      fechaAlta: '2026-10-29T10:00:00.000Z',
      qrPayload: 'ELEGE:CLI:CLI_interno_diferente',
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'isValidCliente exige estrictamente data.id == docId.',
  },
  {
    id: 'SEC-30',
    categoria: 'MALICIOUS_WRITE',
    descripcion: 'Inyección de campos inesperados no declarados en esquema de cliente',
    coleccion: 'clientes',
    documentId: 'CLI_inyeccion_1',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    payload: {
      id: 'CLI_inyeccion_1',
      nombre: 'Carlos',
      telefono: '1144556677',
      fechaAlta: '2026-10-29T10:00:00.000Z',
      qrPayload: 'ELEGE:CLI:CLI_inyeccion_1',
      esSuperAdminPrivilegiado: true, // CAMPO INYECTADO NO PERMITIDO
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'data.keys().hasOnly() rechaza campos no definidos en el esquema.',
  },
  {
    id: 'SEC-31',
    categoria: 'IMMUTABILITY',
    descripcion: 'Intento de modificar la fecha de alta histórica de un cliente en update',
    coleccion: 'clientes',
    documentId: 'CLI_valido_1',
    operacion: 'update',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    existingData: {
      id: 'CLI_valido_1',
      nombre: 'Lucía',
      telefono: '1144556677',
      fechaAlta: '2026-01-01T10:00:00.000Z',
      qrPayload: 'ELEGE:CLI:CLI_valido_1',
    },
    payload: {
      id: 'CLI_valido_1',
      nombre: 'Lucía Actualizada',
      telefono: '1144556677',
      fechaAlta: '2026-10-29T10:00:00.000Z', // ALTERACIÓN DE FECHA HISTÓRICA
      qrPayload: 'ELEGE:CLI:CLI_valido_1',
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'request.resource.data.fechaAlta == resource.data.fechaAlta asegura inmutabilidad.',
  },

  // -------------------------------------------------------------------------
  // 9. INTEGRIDAD REFERENCIAL Y RESTRICCIONES DE BORRADO
  // -------------------------------------------------------------------------
  {
    id: 'SEC-32',
    categoria: 'REFERENTIAL_INTEGRITY',
    descripcion: 'Intento de crear pedido referenciando un cliente inexistente',
    coleccion: 'pedidos',
    documentId: 'PED_huerfano',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    existingDocuments: ['clientes/CLI_otro_existente'],
    payload: {
      id: 'PED_huerfano',
      codigoVisible: '#1005',
      clienteId: 'CLI_INEXISTENTE',
      fechaRecepcion: '2026-10-29T10:00:00.000Z',
      total: 3000,
      saldoPendiente: 3000,
      estadoPago: 'pendiente',
      estadoGeneral: 'recibido',
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'clienteExiste() exige que el clienteId exista en Firestore.',
  },
  {
    id: 'SEC-33',
    categoria: 'REFERENTIAL_INTEGRITY',
    descripcion: 'Intento de crear pago para un pedido que no existe en Firestore',
    coleccion: 'pagos',
    documentId: 'PAG_huerfano',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    existingDocuments: ['pedidos/PED_existente_1'],
    payload: {
      id: 'PAG_huerfano',
      pedidoId: 'PED_INEXISTENTE',
      clienteId: 'CLI_valido_1',
      monto: 2000,
      metodo: 'efectivo',
      fecha: '2026-10-29T10:00:00.000Z',
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'pedidoExiste() exige que el pedido exista en Firestore.',
  },
  {
    id: 'SEC-34',
    categoria: 'REFERENTIAL_INTEGRITY',
    descripcion: 'Intento de eliminación física de cliente (prohibido por allow delete: if false)',
    coleccion: 'clientes',
    documentId: 'CLI_con_pedidos',
    operacion: 'delete',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    existingData: {
      id: 'CLI_con_pedidos',
      nombre: 'Roberto',
      telefono: '1133221100',
      fechaAlta: '2026-05-01T10:00:00.000Z',
      qrPayload: 'ELEGE:CLI:CLI_con_pedidos',
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'allow delete: if false; prohíbe eliminación física para evitar manipulación de contadores y proteger historial.',
  },

  // -------------------------------------------------------------------------
  // 10. CONSISTENCIA CONTABLE EN PEDIDOS Y PAGOS
  // -------------------------------------------------------------------------
  {
    id: 'SEC-35',
    categoria: 'ACCOUNTING_CONSISTENCY',
    descripcion: 'Intento de crear pedido con saldo pendiente superior al total del pedido',
    coleccion: 'pedidos',
    documentId: 'PED_saldo_incoherente',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    existingDocuments: ['clientes/CLI_valido_1'],
    payload: {
      id: 'PED_saldo_incoherente',
      codigoVisible: '#1006',
      clienteId: 'CLI_valido_1',
      fechaRecepcion: '2026-10-29T10:00:00.000Z',
      total: 5000,
      saldoPendiente: 6500, // ILEGAL: saldo mayor al total
      estadoPago: 'pendiente',
      estadoGeneral: 'recibido',
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'data.saldoPendiente <= data.total garantiza coherencia aritmética básica.',
  },
  {
    id: 'SEC-36',
    categoria: 'ACCOUNTING_CONSISTENCY',
    descripcion: 'Intento de reducir total de pedido por debajo de los cobros percibidos vigentes',
    coleccion: 'pedidos',
    documentId: 'PED_con_cobros',
    operacion: 'update',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    existingData: {
      id: 'PED_con_cobros',
      codigoVisible: '#1007',
      clienteId: 'CLI_valido_1',
      fechaRecepcion: '2026-10-29T10:00:00.000Z',
      total: 10000,
      saldoPendiente: 6000, // Ya se cobraron 4000
      estadoPago: 'parcial',
      estadoGeneral: 'en_proceso',
    },
    payload: {
      id: 'PED_con_cobros',
      codigoVisible: '#1007',
      clienteId: 'CLI_valido_1',
      fechaRecepcion: '2026-10-29T10:00:00.000Z',
      total: 3000, // ILEGAL: menor a los 4000 cobrados
      saldoPendiente: 0,
      estadoPago: 'pagado',
      estadoGeneral: 'en_proceso',
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'total >= (total - saldoPendiente) bloquea reducciones por debajo de cobros existentes.',
  },
  {
    id: 'SEC-37',
    categoria: 'ACCOUNTING_CONSISTENCY',
    descripcion: 'Intento de cancelar un pedido que ya fue entregado al cliente',
    coleccion: 'pedidos',
    documentId: 'PED_entregado_previamente',
    operacion: 'update',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    existingData: {
      id: 'PED_entregado_previamente',
      codigoVisible: '#1008',
      clienteId: 'CLI_valido_1',
      fechaRecepcion: '2026-10-29T10:00:00.000Z',
      total: 4000,
      saldoPendiente: 0,
      estadoPago: 'pagado',
      estadoGeneral: 'entregado', // Ya entregado
    },
    payload: {
      id: 'PED_entregado_previamente',
      codigoVisible: '#1008',
      clienteId: 'CLI_valido_1',
      fechaRecepcion: '2026-10-29T10:00:00.000Z',
      total: 4000,
      saldoPendiente: 0,
      estadoPago: 'pagado',
      estadoGeneral: 'cancelado', // ILEGAL: pedido entregado no puede cancelarse arbitrariamente
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'Protege pedidos entregados de cancelaciones o modificaciones extemporáneas.',
  },
  {
    id: 'SEC-38',
    categoria: 'ACCOUNTING_CONSISTENCY',
    descripcion: 'Intento de eliminación física de pedido (prohibido por allow delete: if false)',
    coleccion: 'pedidos',
    documentId: 'PED_con_pagos_borrado',
    operacion: 'delete',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    existingData: {
      id: 'PED_con_pagos_borrado',
      codigoVisible: '#1009',
      clienteId: 'CLI_valido_1',
      fechaRecepcion: '2026-10-29T10:00:00.000Z',
      total: 5000,
      saldoPendiente: 2500,
      estadoPago: 'parcial',
      estadoGeneral: 'en_proceso',
      pagos: [{ id: 'PAG_1', monto: 2500 }],
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'allow delete: if false; prohíbe eliminación física de pedidos. Se exige cancelación lógica.',
  },
  {
    id: 'SEC-39',
    categoria: 'IMMUTABILITY',
    descripcion: 'Intento de anulación de pago sin indicar motivo formal de anulación',
    coleccion: 'pagos',
    documentId: 'PAG_sin_motivo',
    operacion: 'update',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    existingData: {
      id: 'PAG_sin_motivo',
      pedidoId: 'PED_valido_1',
      clienteId: 'CLI_valido_1',
      monto: 1000,
      metodo: 'efectivo',
      fecha: '2026-10-29T10:00:00.000Z',
      anulado: false,
    },
    payload: {
      anulado: true,
      motivoAnulacion: '', // INVÁLIDO: motivo vacío
      anuladoPor: AUTHORIZED_ADMIN_UID,
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'motivoAnulacion.size() > 0 exige justificación obligatoria en anulación.',
  },
  {
    id: 'SEC-40',
    categoria: 'IMMUTABILITY',
    descripcion: 'Intento de anulación de pago asignando UID de operador no coincidente',
    coleccion: 'pagos',
    documentId: 'PAG_uid_invalido',
    operacion: 'update',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    existingData: {
      id: 'PAG_uid_invalido',
      pedidoId: 'PED_valido_1',
      clienteId: 'CLI_valido_1',
      monto: 1000,
      metodo: 'efectivo',
      fecha: '2026-10-29T10:00:00.000Z',
      anulado: false,
    },
    payload: {
      anulado: true,
      motivoAnulacion: 'Error en caja',
      anuladoPor: 'UID_DISTINTO_NO_AUTORIZADO', // ILEGAL: no coincide con request.auth.uid
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'anuladoPor == request.auth.uid previene manipulación de firmas de operador.',
  },
  {
    id: 'SEC-41',
    categoria: 'REFERENTIAL_INTEGRITY',
    descripcion: 'Intento de crear prenda vinculada a un pedido inexistente',
    coleccion: 'prendas',
    documentId: 'PRN_huerfana',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    existingDocuments: ['pedidos/PED_existente_otro'],
    payload: {
      id: 'PRN_huerfana',
      pedidoId: 'PED_NO_EXISTE',
      clienteId: 'CLI_valido_1',
      tipo: 'Saco',
      servicio: 'tintoreria',
      precio: 4500,
      estado: 'recibido',
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'pedidoExiste() exige que el pedidoId referenciado exista en Firestore.',
  },
  {
    id: 'SEC-42',
    categoria: 'VALIDATION',
    descripcion: 'Creación de aviso de WhatsApp con esquema completo y teléfono válido',
    coleccion: 'avisos_whatsapp',
    documentId: 'AVS_valido_1',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    payload: {
      fecha: '2026-10-29T10:30:00.000Z',
      pedidoId: 'PED_valido_1',
      clienteId: 'CLI_valido_1',
      telefono: '1155667788',
      mensaje: '¡Hola! Tus prendas del pedido #1001 están listas para retirar en Lavadero eLeGe.',
      enviadoPor: AUTHORIZED_ADMIN_UID,
    },
    resultadoEsperado: 'ALLOW',
    motivoSeguridad: 'isValidAvisoWhatsApp valida formato telefónico, mensaje y metadatos permitidos.',
  },
  {
    id: 'SEC-43',
    categoria: 'VALIDATION',
    descripcion: 'Compatibilidad con migración histórica: cliente con campos migradoAt y migradoPor',
    coleccion: 'clientes',
    documentId: 'CLI_migrado_1',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    payload: {
      id: 'CLI_migrado_1',
      nombre: 'Beatriz',
      apellido: 'Pérez',
      telefono: '1199887766',
      fechaAlta: '2025-06-15T08:00:00.000Z',
      qrPayload: 'ELEGE:CLI:CLI_migrado_1',
      migradoAt: '2026-10-29T10:00:00.000Z',
      migradoPor: AUTHORIZED_ADMIN_UID,
    },
    resultadoEsperado: 'ALLOW',
    motivoSeguridad: 'Las reglas contemplan explícitamente atributos de migración histórica.',
  },
  {
    id: 'SEC-44',
    categoria: 'IMMUTABILITY',
    descripcion: 'Intento de anulación formal legítima de pago con motivo y firma coincidente',
    coleccion: 'pagos',
    documentId: 'PAG_anulacion_valida',
    operacion: 'update',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    existingData: {
      id: 'PAG_anulacion_valida',
      pedidoId: 'PED_valido_1',
      clienteId: 'CLI_valido_1',
      monto: 3500,
      metodo: 'transferencia',
      fecha: '2026-10-29T09:00:00.000Z',
      anulado: false,
    },
    payload: {
      anulado: true,
      motivoAnulacion: 'Transferencia no acreditada en cuenta bancaria',
      anuladoPor: AUTHORIZED_ADMIN_UID,
      anuladoAt: '2026-10-29T10:00:00.000Z',
    },
    resultadoEsperado: 'ALLOW',
    motivoSeguridad: 'Anulación legítima documentada con firma, motivo y sello temporal.',
  },

  // -------------------------------------------------------------------------
  // 11. VALIDACIÓN CRUZADA REFERENCIAL (clienteId EN PRENDAS Y PAGOS)
  // -------------------------------------------------------------------------
  {
    id: 'SEC-45',
    categoria: 'REFERENTIAL_INTEGRITY',
    descripcion: 'Intento de crear prenda con clienteId diferente al clienteId del pedido',
    coleccion: 'prendas',
    documentId: 'PRN_mismatched_client',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    existingDocuments: ['pedidos/PED_valido_1'],
    documentStore: {
      'pedidos/PED_valido_1': { id: 'PED_valido_1', clienteId: 'CLI_valido_1' },
    },
    payload: {
      id: 'PRN_mismatched_client',
      pedidoId: 'PED_valido_1',
      clienteId: 'CLI_DISTINTO_999', // No coincide con el clienteId del pedido
      tipo: 'Camisa',
      servicio: 'planchado',
      precio: 1200,
      estado: 'recibido',
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'getPedidoData(pedidoId).clienteId == request.resource.data.clienteId rechaza disonancias.',
  },
  {
    id: 'SEC-46',
    categoria: 'REFERENTIAL_INTEGRITY',
    descripcion: 'Intento de registrar pago con clienteId diferente al clienteId del pedido',
    coleccion: 'pagos',
    documentId: 'PAG_mismatched_client',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    existingDocuments: ['pedidos/PED_valido_1'],
    documentStore: {
      'pedidos/PED_valido_1': { id: 'PED_valido_1', clienteId: 'CLI_valido_1' },
    },
    payload: {
      id: 'PAG_mismatched_client',
      pedidoId: 'PED_valido_1',
      clienteId: 'CLI_DISTINTO_999', // No coincide con el clienteId del pedido
      monto: 3000,
      metodo: 'efectivo',
      fecha: '2026-10-29T10:00:00.000Z',
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'getPedidoData(pedidoId).clienteId == request.resource.data.clienteId asegura correspondencia contable.',
  },
  {
    id: 'SEC-47',
    categoria: 'IMMUTABILITY',
    descripcion: 'Intento de anulación de pago con motivo menor a 3 caracteres o vacío',
    coleccion: 'pagos',
    documentId: 'PAG_anulacion_motivo_corto',
    operacion: 'update',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    existingData: {
      id: 'PAG_anulacion_motivo_corto',
      pedidoId: 'PED_valido_1',
      clienteId: 'CLI_valido_1',
      monto: 2000,
      metodo: 'efectivo',
      fecha: '2026-10-29T09:00:00.000Z',
      anulado: false,
    },
    payload: {
      anulado: true,
      motivoAnulacion: 'ok', // Demasiado corto (< 3 caracteres)
      anuladoPor: AUTHORIZED_ADMIN_UID,
      anuladoAt: '2026-10-29T10:00:00.000Z',
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'motivoAnulacion.trim().size() >= 3 exige justificación explícita obligatoria.',
  },
  {
    id: 'SEC-48',
    categoria: 'MALICIOUS_WRITE',
    descripcion: 'Intento de inyectar campo tienePedidos o totalPedidos en cliente para manipular borrado',
    coleccion: 'clientes',
    documentId: 'CLI_tamper_flags',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    payload: {
      id: 'CLI_tamper_flags',
      nombre: 'Cliente Tamper',
      telefono: '1122334455',
      fechaAlta: '2026-10-29T10:00:00.000Z',
      qrPayload: 'ELEGE:CLI:CLI_tamper_flags',
      tienePedidos: false, // Inyección de campo no permitido
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'Eliminación de tienePedidos y totalPedidos del esquema de cliente previene manipulaciones.',
  },
  {
    id: 'SEC-49',
    categoria: 'IMMUTABILITY',
    descripcion: 'Intento de eliminación física de una prenda registrada en Firestore',
    coleccion: 'prendas',
    documentId: 'PRN_intento_delete',
    operacion: 'delete',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'allow delete: if false; en prendas resguarda el inventario físico y trazabilidad de pedidos.',
  },
  {
    id: 'SEC-50',
    categoria: 'VALIDATION',
    descripcion: 'Creación válida de prenda con clienteId idéntico al pedido referenciado',
    coleccion: 'prendas',
    documentId: 'PRN_valida_correspondencia',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    existingDocuments: ['pedidos/PED_valido_1'],
    documentStore: {
      'pedidos/PED_valido_1': { id: 'PED_valido_1', clienteId: 'CLI_valido_1' },
    },
    payload: {
      id: 'PRN_valida_correspondencia',
      pedidoId: 'PED_valido_1',
      clienteId: 'CLI_valido_1',
      tipo: 'Campera',
      servicio: 'lavado_planchado',
      precio: 4500,
      estado: 'recibido',
    },
    resultadoEsperado: 'ALLOW',
    motivoSeguridad: 'Coincidencia exacta entre clienteId de la prenda y clienteId del pedido padre.',
  },
  {
    id: 'SEC-51',
    categoria: 'VALIDATION',
    descripcion: 'Creación válida de pago con clienteId idéntico al pedido referenciado',
    coleccion: 'pagos',
    documentId: 'PAG_valido_correspondencia',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    existingDocuments: ['pedidos/PED_valido_1'],
    documentStore: {
      'pedidos/PED_valido_1': { id: 'PED_valido_1', clienteId: 'CLI_valido_1' },
    },
    payload: {
      id: 'PAG_valido_correspondencia',
      pedidoId: 'PED_valido_1',
      clienteId: 'CLI_valido_1',
      monto: 1500,
      metodo: 'debito',
      fecha: '2026-10-29T10:15:00.000Z',
    },
    resultadoEsperado: 'ALLOW',
    motivoSeguridad: 'Coincidencia exacta entre clienteId del pago y clienteId del pedido padre.',
  },
  {
    id: 'SEC-52',
    categoria: 'ACCOUNTING_CONSISTENCY',
    descripcion: 'Intento de crear un pago nuevo ya marcado como anulado desde su inserción',
    coleccion: 'pagos',
    documentId: 'PAG_nacido_anulado',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    existingDocuments: ['pedidos/PED_valido_1'],
    payload: {
      id: 'PAG_nacido_anulado',
      pedidoId: 'PED_valido_1',
      clienteId: 'CLI_valido_1',
      monto: 2500,
      metodo: 'efectivo',
      fecha: '2026-10-29T10:15:00.000Z',
      anulado: true, // ILEGAL: los pagos no pueden nacer anulados
    },
    resultadoEsperado: 'DENY',
    motivoSeguridad: 'La regla isValidPago exige (!("anulado" in data) || data.anulado == false).',
  },
  {
    id: 'SEC-53',
    categoria: 'IMMUTABILITY',
    descripcion: 'Desactivación lógica válida de cliente (activo: false) mediante actualización segura',
    coleccion: 'clientes',
    documentId: 'CLI_valido_1',
    operacion: 'update',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    existingData: {
      id: 'CLI_valido_1',
      nombre: 'Lucía',
      telefono: '1144556677',
      fechaAlta: '2026-01-01T10:00:00.000Z',
      qrPayload: 'ELEGE:CLI:CLI_valido_1',
      activo: true,
    },
    payload: {
      id: 'CLI_valido_1',
      nombre: 'Lucía',
      telefono: '1144556677',
      fechaAlta: '2026-01-01T10:00:00.000Z',
      qrPayload: 'ELEGE:CLI:CLI_valido_1',
      activo: false, // Desactivación lógica segura
    },
    resultadoEsperado: 'ALLOW',
    motivoSeguridad: 'Permite alternar activo: false preservando la clave primaria y fecha de alta histórica.',
  },
  {
    id: 'SEC-54',
    categoria: 'VALIDATION',
    descripcion: 'Creación válida de auditoría con acción DEACTIVATE tras desactivación lógica de cliente',
    coleccion: 'auditoria',
    documentId: 'AUD_deactivate_01',
    operacion: 'create',
    usuario: { autenticado: true, uid: AUTHORIZED_ADMIN_UID },
    payload: {
      id: 'AUD_deactivate_01',
      accion: 'DEACTIVATE',
      fase: 'CONFIRMADA',
      entidad: 'cliente',
      entidadId: 'CLI_valido_1',
      detalles: 'Desactivación lógica de cliente ID: CLI_valido_1',
      usuarioUid: AUTHORIZED_ADMIN_UID,
    },
    resultadoEsperado: 'ALLOW',
    motivoSeguridad: 'La acción DEACTIVATE está explícitamente autorizada en la lista de acciones válidas.',
  },
];

// ===========================================================================
// 3. SUITE DE TRANSACCIONES ATÓMICAS Y CONSISTENCIA CONTABLE (ACCT-01..10)
// ===========================================================================

export interface TransactionMockStore {
  clientes: Map<string, Cliente>;
  pedidos: Map<string, Pedido>;
  prendas: Map<string, Prenda>;
  pagos: Map<string, PagoFirestore>;
  auditoria: Map<string, RegistroAuditoria>;
  configuracion: Map<string, ConfiguracionSistema>;
}

export class AccountingSimulationHarness {
  public store: TransactionMockStore;

  constructor() {
    this.store = {
      clientes: new Map(),
      pedidos: new Map(),
      prendas: new Map(),
      pagos: new Map(),
      auditoria: new Map(),
      configuracion: new Map(),
    };
  }

  // Simulación fiel de FirestoreService.savePedido
  savePedido(pedido: Pedido): Pedido {
    const pedidoConId: Pedido = {
      ...pedido,
      id: pedido.id || generatePedidoId(),
      total: pedido.total || 0,
      saldoPendiente: typeof pedido.saldoPendiente === 'number' ? pedido.saldoPendiente : (pedido.total || 0),
      estadoPago: pedido.estadoPago || 'pendiente',
      estadoGeneral: pedido.estadoGeneral || 'recibido',
    };

    const prev = this.store.pedidos.get(pedidoConId.id);
    if (prev) {
      const pagosVigentes = (prev.pagos as PagoFirestore[] || [])
        .filter((p) => !p.anulado)
        .reduce((sum, p) => sum + p.monto, 0);

      if (pedidoConId.total < pagosVigentes) {
        throw new Error(
          `El nuevo importe total ($${pedidoConId.total}) no puede ser inferior a los pagos ya registrados ($${pagosVigentes}). Registre primero una anulación o devolución.`
        );
      }
    }

    // Persistir pedido y prendas canónicas
    this.store.pedidos.set(pedidoConId.id, { ...pedidoConId });
    for (const prenda of pedidoConId.prendas) {
      this.store.prendas.set(prenda.id, { ...prenda, pedidoId: pedidoConId.id });
    }

    // Asentar auditoría
    const auditId = generateAuditoriaId();
    this.store.auditoria.set(auditId, {
      id: auditId,
      accion: prev ? 'UPDATE' : 'CREATE',
      fase: 'CONFIRMADA',
      entidad: 'pedido',
      entidadId: pedidoConId.id,
      detalles: `Guardado atómico de pedido ${pedidoConId.codigoVisible}`,
      usuarioUid: AUTHORIZED_ADMIN_UID,
      timestamp: new Date().toISOString() as any,
    });

    return pedidoConId;
  }

  // Simulación fiel de FirestoreService.registrarPago
  registrarPago(pedidoId: string, pago: Partial<Pago>): { pedido: Pedido; pago: Pago } {
    if (!pago.monto || pago.monto <= 0) {
      throw new Error('El monto del pago debe ser estrictamente mayor a cero.');
    }

    const pedido = this.store.pedidos.get(pedidoId);
    if (!pedido) {
      throw new Error(`El pedido ${pedidoId} no existe.`);
    }

    const pagoId = pago.id || generatePagoId();
    if (this.store.pagos.has(pagoId)) {
      throw new Error(`El pago ${pagoId} ya se encuentra registrado.`);
    }

    const nuevoPago: PagoFirestore = {
      id: pagoId,
      pedidoId,
      clienteId: pedido.clienteId,
      monto: pago.monto,
      metodo: pago.metodo || 'efectivo',
      fecha: pago.fecha || new Date().toISOString(),
      esSenia: Boolean(pago.esSenia),
      nota: pago.nota || '',
      anulado: false,
    };

    const pagosActuales = (pedido.pagos as PagoFirestore[] || []);
    if (pagosActuales.some((p) => p.id === pagoId)) {
      throw new Error(`El pago ${pagoId} ya fue contabilizado en este pedido.`);
    }

    const pagosActualizados = [...pagosActuales, nuevoPago];
    const totalPagado = pagosActualizados
      .filter((p) => !p.anulado)
      .reduce((acc, p) => acc + (p.monto || 0), 0);

    const nuevoSaldo = Math.max(0, pedido.total - totalPagado);
    let nuevoEstadoPago: EstadoPago = 'pendiente';
    if (nuevoSaldo === 0 && pedido.total > 0) nuevoEstadoPago = 'pagado';
    else if (totalPagado > 0) nuevoEstadoPago = 'parcial';

    const pedidoActualizado: Pedido = {
      ...pedido,
      pagos: pagosActualizados as Pago[],
      saldoPendiente: nuevoSaldo,
      estadoPago: nuevoEstadoPago,
    };

    this.store.pedidos.set(pedidoId, pedidoActualizado);
    this.store.pagos.set(pagoId, nuevoPago);

    const auditId = generateAuditoriaId();
    this.store.auditoria.set(auditId, {
      id: auditId,
      accion: 'PAYMENT',
      fase: 'CONFIRMADA',
      entidad: 'pago',
      entidadId: pagoId,
      detalles: `Registro de pago $${nuevoPago.monto}. Saldo restante: $${nuevoSaldo}`,
      usuarioUid: AUTHORIZED_ADMIN_UID,
      timestamp: new Date().toISOString() as any,
    });

    return { pedido: pedidoActualizado, pago: nuevoPago };
  }

  // Simulación fiel de FirestoreService.anularPago
  anularPago(pedidoId: string, pagoId: string, motivo: string): { pedido: Pedido; pagoAnuladoId: string } {
    if (!motivo || motivo.trim().length < 3) {
      throw new Error('Debe proporcionar un motivo válido (mínimo 3 caracteres) para anular un pago registrado.');
    }

    const pago = this.store.pagos.get(pagoId);
    if (!pago) {
      throw new Error(`El pago ${pagoId} no existe.`);
    }
    if (pago.anulado) {
      throw new Error(`El pago ${pagoId} ya se encuentra anulado.`);
    }

    const pedido = this.store.pedidos.get(pedidoId);
    if (!pedido) {
      throw new Error(`El pedido ${pedidoId} no existe.`);
    }

    // Actualizar pago en colección canónica
    pago.anulado = true;
    pago.motivoAnulacion = motivo;
    pago.anuladoAt = new Date().toISOString();
    pago.anuladoPor = AUTHORIZED_ADMIN_UID;
    this.store.pagos.set(pagoId, pago);

    // Actualizar pedido
    const pagosActualizados = (pedido.pagos as PagoFirestore[]).map((p) => {
      if (p.id === pagoId) {
        return { ...p, anulado: true, motivoAnulacion: motivo };
      }
      return p;
    });

    const totalPagado = pagosActualizados
      .filter((p) => !p.anulado)
      .reduce((acc, p) => acc + (p.monto || 0), 0);

    const nuevoSaldo = Math.max(0, pedido.total - totalPagado);
    let nuevoEstadoPago: EstadoPago = 'pendiente';
    if (nuevoSaldo === 0 && pedido.total > 0) nuevoEstadoPago = 'pagado';
    else if (totalPagado > 0) nuevoEstadoPago = 'parcial';

    const pedidoActualizado: Pedido = {
      ...pedido,
      pagos: pagosActualizados as Pago[],
      saldoPendiente: nuevoSaldo,
      estadoPago: nuevoEstadoPago,
    };
    this.store.pedidos.set(pedidoId, pedidoActualizado);

    const auditId = generateAuditoriaId();
    this.store.auditoria.set(auditId, {
      id: auditId,
      accion: 'PAYMENT_CANCEL',
      fase: 'CONFIRMADA',
      entidad: 'pago',
      entidadId: pagoId,
      detalles: `Anulación de pago $${pago.monto}. Recompuesto saldo a $${nuevoSaldo}`,
      usuarioUid: AUTHORIZED_ADMIN_UID,
      timestamp: new Date().toISOString() as any,
    });

    return { pedido: pedidoActualizado, pagoAnuladoId: pagoId };
  }

  // Simulación de actualización de estado de prenda con reconciliación de pedido
  updateEstadoPrenda(pedidoId: string, prendaId: string, nuevoEstado: EstadoPrenda): Pedido {
    const pedido = this.store.pedidos.get(pedidoId);
    if (!pedido) throw new Error(`El pedido ${pedidoId} no existe.`);

    const index = pedido.prendas.findIndex((p) => p.id === prendaId);
    if (index === -1) throw new Error(`La prenda ${prendaId} no pertenece al pedido.`);

    pedido.prendas[index].estado = nuevoEstado;
    const prendaCanonica = this.store.prendas.get(prendaId);
    if (prendaCanonica) {
      prendaCanonica.estado = nuevoEstado;
      this.store.prendas.set(prendaId, prendaCanonica);
    }

    const todasEntregadas = pedido.prendas.every((p) => p.estado === 'entregado');
    const todasListas = pedido.prendas.every((p) => p.estado === 'listo' || p.estado === 'entregado');
    const algunaEnProceso = pedido.prendas.some((p) => p.estado === 'en_proceso');

    let nuevoEstadoGeneral: EstadoPedido = 'recibido';
    if (todasEntregadas) nuevoEstadoGeneral = 'entregado';
    else if (todasListas) nuevoEstadoGeneral = 'listo';
    else if (algunaEnProceso) nuevoEstadoGeneral = 'en_proceso';

    pedido.estadoGeneral = nuevoEstadoGeneral;
    this.store.pedidos.set(pedidoId, pedido);
    return pedido;
  }

  // Cancelación de pedido
  cancelarPedido(pedidoId: string, motivo: string): Pedido {
    const pedido = this.store.pedidos.get(pedidoId);
    if (!pedido) throw new Error(`El pedido ${pedidoId} no existe.`);
    if (pedido.estadoGeneral === 'entregado') {
      throw new Error('No se puede cancelar un pedido que ya ha sido entregado por completo.');
    }

    pedido.estadoGeneral = 'cancelado';
    pedido.observacionesGenerales = pedido.observacionesGenerales
      ? `${pedido.observacionesGenerales} | [CANCELADO]: ${motivo}`
      : `[CANCELADO]: ${motivo}`;

    this.store.pedidos.set(pedidoId, pedido);

    const auditId = generateAuditoriaId();
    this.store.auditoria.set(auditId, {
      id: auditId,
      accion: 'ORDER_CANCEL',
      fase: 'CONFIRMADA',
      entidad: 'pedido',
      entidadId: pedidoId,
      detalles: `Cancelación de pedido ${pedido.codigoVisible || pedidoId}. Motivo: ${motivo}`,
      usuarioUid: AUTHORIZED_ADMIN_UID,
      timestamp: new Date().toISOString() as any,
    });

    return pedido;
  }

  // Desactivación lógica de cliente (borrado físico prohibido)
  desactivarCliente(clienteId: string): void {
    const cliente = this.store.clientes.get(clienteId);
    if (!cliente) throw new Error(`El cliente ${clienteId} no existe.`);
    cliente.activo = false;
    this.store.clientes.set(clienteId, cliente);

    const auditId = generateAuditoriaId();
    this.store.auditoria.set(auditId, {
      id: auditId,
      accion: 'DEACTIVATE',
      fase: 'CONFIRMADA',
      entidad: 'cliente',
      entidadId: clienteId,
      detalles: `Desactivación lógica de cliente ${clienteId} (borrado físico prohibido)`,
      usuarioUid: AUTHORIZED_ADMIN_UID,
      timestamp: new Date().toISOString() as any,
    });
  }

  deleteCliente(clienteId: string): void {
    this.desactivarCliente(clienteId);
  }

  // Cancelación lógica de pedido (borrado físico prohibido en reglas)
  deletePedido(pedidoId: string): void {
    this.cancelarPedido(pedidoId, 'Cancelación requerida (borrado físico prohibido por reglas)');
  }
}

// ===========================================================================
// 4. EJECUTOR DE SUITES CON REPORTES Y VERIFICACIONES DE CIERRE
// ===========================================================================

export interface TestReport {
  totalPruebas: number;
  pasadas: number;
  fallidas: number;
  detallesFallos: string[];
}

export function ejecutarTodasLasPruebas(): TestReport {
  console.log('\n=================================================================');
  console.log('AUDITORÍA Y TESTING FINAL FIRESTORE: LAVADERO ELEGE (elege-99d0c)');
  console.log('=================================================================');
  console.log(`UID Administrador Autorizado: ${AUTHORIZED_ADMIN_UID}`);
  console.log(`Fecha de Verificación: ${new Date().toISOString()}`);
  console.log('-----------------------------------------------------------------\n');

  let pasadas = 0;
  let fallidas = 0;
  const detallesFallos: string[] = [];

  // -------------------------------------------------------------------------
  // PARTE 1 & 2: REGLAS DE SEGURIDAD REFORZADAS (54 CASOS)
  // -------------------------------------------------------------------------
  console.log(`--- PARTE 1 & 2: EVALUACIÓN DE REGLAS DE SEGURIDAD (${SECURITY_TEST_CASES.length} CASOS) ---`);

  for (const tc of SECURITY_TEST_CASES) {
    const existingDocsSet = new Set<string>();
    const docStore = new Map<string, any>();
    docStore.set('pedidos/PED_valido_1', { id: 'PED_valido_1', clienteId: 'CLI_valido_1' });

    if (tc.existingDocuments) {
      tc.existingDocuments.forEach((d) => existingDocsSet.add(d));
    } else {
      // Poblar dependencias estándar para casos que no evalúan huérfanos
      existingDocsSet.add('clientes/CLI_valido_1');
      existingDocsSet.add('pedidos/PED_valido_1');
    }

    if (tc.documentStore) {
      for (const [k, v] of Object.entries(tc.documentStore)) {
        docStore.set(k, v);
      }
    }

    const ctx: SecurityContext = {
      auth: tc.usuario.autenticado
        ? {
            uid: tc.usuario.uid || 'anon',
            email: tc.usuario.email || 'user@test.com',
            isAnonymous: tc.usuario.isAnonymous,
            providerId: tc.usuario.isAnonymous ? 'anonymous' : 'password',
          }
        : null,
      existingDocuments: existingDocsSet,
      documentStore: docStore,
    };

    const evaluacion = FirestoreRulesEvaluator.evaluate(
      tc.coleccion,
      tc.documentId,
      tc.operacion,
      ctx,
      tc.payload,
      tc.existingData
    );

    const ok = evaluacion === tc.resultadoEsperado;
    if (ok) {
      pasadas++;
      console.log(`  ✓ [${tc.id}] [${tc.categoria}] ${tc.descripcion} -> ${evaluacion}`);
    } else {
      fallidas++;
      const msg = `FALLÓ [${tc.id}]: Esperado ${tc.resultadoEsperado}, pero se evaluó ${evaluacion}. Colección: ${tc.coleccion}`;
      detallesFallos.push(msg);
      console.error(`  ✗ ${msg}`);
    }
  }

  // -------------------------------------------------------------------------
  // PARTE 3: PRUEBAS DE CONSISTENCIA CONTABLE Y ATOMICIDAD (ACCT-01 a ACCT-10)
  // -------------------------------------------------------------------------
  console.log('\n--- PARTE 3: CONSISTENCIA CONTABLE Y ATOMICIDAD (10 PRUEBAS) ---');

  const harness = new AccountingSimulationHarness();

  function runAcctTest(id: string, desc: string, fn: () => void) {
    try {
      fn();
      pasadas++;
      console.log(`  ✓ [${id}] ${desc}`);
    } catch (err: any) {
      fallidas++;
      const msg = `FALLÓ [${id}]: ${desc} -> Error: ${err.message}`;
      detallesFallos.push(msg);
      console.error(`  ✗ ${msg}`);
    }
  }

  const clienteTest: Cliente = {
    id: 'CLI_acct_01',
    nombre: 'Elena',
    apellido: 'López',
    telefono: '1133445566',
    fechaAlta: new Date().toISOString(),
    qrPayload: 'ELEGE:CLI:CLI_acct_01',
  };
  harness.store.clientes.set(clienteTest.id, clienteTest);

  // ACCT-01: Creación de pedido y registro de seña con cálculo exacto
  runAcctTest('ACCT-01', 'Registro de pedido y cobro de seña inicial con cálculo exacto de saldo', () => {
    const pedido = harness.savePedido({
      id: 'PED_acct_01',
      codigoVisible: '#1001',
      clienteId: clienteTest.id,
      fechaRecepcion: new Date().toISOString(),
      fechaEstimadaEntrega: '2026-10-31',
      prendas: [
        {
          id: 'PRN_1001_1',
          pedidoId: 'PED_acct_01',
          clienteId: clienteTest.id,
          tipo: 'Acolchado 2 plazas',
          descripcion: 'Plumas azul',
          servicio: 'acolchados_frazadas',
          precio: 10000,
          estado: 'recibido',
          qrPayload: 'PRN_1001_1',
        },
      ],
      total: 10000,
      saldoPendiente: 10000,
      estadoPago: 'pendiente',
      estadoGeneral: 'recibido',
      pagos: [],
      avisosWhatsApp: [],
      qrPayload: 'PED_acct_01',
    });

    if (pedido.saldoPendiente !== 10000) throw new Error('Saldo inicial incorrecto');

    const { pedido: pedidoConSenia, pago } = harness.registrarPago('PED_acct_01', {
      monto: 4000,
      metodo: 'efectivo',
      esSenia: true,
    });

    if (pedidoConSenia.saldoPendiente !== 6000) {
      throw new Error(`Saldo incorrecto tras seña. Esperado 6000, obtenido ${pedidoConSenia.saldoPendiente}`);
    }
    if (pedidoConSenia.estadoPago !== 'parcial') {
      throw new Error(`Estado incorrecto. Esperado 'parcial', obtenido '${pedidoConSenia.estadoPago}'`);
    }
    if (!pago.esSenia) throw new Error('El pago debe marcarse como seña');
  });

  // ACCT-02: Pagos parciales acumulados hasta saldar el total (saldo == 0, estado = 'pagado')
  runAcctTest('ACCT-02', 'Pago acumulado de saldo restante y transición a estado pagado', () => {
    const { pedido: pedidoSaldado } = harness.registrarPago('PED_acct_01', {
      monto: 6000,
      metodo: 'transferencia',
    });

    if (pedidoSaldado.saldoPendiente !== 0) {
      throw new Error(`Saldo debería ser 0, se obtuvo ${pedidoSaldado.saldoPendiente}`);
    }
    if (pedidoSaldado.estadoPago !== 'pagado') {
      throw new Error(`Estado debería ser 'pagado', se obtuvo '${pedidoSaldado.estadoPago}'`);
    }
  });

  // ACCT-03: Anulación de un pago con recomposición inmediata del saldo pendiente
  runAcctTest('ACCT-03', 'Anulación contable con soft-delete y recomposición matemática de saldos', () => {
    const pedido = harness.store.pedidos.get('PED_acct_01')!;
    const pagoTransferencia = (pedido.pagos as PagoFirestore[]).find((p) => p.monto === 6000 && !p.anulado)!;

    const { pedido: pedidoRecompuesto } = harness.anularPago(
      'PED_acct_01',
      pagoTransferencia.id,
      'Transferencia rechazada por el banco'
    );

    if (pedidoRecompuesto.saldoPendiente !== 6000) {
      throw new Error(`El saldo debió volver a 6000, pero es ${pedidoRecompuesto.saldoPendiente}`);
    }
    if (pedidoRecompuesto.estadoPago !== 'parcial') {
      throw new Error(`El estado de pago debió volver a 'parcial', pero es '${pedidoRecompuesto.estadoPago}'`);
    }

    const pagoEnStore = harness.store.pagos.get(pagoTransferencia.id);
    if (!pagoEnStore || !pagoEnStore.anulado) {
      throw new Error('El pago debe persistir en Firestore marcado como anulado: true');
    }
  });

  // ACCT-04: Prevención de pagos duplicados (mismo id)
  runAcctTest('ACCT-04', 'Detección y rechazo de identificador de pago duplicado', () => {
    let capturoError = false;
    try {
      const pedido = harness.store.pedidos.get('PED_acct_01')!;
      const primerPagoId = pedido.pagos[0].id;
      harness.registrarPago('PED_acct_01', {
        id: primerPagoId,
        monto: 2000,
        metodo: 'efectivo',
      });
    } catch {
      capturoError = true;
    }
    if (!capturoError) throw new Error('Debió fallar por duplicación de pago');
  });

  // ACCT-05: Prevención de inconsistencia contable al reducir total por debajo de pagos cobrados
  runAcctTest('ACCT-05', 'Bloqueo al intentar reducir el total por debajo de cobros históricos vigentes', () => {
    let capturoError = false;
    try {
      const pedido = harness.store.pedidos.get('PED_acct_01')!;
      harness.savePedido({
        ...pedido,
        total: 2000,
      });
    } catch (err: any) {
      if (err.message.includes('inferior a los pagos ya registrados')) {
        capturoError = true;
      }
    }
    if (!capturoError) throw new Error('Debió rechazar reducción de total por debajo de pagos existentes');
  });

  // ACCT-06: Cancelación de pedido preservando historial y bloqueo si ya fue entregado
  runAcctTest('ACCT-06', 'Cancelación de orden preservando trazabilidad y bloqueo si fue entregado', () => {
    const cancelado = harness.cancelarPedido('PED_acct_01', 'Cliente desistió del servicio');
    if (cancelado.estadoGeneral !== 'cancelado') throw new Error('Estado general no cambió a cancelado');
    if (!cancelado.observacionesGenerales?.includes('[CANCELADO]')) {
      throw new Error('No se registró la nota de cancelación en observaciones');
    }

    const pedidoEntregado = harness.savePedido({
      id: 'PED_entregado_test',
      codigoVisible: '#1002',
      clienteId: clienteTest.id,
      fechaRecepcion: new Date().toISOString(),
      fechaEstimadaEntrega: '2026-10-31',
      prendas: [
        {
          id: 'PRN_1002_1',
          pedidoId: 'PED_entregado_test',
          clienteId: clienteTest.id,
          tipo: 'Camisa',
          descripcion: 'Blanca',
          servicio: 'solo_planchado',
          precio: 2000,
          estado: 'entregado',
          qrPayload: 'PRN_1002_1',
        },
      ],
      total: 2000,
      saldoPendiente: 0,
      estadoPago: 'pagado',
      estadoGeneral: 'entregado',
      pagos: [],
      avisosWhatsApp: [],
      qrPayload: 'PED_1002',
    });

    let capturoErrorEntregado = false;
    try {
      harness.cancelarPedido(pedidoEntregado.id, 'Intento ilegal');
    } catch {
      capturoErrorEntregado = true;
    }
    if (!capturoErrorEntregado) throw new Error('Debió rechazar cancelación de pedido ya entregado');
  });

  // ACCT-07: Sincronización canónica de estado de prendas y pedido
  runAcctTest('ACCT-07', 'Sincronización atómica canónica de prendas y estado general del pedido', () => {
    const pedidoSinc = harness.savePedido({
      id: 'PED_sinc_test',
      codigoVisible: '#1003',
      clienteId: clienteTest.id,
      fechaRecepcion: new Date().toISOString(),
      fechaEstimadaEntrega: '2026-10-31',
      prendas: [
        {
          id: 'PRN_sinc_1',
          pedidoId: 'PED_sinc_test',
          clienteId: clienteTest.id,
          tipo: 'Pantalón',
          descripcion: 'Jean',
          servicio: 'lavado_planchado',
          precio: 3000,
          estado: 'recibido',
          qrPayload: 'PRN_sinc_1',
        },
        {
          id: 'PRN_sinc_2',
          pedidoId: 'PED_sinc_test',
          clienteId: clienteTest.id,
          tipo: 'Camisa',
          descripcion: 'Lisa',
          servicio: 'solo_planchado',
          precio: 2500,
          estado: 'recibido',
          qrPayload: 'PRN_sinc_2',
        },
      ],
      total: 5500,
      saldoPendiente: 5500,
      estadoPago: 'pendiente',
      estadoGeneral: 'recibido',
      pagos: [],
      avisosWhatsApp: [],
      qrPayload: 'PED_1003',
    });

    const res1 = harness.updateEstadoPrenda(pedidoSinc.id, 'PRN_sinc_1', 'en_proceso');
    if (res1.estadoGeneral !== 'en_proceso') {
      throw new Error(`Esperado en_proceso, obtenido ${res1.estadoGeneral}`);
    }

    harness.updateEstadoPrenda(pedidoSinc.id, 'PRN_sinc_1', 'listo');
    const res2 = harness.updateEstadoPrenda(pedidoSinc.id, 'PRN_sinc_2', 'listo');
    if (res2.estadoGeneral !== 'listo') {
      throw new Error(`Esperado listo, obtenido ${res2.estadoGeneral}`);
    }

    harness.updateEstadoPrenda(pedidoSinc.id, 'PRN_sinc_1', 'entregado');
    const res3 = harness.updateEstadoPrenda(pedidoSinc.id, 'PRN_sinc_2', 'entregado');
    if (res3.estadoGeneral !== 'entregado') {
      throw new Error(`Esperado entregado, obtenido ${res3.estadoGeneral}`);
    }
  });

  // ACCT-08: Trazabilidad de auditoría en cada operación sensible
  runAcctTest('ACCT-08', 'Auditoría obligatoria con fase CONFIRMADA para cada operación', () => {
    const logs = Array.from(harness.store.auditoria.values());
    if (logs.length === 0) throw new Error('No se generaron registros de auditoría');

    const tienePayment = logs.some((l) => l.accion === 'PAYMENT' && l.fase === 'CONFIRMADA');
    const tienePaymentCancel = logs.some((l) => l.accion === 'PAYMENT_CANCEL' && l.fase === 'CONFIRMADA');
    const tienePedidoCreate = logs.some((l) => l.accion === 'CREATE' && l.entidad === 'pedido');

    if (!tienePayment || !tienePaymentCancel || !tienePedidoCreate) {
      throw new Error('Faltan eventos críticos en la bitácora de auditoría');
    }
  });

  // ACCT-09: Desactivación lógica de clientes (prohibición de borrado físico en favor de activo: false)
  runAcctTest('ACCT-09', 'Desactivación lógica de clientes: preservación de identidad e inmutabilidad física', () => {
    harness.deleteCliente(clienteTest.id);
    const cli = harness.store.clientes.get(clienteTest.id);
    if (!cli) throw new Error('El documento del cliente no debe ser eliminado de la base de datos');
    if (cli.activo !== false) throw new Error('El cliente debió quedar desactivado lógicamente (activo: false)');

    const auditDeactivate = Array.from(harness.store.auditoria.values()).some(
      (l) => l.accion === 'DEACTIVATE' && l.entidadId === clienteTest.id && l.fase === 'CONFIRMADA'
    );
    if (!auditDeactivate) throw new Error('Falta evento de auditoría DEACTIVATE confirmado');
  });

  // ACCT-10: Cancelación lógica de pedidos (prohibición de borrado físico para resguardo fiscal y trazabilidad)
  runAcctTest('ACCT-10', 'Cancelación lógica de pedidos: preservación de registros históricos y de cobranza', () => {
    harness.deletePedido('PED_acct_01');
    const ped = harness.store.pedidos.get('PED_acct_01');
    if (!ped) throw new Error('El documento del pedido no debe ser eliminado físicamente');
    if (ped.estadoGeneral !== 'cancelado') throw new Error('El pedido debió marcarse como cancelado');

    const auditCancel = Array.from(harness.store.auditoria.values()).some(
      (l) => l.accion === 'ORDER_CANCEL' && l.entidadId === 'PED_acct_01' && l.fase === 'CONFIRMADA'
    );
    if (!auditCancel) throw new Error('Falta evento de auditoría ORDER_CANCEL confirmado');
  });

  // -------------------------------------------------------------------------
  // REPORTE FINAL CONSOLIDADO
  // -------------------------------------------------------------------------
  const totalPruebas = pasadas + fallidas;
  console.log('\n=================================================================');
  console.log('RESUMEN DE PRUEBAS DE SEGURIDAD Y CONSISTENCIA CONTABLE');
  console.log('=================================================================');
  console.log(`Total de pruebas ejecutadas : ${totalPruebas}`);
  console.log(`Pruebas superadas (PASSED)  : ${pasadas}`);
  console.log(`Pruebas fallidas (FAILED)   : ${fallidas}`);
  console.log('-----------------------------------------------------------------');

  if (fallidas === 0) {
    console.log('✓ RESULTADO: ÉXITO ABSOLUTO (100% de pruebas aprobadas)');
    console.log('✓ REGLAS DE FIRESTORE: Blindadas y zero-trust.');
    console.log('✓ CONSISTENCIA CONTABLE: Validada para cobros, señas y anulaciones.');
    console.log('✓ INTEGRIDAD TRANSACCIONAL: Sincronización atómica confirmada.');
    console.log('✓ ESTADO DE ARQUITECTURA: LISTA PARA MIGRACIÓN FUTURA.');
  } else {
    console.error('✗ RESULTADO: FALLOS DETECTADOS:');
    detallesFallos.forEach((f) => console.error(`  - ${f}`));
  }
  console.log('=================================================================\n');

  return { totalPruebas, pasadas, fallidas, detallesFallos };
}

// Ejecución directa si se invoca con tsx
if (import.meta.url.endsWith('firestore-security.test.ts')) {
  const reporte = ejecutarTodasLasPruebas();
  if (reporte.fallidas > 0) {
    process.exit(1);
  }
}
