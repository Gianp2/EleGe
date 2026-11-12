import { useEffect, useRef, useState } from 'react';

type SpeechResult = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type Recognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResult) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechBrowser = Window & {
  SpeechRecognition?: new () => Recognizer;
  webkitSpeechRecognition?: new () => Recognizer;
};

export function useSpeechDictation(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const recognitionRef = useRef<Recognizer | null>(null);
  const callbackRef = useRef(onTranscript);
  callbackRef.current = onTranscript;
  const available = typeof window !== 'undefined' && Boolean(
    (window as SpeechBrowser).SpeechRecognition || (window as SpeechBrowser).webkitSpeechRecognition
  );

  useEffect(() => () => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.stop();
    }
  }, []);

  const stop = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const toggle = () => {
    if (listening) { stop(); return; }
    setError('');
    const browser = window as SpeechBrowser;
    const Recognition = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Recognition) {
      setError('El navegador no permite dictado. Probá Chrome o Edge con permiso de micrófono.');
      return;
    }
    const instance = new Recognition();
    instance.lang = 'es-AR';
    instance.continuous = false;
    instance.interimResults = false;
    instance.onresult = event => {
      const text = Array.from(event.results).map(r => r[0]?.transcript || '').join(' ').trim();
      if (text) callbackRef.current(text);
    };
    instance.onerror = event => {
      setError(event.error === 'not-allowed' ? 'Habilitá el permiso del micrófono en el navegador.' : `No se pudo reconocer la voz (${event.error}).`);
      setListening(false);
    };
    instance.onend = () => setListening(false);
    recognitionRef.current = instance;
    try { instance.start(); setListening(true); }
    catch { setError('No se pudo iniciar el micrófono.'); setListening(false); }
  };
  return { listening, error, available, toggle, stop };
}
