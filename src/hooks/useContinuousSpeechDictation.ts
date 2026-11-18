import { useState, useRef, useEffect, useCallback } from 'react';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence?: number;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((ev: Event) => void) | null;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: ((ev: Event) => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition || w.webkitSpeechRecognition || null) as SpeechRecognitionConstructor | null;
}

/**
 * Une texto acumulado + nuevo fragmento evitando duplicar palabras repetidas en el borde
 * cuando el navegador reinicia el reconocimiento en segundo plano.
 */
export function mergeTranscriptSegments(existing: string, addition: string): string {
  const base = existing.trim();
  const next = addition.trim();
  if (!next) return base;
  if (!base) return next;

  const baseWords = base.split(/\s+/);
  const nextWords = next.split(/\s+/);
  const maxOverlap = Math.min(6, baseWords.length, nextWords.length);

  for (let len = maxOverlap; len >= 1; len--) {
    const tail = baseWords
      .slice(baseWords.length - len)
      .map((w) => w.toLowerCase())
      .join(' ');
    const head = nextWords
      .slice(0, len)
      .map((w) => w.toLowerCase())
      .join(' ');
    if (tail === head) {
      const remaining = nextWords.slice(len).join(' ');
      return remaining ? `${base} ${remaining}` : base;
    }
  }

  return `${base} ${next}`;
}

export interface UseContinuousSpeechDictationOptions {
  lang?: string;
  onComplete?: (finalText: string) => void;
}

export interface UseContinuousSpeechDictationResult {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  fullLiveText: string;
  statusMessage: string | null;
  error: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  reset: () => void;
  setTranscriptManual: (value: string) => void;
  clearError: () => void;
}

