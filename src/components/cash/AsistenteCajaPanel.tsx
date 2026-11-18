import React, { useState } from 'react';
import {
  Mic,
  MicOff,
  Sparkles,
  Send,
  AlertCircle,
  CheckCircle2,
  Trash2,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import { useContinuousSpeechDictation } from '../../hooks/useContinuousSpeechDictation';
import {
  interpretCashAssistantCommand,
  CashAssistantResult,
  CashEntryDraft,
} from '../../utils/voiceCashParser';
import {
  CATEGORIA_CAJA_LABELS,
  CATEGORIAS_EGRESO,
  CATEGORIAS_INGRESO,
  METODO_PAGO_LABELS,
} from '../../utils/formatters';
import {
  CategoriaMovimientoCaja,
  MetodoPago,
  TipoMovimientoCaja,
} from '../../types';
import { NumericInput } from '../common/NumericInput';
import { storage } from '../../services/storage';

interface AsistenteCajaPanelProps {
  onApplyFilters?: (filters: NonNullable<CashAssistantResult['suggestedFilters']>) => void;
  onMovementSaved: () => void;
}

const EJEMPLOS_RAPIDOS = [
  '¿Cuánto ingresó hoy?',
  '¿Cuánto gastamos esta semana?',
  '¿Cuál es el balance de este mes?',
  '¿Cuánto efectivo tenemos en caja?',
  'Mostrame los gastos de productos de limpieza',
];

const CATEGORIAS_MANUALES_INGRESO = CATEGORIAS_INGRESO.filter(
  (c) => c === 'ingreso_manual' || c === 'ajuste_positivo'
);

export const AsistenteCajaPanel: React.FC<AsistenteCajaPanelProps> = ({
  onApplyFilters,
  onMovementSaved,
}) => {
  const [inputText, setInputText] = useState('');
  const [result, setResult] = useState<CashAssistantResult | null>(null);
  const [draft, setDraft] = useState<CashEntryDraft | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const runCommand = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setSaveMessage(null);
    const res = interpretCashAssistantCommand(clean);
    setResult(res);
    setDraft(res.draftEntry ? { ...res.draftEntry } : null);
    if (res.suggestedFilters && onApplyFilters) {
      onApplyFilters(res.suggestedFilters);
    }
  };

  const {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    statusMessage,
    error: micError,
    toggle,
    reset,
    setTranscriptManual,
    clearError,
  } = useContinuousSpeechDictation({
    lang: 'es-AR',
    onComplete: (finalText) => {
      if (finalText.trim()) {
        setInputText(finalText.trim());
        runCommand(finalText.trim());
      }
    },
  });

  const textoVisible = isListening
    ? `${transcript}${interimTranscript ? (transcript ? ' ' : '') + interimTranscript : ''}`
    : inputText;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runCommand(inputText);
  };

  const handleConfirmDraft = () => {
    if (!draft) return;
    if (!draft.monto || draft.monto <= 0) {
      setSaveMessage({ type: 'err', text: 'Indicá un importe mayor a cero antes de guardar.' });
      return;
    }

    const res = storage.registrarMovimientoCaja({
      tipo: draft.tipo,
      categoria: draft.categoria,
      concepto: draft.concepto,
      monto: draft.monto,
      metodo: draft.metodo,
      fecha: draft.fecha ? `${draft.fecha}T12:00:00` : undefined,
      observaciones: draft.observaciones,
    });

    if (!res.ok) {
      setSaveMessage({ type: 'err', text: res.error || 'No se pudo guardar el movimiento.' });
      return;
    }

    setSaveMessage({
      type: 'ok',
      text: `Movimiento "${draft.concepto}" guardado correctamente en Caja.`,
    });
    setDraft(null);
    onMovementSaved();
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-white border border-neutral-300 shadow-xs space-y-3.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Asistente de Caja eLeGe (Voz o Teclado)</span>
          </h3>
          <p className="text-xs text-neutral-600 mt-0.5">
            Consultá ingresos, gastos o efectivo real, o dictá un gasto/ingreso para revisar antes de guardar.
          </p>
        </div>

        {isSupported && (
          <button
            type="button"
            onClick={toggle}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 ${
              isListening
                ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs'
                : 'bg-neutral-900 hover:bg-neutral-800 text-white shadow-xs'
            }`}
          >
            {isListening ? (
              <>
                <MicOff className="w-4 h-4" />
                <span>Detener Dictado</span>
              </>
            ) : (
              <>
                <Mic className="w-4 h-4 text-emerald-400" />
                <span>Hablar con Asistente</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Indicador discreto de escucha activa */}
      {isListening && (
        <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2 text-xs text-emerald-900">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse shrink-0" />
            <span className="font-semibold">
              {statusMessage || 'Escuchando continuo... podés pausar para pensar.'} Tocá "Detener Dictado" al terminar.
            </span>
          </div>
        </div>
      )}

      {!isListening && statusMessage && (
        <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
          {statusMessage}
        </div>
      )}

      {micError && (
        <div className="px-3 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{micError}</span>
          </div>
          <button
            type="button"
            onClick={clearError}
            className="text-rose-700 font-bold hover:underline shrink-0 cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Entrada por teclado o edición del dictado */}
      <form onSubmit={handleManualSubmit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={textoVisible}
          disabled={isListening}
          onChange={(e) => {
            setInputText(e.target.value);
            setTranscriptManual(e.target.value);
          }}
          placeholder='Ej: "¿Cuánto ingresó hoy?" o "Gastamos 12 mil en jabón líquido"'
          className="flex-1 min-h-[42px] bg-neutral-50 border border-neutral-300 focus:border-neutral-600 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-neutral-900 outline-none"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isListening || !textoVisible.trim()}
            className="flex-1 sm:flex-initial min-h-[42px] inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Procesar</span>
          </button>
          {(inputText || result) && !isListening && (
            <button
              type="button"
              onClick={() => {
                setInputText('');
                reset();
                setResult(null);
                setDraft(null);
                setSaveMessage(null);
              }}
              className="min-w-[42px] min-h-[42px] flex items-center justify-center text-neutral-500 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded-xl transition-colors cursor-pointer"
              title="Limpiar"
              aria-label="Limpiar asistente"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </form>

      {/* Consultas rápidas en 1 clic (deslizable en móvil) */}
      <div className="flex sm:flex-wrap gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {EJEMPLOS_RAPIDOS.map((ej) => (
          <button
            key={ej}
            type="button"
            disabled={isListening}
            onClick={() => {
              setInputText(ej);
              setTranscriptManual(ej);
              runCommand(ej);
            }}
            className="shrink-0 min-h-[34px] px-2.5 py-1.5 text-[11px] font-semibold text-neutral-700 hover:text-neutral-950 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            {ej}
          </button>
        ))}
      </div>

      {/* Mensaje de confirmación de guardado */}
      {saveMessage && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            saveMessage.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {saveMessage.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{saveMessage.text}</span>
        </div>
      )}

      {/* Respuesta a consulta */}
      {result && result.intent !== 'draft_entry' && (
        <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2.5">
          <div>
            <div className="text-xs font-extrabold text-neutral-900">{result.answerTitle}</div>
            <p className="text-xs sm:text-sm text-neutral-700 mt-0.5 leading-relaxed">
              {result.answerText}
            </p>
          </div>

          {result.highlights && result.highlights.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {result.highlights.map((h, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-xl bg-white border border-neutral-200 min-w-0"
                >
                  <span className="text-[11px] text-neutral-500 block truncate">{h.label}</span>
                  <span
                    className={`text-sm font-mono font-extrabold block mt-0.5 ${
                      h.tone === 'emerald'
                        ? 'text-emerald-700'
                        : h.tone === 'rose'
                        ? 'text-rose-700'
                        : h.tone === 'amber'
                        ? 'text-amber-700'
                        : 'text-neutral-900'
                    }`}
                  >
                    {h.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Borrador editable antes de guardar */}
      {draft && (
        <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-300 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-extrabold text-neutral-900">
                Borrador detectado — Revisá antes de confirmar
              </div>
              <p className="text-[11px] text-neutral-600">
                Nada se guarda automáticamente hasta que confirmes abajo.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1 p-1 bg-white rounded-lg border border-neutral-200">
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    tipo: 'ingreso',
                    categoria: 'ingreso_manual',
                  })
                }
                className={`px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
                  draft.tipo === 'ingreso'
                    ? 'bg-emerald-600 text-white'
                    : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                <ArrowDownLeft className="w-3 h-3" /> Ingreso
              </button>
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    tipo: 'egreso',
                    categoria: 'otros_gastos',
                  })
                }
                className={`px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
                  draft.tipo === 'egreso'
                    ? 'bg-rose-600 text-white'
                    : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                <ArrowUpRight className="w-3 h-3" /> Egreso
              </button>
            </div>
          </div>

          {draft.pendientes.length > 0 && (
            <div className="p-2.5 rounded-lg bg-amber-100/70 border border-amber-300 text-xs text-amber-950 font-medium">
              {draft.pendientes.map((p, idx) => (
                <div key={idx}>• {p}</div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-bold text-neutral-700 mb-1">Concepto</label>
              <input
                type="text"
                value={draft.concepto}
                onChange={(e) => setDraft({ ...draft, concepto: e.target.value })}
                className="w-full bg-white border border-neutral-300 rounded-xl px-3 py-2 text-xs font-semibold text-neutral-900"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                Categoría
              </label>
              <select
                value={draft.categoria}
                onChange={(e) =>
                  setDraft({ ...draft, categoria: e.target.value as CategoriaMovimientoCaja })
                }
                className="w-full bg-white border border-neutral-300 rounded-xl px-3 py-2 text-xs font-semibold text-neutral-900"
              >
                {(draft.tipo === 'ingreso' ? CATEGORIAS_MANUALES_INGRESO : CATEGORIAS_EGRESO).map(
                  (c) => (
                    <option key={c} value={c}>
                      {CATEGORIA_CAJA_LABELS[c]}
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                Importe ($)
              </label>
              <NumericInput
                value={draft.monto ?? 0}
                min={1}
                onChange={(val) => setDraft({ ...draft, monto: val })}
                className="w-full bg-white border border-neutral-300 rounded-xl px-3 py-2 text-xs font-mono font-extrabold text-neutral-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                Medio de pago
              </label>
              <select
                value={draft.metodo}
                onChange={(e) => setDraft({ ...draft, metodo: e.target.value as MetodoPago })}
                className="w-full bg-white border border-neutral-300 rounded-xl px-3 py-2 text-xs font-semibold text-neutral-900"
              >
                {Object.entries(METODO_PAGO_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-neutral-700 mb-1">Fecha</label>
              <input
                type="date"
                value={draft.fecha}
                onChange={(e) => setDraft({ ...draft, fecha: e.target.value })}
                className="w-full bg-white border border-neutral-300 rounded-xl px-3 py-2 text-xs font-mono text-neutral-900"
              />
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="px-3.5 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 hover:bg-neutral-100 rounded-xl cursor-pointer"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={handleConfirmDraft}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Confirmar y Guardar Movimiento</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
