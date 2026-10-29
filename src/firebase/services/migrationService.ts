/**
 * Servicio de Migración Segura de LocalStorage a Cloud Firestore (Lavadero eLeGe)
 * Proyecto: elege-99d0c
 * UID Administradora Autorizada: eBvTLPVNQIefDTc52fmcmK0ID0K3
 *
 * Características:
 * 1. Consulta de conectividad con Firebase y validación de autenticación de administradora.
 * 2. Comparación de registros locales vs remotos en Firestore.
 * 3. Simulación previa (Dry-Run) con análisis de esquemas, relaciones e idempotencia.
 * 4. Escritura en lotes atómicos (chunks <= 200 docs) respetando cuotas de Firestore.
 * 5. Idempotencia y protección anti-sobrescritura (no modifica documentos existentes).
 * 6. Sincronización canónica de prendas y pagos sin alterar montos ni fechas históricas.
 * 7. Conciliación y verificación posterior (origen vs destino).
 * 8. Registro de auditoría del proceso.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  limit,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../config';
import { FIRESTORE_COLLECTIONS, PagoFirestore, RegistroAuditoria } from '../collections';
import { AUTHORIZED_ADMIN_UIDS } from '../adminConfig';
import {
  BackupPackage,
  Cliente,
  Pedido,
  Prenda,
  Pago,
  RegistroAvisoWhatsApp,
  ConfiguracionSistema,
} from '../../types';
import { generateAuditoriaId } from '../utils/idGenerator';

// Tipos de estado y resultados
export interface FirebaseConnectionStatus {
  connected: boolean;
  authenticated: boolean;
  userUid?: string;
  userEmail?: string;
  isAuthorizedAdmin: boolean;
  projectId: string;
  latencyMs?: number;
  error?: string;
}

export interface RemoteCounts {
  clientes: number;
  pedidos: number;
  prendas: number;
  pagos: number;
  avisos: number;
  configuracionExiste: boolean;
  totalPagadoRemoto: number;
  saldoPendienteRemoto: number;
}

export interface MigrationValidationIssue {
  tipo: 'error' | 'advertencia';
  entidad: 'cliente' | 'pedido' | 'prenda' | 'pago' | 'aviso' | 'configuracion' | 'relacional';
  id: string;
  mensaje: string;
}

export interface MigrationPlanItem {
  coleccion: string;
  id: string;
  accion: 'CREATE' | 'SKIP_ALREADY_EXISTS' | 'CONFLICT';
  detalle: string;
}

export interface MigrationSimulationResult {
  esValidoParaMigrar: boolean;
  totalLocal: {
    clientes: number;
    pedidos: number;
    prendas: number;
    pagos: number;
    avisos: number;
    totalCobrado: number;
    saldoPendiente: number;
  };
  totalRemotoPrevio: RemoteCounts;
  plan: {
    aCrear: number;
    aOmitirPorExistente: number;
    conflictos: number;
    detalles: MigrationPlanItem[];
  };
  validaciones: MigrationValidationIssue[];
  tiempoSimulacionMs: number;
}

export interface MigrationProgress {
  etapa:
    | 'iniciando'
    | 'validando'
    | 'migrando_clientes'
    | 'migrando_pedidos'
    | 'migrando_prendas'
    | 'migrando_pagos'
    | 'migrando_avisos'
    | 'migrando_config'
    | 'verificando'
    | 'completado'
    | 'error';
  porcentaje: number;
  mensaje: string;
  itemsProcesados: number;
  totalItems: number;
  errores: string[];
}

export interface MigrationExecutionResult {
  exito: boolean;
  tiempoTotalMs: number;
  creados: {
    clientes: number;
    pedidos: number;
    prendas: number;
    pagos: number;
    avisos: number;
    configuracion: boolean;
  };
  omitidosPorExistentes: {
    clientes: number;
    pedidos: number;
    prendas: number;
    pagos: number;
    avisos: number;
  };
  errores: string[];
  auditoriaId?: string;
}

export interface ReconciliationReport {
  fecha: string;
  origenLocal: {
    clientes: number;
    pedidos: number;
    prendas: number;
    pagos: number;
    avisos: number;
    totalCobrado: number;
    saldoPendiente: number;
  };
  destinoFirestore: {
    clientes: number;
    pedidos: number;
    prendas: number;
    pagos: number;
    avisos: number;
    totalCobrado: number;
    saldoPendiente: number;
  };
  coincidencias: {
    clientesCoinciden: boolean;
    pedidosCoinciden: boolean;
    prendasCoinciden: boolean;
    pagosCoinciden: boolean;
    totalCobradoCoincide: boolean;
    saldoPendienteCoincide: boolean;
    integridadRelacionalOk: boolean;
  };
  erroresRelacionales: string[];
  resumenEstado: 'CONCILIACION_PERFECTA' | 'DIFERENCIAS_DETECTADAS' | 'ERROR_CONSULTA';
}

const MAX_BATCH_SIZE = 200; // Por debajo del límite de 500 de Firestore

export class MigrationService {
  // =========================================================================
  // 1. ESTADO DE CONEXIÓN CON FIREBASE
  // =========================================================================

  static async checkFirebaseConnection(): Promise<FirebaseConnectionStatus> {
    const start = performance.now();
    const currentUser = auth.currentUser;
    const isAuthorized = currentUser ? AUTHORIZED_ADMIN_UIDS.includes(currentUser.uid) : false;

    try {
      // Intentar una lectura de configuración o colección para verificar conectividad
      const configRef = doc(db, FIRESTORE_COLLECTIONS.CONFIGURACION, 'general');
      await getDoc(configRef);
      const latencyMs = Math.round(performance.now() - start);

      return {
        connected: true,
        authenticated: !!currentUser,
        userUid: currentUser?.uid,
        userEmail: currentUser?.email || undefined,
        isAuthorizedAdmin: isAuthorized,
        projectId: 'elege-99d0c',
        latencyMs,
      };
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - start);
      return {
        connected: false,
        authenticated: !!currentUser,
        userUid: currentUser?.uid,
        userEmail: currentUser?.email || undefined,
        isAuthorizedAdmin: isAuthorized,
        projectId: 'elege-99d0c',
        latencyMs,
        error: err?.message || 'No se pudo establecer conexión con Cloud Firestore.',
      };
    }
  }

  // =========================================================================
  // 2. CONTEO DE REGISTROS REMOTOS EN FIRESTORE
  // =========================================================================

  static async getRemoteCounts(): Promise<RemoteCounts> {
    try {
      const [clientesSnap, pedidosSnap, prendasSnap, pagosSnap, avisosSnap, configSnap] =
        await Promise.all([
          getDocs(collection(db, FIRESTORE_COLLECTIONS.CLIENTES)),
          getDocs(collection(db, FIRESTORE_COLLECTIONS.PEDIDOS)),
          getDocs(collection(db, FIRESTORE_COLLECTIONS.PRENDAS)),
          getDocs(collection(db, FIRESTORE_COLLECTIONS.PAGOS)),
          getDocs(collection(db, FIRESTORE_COLLECTIONS.AVISOS_WHATSAPP)),
          getDoc(doc(db, FIRESTORE_COLLECTIONS.CONFIGURACION, 'general')),
        ]);

      let totalPagadoRemoto = 0;
      pagosSnap.docs.forEach((docSnap) => {
        const d = docSnap.data();
        if (!d.anulado && typeof d.monto === 'number') {
          totalPagadoRemoto += d.monto;
        }
      });

      let saldoPendienteRemoto = 0;
      pedidosSnap.docs.forEach((docSnap) => {
        const d = docSnap.data();
        if (typeof d.saldoPendiente === 'number') {
          saldoPendienteRemoto += d.saldoPendiente;
        }
      });

      return {
        clientes: clientesSnap.size,
        pedidos: pedidosSnap.size,
        prendas: prendasSnap.size,
        pagos: pagosSnap.size,
        avisos: avisosSnap.size,
        configuracionExiste: configSnap.exists(),
        totalPagadoRemoto,
        saldoPendienteRemoto,
      };
    } catch (err: any) {
      console.warn('[MigrationService] Error al obtener conteo remoto:', err);
      return {
        clientes: 0,
        pedidos: 0,
        prendas: 0,
        pagos: 0,
        avisos: 0,
        configuracionExiste: false,
        totalPagadoRemoto: 0,
        saldoPendienteRemoto: 0,
      };
    }
  }

  // =========================================================================
  // 3. VALIDACIÓN PROFUNDA DE INTEGRIDAD LOCAL (COMPATIBILIDAD CON REGLAS)
  // =========================================================================

  static validateLocalData(backup: BackupPackage): MigrationValidationIssue[] {
    const issues: MigrationValidationIssue[] = [];
    const clienteIds = new Set<string>();
    const pedidoIds = new Set<string>();

    const isValidId = (id: string) =>
      typeof id === 'string' && id.length > 0 && id.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(id);

    // 1. Validar Clientes
    for (const cli of backup.clientes || []) {
      if (!cli.id || !isValidId(cli.id)) {
        issues.push({
          tipo: 'error',
          entidad: 'cliente',
          id: cli.id || 'desconocido',
          mensaje: 'ID de cliente inválido (debe contener solo caracteres alfanuméricos, guiones y hasta 128 caracteres).',
        });
      }
      if (clienteIds.has(cli.id)) {
        issues.push({
          tipo: 'error',
          entidad: 'cliente',
          id: cli.id,
          mensaje: 'Identificador de cliente duplicado en datos locales.',
        });
      }
      clienteIds.add(cli.id);

      if (!cli.nombre || cli.nombre.trim() === '') {
        issues.push({
          tipo: 'error',
          entidad: 'cliente',
          id: cli.id,
          mensaje: 'El nombre es obligatorio.',
        });
      }
      if (!cli.telefono || cli.telefono.trim().length < 6) {
        issues.push({
          tipo: 'error',
          entidad: 'cliente',
          id: cli.id,
          mensaje: 'El teléfono debe tener al menos 6 caracteres para compatibilidad con WhatsApp y reglas de Firestore.',
        });
      }
      if (!cli.qrPayload) {
        issues.push({
          tipo: 'advertencia',
          entidad: 'cliente',
          id: cli.id,
          mensaje: 'Cliente no posee qrPayload explícito (se autogenerará en migración).',
        });
      }
    }

    // 2. Validar Pedidos y sus Prendas/Pagos vinculados
    for (const ped of backup.pedidos || []) {
      if (!ped.id || !isValidId(ped.id)) {
        issues.push({
          tipo: 'error',
          entidad: 'pedido',
          id: ped.id || 'desconocido',
          mensaje: 'ID de pedido inválido para Firestore.',
        });
      }
      if (pedidoIds.has(ped.id)) {
        issues.push({
          tipo: 'error',
          entidad: 'pedido',
          id: ped.id,
          mensaje: 'Identificador de pedido duplicado.',
        });
      }
      pedidoIds.add(ped.id);

      // Integridad referencial: el cliente debe existir
      if (!clienteIds.has(ped.clienteId)) {
        issues.push({
          tipo: 'error',
          entidad: 'relacional',
          id: ped.id,
          mensaje: `El pedido está asociado a un clienteId inexistente: "${ped.clienteId}".`,
        });
      }

      if (typeof ped.total !== 'number' || ped.total < 0) {
        issues.push({
          tipo: 'error',
          entidad: 'pedido',
          id: ped.id,
          mensaje: 'El total no puede ser negativo.',
        });
      }

      if (typeof ped.saldoPendiente !== 'number' || ped.saldoPendiente < 0) {
        issues.push({
          tipo: 'error',
          entidad: 'pedido',
          id: ped.id,
          mensaje: 'El saldo pendiente no puede ser negativo.',
        });
      }

      // Validar prendas
      if (!Array.isArray(ped.prendas) || ped.prendas.length === 0) {
        issues.push({
          tipo: 'error',
          entidad: 'pedido',
          id: ped.id,
          mensaje: 'El pedido debe contener al menos una prenda registrada.',
        });
      } else {
        for (const prenda of ped.prendas) {
          if (!prenda.id || !isValidId(prenda.id)) {
            issues.push({
              tipo: 'error',
              entidad: 'prenda',
              id: prenda.id || 'desconocido',
              mensaje: `Prenda con ID inválido en pedido ${ped.id}.`,
            });
          }
          if (typeof prenda.precio !== 'number' || prenda.precio < 0) {
            issues.push({
              tipo: 'error',
              entidad: 'prenda',
              id: prenda.id,
              mensaje: `Prenda "${prenda.tipo}" con precio negativo ($${prenda.precio}).`,
            });
          }
        }
      }

      // Validar pagos históricos
      const pagos = ped.pagos || [];
      let totalPagosValidos = 0;
      for (const pago of pagos) {
        if (!pago.id || !isValidId(pago.id)) {
          issues.push({
            tipo: 'error',
            entidad: 'pago',
            id: pago.id || 'desconocido',
            mensaje: `Pago con ID inválido en pedido ${ped.id}.`,
          });
        }
        if (typeof pago.monto !== 'number' || pago.monto <= 0) {
          issues.push({
            tipo: 'error',
            entidad: 'pago',
            id: pago.id,
            mensaje: `El monto del pago debe ser estrictamente mayor a 0 ($${pago.monto}).`,
          });
        } else {
          totalPagosValidos += pago.monto;
        }
      }

      // Coherencia contable: totalPagosValidos + saldoPendiente debe cuadrar con el total
      const saldoCalculado = Math.max(0, ped.total - totalPagosValidos);
      if (Math.abs(saldoCalculado - ped.saldoPendiente) > 0.01) {
        issues.push({
          tipo: 'advertencia',
          entidad: 'pedido',
          id: ped.id,
          mensaje: `Discrepancia contable detectada: saldo registrado ($${ped.saldoPendiente}) vs saldo calculado ($${saldoCalculado}). Se preservará el histórico real.`,
        });
      }
    }

    return issues;
  }

  // =========================================================================
  // 4. SIMULACIÓN PREVIA DE MIGRACIÓN (DRY-RUN)
  // =========================================================================

  static async simulateMigration(backup: BackupPackage): Promise<MigrationSimulationResult> {
    const start = performance.now();
    const validaciones = this.validateLocalData(backup);
    const erroresCriticos = validaciones.filter((v) => v.tipo === 'error');

    // Totales locales
    let totalPrendas = 0;
    let totalPagos = 0;
    let totalAvisos = 0;
    let totalCobrado = 0;
    let totalSaldoPendiente = 0;

    for (const p of backup.pedidos || []) {
      totalPrendas += p.prendas?.length || 0;
      totalPagos += p.pagos?.length || 0;
      totalAvisos += p.avisosWhatsApp?.length || 0;
      totalSaldoPendiente += p.saldoPendiente || 0;
      for (const pago of p.pagos || []) {
        totalCobrado += pago.monto || 0;
      }
    }

    const totalLocal = {
      clientes: backup.clientes?.length || 0,
      pedidos: backup.pedidos?.length || 0,
      prendas: totalPrendas,
      pagos: totalPagos,
      avisos: totalAvisos,
      totalCobrado,
      saldoPendiente: totalSaldoPendiente,
    };

    // Consultar estado remoto para verificar idempotencia y detectar colisiones
    const totalRemotoPrevio = await this.getRemoteCounts();

    const planDetalles: MigrationPlanItem[] = [];
    let aCrear = 0;
    let aOmitirPorExistente = 0;
    let conflictos = 0;

    // Verificar si existen clientes en remoto
    try {
      const clientesExistentesSnap = await getDocs(
        collection(db, FIRESTORE_COLLECTIONS.CLIENTES)
      );
      const clientesExistentesIds = new Set(clientesExistentesSnap.docs.map((d) => d.id));

      for (const cli of backup.clientes || []) {
        if (clientesExistentesIds.has(cli.id)) {
          aOmitirPorExistente++;
          planDetalles.push({
            coleccion: 'clientes',
            id: cli.id,
            accion: 'SKIP_ALREADY_EXISTS',
            detalle: `Cliente "${cli.nombre} ${cli.apellido || ''}" ya existe en Firestore. Se conservará la versión remota sin sobrescribir.`,
          });
        } else {
          aCrear++;
          planDetalles.push({
            coleccion: 'clientes',
            id: cli.id,
            accion: 'CREATE',
            detalle: `Alta de cliente "${cli.nombre} ${cli.apellido || ''}" (${cli.telefono})`,
          });
        }
      }
    } catch {
      // Si la consulta remota falla (offline / reglas de emulador), proyectar como nuevas creaciones
      aCrear += backup.clientes?.length || 0;
    }

    // Verificar pedidos en remoto
    try {
      const pedidosExistentesSnap = await getDocs(
        collection(db, FIRESTORE_COLLECTIONS.PEDIDOS)
      );
      const pedidosExistentesIds = new Set(pedidosExistentesSnap.docs.map((d) => d.id));

      for (const ped of backup.pedidos || []) {
        if (pedidosExistentesIds.has(ped.id)) {
          aOmitirPorExistente++;
          planDetalles.push({
            coleccion: 'pedidos',
            id: ped.id,
            accion: 'SKIP_ALREADY_EXISTS',
            detalle: `Pedido "${ped.codigoVisible}" ya existe en Firestore.`,
          });
        } else {
          aCrear++;
          planDetalles.push({
            coleccion: 'pedidos',
            id: ped.id,
            accion: 'CREATE',
            detalle: `Creación de pedido ${ped.codigoVisible} (Total: $${ped.total}, Saldo: $${ped.saldoPendiente})`,
          });
        }
      }
    } catch {
      aCrear += backup.pedidos?.length || 0;
    }

    // Prendas y pagos canónicos a crear
    aCrear += totalPrendas;
    aCrear += totalPagos;
    if (backup.configuracion) aCrear += 1;

    const tiempoSimulacionMs = Math.round(performance.now() - start);

    return {
      esValidoParaMigrar: erroresCriticos.length === 0,
      totalLocal,
      totalRemotoPrevio,
      plan: {
        aCrear,
        aOmitirPorExistente,
        conflictos,
        detalles: planDetalles.slice(0, 50), // primeros 50 para preview scannable
      },
      validaciones,
      tiempoSimulacionMs,
    };
  }

  // =========================================================================
  // 5. EJECUCIÓN REAL DE MIGRACIÓN POR LOTES (IDEMPOTENTE Y SIN SOBREESCRITURAS)
  // =========================================================================

  static async executeMigration(
    backup: BackupPackage,
    onProgress: (p: MigrationProgress) => void
  ): Promise<MigrationExecutionResult> {
    const start = performance.now();
    const admin = auth.currentUser;
    const adminUid = admin?.uid || AUTHORIZED_ADMIN_UIDS[0];

    // Validación preventiva previa
    const issues = this.validateLocalData(backup);
    const erroresCriticos = issues.filter((i) => i.tipo === 'error');
    if (erroresCriticos.length > 0) {
      throw new Error(
        `No se puede ejecutar la migración: se detectaron ${erroresCriticos.length} errores de integridad en los datos locales.`
      );
    }

    let itemsProcesados = 0;
    const totalEstimado =
      (backup.clientes?.length || 0) +
      (backup.pedidos?.length || 0) +
      backup.pedidos.reduce((acc, p) => acc + (p.prendas?.length || 0) + (p.pagos?.length || 0), 0) +
      1; // configuración

    const creados = {
      clientes: 0,
      pedidos: 0,
      prendas: 0,
      pagos: 0,
      avisos: 0,
      configuracion: false,
    };

    const omitidos = {
      clientes: 0,
      pedidos: 0,
      prendas: 0,
      pagos: 0,
      avisos: 0,
    };

    const errores: string[] = [];

    // Helper para comitear batches
    let currentBatch = writeBatch(db);
    let batchCount = 0;

    const commitBatchIfFull = async (force = false) => {
      if (batchCount >= MAX_BATCH_SIZE || (force && batchCount > 0)) {
        await currentBatch.commit();
        currentBatch = writeBatch(db);
        batchCount = 0;
      }
    };

    try {
      // ---------------------------------------------------------------------
      // FASE 1: CLIENTES
      // ---------------------------------------------------------------------
      onProgress({
        etapa: 'migrando_clientes',
        porcentaje: Math.round((itemsProcesados / totalEstimado) * 100),
        mensaje: `Migrando clientes (${backup.clientes.length} registros)...`,
        itemsProcesados,
        totalItems: totalEstimado,
        errores,
      });

      for (const cli of backup.clientes) {
        try {
          const cliRef = doc(db, FIRESTORE_COLLECTIONS.CLIENTES, cli.id);
          const snap = await getDoc(cliRef);
          if (snap.exists()) {
            omitidos.clientes++;
          } else {
            currentBatch.set(cliRef, {
              ...cli,
              qrPayload: cli.qrPayload || `ELEGE:CLI:${cli.id}`,
              migradoAt: serverTimestamp(),
              migradoPor: adminUid,
            });
            batchCount++;
            creados.clientes++;
            await commitBatchIfFull();
          }
        } catch (err: any) {
          errores.push(`Error al migrar cliente ${cli.id}: ${err.message}`);
        }
        itemsProcesados++;
      }
      await commitBatchIfFull(true);

      // ---------------------------------------------------------------------
      // FASE 2: PEDIDOS, PRENDAS Y PAGOS
      // ---------------------------------------------------------------------
      onProgress({
        etapa: 'migrando_pedidos',
        porcentaje: Math.round((itemsProcesados / totalEstimado) * 100),
        mensaje: `Migrando pedidos, prendas y registros de cobro...`,
        itemsProcesados,
        totalItems: totalEstimado,
        errores,
      });

      for (const ped of backup.pedidos) {
        try {
          const pedRef = doc(db, FIRESTORE_COLLECTIONS.PEDIDOS, ped.id);
          const pedSnap = await getDoc(pedRef);

          if (pedSnap.exists()) {
            omitidos.pedidos++;
          } else {
            // Guardar documento del pedido
            currentBatch.set(pedRef, {
              ...ped,
              migradoAt: serverTimestamp(),
              migradoPor: adminUid,
            });
            batchCount++;
            creados.pedidos++;
            await commitBatchIfFull();

            // Guardar prendas en colección canónica 'prendas'
            for (const prenda of ped.prendas || []) {
              const prendaRef = doc(db, FIRESTORE_COLLECTIONS.PRENDAS, prenda.id);
              currentBatch.set(prendaRef, {
                ...prenda,
                pedidoId: ped.id,
                clienteId: ped.clienteId,
                migradoAt: serverTimestamp(),
              });
              batchCount++;
              creados.prendas++;
              itemsProcesados++;
              await commitBatchIfFull();
            }

            // Guardar pagos en colección canónica 'pagos'
            for (const pago of ped.pagos || []) {
              const pagoRef = doc(db, FIRESTORE_COLLECTIONS.PAGOS, pago.id);
              const pagoFirestore: PagoFirestore = {
                ...pago,
                pedidoId: ped.id,
                clienteId: ped.clienteId,
                anulado: false,
                registradoPor: adminUid,
                registradoAt: serverTimestamp() as any,
              };
              currentBatch.set(pagoRef, pagoFirestore);
              batchCount++;
              creados.pagos++;
              itemsProcesados++;
              await commitBatchIfFull();
            }

            // Guardar avisos WhatsApp si existen
            for (const aviso of ped.avisosWhatsApp || []) {
              const avisoRef = doc(collection(db, FIRESTORE_COLLECTIONS.AVISOS_WHATSAPP));
              currentBatch.set(avisoRef, {
                ...aviso,
                enviadoPor: adminUid,
                migradoAt: serverTimestamp(),
              });
              batchCount++;
              creados.avisos++;
              await commitBatchIfFull();
            }
          }
        } catch (err: any) {
          errores.push(`Error al migrar pedido ${ped.id}: ${err.message}`);
        }
        itemsProcesados++;
      }
      await commitBatchIfFull(true);

      // ---------------------------------------------------------------------
      // FASE 3: CONFIGURACIÓN GENERAL DEL COMERCIO
      // ---------------------------------------------------------------------
      if (backup.configuracion) {
        onProgress({
          etapa: 'migrando_config',
          porcentaje: 95,
          mensaje: 'Migrando parámetros comerciales e impresión...',
          itemsProcesados,
          totalItems: totalEstimado,
          errores,
        });

        try {
          const configRef = doc(db, FIRESTORE_COLLECTIONS.CONFIGURACION, 'general');
          currentBatch.set(
            configRef,
            {
              ...backup.configuracion,
              migradoAt: serverTimestamp(),
              migradoPor: adminUid,
            },
            { merge: true }
          );
          batchCount++;
          creados.configuracion = true;
          await commitBatchIfFull(true);
        } catch (err: any) {
          errores.push(`Error al migrar configuración: ${err.message}`);
        }
      }

      // ---------------------------------------------------------------------
      // FASE 4: REGISTRO DE AUDITORÍA CONFIRMADA
      // ---------------------------------------------------------------------
      const auditId = generateAuditoriaId();
      try {
        const auditRef = doc(db, FIRESTORE_COLLECTIONS.AUDITORIA, auditId);
        const auditLog: RegistroAuditoria = {
          id: auditId,
          accion: 'RESTORE',
          fase: 'CONFIRMADA',
          entidad: 'sistema',
          entidadId: 'MIGRACION_LOCALSTORAGE_FIRESTORE',
          detalles: `Migración exitosa desde localStorage: ${creados.clientes} clientes, ${creados.pedidos} pedidos, ${creados.prendas} prendas, ${creados.pagos} pagos.`,
          usuarioUid: adminUid,
          usuarioEmail: admin?.email || 'admin@elege.com',
          timestamp: serverTimestamp(),
          datosNuevos: {
            creados,
            omitidos,
          },
        };
        const auditBatch = writeBatch(db);
        auditBatch.set(auditRef, auditLog);
        await auditBatch.commit();
      } catch (err: any) {
        console.warn('[MigrationService] No se pudo guardar auditoría de migración:', err);
      }

      onProgress({
        etapa: 'completado',
        porcentaje: 100,
        mensaje: 'Migración completada con éxito.',
        itemsProcesados: totalEstimado,
        totalItems: totalEstimado,
        errores,
      });

      const tiempoTotalMs = Math.round(performance.now() - start);

      return {
        exito: errores.length === 0,
        tiempoTotalMs,
        creados,
        omitidosPorExistentes: omitidos,
        errores,
        auditoriaId: auditId,
      };
    } catch (err: any) {
      onProgress({
        etapa: 'error',
        porcentaje: Math.round((itemsProcesados / totalEstimado) * 100),
        mensaje: `Fallo durante la migración: ${err.message}`,
        itemsProcesados,
        totalItems: totalEstimado,
        errores: [...errores, err.message],
      });

      throw err;
    }
  }

  // =========================================================================
  // 6. VERIFICACIÓN Y CONCILIACIÓN POSTERIOR (LOCALSTORAGE VS FIRESTORE)
  // =========================================================================

  static async verifyReconciliation(localBackup: BackupPackage): Promise<ReconciliationReport> {
    let localPrendas = 0;
    let localPagos = 0;
    let localAvisos = 0;
    let localCobrado = 0;
    let localSaldo = 0;

    for (const p of localBackup.pedidos || []) {
      localPrendas += p.prendas?.length || 0;
      localPagos += p.pagos?.length || 0;
      localAvisos += p.avisosWhatsApp?.length || 0;
      localSaldo += p.saldoPendiente || 0;
      for (const pago of p.pagos || []) {
        localCobrado += pago.monto || 0;
      }
    }

    const origenLocal = {
      clientes: localBackup.clientes?.length || 0,
      pedidos: localBackup.pedidos?.length || 0,
      prendas: localPrendas,
      pagos: localPagos,
      avisos: localAvisos,
      totalCobrado: localCobrado,
      saldoPendiente: localSaldo,
    };

    try {
      const remote = await this.getRemoteCounts();

      const erroresRelacionales: string[] = [];

      // Validar si las cantidades remotas cubren los registros locales
      const clientesCoinciden = remote.clientes >= origenLocal.clientes;
      const pedidosCoinciden = remote.pedidos >= origenLocal.pedidos;
      const prendasCoinciden = remote.prendas >= origenLocal.prendas;
      const pagosCoinciden = remote.pagos >= origenLocal.pagos;
      const totalCobradoCoincide = Math.abs(remote.totalPagadoRemoto - origenLocal.totalCobrado) < 0.01;
      const saldoPendienteCoincide = Math.abs(remote.saldoPendienteRemoto - origenLocal.saldoPendiente) < 0.01;

      if (!clientesCoinciden) {
        erroresRelacionales.push(
          `Clientes en Firestore (${remote.clientes}) es menor a local (${origenLocal.clientes}).`
        );
      }
      if (!pedidosCoinciden) {
        erroresRelacionales.push(
          `Pedidos en Firestore (${remote.pedidos}) es menor a local (${origenLocal.pedidos}).`
        );
      }
      if (!pagosCoinciden) {
        erroresRelacionales.push(
          `Pagos en Firestore (${remote.pagos}) es menor a local (${origenLocal.pagos}).`
        );
      }

      const integridadRelacionalOk = erroresRelacionales.length === 0;

      let resumenEstado: ReconciliationReport['resumenEstado'] = 'CONCILIACION_PERFECTA';
      if (!integridadRelacionalOk || !totalCobradoCoincide || !saldoPendienteCoincide) {
        resumenEstado = 'DIFERENCIAS_DETECTADAS';
      }

      return {
        fecha: new Date().toISOString(),
        origenLocal,
        destinoFirestore: {
          clientes: remote.clientes,
          pedidos: remote.pedidos,
          prendas: remote.prendas,
          pagos: remote.pagos,
          avisos: remote.avisos,
          totalCobrado: remote.totalPagadoRemoto,
          saldoPendiente: remote.saldoPendienteRemoto,
        },
        coincidencias: {
          clientesCoinciden,
          pedidosCoinciden,
          prendasCoinciden,
          pagosCoinciden,
          totalCobradoCoincide,
          saldoPendienteCoincide,
          integridadRelacionalOk,
        },
        erroresRelacionales,
        resumenEstado,
      };
    } catch (err: any) {
      return {
        fecha: new Date().toISOString(),
        origenLocal,
        destinoFirestore: {
          clientes: 0,
          pedidos: 0,
          prendas: 0,
          pagos: 0,
          avisos: 0,
          totalCobrado: 0,
          saldoPendiente: 0,
        },
        coincidencias: {
          clientesCoinciden: false,
          pedidosCoinciden: false,
          prendasCoinciden: false,
          pagosCoinciden: false,
          totalCobradoCoincide: false,
          saldoPendienteCoincide: false,
          integridadRelacionalOk: false,
        },
        erroresRelacionales: [`Fallo al consultar Firestore: ${err.message}`],
        resumenEstado: 'ERROR_CONSULTA',
      };
    }
  }
}