export function useContinuousSpeechDictation(
  options: UseContinuousSpeechDictationOptions = {}
): UseContinuousSpeechDictationResult {
  const { lang = 'es-AR', onComplete } = options;

  const isSupported = Boolean(getSpeechRecognitionCtor());
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Referencias para control estricto de ciclo de vida y anti-bucles
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const userStoppedRef = useRef<boolean>(true);
  const isListeningRef = useRef<boolean>(false);
  const committedTextRef = useRef<string>('');
  const sessionFinalRef = useRef<string>('');
  const sessionInterimRef = useRef<string>('');
  const restartTimerRef = useRef<number | null>(null);
  const sessionCounterRef = useRef<number>(0);
  const consecutiveErrorsRef = useRef<number>(0);
  const rapidRestartTimestampsRef = useRef<number[]>([]);
  const fatalErrorRef = useRef<boolean>(false);
  const didEmitCompleteRef = useRef<boolean>(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const syncCommittedFromSession = useCallback(() => {
    const finalPart = sessionFinalRef.current.trim();
    const interimFallback = !finalPart ? sessionInterimRef.current.trim() : '';
    const toCommit = finalPart || interimFallback;

    if (toCommit) {
      const merged = mergeTranscriptSegments(committedTextRef.current, toCommit);
      committedTextRef.current = merged;
      setTranscript(merged);
    }
    sessionFinalRef.current = '';
    sessionInterimRef.current = '';
    setInterimTranscript('');
  }, []);

  const finishListening = useCallback(
    (emitComplete: boolean, msg?: string) => {
      clearRestartTimer();
      userStoppedRef.current = true;
      isListeningRef.current = false;
      setIsListening(false);
      syncCommittedFromSession();
      setStatusMessage(msg ?? null);

      if (emitComplete && !didEmitCompleteRef.current) {
        didEmitCompleteRef.current = true;
        const finalText = committedTextRef.current.trim();
        if (onCompleteRef.current && finalText) {
          onCompleteRef.current(finalText);
        }
      }
    },
    [clearRestartTimer, syncCommittedFromSession]
  );

  const launchSession = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError(
        'Este navegador no soporta dictado por voz. Podés escribir o pegar el texto directamente y procesarlo igual.'
      );
      finishListening(false);
      return;
    }

    if (userStoppedRef.current || fatalErrorRef.current) {
      return;
    }

    // Limpiar instancia anterior si quedara abierta
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch {
        // Ignorar
      }
      recognitionRef.current = null;
    }

    sessionCounterRef.current += 1;
    const currentSessionId = sessionCounterRef.current;
    sessionFinalRef.current = '';
    sessionInterimRef.current = '';

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (currentSessionId !== sessionCounterRef.current || userStoppedRef.current) return;
      isListeningRef.current = true;
      setIsListening(true);
      setStatusMessage('Escuchando continuo · Pausá tranquilo para pensar');
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      if (currentSessionId !== sessionCounterRef.current) return;
      consecutiveErrorsRef.current = 0;

      let sessionFinals = '';
      let sessionInterims = '';

      for (let i = 0; i < event.results.length; i++) {
        const res = event.results[i];
        const piece = (res[0]?.transcript || '').trim();
        if (!piece) continue;
        if (res.isFinal) {
          sessionFinals = sessionFinals ? `${sessionFinals} ${piece}` : piece;
        } else {
          sessionInterims = sessionInterims ? `${sessionInterims} ${piece}` : piece;
        }
      }

      sessionFinalRef.current = sessionFinals;
      sessionInterimRef.current = sessionInterims;

      // Mostrar en vivo el texto acumulado + sesión actual
      const liveCommitted = mergeTranscriptSegments(committedTextRef.current, sessionFinals);
      setTranscript(liveCommitted);
      setInterimTranscript(sessionInterims);
    };

    recognition.onerror = (ev: SpeechRecognitionErrorEventLike) => {
      if (currentSessionId !== sessionCounterRef.current) return;

      const code = ev.error;
      // Silencio o pausa normal: NO detener
      if (code === 'no-speech') {
        setStatusMessage('Esperando voz... (seguís con el micrófono activo)');
        return;
      }

      if (code === 'aborted' && userStoppedRef.current) {
        return;
      }

      if (code === 'not-allowed' || code === 'service-not-allowed') {
        fatalErrorRef.current = true;
        setError(
          'El navegador bloqueó el acceso al micrófono. Habilitá el permiso de micrófono en el sitio o escribí el texto manualmente.'
        );
        finishListening(false);
        return;
      }

      if (code === 'audio-capture') {
        fatalErrorRef.current = true;
        setError(
          'No se encontró un micrófono conectado o está siendo usado por otra aplicación.'
        );
        finishListening(false);
        return;
      }

      consecutiveErrorsRef.current += 1;
      if (code === 'network') {
        setStatusMessage('Reintentando conexión de dictado...');
        if (consecutiveErrorsRef.current >= 5) {
          fatalErrorRef.current = true;
          setError(
            'El servicio de reconocimiento de voz del navegador perdió conexión. Conservamos todo tu texto dictado.'
          );
          finishListening(false);
        }
        return;
      }

      if (consecutiveErrorsRef.current >= 8) {
        fatalErrorRef.current = true;
        setError(
          `El navegador interrumpió el dictado (${code}). Conservamos todo el texto reconocido.`
        );
        finishListening(false);
      }
    };

    recognition.onend = () => {
      if (currentSessionId !== sessionCounterRef.current) return;
      recognitionRef.current = null;

      // Consolidar cualquier frase finalizada en esta sesión antes de evaluar reinicio
      syncCommittedFromSession();

      // Si el usuario presionó detener, terminar limpiamente una sola vez
      if (userStoppedRef.current || fatalErrorRef.current) {
        finishListening(true);
        return;
      }

      // Protección contra bucles rápidos sin descanso (< 8 reinicios en 6 segundos)
      const now = Date.now();
      rapidRestartTimestampsRef.current = [
        ...rapidRestartTimestampsRef.current.filter((t) => now - t < 6000),
        now,
      ];

      if (rapidRestartTimestampsRef.current.length >= 12) {
        setError(
          'El navegador cerró el micrófono repetidamente en segundo plano. Tocá el micrófono para retomar; tu texto quedó guardado.'
        );
        finishListening(false);
        return;
      }

      // Recuperación controlada tras pausa o corte automático del navegador
      clearRestartTimer();
      restartTimerRef.current = window.setTimeout(() => {
        if (!userStoppedRef.current && !fatalErrorRef.current) {
          launchSession();
        }
      }, 240);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      consecutiveErrorsRef.current += 1;
      if (consecutiveErrorsRef.current >= 5) {
        fatalErrorRef.current = true;
        setError(
          'No se pudo reiniciar automáticamente el micrófono en este navegador. Conservamos tu texto.'
        );
        finishListening(false);
      } else {
        clearRestartTimer();
        restartTimerRef.current = window.setTimeout(() => {
          if (!userStoppedRef.current && !fatalErrorRef.current) {
            launchSession();
          }
        }, 350);
      }
    }
  }, [lang, finishListening, syncCommittedFromSession, clearRestartTimer]);

  const start = useCallback(() => {
    if (!getSpeechRecognitionCtor()) {
      setError(
        'Este navegador no soporta dictado por voz (Web Speech API). Podés escribir o pegar directamente en el cuadro de texto.'
      );
      return;
    }

    if (isListeningRef.current && !userStoppedRef.current) return;

    clearRestartTimer();
    setError(null);
    fatalErrorRef.current = false;
    userStoppedRef.current = false;
    didEmitCompleteRef.current = false;
    consecutiveErrorsRef.current = 0;
    rapidRestartTimestampsRef.current = [];
    isListeningRef.current = true;
    setIsListening(true);
    setStatusMessage('Iniciando micrófono...');

    launchSession();
  }, [clearRestartTimer, launchSession]);

  const stop = useCallback(() => {
    if (userStoppedRef.current && !isListeningRef.current) return;
    clearRestartTimer();
    userStoppedRef.current = true;

    const active = recognitionRef.current;
    if (active) {
      try {
        active.stop();
        // Si el navegador no dispara onend en ~500ms, forzamos cierre limpio
        window.setTimeout(() => {
          if (!didEmitCompleteRef.current && userStoppedRef.current) {
            finishListening(true);
          }
        }, 500);
        return;
      } catch {
        // Fallback inmediato
      }
    }

    finishListening(true);
  }, [clearRestartTimer, finishListening]);

  const toggle = useCallback(() => {
    if (isListeningRef.current && !userStoppedRef.current) {
      stop();
    } else {
      start();
    }
  }, [start, stop]);

  const reset = useCallback(() => {
    clearRestartTimer();
    userStoppedRef.current = true;
    isListeningRef.current = false;
    setIsListening(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignorar
      }
      recognitionRef.current = null;
    }
    committedTextRef.current = '';
    sessionFinalRef.current = '';
    sessionInterimRef.current = '';
    didEmitCompleteRef.current = false;
    setTranscript('');
    setInterimTranscript('');
    setStatusMessage(null);
    setError(null);
  }, [clearRestartTimer]);

  const setTranscriptManual = useCallback((value: string) => {
    committedTextRef.current = value;
    sessionFinalRef.current = '';
    sessionInterimRef.current = '';
    setTranscript(value);
    setInterimTranscript('');
  }, []);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    return () => {
      clearRestartTimer();
      userStoppedRef.current = true;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.abort();
        } catch {
          // Ignorar
        }
      }
    };
  }, [clearRestartTimer]);

  const fullLiveText = interimTranscript
    ? mergeTranscriptSegments(transcript, interimTranscript)
    : transcript;

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    fullLiveText,
    statusMessage,
    error,
    start,
    stop,
    toggle,
    reset,
    setTranscriptManual,
    clearError,
  };
}
