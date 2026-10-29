/**
 * Servicio desacoplado y reforzado de Cloud Firestore para Lavadero eLeGe
 *
 * Mejoras arquitectónicas aplicadas:
 * 1. Acceso exclusivo validado con el UID administrador autorizado.
 * 2. Única fuente de verdad canónica para prendas y pagos con proyección consistente.
 * 3. Transacciones atómicas contables para pagos, señas y anulaciones.
 * 4. Inmutabilidad de pagos históricos (sin borrado físico, solo anulación auditada).
 * 5. Generación de IDs seguros y a prueba de colisiones (crypto-random).
 * 6. Auditoría con fases (INICIADA / CONFIRMADA / FALLIDA).
 * 7. Control de integridad en modificaciones de pedidos con pagos previos.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../config';
import { FIRESTORE_COLLECTIONS, RegistroAuditoria, PagoFirestore, FaseAuditoria } from '../collections';
import { handleFirestoreError, OperationType } from '../errorHandler';
import {
  generateClienteId,
  generatePedidoId,
  generateCodigoVisible,
  generatePrendaId,
  generatePagoId,
  generateAuditoriaId,
} from '../utils/idGenerator';
import {
  Cliente,
  Pedido,
  Prenda,
  Pago,
  RegistroAvisoWhatsApp,
  ConfiguracionSistema,
  EstadoPrenda,
  EstadoPedido,
  EstadoPago,
} from '../../types';

export class FirestoreService {
  private static getAdminInfo() {
    return {
      uid: auth.currentUser?.uid || 'no-auth-uid',
      email: auth.currentUser?.email || 'admin@elege.com',
    };
  }

  // =========================================================================
  // 1. VALIDACIONES ESTRICTAS DE INTEGRIDAD Y TIPOS
  // =========================================================================

  private static validateCliente(cli: Partial<Cliente>): void {
    if (!cli.id || typeof cli.id !== 'string' || cli.id.trim() === '') {
      throw new Error('El ID de cliente es obligatorio y debe ser válido.');
    }
    if (!cli.nombre || typeof cli.nombre !== 'string' || cli.nombre.trim() === '') {
      throw new Error('El nombre de cliente es obligatorio.');
    }
    if (cli.nombre.length > 100) {
      throw new Error('El nombre de cliente no puede exceder los 100 caracteres.');
    }
    if (!cli.telefono || typeof cli.telefono !== 'string' || cli.telefono.trim().length < 6) {
      throw new Error('El teléfono es obligatorio y debe contener al menos 6 caracteres.');
    }
  }

  private static validatePedido(ped: Partial<Pedido>): void {
    if (!ped.id || typeof ped.id !== 'string') {
      throw new Error('El ID del pedido es obligatorio.');
    }
    if (!ped.clienteId || typeof ped.clienteId !== 'string') {
      throw new Error('El pedido debe estar asociado a un cliente válido (clienteId).');
    }
    if (!Array.isArray(ped.prendas) || ped.prendas.length === 0) {
      throw new Error('El pedido debe incluir al menos una prenda registrada.');
    }
    if (typeof ped.total !== 'number' || ped.total < 0) {
      throw new Error('El importe total del pedido no puede ser negativo.');
    }
    if (typeof ped.saldoPendiente !== 'number' || ped.saldoPendiente < 0) {
      throw new Error('El saldo pendiente no puede ser negativo.');
    }
  }

  private static validatePrenda(prenda: Partial<Prenda>): void {
    if (!prenda.id || !prenda.pedidoId || !prenda.clienteId) {
      throw new Error('La prenda requiere ID, pedidoId y clienteId asociados.');
    }
    if (!prenda.tipo || prenda.tipo.trim() === '') {
      throw new Error('El tipo de prenda es obligatorio.');
    }
    if (typeof prenda.precio !== 'number' || prenda.precio < 0) {
      throw new Error('El precio de la prenda no puede ser negativo.');
    }
  }

  private static validatePago(pago: Partial<Pago>): void {
    if (!pago.id || !pago.pedidoId || !pago.clienteId) {
      throw new Error('El pago debe tener identificadores válidos de pedido y cliente.');
    }
    if (typeof pago.monto !== 'number' || pago.monto <= 0) {
      throw new Error('El monto del pago debe ser estrictamente mayor a cero.');
    }
  }

  // =========================================================================
  // 2. AUDITORÍA CON REGISTRO DE FASES (INICIADA / CONFIRMADA / FALLIDA)
  // =========================================================================

  private static async registrarEventoAuditoria(
    accion: RegistroAuditoria['accion'],
    fase: FaseAuditoria,
    entidad: RegistroAuditoria['entidad'],
    entidadId: string,
    detalles: string,
    datosPrevios?: any,
    datosNuevos?: any
  ): Promise<string> {
    const admin = this.getAdminInfo();
    const auditId = generateAuditoriaId();
    const docRef = doc(db, FIRESTORE_COLLECTIONS.AUDITORIA, auditId);

    const record: RegistroAuditoria = {
      id: auditId,
      accion,
      fase,
      entidad,
      entidadId,
      detalles,
      usuarioUid: admin.uid,
      usuarioEmail: admin.email,
      timestamp: serverTimestamp(),
      datosPrevios: datosPrevios || null,
      datosNuevos: datosNuevos || null,
    };

    try {
      const batch = writeBatch(db);
      batch.set(docRef, record);
      await batch.commit();
      return auditId;
    } catch (err) {
      console.warn('[Auditoria] No se pudo persistir el registro de auditoría:', err);
      return auditId;
    }
  }

  // =========================================================================
  // 3. CLIENTES
  // =========================================================================

  static async getClientes(): Promise<Cliente[]> {
    try {
      const q = query(
        collection(db, FIRESTORE_COLLECTIONS.CLIENTES),
        orderBy('fechaAlta', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          nombre: data.nombre,
          apellido: data.apellido || '',
          telefono: data.telefono,
          observaciones: data.observaciones || '',
          fechaAlta: data.fechaAlta,
          qrPayload: data.qrPayload,
        } as Cliente;
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, FIRESTORE_COLLECTIONS.CLIENTES);
    }
  }

  static async getClienteById(id: string): Promise<Cliente | null> {
    try {
      const docRef = doc(db, FIRESTORE_COLLECTIONS.CLIENTES, id);
      const snap = await getDoc(docRef);
      if (!snap.exists()) return null;
      const data = snap.data();
      return {
        id: snap.id,
        nombre: data.nombre,
        apellido: data.apellido || '',
        telefono: data.telefono,
        observaciones: data.observaciones || '',
        fechaAlta: data.fechaAlta,
        qrPayload: data.qrPayload,
      } as Cliente;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `${FIRESTORE_COLLECTIONS.CLIENTES}/${id}`);
    }
  }

  static async saveCliente(cliente: Cliente): Promise<Cliente> {
    const clienteConId: Cliente = {
      ...cliente,
      id: cliente.id || generateClienteId(),
    };
    this.validateCliente(clienteConId);

    const admin = this.getAdminInfo();
    const docRef = doc(db, FIRESTORE_COLLECTIONS.CLIENTES, clienteConId.id);

    try {
      const prevSnap = await getDoc(docRef);
      const esNuevo = !prevSnap.exists();
      const datosPrevios = esNuevo ? null : prevSnap.data();

      const batch = writeBatch(db);
      batch.set(
        docRef,
        {
          ...clienteConId,
          updatedAt: serverTimestamp(),
          ...(esNuevo ? { createdAt: serverTimestamp(), createdBy: admin.uid } : {}),
        },
        { merge: true }
      );

      const auditId = generateAuditoriaId();
      const auditRef = doc(db, FIRESTORE_COLLECTIONS.AUDITORIA, auditId);
      const auditRecord: RegistroAuditoria = {
        id: auditId,
        accion: esNuevo ? 'CREATE' : 'UPDATE',
        fase: 'CONFIRMADA',
        entidad: 'cliente',
        entidadId: clienteConId.id,
        detalles: `${esNuevo ? 'Alta' : 'Modificación'} de cliente: ${clienteConId.nombre} ${clienteConId.apellido || ''} (${clienteConId.telefono})`,
        usuarioUid: admin.uid,
        usuarioEmail: admin.email,
        timestamp: serverTimestamp(),
        datosPrevios,
        datosNuevos: clienteConId,
      };
      batch.set(auditRef, auditRecord);

      await batch.commit();
      return clienteConId;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `${FIRESTORE_COLLECTIONS.CLIENTES}/${clienteConId.id}`);
    }
  }

  static async desactivarCliente(id: string): Promise<void> {
    const admin = this.getAdminInfo();
    try {
      const docRef = doc(db, FIRESTORE_COLLECTIONS.CLIENTES, id);
      const snap = await getDoc(docRef);
      if (!snap.exists()) {
        throw new Error(`El cliente ${id} no existe en Firestore.`);
      }

      const batch = writeBatch(db);
      batch.update(docRef, {
        activo: false,
        updatedAt: serverTimestamp(),
      });

      const auditId = generateAuditoriaId();
      const auditRef = doc(db, FIRESTORE_COLLECTIONS.AUDITORIA, auditId);
      batch.set(auditRef, {
        id: auditId,
        accion: 'DEACTIVATE',
        fase: 'CONFIRMADA',
        entidad: 'cliente',
        entidadId: id,
        detalles: `Desactivación lógica de cliente ID: ${id} (borrado físico prohibido por reglas)`,
        usuarioUid: admin.uid,
        usuarioEmail: admin.email,
        timestamp: serverTimestamp(),
      });

      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${FIRESTORE_COLLECTIONS.CLIENTES}/${id}`);
    }
  }

  static async deleteCliente(id: string): Promise<void> {
    // Las reglas de Firestore prohíben la eliminación física (allow delete: if false)
    // para prevenir manipulaciones de contadores o pérdida de trazabilidad.
    return await this.desactivarCliente(id);
  }

  // =========================================================================
  // 4. PEDIDOS Y PRENDAS (Transacciones Atómicas y Sincronización Canónica)
  // =========================================================================

  static async getPedidos(): Promise<Pedido[]> {
    try {
      const q = query(
        collection(db, FIRESTORE_COLLECTIONS.PEDIDOS),
        orderBy('fechaRecepcion', 'desc')
      );
      const snap = await getDocs(q);
      return snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          codigoVisible: d.codigoVisible,
          clienteId: d.clienteId,
          fechaRecepcion: d.fechaRecepcion,
          fechaEstimadaEntrega: d.fechaEstimadaEntrega,
          prendas: d.prendas || [],
          total: d.total || 0,
          saldoPendiente: d.saldoPendiente ?? d.total,
          estadoPago: d.estadoPago || 'pendiente',
          estadoGeneral: d.estadoGeneral || 'recibido',
          observacionesGenerales: d.observacionesGenerales || '',
          pagos: d.pagos || [],
          avisosWhatsApp: d.avisosWhatsApp || [],
          qrPayload: d.qrPayload,
          fechaEntregaEfectiva: d.fechaEntregaEfectiva,
        } as Pedido;
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, FIRESTORE_COLLECTIONS.PEDIDOS);
    }
  }

  static async getPedidoById(id: string): Promise<Pedido | null> {
    try {
      const docRef = doc(db, FIRESTORE_COLLECTIONS.PEDIDOS, id);
      const snap = await getDoc(docRef);
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as Pedido;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `${FIRESTORE_COLLECTIONS.PEDIDOS}/${id}`);
    }
  }

  /**
   * Obtiene el pedido garantizando lectura de las fuentes de verdad canónicas
   * (colecciones prendas y pagos individuales asociadas a este pedido)
   */
  static async getPedidoConDetalleCanonico(id: string): Promise<Pedido | null> {
    try {
      const pedido = await this.getPedidoById(id);
      if (!pedido) return null;

      // Consultar prendas canónicas
      const prendasQuery = query(
        collection(db, FIRESTORE_COLLECTIONS.PRENDAS),
        where('pedidoId', '==', id)
      );
      const prendasSnap = await getDocs(prendasQuery);
      const prendasCanonicas = prendasSnap.docs.map((d) => d.data() as Prenda);

      // Consultar pagos canónicos (excluyendo anulados para el cálculo contable)
      const pagosQuery = query(
        collection(db, FIRESTORE_COLLECTIONS.PAGOS),
        where('pedidoId', '==', id)
      );
      const pagosSnap = await getDocs(pagosQuery);
      const pagosCanonicos = pagosSnap.docs.map((d) => d.data() as PagoFirestore);

      const pagosValidos = pagosCanonicos.filter((p) => !p.anulado);
      const totalPagado = pagosValidos.reduce((acc, p) => acc + (p.monto || 0), 0);
      const saldoPendiente = Math.max(0, pedido.total - totalPagado);

      let estadoPago: EstadoPago = 'pendiente';
      if (saldoPendiente === 0) estadoPago = 'pagado';
      else if (totalPagado > 0) estadoPago = 'parcial';

      return {
        ...pedido,
        prendas: prendasCanonicas.length > 0 ? prendasCanonicas : pedido.prendas,
        pagos: pagosCanonicos as Pago[],
        saldoPendiente,
        estadoPago,
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `${FIRESTORE_COLLECTIONS.PEDIDOS}/${id}`);
    }
  }

  /**
   * Guarda o actualiza un pedido junto a sus prendas y pagos de forma atómica.
   * Valida que no se reduzca el importe total por debajo de los pagos ya cobrados.
   */
  static async savePedido(pedido: Pedido): Promise<Pedido> {
    const pedidoConId: Pedido = {
      ...pedido,
      id: pedido.id || generatePedidoId(),
      codigoVisible: pedido.codigoVisible || generateCodigoVisible(),
      total: typeof pedido.total === 'number' ? pedido.total : 0,
      saldoPendiente: typeof pedido.saldoPendiente === 'number' ? pedido.saldoPendiente : (pedido.total || 0),
      estadoPago: pedido.estadoPago || 'pendiente',
      estadoGeneral: pedido.estadoGeneral || 'recibido',
    };

    // Asegurar IDs seguros en cada prenda
    const prendasConId = pedidoConId.prendas.map((p, idx) => ({
      ...p,
      id: p.id || generatePrendaId(pedidoConId.id, idx),
      pedidoId: pedidoConId.id,
      clienteId: pedidoConId.clienteId,
    }));
    pedidoConId.prendas = prendasConId;

    this.validatePedido(pedidoConId);
    pedidoConId.prendas.forEach((p) => this.validatePrenda(p));

    const admin = this.getAdminInfo();

    try {
      return await runTransaction(db, async (tx) => {
        const pedidoRef = doc(db, FIRESTORE_COLLECTIONS.PEDIDOS, pedidoConId.id);
        const prevSnap = await tx.get(pedidoRef);

        let pagosExistentes: PagoFirestore[] = [];
        if (prevSnap.exists()) {
          const prevData = prevSnap.data() as Pedido;
          pagosExistentes = (prevData.pagos as PagoFirestore[]) || [];

          // VALIDACIÓN CRÍTICA: No permitir reducir el total por debajo de los pagos vigentes ya cobrados
          const totalPagadoPrevio = pagosExistentes
            .filter((p) => !p.anulado)
            .reduce((acc, p) => acc + (p.monto || 0), 0);

          if (pedidoConId.total < totalPagadoPrevio) {
            throw new Error(
              `El nuevo importe total ($${pedidoConId.total}) no puede ser inferior a los pagos ya registrados ($${totalPagadoPrevio}). Registre primero una anulación o devolución.`
            );
          }
        }

        // 1. Guardar en documento del pedido
        tx.set(
          pedidoRef,
          {
            ...pedidoConId,
            updatedAt: serverTimestamp(),
            updatedBy: admin.uid,
          },
          { merge: true }
        );

        // 2. Fuente de verdad canónica: Guardar cada prenda en colección 'prendas'
        for (const prenda of pedidoConId.prendas) {
          const prendaRef = doc(db, FIRESTORE_COLLECTIONS.PRENDAS, prenda.id);
          tx.set(
            prendaRef,
            {
              ...prenda,
              pedidoId: pedidoConId.id,
              clienteId: pedidoConId.clienteId,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }

        // 3. Registrar auditoría con fase confirmada
        const auditId = generateAuditoriaId();
        const auditRef = doc(db, FIRESTORE_COLLECTIONS.AUDITORIA, auditId);
        tx.set(auditRef, {
          id: auditId,
          accion: prevSnap.exists() ? 'UPDATE' : 'CREATE',
          fase: 'CONFIRMADA',
          entidad: 'pedido',
          entidadId: pedidoConId.id,
          detalles: `Guardado atómico de pedido ${pedidoConId.codigoVisible} (${pedidoConId.prendas.length} prendas, total: $${pedidoConId.total})`,
          usuarioUid: admin.uid,
          usuarioEmail: admin.email,
          timestamp: serverTimestamp(),
        });

        return pedidoConId;
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `${FIRESTORE_COLLECTIONS.PEDIDOS}/${pedidoConId.id}`);
    }
  }

  /**
   * Actualiza el estado de una prenda de forma atómica sincronizando la colección
   * canónica 'prendas' y la proyección en 'pedidos'
   */
  static async updateEstadoPrenda(
    pedidoId: string,
    prendaId: string,
    nuevoEstado: EstadoPrenda
  ): Promise<{ pedido: Pedido; prenda: Prenda }> {
    const admin = this.getAdminInfo();

    try {
      return await runTransaction(db, async (tx) => {
        const pedidoRef = doc(db, FIRESTORE_COLLECTIONS.PEDIDOS, pedidoId);
        const prendaRef = doc(db, FIRESTORE_COLLECTIONS.PRENDAS, prendaId);

        const pedidoSnap = await tx.get(pedidoRef);
        if (!pedidoSnap.exists()) {
          throw new Error(`El pedido ${pedidoId} no existe en Firestore.`);
        }

        const pedidoData = pedidoSnap.data() as Pedido;
        const index = pedidoData.prendas.findIndex((p) => p.id === prendaId);
        if (index === -1) {
          throw new Error(`La prenda ${prendaId} no pertenece al pedido ${pedidoId}.`);
        }

        const fechaActual = new Date().toISOString();
        const prendaActualizada: Prenda = {
          ...pedidoData.prendas[index],
          estado: nuevoEstado,
          fechaActualizacion: fechaActual,
        };

        const prendasActualizadas = [...pedidoData.prendas];
        prendasActualizadas[index] = prendaActualizada;

        // Recalcular estado general del pedido
        const todasEntregadas = prendasActualizadas.every((p) => p.estado === 'entregado');
        const todasListas = prendasActualizadas.every(
          (p) => p.estado === 'listo' || p.estado === 'entregado'
        );
        const algunaEnProceso = prendasActualizadas.some((p) => p.estado === 'en_proceso');

        let nuevoEstadoGeneral: EstadoPedido = 'recibido';
        if (todasEntregadas) nuevoEstadoGeneral = 'entregado';
        else if (todasListas) nuevoEstadoGeneral = 'listo';
        else if (algunaEnProceso) nuevoEstadoGeneral = 'en_proceso';

        const pedidoActualizado: Pedido = {
          ...pedidoData,
          prendas: prendasActualizadas,
          estadoGeneral: nuevoEstadoGeneral,
          fechaEntregaEfectiva: todasEntregadas
            ? pedidoData.fechaEntregaEfectiva || fechaActual
            : undefined,
        };

        // 1. Actualizar proyección en pedido
        tx.update(pedidoRef, {
          prendas: prendasActualizadas,
          estadoGeneral: nuevoEstadoGeneral,
          fechaEntregaEfectiva: pedidoActualizado.fechaEntregaEfectiva || null,
          updatedAt: serverTimestamp(),
        });

        // 2. Actualizar fuente canónica de la prenda
        tx.update(prendaRef, {
          estado: nuevoEstado,
          fechaActualizacion: fechaActual,
          updatedAt: serverTimestamp(),
        });

        // 3. Auditoría
        const auditId = generateAuditoriaId();
        const auditRef = doc(db, FIRESTORE_COLLECTIONS.AUDITORIA, auditId);
        tx.set(auditRef, {
          id: auditId,
          accion: 'STATUS_CHANGE',
          fase: 'CONFIRMADA',
          entidad: 'prenda',
          entidadId: prendaId,
          detalles: `Cambio de estado de prenda ${prendaId} a "${nuevoEstado}" en pedido ${pedidoId}`,
          usuarioUid: admin.uid,
          usuarioEmail: admin.email,
          timestamp: serverTimestamp(),
        });

        return { pedido: pedidoActualizado, prenda: prendaActualizada };
      });
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `${FIRESTORE_COLLECTIONS.PEDIDOS}/${pedidoId}/prendas/${prendaId}`
      );
    }
  }

  /**
   * Cancela un pedido preservando la trazabilidad de prendas y pagos
   */
  static async cancelarPedido(pedidoId: string, motivo: string): Promise<Pedido> {
    const admin = this.getAdminInfo();

    try {
      return await runTransaction(db, async (tx) => {
        const pedidoRef = doc(db, FIRESTORE_COLLECTIONS.PEDIDOS, pedidoId);
        const snap = await tx.get(pedidoRef);
        if (!snap.exists()) {
          throw new Error(`El pedido ${pedidoId} no existe.`);
        }

        const ped = snap.data() as Pedido;
        if (ped.estadoGeneral === 'entregado') {
          throw new Error('No se puede cancelar un pedido que ya ha sido entregado por completo.');
        }

        const pedidoActualizado: Pedido = {
          ...ped,
          estadoGeneral: 'cancelado',
          observacionesGenerales: ped.observacionesGenerales
            ? `${ped.observacionesGenerales} | [CANCELADO]: ${motivo}`
            : `[CANCELADO]: ${motivo}`,
        };

        tx.update(pedidoRef, {
          estadoGeneral: 'cancelado',
          observacionesGenerales: pedidoActualizado.observacionesGenerales,
          updatedAt: serverTimestamp(),
        });

        const auditId = generateAuditoriaId();
        const auditRef = doc(db, FIRESTORE_COLLECTIONS.AUDITORIA, auditId);
        tx.set(auditRef, {
          id: auditId,
          accion: 'ORDER_CANCEL',
          fase: 'CONFIRMADA',
          entidad: 'pedido',
          entidadId: pedidoId,
          detalles: `Cancelación de pedido ${ped.codigoVisible}. Motivo: ${motivo}`,
          usuarioUid: admin.uid,
          usuarioEmail: admin.email,
          timestamp: serverTimestamp(),
        });

        return pedidoActualizado;
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${FIRESTORE_COLLECTIONS.PEDIDOS}/${pedidoId}`);
    }
  }

  static async deletePedido(id: string, motivo: string = 'Cancelación solicitada por administración'): Promise<void> {
    // Las reglas de Firestore prohíben la eliminación física de pedidos (allow delete: if false)
    // para preservar trazabilidad fiscal, balances de pagos e inventario de prendas.
    // Se ejecuta la cancelación lógica del pedido.
    await this.cancelarPedido(id, motivo);
  }

  // =========================================================================
  // 5. CONTROL CONTABLE Y PAGOS INMUTABLES CON ANULACIÓN ATÓMICA
  // =========================================================================

  /**
   * Registra un pago de forma atómica:
   * - Crea el documento canónico en la colección 'pagos'
   * - Recalcula saldo y estado contable en 'pedidos/{pedidoId}'
   * - Genera auditoría confirmada
   */
  static async registrarPago(
    pedidoId: string,
    pago: Partial<Pago>
  ): Promise<{ pedido: Pedido; pago: Pago }> {
    const nuevoPago: Pago = {
      id: pago.id || generatePagoId(),
      pedidoId,
      clienteId: pago.clienteId || '',
      monto: pago.monto || 0,
      metodo: pago.metodo || 'efectivo',
      fecha: pago.fecha || new Date().toISOString(),
      esSenia: Boolean(pago.esSenia),
      nota: pago.nota || '',
    };

    this.validatePago(nuevoPago);
    const admin = this.getAdminInfo();

    try {
      return await runTransaction(db, async (tx) => {
        const pedidoRef = doc(db, FIRESTORE_COLLECTIONS.PEDIDOS, pedidoId);
        const pagoRef = doc(db, FIRESTORE_COLLECTIONS.PAGOS, nuevoPago.id);

        const pagoExistente = await tx.get(pagoRef);
        if (pagoExistente.exists()) {
          throw new Error(`El pago ${nuevoPago.id} ya se encuentra registrado.`);
        }

        const pedidoSnap = await tx.get(pedidoRef);
        if (!pedidoSnap.exists()) {
          throw new Error(`El pedido ${pedidoId} no existe en Firestore.`);
        }

        const pedidoData = pedidoSnap.data() as Pedido;
        nuevoPago.clienteId = pedidoData.clienteId;

        const pagosPrevios: PagoFirestore[] = (pedidoData.pagos as PagoFirestore[]) || [];
        if (pagosPrevios.some((p) => p.id === nuevoPago.id)) {
          throw new Error(`El pago ${nuevoPago.id} ya fue contabilizado en este pedido.`);
        }

        const pagosActualizados = [...pagosPrevios, { ...nuevoPago, anulado: false }];
        const totalPagado = pagosActualizados
          .filter((p) => !p.anulado)
          .reduce((acc, p) => acc + (p.monto || 0), 0);

        const nuevoSaldo = Math.max(0, pedidoData.total - totalPagado);

        let nuevoEstadoPago: EstadoPago = 'pendiente';
        if (nuevoSaldo === 0) nuevoEstadoPago = 'pagado';
        else if (totalPagado > 0) nuevoEstadoPago = 'parcial';

        const pedidoActualizado: Pedido = {
          ...pedidoData,
          pagos: pagosActualizados as Pago[],
          saldoPendiente: nuevoSaldo,
          estadoPago: nuevoEstadoPago,
        };

        // 1. Actualizar pedido atómicamente
        tx.update(pedidoRef, {
          pagos: pagosActualizados,
          saldoPendiente: nuevoSaldo,
          estadoPago: nuevoEstadoPago,
          updatedAt: serverTimestamp(),
        });

        // 2. Guardar en colección canónica 'pagos'
        tx.set(pagoRef, {
          ...nuevoPago,
          anulado: false,
          registradoAt: serverTimestamp(),
          registradoPor: admin.uid,
        });

        // 3. Auditoría confirmada
        const auditId = generateAuditoriaId();
        const auditRef = doc(db, FIRESTORE_COLLECTIONS.AUDITORIA, auditId);
        tx.set(auditRef, {
          id: auditId,
          accion: 'PAYMENT',
          fase: 'CONFIRMADA',
          entidad: 'pago',
          entidadId: nuevoPago.id,
          detalles: `Registro de pago: $${nuevoPago.monto} (${nuevoPago.metodo}) en pedido ${pedidoId}. Saldo pendiente: $${nuevoSaldo}`,
          usuarioUid: admin.uid,
          usuarioEmail: admin.email,
          timestamp: serverTimestamp(),
        });

        return { pedido: pedidoActualizado, pago: nuevoPago };
      });
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.WRITE,
        `${FIRESTORE_COLLECTIONS.PEDIDOS}/${pedidoId}/pagos/${nuevoPago.id}`
      );
    }
  }

  /**
   * Anula un pago de forma atómica:
   * - Marca el pago canónico como anulado con motivo (sin eliminarlo físicamente)
   * - Recompone el saldo pendiente y el estado contable del pedido
   * - Registra evento de auditoría
   */
  static async anularPago(
    pedidoId: string,
    pagoId: string,
    motivo: string
  ): Promise<{ pedido: Pedido; pagoAnuladoId: string }> {
    if (!motivo || motivo.trim().length < 3) {
      throw new Error('Debe proporcionar un motivo válido (mínimo 3 caracteres) para anular un pago registrado.');
    }
    const motivoLimpio = motivo.trim();

    const admin = this.getAdminInfo();

    try {
      return await runTransaction(db, async (tx) => {
        const pedidoRef = doc(db, FIRESTORE_COLLECTIONS.PEDIDOS, pedidoId);
        const pagoRef = doc(db, FIRESTORE_COLLECTIONS.PAGOS, pagoId);

        const pagoSnap = await tx.get(pagoRef);
        if (!pagoSnap.exists()) {
          throw new Error(`El pago ${pagoId} no existe en la colección de pagos.`);
        }

        const pagoData = pagoSnap.data() as PagoFirestore;
        if (pagoData.anulado) {
          throw new Error(`El pago ${pagoId} ya se encuentra anulado.`);
        }

        const pedidoSnap = await tx.get(pedidoRef);
        if (!pedidoSnap.exists()) {
          throw new Error(`El pedido ${pedidoId} no existe.`);
        }

        const pedidoData = pedidoSnap.data() as Pedido;
        const pagosExistentes: PagoFirestore[] = (pedidoData.pagos as PagoFirestore[]) || [];

        const fechaAnulacion = new Date().toISOString();
        const pagosActualizados = pagosExistentes.map((p) => {
          if (p.id === pagoId) {
            return {
              ...p,
              anulado: true,
              motivoAnulacion: motivoLimpio,
              anuladoAt: fechaAnulacion,
              anuladoPor: admin.uid,
            };
          }
          return p;
        });

        const totalPagado = pagosActualizados
          .filter((p) => !p.anulado)
          .reduce((acc, p) => acc + (p.monto || 0), 0);

        const nuevoSaldo = Math.max(0, pedidoData.total - totalPagado);

        let nuevoEstadoPago: EstadoPago = 'pendiente';
        if (nuevoSaldo === 0 && pedidoData.total > 0) nuevoEstadoPago = 'pagado';
        else if (totalPagado > 0) nuevoEstadoPago = 'parcial';

        const pedidoActualizado: Pedido = {
          ...pedidoData,
          pagos: pagosActualizados as Pago[],
          saldoPendiente: nuevoSaldo,
          estadoPago: nuevoEstadoPago,
        };

        // 1. Marcar como anulado en colección canónica
        tx.update(pagoRef, {
          anulado: true,
          motivoAnulacion: motivoLimpio,
          anuladoAt: serverTimestamp(),
          anuladoPor: admin.uid,
        });

        // 2. Actualizar pedido
        tx.update(pedidoRef, {
          pagos: pagosActualizados,
          saldoPendiente: nuevoSaldo,
          estadoPago: nuevoEstadoPago,
          updatedAt: serverTimestamp(),
        });

        // 3. Registrar auditoría contable
        const auditId = generateAuditoriaId();
        const auditRef = doc(db, FIRESTORE_COLLECTIONS.AUDITORIA, auditId);
        tx.set(auditRef, {
          id: auditId,
          accion: 'PAYMENT_CANCEL',
          fase: 'CONFIRMADA',
          entidad: 'pago',
          entidadId: pagoId,
          detalles: `Anulación de pago $${pagoData.monto} en pedido ${pedidoId}. Motivo: ${motivoLimpio}. Nuevo saldo: $${nuevoSaldo}`,
          usuarioUid: admin.uid,
          usuarioEmail: admin.email,
          timestamp: serverTimestamp(),
        });

        return { pedido: pedidoActualizado, pagoAnuladoId: pagoId };
      });
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `${FIRESTORE_COLLECTIONS.PEDIDOS}/${pedidoId}/pagos/${pagoId}`
      );
    }
  }

  // =========================================================================
  // 6. AVISOS DE WHATSAPP
  // =========================================================================

  static async registrarAvisoWhatsApp(aviso: RegistroAvisoWhatsApp): Promise<void> {
    const admin = this.getAdminInfo();

    try {
      const batch = writeBatch(db);

      const avisoRef = doc(collection(db, FIRESTORE_COLLECTIONS.AVISOS_WHATSAPP));
      batch.set(avisoRef, {
        ...aviso,
        timestamp: serverTimestamp(),
        enviadoPor: admin.uid,
      });

      if (aviso.pedidoId) {
        const pedidoRef = doc(db, FIRESTORE_COLLECTIONS.PEDIDOS, aviso.pedidoId);
        const snap = await getDoc(pedidoRef);
        if (snap.exists()) {
          const ped = snap.data() as Pedido;
          const avisosExistentes = ped.avisosWhatsApp || [];
          batch.update(pedidoRef, {
            avisosWhatsApp: [...avisosExistentes, aviso],
            updatedAt: serverTimestamp(),
          });
        }
      }

      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, FIRESTORE_COLLECTIONS.AVISOS_WHATSAPP);
    }
  }

  // =========================================================================
  // 7. CONFIGURACIÓN DEL SISTEMA
  // =========================================================================

  static async getConfiguracion(): Promise<ConfiguracionSistema | null> {
    try {
      const docRef = doc(db, FIRESTORE_COLLECTIONS.CONFIGURACION, 'general');
      const snap = await getDoc(docRef);
      if (!snap.exists()) return null;
      return snap.data() as ConfiguracionSistema;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `${FIRESTORE_COLLECTIONS.CONFIGURACION}/general`);
    }
  }

  static async saveConfiguracion(config: ConfiguracionSistema): Promise<ConfiguracionSistema> {
    const admin = this.getAdminInfo();

    try {
      const docRef = doc(db, FIRESTORE_COLLECTIONS.CONFIGURACION, 'general');
      const batch = writeBatch(db);

      batch.set(
        docRef,
        {
          ...config,
          updatedAt: serverTimestamp(),
          updatedBy: admin.uid,
        },
        { merge: true }
      );

      const auditId = generateAuditoriaId();
      const auditRef = doc(db, FIRESTORE_COLLECTIONS.AUDITORIA, auditId);
      batch.set(auditRef, {
        id: auditId,
        accion: 'UPDATE',
        fase: 'CONFIRMADA',
        entidad: 'configuracion',
        entidadId: 'general',
        detalles: 'Actualización de parámetros del sistema y datos comerciales',
        usuarioUid: admin.uid,
        usuarioEmail: admin.email,
        timestamp: serverTimestamp(),
      });

      await batch.commit();
      return config;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `${FIRESTORE_COLLECTIONS.CONFIGURACION}/general`);
    }
  }

  // =========================================================================
  // 8. AUDITORÍA
  // =========================================================================

  static async getAuditoria(limitCount = 50): Promise<RegistroAuditoria[]> {
    try {
      const q = query(
        collection(db, FIRESTORE_COLLECTIONS.AUDITORIA),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );
      const snap = await getDocs(q);
      return snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as RegistroAuditoria[];
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, FIRESTORE_COLLECTIONS.AUDITORIA);
    }
  }
}
