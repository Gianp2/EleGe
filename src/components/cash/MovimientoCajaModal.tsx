import React, { useState, useEffect } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  History,
  Save,
  Ban,
} from 'lucide-react';
import {
  CategoriaMovimientoCaja,
  MetodoPago,
  MovimientoCaja,
  TipoMovimientoCaja,
} from '../../types';
import { Modal } from '../common/Modal';
import { NumericInput } from '../common/NumericInput';
import {
  CATEGORIA_CAJA_LABELS,
  CATEGORIAS_EGRESO,
  CATEGORIAS_INGRESO,
  METODO_PAGO_LABELS,
  formatFechaHora,
  formatMoneda,
  getLocalDateKey,
} from '../../utils/formatters';
import { storage } from '../../services/storage';

interface MovimientoCajaModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'create' | 'edit' | 'annul';
  tipoInicial?: TipoMovimientoCaja;
  movimiento?: MovimientoCaja | null;
  onSaved: () => void;
}

const CATEGORIAS_INGRESO_MANUAL: CategoriaMovimientoCaja[] = CATEGORIAS_INGRESO.filter(
  (c) => c === 'ingreso_manual' || c === 'ajuste_positivo'
);

export const MovimientoCajaModal: React.FC<MovimientoCajaModalProps> = ({
  isOpen,
  onClose,
  mode,
  tipoInicial = 'egreso',
  movimiento,
  onSaved,
}) => {
  const [tipo, setTipo] = useState<TipoMovimientoCaja>(tipoInicial);
  const [categoria, setCategoria] = useState<CategoriaMovimientoCaja>(
    tipoInicial === 'ingreso' ? 'ingreso_manual' : 'productos_limpieza'
  );
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState<number>(0);
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo');
  const [fechaDia, setFechaDia] = useState<string>(getLocalDateKey());
  const [horaStr, setHoraStr] = useState<string>('12:00');
  const [observaciones, setObservaciones] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setProcesando(false);
    setMotivo('');

    if (mode === 'create') {
      const now = new Date();
      setTipo(tipoInicial);
      setCategoria(tipoInicial === 'ingreso' ? 'ingreso_manual' : 'productos_limpieza');
      setConcepto('');
      setMonto(0);
      setMetodo('efectivo');
      setFechaDia(getLocalDateKey(now));
      setHoraStr(
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      );
      setObservaciones('');
    } else if (movimiento) {
      const d = new Date(movimiento.fecha);
      setTipo(movimiento.tipo);
      setCategoria(movimiento.categoria);
      setConcepto(movimiento.concepto);
      setMonto(movimiento.monto);
      setMetodo(movimiento.metodo);
      setFechaDia(getLocalDateKey(d));
      setHoraStr(
        !isNaN(d.getTime())
          ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
          : '12:00'
      );
      setObservaciones(movimiento.observaciones || '');
    }
  }, [isOpen, mode, tipoInicial, movimiento]);

  if (!isOpen) return null;

  const esPagoPedido = mode !== 'create' && movimiento?.origen === 'pedido_pago';

  const categoriasDisponibles =
    tipo === 'ingreso'
      ? esPagoPedido
        ? CATEGORIAS_INGRESO
        : CATEGORIAS_INGRESO_MANUAL
      : CATEGORIAS_EGRESO;

  const handleTipoChange = (nuevoTipo: TipoMovimientoCaja) => {
    if (mode !== 'create') return;
    setTipo(nuevoTipo);
    setCategoria(nuevoTipo === 'ingreso' ? 'ingreso_manual' : 'productos_limpieza');
  };

  const buildIsoFecha = (): string => {
    const [hh, mm] = (horaStr || '12:00').split(':').map((n) => parseInt(n, 10) || 0);
    const [yyyy, mo, dd] = fechaDia.split('-').map((n) => parseInt(n, 10));
    if (!yyyy || !mo || !dd) return new Date().toISOString();
    const localDate = new Date(yyyy, mo - 1, dd, hh, mm, 0);
    return isNaN(localDate.getTime()) ? new Date().toISOString() : localDate.toISOString();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (procesando) return;
    setError(null);
    setProcesando(true);

    if (mode === 'create') {
      const res = storage.registrarMovimientoCaja({
        tipo,
        categoria,
        concepto,
        monto,
        metodo,
        fecha: buildIsoFecha(),
        observaciones,
      });

      setProcesando(false);
      if (!res.ok) {
        setError(res.error || 'No se pudo registrar el movimiento.');
        return;
      }
      onSaved();
      onClose();
      return;
    }

    if (mode === 'edit' && movimiento) {
      const res = storage.corregirMovimientoCaja(
        movimiento.id,
        {
          concepto: esPagoPedido ? undefined : concepto,
          categoria: esPagoPedido ? undefined : categoria,
          monto,
          metodo,
          fecha: buildIsoFecha(),
          observaciones,
        },
        motivo
      );

      setProcesando(false);
      if (!res.ok) {
        setError(res.error || 'No se pudo actualizar el movimiento.');
        return;
      }
      onSaved();
      onClose();
      return;
    }

    if (mode === 'annul' && movimiento) {
      const res = storage.anularMovimientoCaja(movimiento.id, motivo);
      setProcesando(false);
      if (!res.ok) {
        setError(res.error || 'No se pudo anular el movimiento.');
        return;
      }
      onSaved();
      onClose();
    }
  };

  const modalTitle =
    mode === 'create'
      ? tipo === 'ingreso'
        ? 'Registrar Ingreso Manual'
        : 'Registrar Egreso / Gasto'
      : mode === 'edit'
      ? 'Corregir Movimiento de Caja'
      : 'Anular Movimiento de Caja';

  const modalSubtitle =
    mode === 'create'
      ? 'Asiento contable directo en Caja eLeGe'
      : movimiento
      ? `${movimiento.concepto} · ${formatMoneda(movimiento.monto)}`
      : '';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      subtitle={modalSubtitle}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-xs font-semibold text-rose-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {mode === 'annul' && movimiento ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 space-y-2">
              <div className="flex items-start gap-2.5">
                <Ban className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs text-rose-900">
                  <p className="font-bold text-sm">
                    ¿Confirmás la anulación de este {movimiento.tipo}?
                  </p>
                  <p>
                    El movimiento quedará marcado como <strong>Anulado</strong> en el historial para
                    conservar la trazabilidad contable (no se elimina físicamente).
                  </p>
                  {movimiento.origen === 'pedido_pago' && movimiento.codigoPedido && (
                    <p className="font-semibold text-rose-950 bg-rose-100/80 px-2.5 py-1.5 rounded-lg border border-rose-200">
                      Este cobro pertenece al Pedido {movimiento.codigoPedido}. Al anularlo, el
                      saldo pendiente del pedido se recalculará automáticamente.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-neutral-500 block">Concepto</span>
                <span className="font-bold text-neutral-900">{movimiento.concepto}</span>
              </div>
              <div className="text-right">
                <span className="text-neutral-500 block">Importe</span>
                <span className="font-mono font-extrabold text-neutral-900">
                  {formatMoneda(movimiento.monto)}
                </span>
              </div>
              <div>
                <span className="text-neutral-500 block">Medio</span>
                <span className="font-semibold text-neutral-800">
                  {METODO_PAGO_LABELS[movimiento.metodo]}
                </span>
              </div>
              <div className="text-right">
                <span className="text-neutral-500 block">Fecha</span>
                <span className="font-mono text-neutral-700">
                  {formatFechaHora(movimiento.fecha)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-800 mb-1">
                Motivo obligatorio de anulación *
              </label>
              <textarea
                rows={2}
                required
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: Error al cargar el importe o medio de pago equivocado"
                className="w-full bg-neutral-50 border border-neutral-300 focus:border-neutral-600 rounded-xl px-3 py-2 text-xs sm:text-sm text-neutral-900 outline-none resize-none"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3.5">
            {mode === 'create' && (
              <div className="grid grid-cols-2 gap-2 p-1 bg-neutral-100 rounded-xl border border-neutral-200">
                <button
                  type="button"
                  onClick={() => handleTipoChange('ingreso')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    tipo === 'ingreso'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-neutral-700 hover:bg-white/70'
                  }`}
                >
                  <ArrowDownLeft className="w-4 h-4" />
                  <span>Ingreso</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTipoChange('egreso')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    tipo === 'egreso'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-neutral-700 hover:bg-white/70'
                  }`}
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>Egreso / Gasto</span>
                </button>
              </div>
            )}

            {esPagoPedido && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                <strong>Cobro vinculado a Pedido {movimiento?.codigoPedido}:</strong> si corregís el
                importe o medio de pago, se actualizará automáticamente el historial de pagos y el
                saldo pendiente del pedido.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  Categoría *
                </label>
                <select
                  value={categoria}
                  disabled={esPagoPedido}
                  onChange={(e) => setCategoria(e.target.value as CategoriaMovimientoCaja)}
                  className="w-full bg-neutral-50 border border-neutral-300 rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold text-neutral-900 outline-none disabled:opacity-60"
                >
                  {categoriasDisponibles.map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORIA_CAJA_LABELS[cat]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  Importe ($) *
                </label>
                <NumericInput
                  value={monto}
                  min={1}
                  required
                  placeholder="Ej: 15000"
                  onChange={(val) => setMonto(val)}
                  className="w-full bg-neutral-50 border border-neutral-300 focus:border-neutral-600 rounded-xl px-3 py-2 text-sm font-mono font-extrabold text-neutral-900 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-800 mb-1">
                Concepto / Descripción *
              </label>
              <input
                type="text"
                required
                disabled={esPagoPedido}
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                placeholder={
                  tipo === 'ingreso'
                    ? 'Ej: Ajuste positivo o venta de producto'
                    : 'Ej: Compra jabón líquido y suavizante x 20L'
                }
                className="w-full bg-neutral-50 border border-neutral-300 focus:border-neutral-600 rounded-xl px-3 py-2 text-xs sm:text-sm text-neutral-900 font-medium outline-none disabled:opacity-60"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  Medio de pago *
                </label>
                <select
                  value={metodo}
                  onChange={(e) => setMetodo(e.target.value as MetodoPago)}
                  className="w-full bg-neutral-50 border border-neutral-300 rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold text-neutral-900 outline-none"
                >
                  {Object.entries(METODO_PAGO_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">Fecha *</label>
                <input
                  type="date"
                  required
                  value={fechaDia}
                  onChange={(e) => setFechaDia(e.target.value)}
                  className="w-full bg-neutral-50 border border-neutral-300 rounded-xl px-3 py-2 text-xs sm:text-sm font-mono text-neutral-900 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">Hora</label>
                <input
                  type="time"
                  value={horaStr}
                  onChange={(e) => setHoraStr(e.target.value)}
                  className="w-full bg-neutral-50 border border-neutral-300 rounded-xl px-3 py-2 text-xs sm:text-sm font-mono text-neutral-900 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-800 mb-1">
                Observaciones / Comprobante (opcional)
              </label>
              <input
                type="text"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Ej: Factura C #0002-145 o proveedor"
                className="w-full bg-neutral-50 border border-neutral-300 focus:border-neutral-600 rounded-xl px-3 py-2 text-xs sm:text-sm text-neutral-900 outline-none"
              />
            </div>

            {mode === 'edit' && (
              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  Motivo de la corrección *
                </label>
                <input
                  type="text"
                  required
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej: Se cargó en efectivo y fue por transferencia"
                  className="w-full bg-amber-50/60 border border-amber-300 focus:border-amber-500 rounded-xl px-3 py-2 text-xs sm:text-sm text-neutral-900 outline-none"
                />
              </div>
            )}
          </div>
        )}

        {/* Historial de cambios si existe */}
        {movimiento?.historialCambios && movimiento.historialCambios.length > 0 && (
          <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-600 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              <span>Historial de correcciones ({movimiento.historialCambios.length})</span>
            </div>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {movimiento.historialCambios.map((h, i) => (
                <div
                  key={i}
                  className="text-[11px] text-neutral-700 bg-white p-2 rounded-lg border border-neutral-200"
                >
                  <div className="flex justify-between gap-2 font-semibold text-neutral-900">
                    <span>{h.detalle}</span>
                    <span className="font-mono text-neutral-500 shrink-0">
                      {formatFechaHora(h.fecha)}
                    </span>
                  </div>
                  <div className="text-neutral-600 mt-0.5">Motivo: {h.motivo}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 pt-3 border-t border-neutral-200">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 text-xs sm:text-sm font-semibold text-neutral-700 hover:text-neutral-950 bg-neutral-100 hover:bg-neutral-200 rounded-xl transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={procesando}
            className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-5 py-2.5 text-xs sm:text-sm font-bold text-white rounded-xl transition-colors shadow-xs cursor-pointer disabled:opacity-50 ${
              mode === 'annul'
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-neutral-900 hover:bg-neutral-800'
            }`}
          >
            {mode === 'annul' ? (
              <>
                <Ban className="w-4 h-4" />
                <span>Confirmar Anulación</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>
                  {mode === 'create'
                    ? `Guardar ${tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}`
                    : 'Guardar Corrección'}
                </span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
