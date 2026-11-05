export interface RecognitionResultEvent { results: ArrayLike<ArrayLike<{ transcript: string }>> }
export interface SpeechRecognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
export type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognizer;
  webkitSpeechRecognition?: new () => SpeechRecognizer;
};
export function getRecognizer() {
  if (typeof window === 'undefined') return null;
  const w = window as SpeechWindow;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}
