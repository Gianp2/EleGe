import React, { useEffect, useRef, useState } from 'react';
import { Bot, MessageCircle, Mic, MicOff, Send, X } from 'lucide-react';
import type { Cliente, Pedido } from '../../types';
import type { ClientDraft } from '../../utils/voiceDraft';
import { isNewClientIntent, isNewOrderIntent, parseClient } from '../../utils/voiceDraft';

type Message = { role: 'user' | 'assistant'; text: string; orders?: Pedido[] };

type RecognitionResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type SpeechRecognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognizer;
  webkitSpeechRecognition?: new () => SpeechRecognizer;
};

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const money = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

function answer(question: string, pedidos: Pedido[], clientes: Cliente[]): Message {
  const q = normalize(question);
  const activos = pedidos.filter(p => p.estadoGeneral !== 'cancelado' && p.estadoGeneral !== 'entregado');
  const lista = (items: Pedido[], titulo: string): Message => ({
    role: 'assistant',
    text: `${titulo}: ${items.length} pedido(s).${items.length > 5 ? ' Mostrando los primeros 5.' : ''}`,
    orders: items.slice(0, 5),
  });
  if (/listos?|retirar|retiro/.test(q)) {
    return lista(activos.filter(p => p.estadoGeneral === 'listo'), 'Listos para retirar');
  }
  if (/deuda|saldo|cobrar|cobro/.test(q)) {
    const pendientes = pedidos.filter(p => p.estadoGeneral !== 'cancelado' && p.saldoPendiente > 0);
    const total = pendientes.reduce((a, p) => a + p.saldoPendiente, 0);
    return { ...lista(pendientes, 'Pedidos con saldo'), text: `Hay ${pendientes.length} pedidos con saldo. Total pendiente: ${money(total)}.` };
  }
  if (/cliente|buscar/.test(q)) {
    const termino = q.replace(/.*?(?:cliente|buscar)(?:s)?\s*/, '').trim();
    if (termino.length < 2) return { role: 'assistant', text: 'Probá diciendo: cliente María.' };
    const matches = clientes.filter(c => normalize(`${c.nombre} ${c.apellido || ''} ${c.telefono}`).includes(termino)).slice(0, 5);
    return { role: 'assistant', text: matches.length
      ? matches.map(c => `${c.nombre} ${c.apellido || ''} — ${c.telefono}`).join('\n')
      : 'No encontré clientes que coincidan.' };
  }
  if (/pedido|activo|proceso|pendiente/.test(q)) return lista(activos, 'Pedidos activos');
  return { role: 'assistant', text: 'Puedo consultar pedidos listos, pedidos activos, saldos pendientes y buscar clientes. Dictá o escribí una consulta.' };
}

interface Props {
  pedidos: Pedido[];
  clientes: Cliente[];
  onSelectOrder: (pedido: Pedido) => void;
  onNewClient: (draft: ClientDraft) => void;
  onNewOrder: (text: string) => void;
}

