import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
  Download,
  Upload,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  FileJson,
  Calendar,
  Users,
  Shirt,
  Receipt,
  Building,
  Save,
  Printer,
  FileCheck,
  AlertCircle,
  HelpCircle,
  UserCheck,
  LogOut,
  KeyRound,
  Database,
} from 'lucide-react';
import { ConfiguracionSistema, BackupPackage, BackupValidationResult } from '../../types';
import { storage } from '../../services/storage';
import { formatMoneda, formatFechaHora } from '../../utils/formatters';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { AUTHORIZED_ADMIN_UIDS } from '../../firebase/adminConfig';
import { dataProviderManager } from '../../services/dataProvider';
import { DatabaseMigrationWizard } from './DatabaseMigrationWizard';

interface SettingsViewProps {
  onDataChanged: () => void;
  onLogout?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onDataChanged, onLogout }) => {
  const { currentUser } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<'backup' | 'database' | 'comercio' | 'tickets' | 'sesion'>('backup');
  const [config, setConfig] = useState<ConfiguracionSistema>(storage.getConfiguracion());
  const [guardadoExitoso, setGuardadoExitoso] = useState(false);

  // Estados de Backup
  const [archivoSeleccionado, setArchivoSeleccionado] = useState<File | null>(null);
  const [resultadoValidacion, setResultadoValidacion] = useState<BackupValidationResult | null>(null);
  const [crearRespaldoPrevio, setCrearRespaldoPrevio] = useState(true);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  // Snapshot de seguridad existente
  const [safetySnapshot, setSafetySnapshot] = useState<BackupPackage | null>(storage.obtenerSnapshotSeguridad());

  // Diálogo de confirmación para restaurar
  const [confirmRestoreModal, setConfirmRestoreModal] = useState(false);
  const [confirmUndoModal, setConfirmUndoModal] = useState(false);
  const [confirmResetDemoModal, setConfirmResetDemoModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setConfig(storage.getConfiguracion());
    setSafetySnapshot(storage.obtenerSnapshotSeguridad());
  }, []);

  // --- EXPORTAR BACKUP ---
  const handleExportarBackup = () => {
    try {
      const backup = storage.exportarBackup();
      const jsonStr = JSON.stringify(backup, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const ahora = new Date();
      const fechaStr = ahora.toISOString().split('T')[0];
      const horaStr = `${String(ahora.getHours()).padStart(2, '0')}-${String(ahora.getMinutes()).padStart(2, '0')}`;
      const filename = `respaldo_elege_${fechaStr}_${horaStr}.json`;

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setMensajeExito(`Copia de seguridad exportada correctamente: "${filename}".`);
      setMensajeError(null);
      setTimeout(() => setMensajeExito(null), 6000);
    } catch (err: any) {
      setMensajeError(`Error al generar la copia de seguridad: ${err.message}`);
    }
  };

  // --- LECTURA Y VALIDACIÓN DE ARCHIVO ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setArchivoSeleccionado(file);
    setMensajeExito(null);
    setMensajeError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const res = storage.validarBackup(content);
      setResultadoValidacion(res);
      if (!res.esValido) {
        setMensajeError('El archivo seleccionado contiene errores y no puede restaurarse.');
      }
    };
    reader.onerror = () => {
      setMensajeError('Error al leer el archivo desde el dispositivo.');
      setResultadoValidacion(null);
    };
    reader.readAsText(file);
  };

  // --- EJECUTAR RESTAURACIÓN ---
  const handleEjecutarRestauracion = () => {
    if (!resultadoValidacion?.backupPackage) return;

    const res = storage.restaurarBackup(resultadoValidacion.backupPackage, crearRespaldoPrevio);
    if (res.exito) {
      setMensajeExito(res.mensaje);
      setMensajeError(null);
      setArchivoSeleccionado(null);
      setResultadoValidacion(null);
      setSafetySnapshot(storage.obtenerSnapshotSeguridad());
      if (fileInputRef.current) fileInputRef.current.value = '';
      onDataChanged();
    } else {
      setMensajeError(res.mensaje);
    }
    setConfirmRestoreModal(false);
  };

  // --- DESHACER / RESTAURAR SNAPSHOT DE SEGURIDAD ---
  const handleEjecutarDeshacer = () => {
    const res = storage.restaurarSnapshotSeguridad();
    if (res.exito) {
      setMensajeExito('Se deshizo la restauración y se recuperaron los datos anteriores exitosamente.');
      setMensajeError(null);
      setSafetySnapshot(storage.obtenerSnapshotSeguridad());
      onDataChanged();
    } else {
      setMensajeError(res.mensaje);
    }
    setConfirmUndoModal(false);
  };

  // --- DESCARGAR SNAPSHOT DE SEGURIDAD ---
  const handleDescargarSnapshot = () => {
    if (!safetySnapshot) return;
    const jsonStr = JSON.stringify(safetySnapshot, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `respaldo_seguridad_previo_elege.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // --- GUARDAR CONFIGURACIÓN GENERAL ---
  const handleGuardarConfiguracion = (e: React.FormEvent) => {
    e.preventDefault();
    const actualizada = storage.saveConfiguracion(config);
    setConfig(actualizada);
    setGuardadoExitoso(true);
    setTimeout(() => setGuardadoExitoso(false), 4000);
  };

  const metricasActuales = storage.exportarBackup().metadata;

  return (
    <div className="w-full min-w-0 max-w-full space-y-6">
      {/* Encabezado Principal */}
      <div className="min-w-0 w-full bg-white p-4 sm:p-5 rounded-2xl border border-neutral-200 shadow-2xs flex flex-col gap-4">
        <div>
          <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
            <Building className="w-5 h-5 text-neutral-700" />
            Configuración del Sistema y Resguardos
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Gestión de copias de seguridad locales, parámetros de impresión y datos comerciales
          </p>
        </div>

        {/* Pestañas secundarias */}
        <div className="flex w-full min-w-0 max-w-full items-center gap-1.5 overflow-x-auto overscroll-x-contain bg-neutral-100 p-1.5 rounded-xl border border-neutral-200 text-xs [scrollbar-width:thin]">
          <button
            type="button"
            onClick={() => setActiveSubTab('backup')}
            className={`shrink-0 whitespace-nowrap px-3 py-2 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'backup'
                ? 'bg-neutral-900 text-white shadow-2xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Copias de Seguridad</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('database')}
            className={`shrink-0 whitespace-nowrap px-3 py-2 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'database'
                ? 'bg-neutral-900 text-white shadow-2xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Base de datos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('comercio')}
            className={`shrink-0 whitespace-nowrap px-3 py-2 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'comercio'
                ? 'bg-neutral-900 text-white shadow-2xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>Datos del Lavadero</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('tickets')}
            className={`shrink-0 whitespace-nowrap px-3 py-2 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'tickets'
                ? 'bg-neutral-900 text-white shadow-2xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Impresión Térmica</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('sesion')}
            className={`shrink-0 whitespace-nowrap px-3 py-2 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'sesion'
                ? 'bg-neutral-900 text-white shadow-2xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Sesión Administradora</span>
          </button>
        </div>
      </div>

      {/* Alertas Globales de Notificación */}
      {mensajeExito && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-medium flex items-center justify-between shadow-2xs">
          <div className="flex min-w-0 items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{mensajeExito}</span>
          </div>
          <button
            type="button"
            onClick={() => setMensajeExito(null)}
            className="text-emerald-700 hover:text-emerald-950 font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {mensajeError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs font-medium flex items-center justify-between shadow-2xs">
          <div className="flex min-w-0 items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{mensajeError}</span>
          </div>
          <button
            type="button"
            onClick={() => setMensajeError(null)}
            className="text-rose-700 hover:text-rose-950 font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ========================================================== */}
      {/* 1. SECCIÓN: COPIAS DE SEGURIDAD (BACKUP Y RESTAURACIÓN)     */}
      {/* ========================================================== */}
      {activeSubTab === 'backup' && (
        <div className="min-w-0 space-y-5">
          {/* Fila de Exportar e Importar */}
          <div className="grid min-w-0 grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Card: Exportar Copia de Seguridad */}
            <div className="min-w-0 w-full bg-white p-4 sm:p-5 rounded-2xl border border-neutral-200 shadow-2xs flex flex-col justify-between space-y-4">
              <div className="min-w-0 space-y-3">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="p-2 rounded-xl bg-neutral-100 text-neutral-800">
                    <Download className="w-4 h-4 text-neutral-900" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900">Exportar Copia de Seguridad</h3>
                    <p className="text-[11px] text-neutral-500">
                      Descargá un archivo JSON con todos los datos del sistema para resguardar fuera del navegador.
                    </p>
                  </div>
                </div>

                {/* Resumen de registros a exportar */}
                <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl space-y-2">
                  <span className="text-[11px] font-bold text-neutral-600 block uppercase tracking-wider">
                    Contenido actual del sistema:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-neutral-700">
                      <Users className="w-3.5 h-3.5 text-neutral-400" />
                      <span>{metricasActuales.totalClientes} clientes</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-neutral-700">
                      <Receipt className="w-3.5 h-3.5 text-neutral-400" />
                      <span>{metricasActuales.totalPedidos} pedidos</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-neutral-700">
                      <Shirt className="w-3.5 h-3.5 text-neutral-400" />
                      <span>{metricasActuales.totalPrendas} prendas registradas</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-neutral-700">
                      <span className="font-mono font-bold">$</span>
                      <span>{metricasActuales.totalPagos} pagos ({formatMoneda(metricasActuales.importeTotalHistorico)})</span>
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-neutral-500 leading-relaxed">
                  El archivo generado incluye clientes, pedidos, historial de pagos, prendas, configuraciones y códigos QR permanentes. Formato universal compatible para migración futura a Cloud Firestore.
                </div>
              </div>

              <button
                type="button"
                onClick={handleExportarBackup}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-neutral-900 text-white font-bold text-xs rounded-xl hover:bg-neutral-800 transition-all shadow-xs cursor-pointer active:scale-98"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Descargar Copia Completa (.JSON)</span>
              </button>
            </div>

            {/* Card: Importar y Restaurar Copia */}
            <div className="min-w-0 w-full bg-white p-4 sm:p-5 rounded-2xl border border-neutral-200 shadow-2xs flex flex-col justify-between space-y-4">
              <div className="min-w-0 space-y-3">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="p-2 rounded-xl bg-neutral-100 text-neutral-800">
                    <Upload className="w-4 h-4 text-neutral-900" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900">Importar y Restaurar Copia</h3>
                    <p className="text-[11px] text-neutral-500">
                      Seleccioná un archivo de respaldo generado previamente para restaurar el estado completo.
                    </p>
                  </div>
                </div>

                {/* Zona de Selección de Archivo */}
                <div className="border-2 border-dashed border-neutral-300 hover:border-neutral-500 rounded-xl p-4 text-center transition-colors bg-neutral-50/50">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".json,application/json"
                    onChange={handleFileChange}
                    className="hidden"
                    id="backup-file-input"
                  />
                  <label
                    htmlFor="backup-file-input"
                    className="cursor-pointer flex min-w-0 flex-col items-center justify-center gap-1.5"
                  >
                    <FileJson className="w-8 h-8 text-neutral-400" />
                    <span className="text-xs font-bold text-neutral-800 break-all">
                      {archivoSeleccionado ? archivoSeleccionado.name : 'Hacé clic para seleccionar archivo .JSON'}
                    </span>
                    <span className="text-[11px] text-neutral-500">
                      {archivoSeleccionado
                        ? `${(archivoSeleccionado.size / 1024).toFixed(1)} KB`
                        : 'Archivos válidos de respaldo de Lavadero eLeGe'}
                    </span>
                  </label>
                </div>

                {/* Panel de Validación de Integridad */}
                {resultadoValidacion && (
                  <div
                    className={`p-3.5 rounded-xl border text-xs space-y-2.5 ${
                      resultadoValidacion.esValido
                        ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950'
                        : 'bg-rose-50 border-rose-300 text-rose-950'
                    }`}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className="font-bold flex items-center gap-1.5">
                        {resultadoValidacion.esValido ? (
                          <>
                            <FileCheck className="w-4 h-4 text-emerald-600" />
                            <span>Archivo Verificado e Íntegro</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-4 h-4 text-rose-600" />
                            <span>Archivo No Válido</span>
                          </>
                        )}
                      </span>
                      {resultadoValidacion.resumen && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white border border-neutral-200">
                          Esquema v{resultadoValidacion.resumen.versionEsquema}
                        </span>
                      )}
                    </div>

                    {resultadoValidacion.resumen && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] pt-1 border-t border-emerald-200/60">
                        <div>
                          <strong className="text-neutral-900 font-bold">Fecha: </strong>
                          {formatFechaHora(resultadoValidacion.resumen.fecha)}
                        </div>
                        <div>
                          <strong className="text-neutral-900 font-bold">Clientes: </strong>
                          {resultadoValidacion.resumen.totalClientes}
                        </div>
                        <div>
                          <strong className="text-neutral-900 font-bold">Pedidos: </strong>
                          {resultadoValidacion.resumen.totalPedidos}
                        </div>
                        <div>
                          <strong className="text-neutral-900 font-bold">Prendas: </strong>
                          {resultadoValidacion.resumen.totalPrendas}
                        </div>
                      </div>
                    )}

                    {resultadoValidacion.errores.length > 0 && (
                      <div className="space-y-1 text-rose-800 text-[11px] font-medium pt-1">
                        {resultadoValidacion.errores.map((err, i) => (
                          <div key={i}>• {err}</div>
                        ))}
                      </div>
                    )}

                    {resultadoValidacion.advertencias.length > 0 && (
                      <div className="space-y-0.5 text-amber-800 text-[11px] pt-1">
                        <span className="font-bold block">Avisos de compatibilidad:</span>
                        {resultadoValidacion.advertencias.map((adv, i) => (
                          <div key={i}>• {adv}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Botón de Restaurar y Checkbox de Respaldo Previo */}
              <div className="space-y-2 pt-2">
                {resultadoValidacion?.esValido && (
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-neutral-700 select-none">
                    <input
                      type="checkbox"
                      checked={crearRespaldoPrevio}
                      onChange={(e) => setCrearRespaldoPrevio(e.target.checked)}
                      className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
                    />
                    <span>
                      Crear respaldo automático de seguridad previo antes de reemplazar
                    </span>
                  </label>
                )}

                <button
                  type="button"
                  disabled={!resultadoValidacion?.esValido}
                  onClick={() => setConfirmRestoreModal(true)}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-neutral-900 text-white font-bold text-xs rounded-xl hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer active:scale-98"
                >
                  <Upload className="w-4 h-4" />
                  <span>Restaurar Copia de Seguridad</span>
                </button>
              </div>
            </div>
          </div>

          {/* Card: Respaldo de Seguridad Previo (Snapshot de Emergencia & Undo) */}
          <div className="min-w-0 w-full bg-white p-4 sm:p-5 rounded-2xl border border-neutral-200 shadow-2xs space-y-3">
            <div className="flex min-w-0 flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="space-y-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-800 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-600" />
                  Respaldo Automático de Seguridad Previo
                </h3>
                <p className="text-xs text-neutral-500">
                  Cada vez que realizás una restauración, el sistema guarda una copia completa de los datos que fueron reemplazados para permitirte deshacer cualquier cambio accidental.
                </p>
              </div>

              {safetySnapshot && (
                <button
                  type="button"
                  onClick={handleDescargarSnapshot}
                  className="px-3 py-1.5 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded-xl transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5 shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar Copia Previa</span>
                </button>
              )}
            </div>

            {safetySnapshot ? (
              <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-neutral-900 font-bold">
                    <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                    <span>Guardado el {formatFechaHora(safetySnapshot.metadata.fechaGeneracion)}</span>
                  </div>
                  <div className="text-[11px] text-neutral-600">
                    Contiene {safetySnapshot.clientes.length} clientes, {safetySnapshot.pedidos.length} pedidos y {safetySnapshot.metadata.totalPrendas} prendas.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setConfirmUndoModal(true)}
                  className="px-4 py-2 bg-neutral-900 text-white font-bold text-xs rounded-xl hover:bg-neutral-800 transition-colors cursor-pointer shadow-xs active:scale-98 flex items-center justify-center gap-1.5 shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Deshacer y Restaurar este Respaldo</span>
                </button>
              </div>
            ) : (
              <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl text-center text-xs text-neutral-500">
                Aún no se ha realizado ninguna restauración en esta sesión. El respaldo previo se generará automáticamente cuando restaures una copia.
              </div>
            )}
          </div>

          {/* Card: Buenas Prácticas de Respaldo */}
          <div className="min-w-0 p-4 bg-amber-50/70 border border-amber-200 rounded-2xl flex items-start gap-3 text-xs text-amber-900">
            <HelpCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="block font-bold">Recomendación para el operador de Lavadero eLeGe:</strong>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Descargá una copia de seguridad al finalizar cada jornada de trabajo o cada semana laboral. Podés guardar el archivo en un pendrive, Google Drive o enviártelo por correo electrónico para garantizar continuidad operativa ante cualquier fallo del equipo físico.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* 2. SECCIÓN: BASE DE DATOS Y ASISTENTE DE MIGRACIÓN         */}
      {/* ========================================================== */}
      {activeSubTab === 'database' && (
        <DatabaseMigrationWizard />
      )}

      {/* ========================================================== */}
      {/* 3. SECCIÓN: DATOS DEL LAVADERO                             */}
      {/* ========================================================== */}
      {activeSubTab === 'comercio' && (
        <form onSubmit={handleGuardarConfiguracion} className="min-w-0 space-y-4">
          <div className="min-w-0 w-full bg-white p-4 sm:p-5 rounded-2xl border border-neutral-200 shadow-2xs space-y-4">
            <div className="border-b border-neutral-100 pb-3">
              <h3 className="text-sm font-bold text-neutral-900">Información del Establecimiento</h3>
              <p className="text-xs text-neutral-500">
                Estos datos aparecen en los comprobantes y etiquetas generadas para los clientes.
              </p>
            </div>

            <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  Nombre Comercial
                </label>
                <input
                  type="text"
                  required
                  value={config.nombreComercio}
                  onChange={(e) => setConfig({ ...config, nombreComercio: e.target.value })}
                  className="w-full min-w-0 max-w-full bg-neutral-50 border border-neutral-300 focus:border-neutral-500 rounded-xl px-3 py-2 text-xs text-neutral-900 outline-none font-semibold shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  Teléfono / WhatsApp de Contacto
                </label>
                <input
                  type="text"
                  required
                  value={config.telefono}
                  onChange={(e) => setConfig({ ...config, telefono: e.target.value })}
                  className="w-full min-w-0 max-w-full bg-neutral-50 border border-neutral-300 focus:border-neutral-500 rounded-xl px-3 py-2 text-xs text-neutral-900 outline-none font-mono shadow-2xs"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  Dirección del Local
                </label>
                <input
                  type="text"
                  value={config.direccion}
                  onChange={(e) => setConfig({ ...config, direccion: e.target.value })}
                  placeholder="Ej: Av. Corrientes 3450, CABA"
                  className="w-full min-w-0 max-w-full bg-neutral-50 border border-neutral-300 focus:border-neutral-500 rounded-xl px-3 py-2 text-xs text-neutral-900 outline-none shadow-2xs"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  Mensaje de Pie en Tickets
                </label>
                <textarea
                  rows={2}
                  value={config.lemaOTicketPie}
                  onChange={(e) => setConfig({ ...config, lemaOTicketPie: e.target.value })}
                  placeholder="Ej: Muchas gracias por su confianza. Cuidado artesanal."
                  className="w-full min-w-0 max-w-full bg-neutral-50 border border-neutral-300 focus:border-neutral-500 rounded-xl px-3 py-2 text-xs text-neutral-900 outline-none shadow-2xs resize-none"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-neutral-200">
              <span className="text-xs text-neutral-500">
                {guardadoExitoso && <strong className="text-emerald-700">✓ Cambios guardados correctamente</strong>}
              </span>

              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-neutral-900 text-white font-bold text-xs rounded-xl hover:bg-neutral-800 transition-all shadow-xs cursor-pointer active:scale-98"
              >
                <Save className="w-4 h-4" />
                <span>Guardar Parámetros</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ========================================================== */}
      {/* 3. SECCIÓN: IMPRESIÓN Y PREFERENCIAS OPERATIVAS            */}
      {/* ========================================================== */}
      {activeSubTab === 'tickets' && (
        <form onSubmit={handleGuardarConfiguracion} className="min-w-0 space-y-4">
          <div className="min-w-0 w-full bg-white p-4 sm:p-5 rounded-2xl border border-neutral-200 shadow-2xs space-y-4">
            <div className="border-b border-neutral-100 pb-3">
              <h3 className="text-sm font-bold text-neutral-900">Parámetros de Impresión Térmica</h3>
              <p className="text-xs text-neutral-500">
                Configuración del ancho de papel para tickets térmicos y tiempos estándar de entrega
              </p>
            </div>

            <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  Ancho de Impresora Térmica Predeterminado
                </label>
                <select
                  value={config.formatoTicketDefecto}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      formatoTicketDefecto: e.target.value as '80mm' | '58mm',
                    })
                  }
                  className="w-full min-w-0 max-w-full bg-neutral-50 border border-neutral-300 focus:border-neutral-500 rounded-xl px-3 py-2 text-xs text-neutral-900 outline-none font-semibold shadow-2xs cursor-pointer"
                >
                  <option value="80mm">80 mm (Ticket estándar de mostrador)</option>
                  <option value="58mm">58 mm (Impresora compacta / mini POS)</option>
                </select>
                <span className="text-[11px] text-neutral-500 mt-1 block">
                  Aplica al imprimir comprobantes de cliente y etiquetas para prendas.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  Plazo de Entrega Predeterminado (Días)
                </label>
                <input
                  type="number"
                  min="1"
                  max="15"
                  value={config.diasEstimadosEntregaDefecto}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      diasEstimadosEntregaDefecto: Number(e.target.value),
                    })
                  }
                  className="w-full min-w-0 max-w-full bg-neutral-50 border border-neutral-300 focus:border-neutral-500 rounded-xl px-3 py-2 text-xs text-neutral-900 outline-none font-mono shadow-2xs"
                />
                <span className="text-[11px] text-neutral-500 mt-1 block">
                  Días sumados automáticamente a la fecha de recepción al crear nuevos pedidos.
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-neutral-200">
              <span className="text-xs text-neutral-500">
                {guardadoExitoso && <strong className="text-emerald-700">✓ Preferencias guardadas correctamente</strong>}
              </span>

              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-neutral-900 text-white font-bold text-xs rounded-xl hover:bg-neutral-800 transition-all shadow-xs cursor-pointer active:scale-98"
              >
                <Save className="w-4 h-4" />
                <span>Guardar Preferencias</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ========================================================== */}
      {/* 4. SECCIÓN: SESIÓN Y CONTROL DE ADMINISTRADORA             */}
      {/* ========================================================== */}
      {activeSubTab === 'sesion' && (
        <div className="min-w-0 space-y-4">
          <div className="min-w-0 w-full bg-white p-4 sm:p-5 rounded-2xl border border-neutral-200 shadow-2xs space-y-4">
            <div className="border-b border-neutral-100 pb-3">
              <h3 className="text-sm font-bold text-neutral-900 flex flex-wrap items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <span>Sesión de Administradora Activa</span>
              </h3>
              <p className="text-xs text-neutral-500">
                Detalles del usuario y credenciales autorizadas en Firebase Authentication
              </p>
            </div>

            <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="min-w-0 p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl space-y-1">
                <span className="text-[10px] uppercase font-mono tracking-wider text-neutral-400 font-bold block">
                  Correo Electrónico
                </span>
                <span className="text-xs font-bold text-neutral-900 block font-mono break-all">
                  {currentUser?.email || 'admin@elege.com'}
                </span>
              </div>

              <div className="min-w-0 p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl space-y-1">
                <span className="text-[10px] uppercase font-mono tracking-wider text-neutral-400 font-bold block">
                  Estado de Autorización
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  Administradora Autorizada (eLeGe)
                </span>
              </div>

              <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl space-y-1 sm:col-span-2">
                <span className="text-[10px] uppercase font-mono tracking-wider text-neutral-400 font-bold block">
                  Identificador de Usuario (UID Firebase)
                </span>
                <span className="text-xs font-mono text-neutral-700 break-all block select-all">
                  {currentUser?.uid || AUTHORIZED_ADMIN_UIDS[0]}
                </span>
              </div>

              <div className="min-w-0 p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl space-y-1">
                <span className="text-[10px] uppercase font-mono tracking-wider text-neutral-400 font-bold block">
                  Proyecto Firebase
                </span>
                <span className="text-xs font-mono font-bold text-neutral-800 block break-all">
                  elege-99d0c
                </span>
              </div>

              <div className="min-w-0 p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl space-y-1">
                <span className="text-[10px] uppercase font-mono tracking-wider text-neutral-400 font-bold block">
                  Dominio Auth
                </span>
                <span className="text-xs font-mono font-bold text-neutral-800 block break-all">
                  elege-99d0c.firebaseapp.com
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-neutral-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="text-[11px] text-neutral-500 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                <span>La sesión permanece activa al recargar el navegador de este dispositivo.</span>
              </div>

              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-all cursor-pointer shadow-2xs"
                >
                  <LogOut className="w-4 h-4 text-red-600" />
                  <span>Cerrar Sesión Segura</span>
                </button>
              )}
            </div>
          </div>

          {/* Estado de Proveedor de Datos y Preparación de Firestore */}
          <div className="min-w-0 w-full bg-white p-4 sm:p-5 rounded-2xl border border-neutral-200 shadow-2xs space-y-4">
            <div className="border-b border-neutral-100 pb-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-neutral-900 flex flex-wrap items-center gap-2">
                  <Database className="w-4 h-4 text-neutral-800" />
                  <span>Proveedor de Almacenamiento y Estado de Base de Datos</span>
                </h3>
                <p className="text-xs text-neutral-500">
                  Control explícito del motor de persistencia activo y preparación de Cloud Firestore
                </p>
              </div>

              <span className="px-2.5 py-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full">
                {dataProviderManager.isUsingLocalStorage() ? 'LocalStorage Activo' : 'Firestore Activo'}
              </span>
            </div>

            <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="min-w-0 p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl space-y-1.5">
                <span className="text-[10px] uppercase font-mono tracking-wider text-neutral-500 font-bold block">
                  Motor Activo Predeterminado
                </span>
                <span className="text-xs font-bold text-neutral-900 flex flex-wrap items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  Almacenamiento Local (LocalStorage)
                </span>
                <p className="text-[11px] text-neutral-500 leading-tight">
                  Todos los clientes, pedidos, prendas, pagos e historial se guardan en el navegador de este dispositivo con soporte para descargas JSON.
                </p>
              </div>

              <div className="min-w-0 p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl space-y-1.5">
                <span className="text-[10px] uppercase font-mono tracking-wider text-neutral-500 font-bold block">
                  Estado de Cloud Firestore (Etapa 3)
                </span>
                <span className="text-xs font-bold text-neutral-900 flex flex-wrap items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Preparado / En Espera de Migración
                </span>
                <p className="text-[11px] text-neutral-500 leading-tight">
                  Servicios CRUD desacoplados, reglas zero-trust para la administradora, índices compuestos e integridad contable listos en el código.
                </p>
              </div>
            </div>

            <div className="min-w-0 p-3 bg-neutral-100/70 border border-neutral-200 rounded-xl text-[11px] text-neutral-600 space-y-1">
              <strong className="text-neutral-800 block">Colecciones preparadas en Firestore (elege-99d0c):</strong>
              <div className="font-mono text-[10px] text-neutral-700 flex flex-wrap gap-2">
                <span className="bg-white px-2 py-0.5 rounded border border-neutral-200">clientes</span>
                <span className="bg-white px-2 py-0.5 rounded border border-neutral-200">pedidos</span>
                <span className="bg-white px-2 py-0.5 rounded border border-neutral-200">prendas</span>
                <span className="bg-white px-2 py-0.5 rounded border border-neutral-200">pagos</span>
                <span className="bg-white px-2 py-0.5 rounded border border-neutral-200">avisos_whatsapp</span>
                <span className="bg-white px-2 py-0.5 rounded border border-neutral-200">configuracion</span>
                <span className="bg-white px-2 py-0.5 rounded border border-neutral-200">auditoria</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODALES DE CONFIRMACIÓN SEGURA                             */}
      {/* ========================================================== */}

      {/* 1. Confirmar Reemplazo por Restauración */}
      <ConfirmDialog
        isOpen={confirmRestoreModal}
        onClose={() => setConfirmRestoreModal(false)}
        onConfirm={handleEjecutarRestauracion}
        title="Confirmar Restauración de Copia de Seguridad"
        message={`Esta acción reemplazará los datos actuales del sistema con la información contenida en el archivo seleccionado (${resultadoValidacion?.resumen?.totalClientes} clientes, ${resultadoValidacion?.resumen?.totalPedidos} pedidos). ${
          crearRespaldoPrevio
            ? 'Se generará automáticamente un respaldo de seguridad previo para que puedas deshacer la operación si fuera necesario.'
            : 'ADVERTENCIA: No se guardará un respaldo previo de los datos actuales.'
        }`}
        confirmText="Sí, restaurar datos"
        cancelText="Cancelar"
        variant="warning"
      />

      {/* 2. Confirmar Deshacer Restauración */}
      <ConfirmDialog
        isOpen={confirmUndoModal}
        onClose={() => setConfirmUndoModal(false)}
        onConfirm={handleEjecutarDeshacer}
        title="Deshacer y Restaurar Respaldo Previo"
        message="¿Estás seguro de que deseás volver al estado previo de seguridad? Se recuperarán los clientes, pedidos y prendas que tenías antes de la última restauración."
        confirmText="Sí, recuperar estado previo"
        cancelText="Cancelar"
        variant="warning"
      />
    </div>
  );
};
