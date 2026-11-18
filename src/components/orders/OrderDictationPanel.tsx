import React, { useState } from 'react';
import {
  Mic,
  MicOff,
  Sparkles,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Cliente, MetodoPago, TipoServicio } from '../../types';
import { useContinuousSpeechDictation } from '../../hooks/useContinuousSpeechDictation';
import {
  parseOrderDictation,
  OrderDictationDraft,
  ParsedGarmentDraft,
} from '../../utils/voiceOrderParser';
import { formatMoneda, SERVICIOS_INFO, METODO_PAGO_LABELS } from '../../utils/formatters';
import { NumericInput } from '../common/NumericInput';

interface OrderDictationPanelProps {
  clientes: Cliente[];
  onApplyDraft: (draft: OrderDictationDraft) => void;
}

export const OrderDictationPanel: React.FC<OrderDictationPanelProps> = ({
  clientes,
  onApplyDraft,
}) => {
  const [abierto, setAbierto] = useState(false);
  const [draft, setDraft] = useState<OrderDictationDraft | null>(null);

  const runInterpret = (rawText: string) => {
    if (!rawText.trim()) return;
    const parsed = parseOrderDictation(rawText, clientes);
    setDraft(parsed);
  };

  const {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    statusMessage,
    error,
    toggle,
    reset,
    setTranscriptManual,
    clearError,
  } = useContinuousSpeechDictation({
    lang: 'es-AR',
    onComplete: (finalText) => {
      runInterpret(finalText);
    },
  });

  const handleClear = () => {
    reset();
    setDraft(null);
  };

  const updateGarment = (tempId: string, patch: Partial<ParsedGarmentDraft>) => {
    if (!draft) return;
    setDraft({
      ...draft,
      prendas: draft.prendas.map((p) => (p.tempId === tempId ? { ...p, ...patch } : p)),
    });
  };

  const removeGarment = (tempId: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      prendas: draft.prendas.filter((p) => p.tempId !== tempId),
    });
  };

  const resolveTotalVsUnit = (item: ParsedGarmentDraft, mode: 'unitario' | 'total') => {
    const raw = item.montoOriginalDetectado || item.precioUnitario || 0;
    const newUnit = mode === 'unitario' ? raw : Math.round(raw / Math.max(1, item.cantidad));
    updateGarment(item.tempId, {
      precioUnitario: newUnit,
      ambiguedadPrecio: undefined,
    });
  };

  const handleConfirmApply = () => {
    if (!draft) return;
    onApplyDraft(draft);
    setAbierto(false);
  };

  return (
    <div className="rounded-2xl bg-neutral-50 border border-neutral-200 overflow-hidden">
      {/* Barra superior colapsable */}
      <div className="p-3 sm:p-3.5 flex flex-wrap items-center justify-between gap-2 bg-white border-b border-neutral-200/80">
        <button
          type="button"
          onClick={() => setAbierto(!abierto)}
          className="flex items-center gap-2 text-left min-w-0 flex-1 cursor-pointer"
        >
          <div className="w-8 h-8 rounded-xl bg-neutral-900 text-emerald-400 flex items-center justify-center shrink-0">
            <Mic className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-bold text-neutral-900 flex items-center gap-1.5">
              <span>Dictado por Voz o Texto</span>
              {isListening && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Escuchando
                </span>
              )}
            </div>
            <p className="text-[11px] text-neutral-500">
              Dictá o escribí el pedido completo para armar un borrador editable
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (!abierto) setAbierto(true);
              toggle();
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer min-h-[38px] ${
              isListening
                ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs'
                : 'bg-neutral-900 hover:bg-neutral-800 text-white shadow-2xs'
            }`}
          >
            {isListening ? (
              <>
                <MicOff className="w-3.5 h-3.5 shrink-0" />
                <span>Detener</span>
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Dictar</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setAbierto(!abierto)}
            aria-label={abierto ? 'Ocultar panel de dictado' : 'Mostrar panel de dictado'}
            className="p-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl cursor-pointer"
          >
            {abierto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {abierto && (
        <div className="p-3.5 sm:p-4 space-y-3">
          {/* Aviso de estado / soporte / error */}
          {!isSupported && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
              Este navegador no admite reconocimiento de voz nativo. Podés escribir o pegar el pedido abajo y usar{' '}
              <strong>Interpretar borrador</strong>.
            </div>
          )}

          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start justify-between gap-2">
              <span>{error}</span>
              <button
                type="button"
                onClick={clearError}
                className="text-rose-600 font-bold hover:underline shrink-0 cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          )}

          {isListening && (
            <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse shrink-0" />
                <span className="font-medium break-words">
                  {statusMessage || 'Escuchando continuo · Pausá tranquilo para pensar'}
                </span>
              </div>
              <span className="text-[11px] font-semibold text-emerald-700 shrink-0">
                Tocá "Detener" al terminar
              </span>
            </div>
          )}

          {/* Cuadro de texto en tiempo real (editable también por teclado) */}
          <div className="space-y-1.5">
            <textarea
              rows={3}
              value={transcript}
              onChange={(e) => setTranscriptManual(e.target.value)}
              disabled={isListening}
              placeholder='Ej: "Para Laura Gómez, tel 11 4567 8901, dos acolchados de dos plazas a quince mil cada uno, tres camisas cinco mil pesos cada una, dejó diez mil de seña por transferencia, entregar el viernes"'
              className="w-full bg-white border border-neutral-300 focus:border-neutral-600 disabled:bg-neutral-100 rounded-xl px-3 py-2 text-xs sm:text-sm text-neutral-900 outline-none resize-y shadow-2xs"
            />
            {isListening && interimTranscript && (
              <div className="text-xs text-neutral-500 italic px-1">
                Reconociendo ahora: &ldquo;{interimTranscript}&rdquo;
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={handleClear}
                disabled={isListening || (!transcript && !draft)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900 disabled:opacity-40 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Limpiar</span>
              </button>

              <button
                type="button"
                onClick={() => runInterpret(transcript)}
                disabled={isListening || !transcript.trim()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-white hover:bg-neutral-100 text-neutral-900 border border-neutral-300 rounded-xl shadow-2xs disabled:opacity-40 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>Interpretar borrador</span>
              </button>
            </div>
          </div>

          {/* BORRADOR EDITABLE INTERPRETADO */}
          {draft && (
            <div className="p-3.5 rounded-xl bg-white border border-neutral-300 space-y-3 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-2">
                <span className="text-xs font-bold text-neutral-900">
                  Borrador detectado (editable antes de cargar)
                </span>
                <span className="text-[11px] text-neutral-500">
                  Nada se guarda hasta que confirmes el pedido
                </span>
              </div>

              {draft.pendientesConfirmacion.length > 0 && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 space-y-1 text-xs text-amber-900">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Revisar antes de aplicar:</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                    {draft.pendientesConfirmacion.map((av, idx) => (
                      <li key={idx}>{av}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Cliente detectado */}
              <div className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2 text-xs">
                <div className="font-bold text-neutral-800">Cliente</div>
                {draft.clienteExistente ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-neutral-900 font-semibold">
                      Coincidencia encontrada: {draft.clienteExistente.nombre}{' '}
                      {draft.clienteExistente.apellido || ''} ({draft.clienteExistente.telefono})
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          clienteExistente: null,
                          clienteNuevo: {
                            nombre: draft.clienteExistente!.nombre,
                            apellido: draft.clienteExistente!.apellido || '',
                            telefono: draft.clienteExistente!.telefono,
                          },
                        })
                      }
                      className="text-[11px] text-neutral-600 hover:text-neutral-900 underline cursor-pointer"
                    >
                      Editar como nuevo
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Nombre"
                      value={draft.clienteNuevo?.nombre || ''}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          clienteNuevo: {
                            nombre: e.target.value,
                            apellido: draft.clienteNuevo?.apellido || '',
                            telefono: draft.clienteNuevo?.telefono || '',
                          },
                        })
                      }
                      className="bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs text-neutral-900"
                    />
                    <input
                      type="text"
                      placeholder="Apellido (opcional)"
                      value={draft.clienteNuevo?.apellido || ''}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          clienteNuevo: {
                            nombre: draft.clienteNuevo?.nombre || '',
                            apellido: e.target.value,
                            telefono: draft.clienteNuevo?.telefono || '',
                          },
                        })
                      }
                      className="bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs text-neutral-900"
                    />
                    <input
                      type="tel"
                      placeholder="Teléfono"
                      value={draft.clienteNuevo?.telefono || ''}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          clienteNuevo: {
                            nombre: draft.clienteNuevo?.nombre || '',
                            apellido: draft.clienteNuevo?.apellido || '',
                            telefono: e.target.value,
                          },
                        })
                      }
                      className="bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs text-neutral-900 font-mono"
                    />
                  </div>
                )}
              </div>

              {/* Prendas detectadas */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-neutral-800">
                  Prendas detectadas ({draft.prendas.length})
                </div>
                {draft.prendas.length === 0 ? (
                  <p className="text-xs text-neutral-500 italic">
                    No se detectaron prendas. Podés agregarlas manualmente abajo.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {draft.prendas.map((item) => {
                      const unit = item.precioUnitario ?? 0;
                      const subtotal = unit * Math.max(1, item.cantidad);
                      return (
                        <div
                          key={item.tempId}
                          className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2 text-xs"
                        >
                          <div className="grid grid-cols-12 gap-2 items-center">
                            <div className="col-span-3 sm:col-span-2">
                              <label className="block text-[10px] font-semibold text-neutral-500 mb-0.5">
                                Cant.
                              </label>
                              <NumericInput
                                min={1}
                                max={50}
                                value={item.cantidad}
                                onChange={(val) => updateGarment(item.tempId, { cantidad: Math.max(1, val) })}
                                className="w-full bg-white border border-neutral-300 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-neutral-900"
                              />
                            </div>

                            <div className="col-span-9 sm:col-span-4">
                              <label className="block text-[10px] font-semibold text-neutral-500 mb-0.5">
                                Prenda
                              </label>
                              <input
                                type="text"
                                value={item.tipo}
                                onChange={(e) => updateGarment(item.tempId, { tipo: e.target.value })}
                                className="w-full bg-white border border-neutral-300 rounded-lg px-2 py-1.5 text-xs font-semibold text-neutral-900"
                              />
                            </div>

                            <div className="col-span-6 sm:col-span-3">
                              <label className="block text-[10px] font-semibold text-neutral-500 mb-0.5">
                                Servicio
                              </label>
                              <select
                                value={item.servicio}
                                onChange={(e) =>
                                  updateGarment(item.tempId, { servicio: e.target.value as TipoServicio })
                                }
                                className="w-full bg-white border border-neutral-300 rounded-lg px-2 py-1.5 text-xs text-neutral-900"
                              >
                                {Object.entries(SERVICIOS_INFO).map(([k, info]) => (
                                  <option key={k} value={k}>
                                    {info.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="col-span-4 sm:col-span-2">
                              <label className="block text-[10px] font-semibold text-neutral-500 mb-0.5">
                                Unitario ($)
                              </label>
                              <NumericInput
                                min={0}
                                value={item.precioUnitario ?? 0}
                                onChange={(val) =>
                                  updateGarment(item.tempId, {
                                    precioUnitario: val,
                                    ambiguedadPrecio: val > 0 ? undefined : 'sin_precio',
                                  })
                                }
                                className="w-full bg-white border border-neutral-300 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-neutral-900"
                              />
                            </div>

                            <div className="col-span-2 sm:col-span-1 flex justify-end pt-4">
                              <button
                                type="button"
                                onClick={() => removeGarment(item.tempId)}
                                className="p-1.5 text-neutral-400 hover:text-rose-600 cursor-pointer"
                                title="Quitar del borrador"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-600">
                            <span>
                              Subtotal ({item.cantidad} × {formatMoneda(unit)}):{' '}
                              <strong className="font-mono text-neutral-900">{formatMoneda(subtotal)}</strong>
                            </span>

                            {item.ambiguedadPrecio === 'total_o_unitario' && item.montoOriginalDetectado && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-amber-800 font-semibold">¿Qué significa {formatMoneda(item.montoOriginalDetectado)}?</span>
                                <button
                                  type="button"
                                  onClick={() => resolveTotalVsUnit(item, 'unitario')}
                                  className="px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold cursor-pointer"
                                >
                                  Cada uno
                                </button>
                                <button
                                  type="button"
                                  onClick={() => resolveTotalVsUnit(item, 'total')}
                                  className="px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold cursor-pointer"
                                >
                                  Total ({formatMoneda(Math.round(item.montoOriginalDetectado / item.cantidad))} c/u)
                                </button>
                              </div>
                            )}

                            {item.ambiguedadPrecio === 'sin_precio' && (
                              <button
                                type="button"
                                onClick={() =>
                                  updateGarment(item.tempId, {
                                    precioUnitario: SERVICIOS_INFO[item.servicio]?.precioSugerido || 0,
                                    ambiguedadPrecio: undefined,
                                  })
                                }
                                className="text-[11px] text-neutral-700 underline cursor-pointer"
                              >
                                Usar sugerido ({formatMoneda(SERVICIOS_INFO[item.servicio]?.precioSugerido || 0)})
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Fecha y Seña */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-200 space-y-1">
                  <div className="font-bold text-neutral-800">Fecha estimada de entrega</div>
                  {draft.fechaEstimadaLabel && (
                    <div className="text-[11px] text-emerald-700 font-semibold capitalize">
                      Interpretado: {draft.fechaEstimadaLabel}
                    </div>
                  )}
                  <input
                    type="date"
                    value={draft.fechaEstimadaEntrega || ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        fechaEstimadaEntrega: e.target.value || null,
                        fechaEstimadaLabel: null,
                      })
                    }
                    className="w-full bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs font-mono"
                  />
                </div>

                <div className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-200 space-y-1">
                  <div className="font-bold text-neutral-800">Seña / Pago recibido</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <NumericInput
                      min={0}
                      placeholder="Importe"
                      value={draft.senia?.monto ?? 0}
                      onChange={(val) =>
                        setDraft({
                          ...draft,
                          senia:
                            val > 0 || draft.senia?.metodo
                              ? {
                                  monto: val,
                                  metodo: draft.senia?.metodo || 'efectivo',
                                }
                              : null,
                        })
                      }
                      className="w-full bg-white border border-neutral-300 rounded-lg px-2 py-1.5 text-xs font-mono font-bold"
                    />
                    <select
                      value={draft.senia?.metodo || 'efectivo'}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          senia: {
                            monto: draft.senia?.monto ?? 0,
                            metodo: e.target.value as MetodoPago,
                          },
                        })
                      }
                      className="w-full bg-white border border-neutral-300 rounded-lg px-2 py-1.5 text-xs"
                    >
                      {Object.entries(METODO_PAGO_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="w-full sm:w-auto px-3 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 cursor-pointer"
                >
                  Descartar borrador
                </button>
                <button
                  type="button"
                  onClick={handleConfirmApply}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Cargar borrador en el pedido</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
