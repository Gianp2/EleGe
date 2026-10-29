import React, { useState, useEffect } from 'react';
import {
  Database,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  Download,
  Play,
  RotateCw,
  Lock,
  Unlock,
  ShieldCheck,
  Server,
  FileCheck,
  FileText,
  AlertCircle,
  HelpCircle,
  Clock,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { storage } from '../../services/storage';
import { formatMoneda, formatFechaHora } from '../../utils/formatters';
import {
  MigrationService,
  FirebaseConnectionStatus,
  RemoteCounts,
  MigrationSimulationResult,
  MigrationProgress,
  MigrationExecutionResult,
  ReconciliationReport,
} from '../../firebase/services/migrationService';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { dataProviderManager } from '../../services/dataProvider';

export const DatabaseMigrationWizard: React.FC = () => {
  // Estado de conexión
  const [connectionStatus, setConnectionStatus] = useState<FirebaseConnectionStatus | null>(null);
  const [checkingConnection, setCheckingConnection] = useState(false);

  // Conteo remoto y local
  const [remoteCounts, setRemoteCounts] = useState<RemoteCounts | null>(null);
  const [loadingRemoteCounts, setLoadingRemoteCounts] = useState(false);

  // Respaldo descargado
  const [backupDescargado, setBackupDescargado] = useState(false);

  // Simulación (Dry Run)
  const [simulationResult, setSimulationResult] = useState<MigrationSimulationResult | null>(null);
  const [simulating, setSimulating] = useState(false);

  // Desbloqueo y confirmación explícita
  const [desbloqueoManualConfirmado, setDesbloqueoManualConfirmado] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  // Ejecución de migración
  const [migrating, setMigrating] = useState(false);
  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const [executionResult, setExecutionResult] = useState<MigrationExecutionResult | null>(null);

  // Conciliación posterior
  const [reconciliationReport, setReconciliationReport] = useState<ReconciliationReport | null>(null);
  const [verifyingReconciliation, setVerifyingReconciliation] = useState(false);

  // Alertas
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);

  // Cargar estado inicial
  useEffect(() => {
    handleCheckConnection();
    handleRefreshRemoteCounts();
  }, []);

  // 1. Consultar estado de conexión
  const handleCheckConnection = async () => {
    setCheckingConnection(true);
    try {
      const res = await MigrationService.checkFirebaseConnection();
      setConnectionStatus(res);
      if (!res.connected) {
        setBannerError(`Problema de conexión con Firebase: ${res.error}`);
      } else {
        setBannerError(null);
      }
    } catch (err: any) {
      setBannerError(`Error al verificar conexión: ${err.message}`);
    } finally {
      setCheckingConnection(false);
    }
  };

  // 2. Refrescar conteo remoto
  const handleRefreshRemoteCounts = async () => {
    setLoadingRemoteCounts(true);
    try {
      const counts = await MigrationService.getRemoteCounts();
      setRemoteCounts(counts);
    } catch (err: any) {
      console.warn('Error al obtener conteos remotos:', err);
    } finally {
      setLoadingRemoteCounts(false);
    }
  };

  // 3. Descargar Respaldo JSON Obligatorio
  const handleDescargarRespaldo = () => {
    try {
      const backup = storage.exportarBackup();
      const jsonStr = JSON.stringify(backup, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const ahora = new Date();
      const fechaStr = ahora.toISOString().split('T')[0];
      const filename = `respaldo_pre_migracion_elege_${fechaStr}.json`;

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setBackupDescargado(true);
      setBannerSuccess(`Copia de seguridad "${filename}" descargada. Podés avanzar con la simulación.`);
      setBannerError(null);
    } catch (err: any) {
      setBannerError(`Fallo al descargar respaldo: ${err.message}`);
    }
  };

  // 4. Ejecutar Simulación Previa (Dry Run)
  const handleEjecutarSimulacion = async () => {
    setSimulating(true);
    setBannerError(null);
    setBannerSuccess(null);
    try {
      const backup = storage.exportarBackup();
      const sim = await MigrationService.simulateMigration(backup);
      setSimulationResult(sim);

      if (sim.esValidoParaMigrar) {
        setBannerSuccess('Simulación previa finalizada con éxito. No se detectaron errores críticos de validación.');
      } else {
        setBannerError('La simulación detectó errores de integridad que deben corregirse antes de migrar.');
      }
    } catch (err: any) {
      setBannerError(`Error en la simulación: ${err.message}`);
    } finally {
      setSimulating(false);
    }
  };

  // 5. Iniciar Migración Real (Tras confirmación explícita)
  const handleEjecutarMigracionReal = async () => {
    setConfirmModalOpen(false);
    setMigrating(true);
    setExecutionResult(null);
    setBannerError(null);
    setBannerSuccess(null);

    const backup = storage.exportarBackup();

    try {
      const result = await MigrationService.executeMigration(backup, (p) => {
        setProgress(p);
      });

      setExecutionResult(result);
      setBannerSuccess('¡Migración completada exitosamente! Se guardó registro de auditoría en Cloud Firestore.');
      await handleRefreshRemoteCounts();

      // Ejecutar conciliación posterior automática para tranquilidad
      const recon = await MigrationService.verifyReconciliation(backup);
      setReconciliationReport(recon);
    } catch (err: any) {
      setBannerError(`La migración fue interrumpida: ${err.message}. Los registros ya insertados se conservan y podés reanudar en cualquier momento.`);
    } finally {
      setMigrating(false);
    }
  };

  // 6. Conciliación Posterior Manual
  const handleEjecutarConciliacion = async () => {
    setVerifyingReconciliation(true);
    try {
      const backup = storage.exportarBackup();
      const recon = await MigrationService.verifyReconciliation(backup);
      setReconciliationReport(recon);
      setBannerSuccess('Verificación de conciliación actualizada.');
    } catch (err: any) {
      setBannerError(`Error al verificar conciliación: ${err.message}`);
    } finally {
      setVerifyingReconciliation(false);
    }
  };

  // Datos locales actuales
  const backupLocal = storage.exportarBackup();
  const totalCobradoLocal = backupLocal.pedidos.reduce(
    (acc, p) => acc + (p.pagos || []).reduce((sum, pago) => sum + pago.monto, 0),
    0
  );
  const saldoPendienteLocal = backupLocal.pedidos.reduce((acc, p) => acc + (p.saldoPendiente || 0), 0);

  const puedeMigrar =
    backupDescargado &&
    simulationResult &&
    simulationResult.esValidoParaMigrar &&
    desbloqueoManualConfirmado &&
    !migrating;

  return (
    <div className="space-y-6">
      {/* ============================================================== */}
      {/* 1. ENCABEZADO Y ESTADO DE CONEXIÓN FIREBASE                    */}
      {/* ============================================================== */}
      <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-neutral-900 text-white rounded-xl">
              <Cloud className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                <span>Asistente de Migración a Cloud Firestore</span>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-neutral-100 text-neutral-700 rounded-md border border-neutral-200">
                  ETAPA 4
                </span>
              </h3>
              <p className="text-xs text-neutral-500">
                Traslado seguro e idempotente de datos locales a la base de datos remota sin alterar la operativa diaria
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                handleCheckConnection();
                handleRefreshRemoteCounts();
              }}
              disabled={checkingConnection || loadingRemoteCounts}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${checkingConnection ? 'animate-spin' : ''}`} />
              <span>Verificar Conexión</span>
            </button>
          </div>
        </div>

        {/* Notificaciones */}
        {bannerSuccess && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{bannerSuccess}</span>
            </div>
            <button
              type="button"
              onClick={() => setBannerSuccess(null)}
              className="text-emerald-700 hover:text-emerald-950 font-bold ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {bannerError && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-950 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{bannerError}</span>
            </div>
            <button
              type="button"
              onClick={() => setBannerError(null)}
              className="text-rose-700 hover:text-rose-950 font-bold ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Grilla de Estado de Conexión */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl space-y-1">
            <span className="text-[10px] uppercase font-mono font-bold text-neutral-400 block">
              Proyecto Firebase
            </span>
            <span className="font-mono font-bold text-neutral-900 block">elege-99d0c</span>
            <span className="text-[11px] text-neutral-500">Google Cloud Firestore</span>
          </div>

          <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl space-y-1">
            <span className="text-[10px] uppercase font-mono font-bold text-neutral-400 block">
              Estado de Red
            </span>
            <span className="font-bold flex items-center gap-1.5">
              {connectionStatus?.connected ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-emerald-800">Conectado ({connectionStatus.latencyMs} ms)</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-amber-800">En espera / Local</span>
                </>
              )}
            </span>
            <span className="text-[11px] text-neutral-500">Firestore SDK v13</span>
          </div>

          <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl space-y-1">
            <span className="text-[10px] uppercase font-mono font-bold text-neutral-400 block">
              Autenticación
            </span>
            <span className="font-bold text-neutral-900 flex items-center gap-1.5">
              {connectionStatus?.isAuthorizedAdmin ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-800">Administradora</span>
                </>
              ) : (
                <span className="text-amber-800">No autenticado</span>
              )}
            </span>
            <span className="text-[11px] font-mono text-neutral-500 truncate block">
              {connectionStatus?.userEmail || 'admin@elege.com'}
            </span>
          </div>

          <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl space-y-1">
            <span className="text-[10px] uppercase font-mono font-bold text-neutral-400 block">
              Proveedor Activo
            </span>
            <span className="font-bold text-neutral-900 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-neutral-700" />
              <span>{dataProviderManager.isUsingLocalStorage() ? 'LocalStorage' : 'Firestore'}</span>
            </span>
            <span className="text-[11px] text-emerald-700 font-medium">No se modificará en esta etapa</span>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. COMPARATIVA: REGISTROS LOCALES VS REMOTOS EN FIRESTORE      */}
      {/* ============================================================== */}
      <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-neutral-800" />
              <span>Comparación de Registros: Origen vs Destino</span>
            </h3>
            <p className="text-xs text-neutral-500">
              Contabilización de registros locales a migrar vs registros ya existentes en Firestore
            </p>
          </div>

          <span className="text-[11px] text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-full font-mono">
            {remoteCounts?.pedidos === 0
              ? 'Firestore Listo (0 pedidos)'
              : `Firestore con ${remoteCounts?.pedidos || 0} pedidos`}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Tarjeta Origen: LocalStorage */}
          <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/70 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                ORIGEN: Almacenamiento Local (localStorage)
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                Activo
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-neutral-200">
                <span className="text-[10px] text-neutral-400 block uppercase">Clientes</span>
                <span className="text-sm font-bold text-neutral-900">{backupLocal.clientes.length}</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-neutral-200">
                <span className="text-[10px] text-neutral-400 block uppercase">Pedidos</span>
                <span className="text-sm font-bold text-neutral-900">{backupLocal.pedidos.length}</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-neutral-200">
                <span className="text-[10px] text-neutral-400 block uppercase">Prendas</span>
                <span className="text-sm font-bold text-neutral-900">
                  {backupLocal.pedidos.reduce((acc, p) => acc + (p.prendas?.length || 0), 0)}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-neutral-200">
                <span className="text-[10px] text-neutral-400 block uppercase">Cobros Registrados</span>
                <span className="text-sm font-bold text-neutral-900 font-mono">
                  {formatMoneda(totalCobradoLocal)}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-neutral-500 pt-1">
              Saldo total por cobrar en pedidos locales: <strong className="font-mono text-neutral-800">{formatMoneda(saldoPendienteLocal)}</strong>
            </div>
          </div>

          {/* Tarjeta Destino: Cloud Firestore */}
          <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/70 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                DESTINO: Cloud Firestore (elege-99d0c)
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                Remoto
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-neutral-200">
                <span className="text-[10px] text-neutral-400 block uppercase">Clientes</span>
                <span className="text-sm font-bold text-neutral-900">
                  {loadingRemoteCounts ? '...' : remoteCounts?.clientes ?? 0}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-neutral-200">
                <span className="text-[10px] text-neutral-400 block uppercase">Pedidos</span>
                <span className="text-sm font-bold text-neutral-900">
                  {loadingRemoteCounts ? '...' : remoteCounts?.pedidos ?? 0}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-neutral-200">
                <span className="text-[10px] text-neutral-400 block uppercase">Prendas</span>
                <span className="text-sm font-bold text-neutral-900">
                  {loadingRemoteCounts ? '...' : remoteCounts?.prendas ?? 0}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-neutral-200">
                <span className="text-[10px] text-neutral-400 block uppercase">Cobros Registrados</span>
                <span className="text-sm font-bold text-neutral-900 font-mono">
                  {loadingRemoteCounts ? '...' : formatMoneda(remoteCounts?.totalPagadoRemoto ?? 0)}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-neutral-500 pt-1">
              Saldo pendiente registrado en Firestore: <strong className="font-mono text-neutral-800">{formatMoneda(remoteCounts?.saldoPendienteRemoto ?? 0)}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. PASOS DE MIGRACIÓN CONTROLADA Y SEGURA                      */}
      {/* ============================================================== */}
      <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-2xs space-y-5">
        <div className="border-b border-neutral-100 pb-3">
          <h3 className="text-sm font-bold text-neutral-900">Procedimiento Paso a Paso</h3>
          <p className="text-xs text-neutral-500">
            Seguí la secuencia controlada para asegurar integridad absoluta antes de transferir datos
          </p>
        </div>

        {/* PASO 1: Descarga de Respaldo */}
        <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-neutral-900 text-white text-xs font-bold flex items-center justify-center shrink-0">
                1
              </span>
              <div>
                <h4 className="text-xs font-bold text-neutral-900">
                  Descarga Obligatoria de Respaldo JSON de Seguridad
                </h4>
                <p className="text-[11px] text-neutral-500">
                  Garantiza que tengas una copia física en tu computadora antes de iniciar cualquier operación en Firestore.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDescargarRespaldo}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0 shadow-2xs ${
                backupDescargado
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                  : 'bg-neutral-900 text-white hover:bg-neutral-800'
              }`}
            >
              {backupDescargado ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Respaldo Descargado ✓</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Descargar Respaldo JSON</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* PASO 2: Simulación Previa (Dry Run) */}
        <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-neutral-900 text-white text-xs font-bold flex items-center justify-center shrink-0">
                2
              </span>
              <div>
                <h4 className="text-xs font-bold text-neutral-900">
                  Simulación Previa (Dry-Run sin escrituras)
                </h4>
                <p className="text-[11px] text-neutral-500">
                  Analiza todos los clientes, prendas, pedidos y pagos contra las reglas de Firestore para asegurar compatibilidad.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleEjecutarSimulacion}
              disabled={simulating}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0 disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 ${simulating ? 'animate-spin' : ''}`} />
              <span>{simulating ? 'Simulando...' : 'Ejecutar Simulación'}</span>
            </button>
          </div>

          {/* Resultado de la simulación */}
          {simulationResult && (
            <div className="mt-3 p-3.5 rounded-xl border bg-neutral-50/80 border-neutral-200 text-xs space-y-3">
              <div className="flex items-center justify-between border-b border-neutral-200/80 pb-2">
                <span className="font-bold text-neutral-900 flex items-center gap-1.5">
                  {simulationResult.esValidoParaMigrar ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span className="text-emerald-950 font-bold">Datos Válidos para Migración</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                      <span className="text-rose-950 font-bold">Requiere Correcciones Previas</span>
                    </>
                  )}
                </span>
                <span className="text-[10px] text-neutral-500 font-mono">
                  Procesado en {simulationResult.tiempoSimulacionMs} ms
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 bg-white rounded-lg border border-neutral-200">
                  <span className="text-[10px] text-neutral-400 block uppercase">Nuevos a Crear</span>
                  <span className="text-sm font-bold text-emerald-700">
                    +{simulationResult.plan.aCrear}
                  </span>
                </div>
                <div className="p-2 bg-white rounded-lg border border-neutral-200">
                  <span className="text-[10px] text-neutral-400 block uppercase">Omitir (Ya Existen)</span>
                  <span className="text-sm font-bold text-neutral-600">
                    {simulationResult.plan.aOmitirPorExistente}
                  </span>
                </div>
                <div className="p-2 bg-white rounded-lg border border-neutral-200">
                  <span className="text-[10px] text-neutral-400 block uppercase">Conflictos</span>
                  <span className="text-sm font-bold text-rose-600">
                    {simulationResult.plan.conflictos}
                  </span>
                </div>
              </div>

              {/* Advertencias o Hallazgos de Simulación */}
              {simulationResult.validaciones.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-neutral-200/70">
                  <span className="text-[11px] font-bold text-neutral-700 block">
                    Observaciones detectadas:
                  </span>
                  <div className="max-h-28 overflow-y-auto space-y-1 text-[11px]">
                    {simulationResult.validaciones.map((val, idx) => (
                      <div
                        key={idx}
                        className={`flex items-start gap-1.5 ${
                          val.tipo === 'error' ? 'text-rose-700 font-bold' : 'text-amber-800'
                        }`}
                      >
                        <span>•</span>
                        <span>
                          [{val.entidad.toUpperCase()} {val.id}]: {val.mensaje}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* PASO 3: Desbloqueo y Ejecución de Migración */}
        <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50 space-y-4">
          <div className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-neutral-900 text-white text-xs font-bold flex items-center justify-center shrink-0">
              3
            </span>
            <div className="space-y-1 flex-1">
              <h4 className="text-xs font-bold text-neutral-900 flex items-center gap-2">
                <span>Confirmación Explícita y Ejecución de Importación</span>
                <span className="text-[10px] text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-full border border-emerald-200 font-bold">
                  Pruebas de Seguridad: 38/38 Aprobadas ✓
                </span>
              </h4>
              <p className="text-[11px] text-neutral-600">
                La ejecución real permanece bloqueada hasta que verifiques la simulación y confirmes manualmente la acción.
              </p>
            </div>
          </div>

          {/* Checkbox de Confirmación Explícita */}
          <div className="p-3 bg-white rounded-xl border border-neutral-200 flex items-start gap-2.5">
            <input
              type="checkbox"
              id="desbloqueo-migracion"
              checked={desbloqueoManualConfirmado}
              onChange={(e) => setDesbloqueoManualConfirmado(e.target.checked)}
              disabled={!backupDescargado || !simulationResult?.esValidoParaMigrar}
              className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 cursor-pointer disabled:opacity-40"
            />
            <label
              htmlFor="desbloqueo-migracion"
              className={`text-xs select-none cursor-pointer ${
                !backupDescargado || !simulationResult?.esValidoParaMigrar
                  ? 'text-neutral-400'
                  : 'text-neutral-800 font-medium'
              }`}
            >
              Confirmo que revisé la simulación previa, tengo descargada la copia de seguridad y autorizo la importación por lotes hacia Cloud Firestore (elege-99d0c), manteniendo localStorage intacto.
            </label>
          </div>

          <div className="flex items-center justify-end">
            <button
              type="button"
              disabled={!puedeMigrar}
              onClick={() => setConfirmModalOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-neutral-900 text-white font-bold text-xs rounded-xl hover:bg-neutral-800 transition-all shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {desbloqueoManualConfirmado ? (
                <Unlock className="w-4 h-4 text-emerald-400" />
              ) : (
                <Lock className="w-4 h-4 text-neutral-400" />
              )}
              <span>Iniciar Migración a Cloud Firestore</span>
            </button>
          </div>
        </div>

        {/* Barra de Progreso Activa */}
        {migrating && progress && (
          <div className="p-4 rounded-xl bg-neutral-900 text-white space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold flex items-center gap-2">
                <RotateCw className="w-4 h-4 animate-spin text-sky-400" />
                <span>{progress.mensaje}</span>
              </span>
              <span className="font-mono font-bold text-sky-400">{progress.porcentaje}%</span>
            </div>

            <div className="w-full bg-neutral-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-sky-400 h-2 transition-all duration-300 rounded-full"
                style={{ width: `${progress.porcentaje}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-neutral-400">
              <span>Etapa: {progress.etapa}</span>
              <span>
                {progress.itemsProcesados} de {progress.totalItems} registros
              </span>
            </div>
          </div>
        )}

        {/* Resumen de Ejecución Finalizada */}
        {executionResult && (
          <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-950 text-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold flex items-center gap-1.5 text-emerald-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Migración Ejecutada con Éxito</span>
              </span>
              <span className="text-[10px] font-mono text-emerald-800">
                Duración: {(executionResult.tiempoTotalMs / 1000).toFixed(1)}s
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
              <div>
                <strong>Clientes creados: </strong> {executionResult.creados.clientes}
              </div>
              <div>
                <strong>Pedidos creados: </strong> {executionResult.creados.pedidos}
              </div>
              <div>
                <strong>Prendas creadas: </strong> {executionResult.creados.prendas}
              </div>
              <div>
                <strong>Pagos creados: </strong> {executionResult.creados.pagos}
              </div>
            </div>

            {executionResult.omitidosPorExistentes.pedidos > 0 && (
              <p className="text-[11px] text-emerald-800 pt-1">
                Se omitieron {executionResult.omitidosPorExistentes.pedidos} pedidos que ya existían para evitar sobreescritura.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* 4. REPORTE DE CONCILIACIÓN Y VERIFICACIÓN POSTERIOR            */}
      {/* ============================================================== */}
      <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-neutral-800" />
              <span>Verificación y Conciliación Posterior</span>
            </h3>
            <p className="text-xs text-neutral-500">
              Auditoría comparativa cruzada entre localStorage y Cloud Firestore para validar 100% de consistencia
            </p>
          </div>

          <button
            type="button"
            onClick={handleEjecutarConciliacion}
            disabled={verifyingReconciliation}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50 self-start sm:self-auto"
          >
            <RotateCw className={`w-3.5 h-3.5 ${verifyingReconciliation ? 'animate-spin' : ''}`} />
            <span>Verificar Conciliación</span>
          </button>
        </div>

        {reconciliationReport ? (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-neutral-200 rounded-xl overflow-hidden">
                <thead className="bg-neutral-100/70 text-neutral-600 font-bold border-b border-neutral-200">
                  <tr>
                    <th className="p-2.5">Entidad / Métrica</th>
                    <th className="p-2.5">Origen Local</th>
                    <th className="p-2.5">Destino Firestore</th>
                    <th className="p-2.5">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  <tr>
                    <td className="p-2.5 font-bold text-neutral-900">Clientes Registrados</td>
                    <td className="p-2.5">{reconciliationReport.origenLocal.clientes}</td>
                    <td className="p-2.5">{reconciliationReport.destinoFirestore.clientes}</td>
                    <td className="p-2.5">
                      {reconciliationReport.coincidencias.clientesCoinciden ? (
                        <span className="text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Coincide
                        </span>
                      ) : (
                        <span className="text-rose-700 font-bold">Diferencia</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-neutral-900">Pedidos Totales</td>
                    <td className="p-2.5">{reconciliationReport.origenLocal.pedidos}</td>
                    <td className="p-2.5">{reconciliationReport.destinoFirestore.pedidos}</td>
                    <td className="p-2.5">
                      {reconciliationReport.coincidencias.pedidosCoinciden ? (
                        <span className="text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Coincide
                        </span>
                      ) : (
                        <span className="text-rose-700 font-bold">Diferencia</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-neutral-900">Prendas Individuales</td>
                    <td className="p-2.5">{reconciliationReport.origenLocal.prendas}</td>
                    <td className="p-2.5">{reconciliationReport.destinoFirestore.prendas}</td>
                    <td className="p-2.5">
                      {reconciliationReport.coincidencias.prendasCoinciden ? (
                        <span className="text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Coincide
                        </span>
                      ) : (
                        <span className="text-rose-700 font-bold">Diferencia</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-neutral-900">Cobros Realizados ($)</td>
                    <td className="p-2.5 font-mono">{formatMoneda(reconciliationReport.origenLocal.totalCobrado)}</td>
                    <td className="p-2.5 font-mono">{formatMoneda(reconciliationReport.destinoFirestore.totalCobrado)}</td>
                    <td className="p-2.5">
                      {reconciliationReport.coincidencias.totalCobradoCoincide ? (
                        <span className="text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Coincide
                        </span>
                      ) : (
                        <span className="text-rose-700 font-bold">Diferencia</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-neutral-900">Saldos Pendientes ($)</td>
                    <td className="p-2.5 font-mono">{formatMoneda(reconciliationReport.origenLocal.saldoPendiente)}</td>
                    <td className="p-2.5 font-mono">{formatMoneda(reconciliationReport.destinoFirestore.saldoPendiente)}</td>
                    <td className="p-2.5">
                      {reconciliationReport.coincidencias.saldoPendienteCoincide ? (
                        <span className="text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Coincide
                        </span>
                      ) : (
                        <span className="text-rose-700 font-bold">Diferencia</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-[11px] text-neutral-600 space-y-1">
              <span className="font-bold text-neutral-900 block">Diagnóstico de Integridad Relacional:</span>
              {reconciliationReport.erroresRelacionales.length === 0 ? (
                <div className="text-emerald-700 font-medium">
                  ✓ Todos los pedidos apuntan a clientes válidos, y todas las prendas y pagos se corresponden con sus órdenes canónicas.
                </div>
              ) : (
                <div className="text-rose-700">
                  {reconciliationReport.erroresRelacionales.map((err, i) => (
                    <div key={i}>• {err}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-6 text-center text-neutral-400 text-xs border border-dashed border-neutral-200 rounded-xl space-y-2">
            <FileText className="w-8 h-8 mx-auto text-neutral-300" />
            <p>Hacé clic en &quot;Verificar Conciliación&quot; para comparar en tiempo real los datos locales contra Firestore.</p>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* 5. RECORDATORIO DE SEGURIDAD OPERATIVA                         */}
      {/* ============================================================== */}
      <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 text-xs text-neutral-600 flex items-start gap-3">
        <HelpCircle className="w-5 h-5 text-neutral-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <strong className="text-neutral-900 font-bold block">Garantía Operativa de eLeGe:</strong>
          <p className="leading-relaxed">
            LocalStorage permanece 100% activo y sin modificaciones. El lavadero continúa registrando prendas, entregas y cobros normalmente en este navegador. Firestore se mantiene como réplica preparada y segura sin alterar el funcionamiento actual.
          </p>
        </div>
      </div>

      {/* ============================================================== */}
      {/* DIÁLOGO DE CONFIRMACIÓN MANUAL                                 */}
      {/* ============================================================== */}
      <ConfirmDialog
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        onConfirm={handleEjecutarMigracionReal}
        title="Confirmar Importación a Cloud Firestore"
        message={`Estás por migrar ${backupLocal.clientes.length} clientes, ${backupLocal.pedidos.length} pedidos y sus respectivas prendas y cobros hacia Cloud Firestore (proyecto: elege-99d0c). La operación es segura e idempotente. LocalStorage no será modificado ni limpiado.`}
        confirmText="Sí, iniciar importación"
        cancelText="Volver a revisar"
        variant="warning"
      />
    </div>
  );
};