export function AssistantPanel({ pedidos, clientes, onSelectOrder, onNewClient, onNewOrder }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: '¡Hola! Puedo consultar pedidos y clientes, o preparar un alta. Probá: “Creá una clienta que se llama Laura Pérez, teléfono 3471 555555” o “Nuevo pedido para María, dos camisas”.' },
  ]);
  const recognitionRef = useRef<SpeechRecognizer | null>(null);
  const hasSpeech = typeof window !== 'undefined' && Boolean(
    (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition
  );

  useEffect(() => () => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.stop();
    }
  }, []);

  const toggleVoice = () => {
    setVoiceError('');
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const w = window as SpeechWindow;
    const Recognition = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceError('Este navegador no permite dictado. Probá Chrome o Edge y habilitá el micrófono.');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'es-AR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = event => {
      const transcript = Array.from(event.results).map(r => r[0]?.transcript || '').join(' ').trim();
      if (transcript) setQuery(transcript.slice(0, 250));
    };
    recognition.onerror = event => {
      setVoiceError(event.error === 'not-allowed'
        ? 'Permiso de micrófono denegado. Habilitalo desde el navegador.'
        : `No se pudo reconocer la voz (${event.error}).`);
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setVoiceError('No se pudo iniciar el micrófono.');
      setListening(false);
    }
  };

  const submit = () => {
    const text = query.trim().slice(0, 250);
    if (!text) return;
    if (isNewClientIntent(text)) {
      const draft = parseClient(text);
      setMessages(prev => [...prev, { role: 'user' as const, text }, {role: 'assistant' as const, text: 'Abrí el alta de cliente con los datos reconocidos. Revisá y confirmá para guardar.'}].slice(-30));
      onNewClient(draft);
    } else if (isNewOrderIntent(text)) {
      setMessages(prev => [...prev, { role: 'user' as const, text }, {role: 'assistant' as const, text: 'Abrí Nuevo Pedido con un borrador. Revisá el cliente, las prendas y los importes antes de crear el pedido.'}].slice(-30));
      onNewOrder(text);
    } else {
      setMessages(prev => [...prev, { role: 'user' as const, text }, answer(text, pedidos, clientes)].slice(-30));
    }
    setQuery('');
  };

  return (
    <div className="fixed right-4 bottom-[calc(164px+env(safe-area-inset-bottom,0px))] lg:bottom-6 z-40 no-print">
      {open && (
        <section role="dialog" aria-label="Asistente eLeGe"
          className="mb-3 flex h-[min(540px,65dvh)] w-[min(370px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl">
          <header className="flex items-center justify-between border-b p-4">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <div>
                <p className="text-sm font-bold">Asistente eLeGe</p>
                <p className="text-xs text-neutral-500">Consultas y altas con confirmación</p>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar asistente">
              <X className="h-5 w-5" />
            </button>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div key={i} className={`rounded-xl p-3 text-sm whitespace-pre-line ${m.role === 'user'
                ? 'ml-8 bg-neutral-900 text-white' : 'mr-5 bg-neutral-100 text-neutral-900'}`}>
                {m.text}
                {m.orders?.map(p => (
                  <button key={p.id} type="button" onClick={() => { onSelectOrder(p); setOpen(false); }}
                    className="mt-2 block w-full rounded-lg border bg-white p-2 text-left text-xs text-neutral-900 hover:bg-neutral-50">
                    <strong>{p.codigoVisible}</strong> · {p.estadoGeneral} · Saldo {money(p.saldoPendiente)}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <form onSubmit={e => { e.preventDefault(); submit(); }} className="border-t p-3">
            {voiceError && <p role="alert" className="mb-2 text-xs text-rose-700">{voiceError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={toggleVoice} disabled={!hasSpeech && !listening}
                aria-label={listening ? 'Detener dictado' : 'Dictar consulta'}
                title={hasSpeech ? 'Dictar en español' : 'Dictado no disponible en este navegador'}
                className={`rounded-xl border px-3 ${listening ? 'border-rose-300 bg-rose-50 text-rose-700' : 'bg-white text-neutral-800'} disabled:opacity-40`}>
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <input aria-label="Consulta" value={query} maxLength={250}
                onChange={e => setQuery(e.target.value)} placeholder={listening ? 'Escuchando...' : 'Escribí o dictá tu consulta'}
                className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" />
              <button type="submit" disabled={!query.trim()} aria-label="Enviar consulta"
                className="rounded-xl bg-neutral-900 px-3 text-white disabled:opacity-40">
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-[11px] text-neutral-500">Para dar de alta clientes o pedidos se abrirá un formulario que deberás revisar y confirmar.</p>
          </form>
        </section>
      )}
      <button type="button" onClick={() => setOpen(v => !v)}
        aria-label={open ? 'Cerrar asistente' : 'Abrir asistente'}
        className="ml-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-neutral-900 shadow-lg ring-1 ring-neutral-200">
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>
    </div>
  );
}
