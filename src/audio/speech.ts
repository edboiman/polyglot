/**
 * Text-to-speech and speech recognition via the browser's Web Speech API.
 *
 * Honesty rules:
 *  - Voices are whatever the device provides. They are synthesised and can
 *    mispronounce words; the UI labels them as such.
 *  - Speech recognition returns a transcript. Comparing it with the expected
 *    text tells us whether the recogniser *understood* the learner — not
 *    whether their accent, phonemes or fluency are good. Feedback says so.
 */

import type { LangCode } from '../data/types';

const LOCALE_PREFIX: Record<LangCode, string> = { es: 'es', de: 'de', fr: 'fr' };
const PREFERRED: Record<LangCode, string[]> = {
  es: ['es-ES', 'es-MX', 'es-US'],
  de: ['de-DE', 'de-AT', 'de-CH'],
  fr: ['fr-FR', 'fr-CA', 'fr-BE'],
};

let voicesCache: SpeechSynthesisVoice[] = [];

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

/** Voices load asynchronously in some browsers. */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!ttsSupported()) return Promise.resolve([]);
  const now = speechSynthesis.getVoices();
  if (now.length) {
    voicesCache = now;
    return Promise.resolve(now);
  }
  return new Promise((resolve) => {
    const done = () => {
      voicesCache = speechSynthesis.getVoices();
      resolve(voicesCache);
    };
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
}

export function voicesFor(lang: LangCode): SpeechSynthesisVoice[] {
  return voicesCache.filter((v) => v.lang.toLowerCase().startsWith(LOCALE_PREFIX[lang]));
}

export function hasVoice(lang: LangCode): boolean {
  return ttsSupported() && voicesFor(lang).length > 0;
}

export function pickVoice(lang: LangCode, preferredURI?: string): SpeechSynthesisVoice | undefined {
  const vs = voicesFor(lang);
  if (preferredURI) {
    const v = vs.find((x) => x.voiceURI === preferredURI);
    if (v) return v;
  }
  for (const loc of PREFERRED[lang]) {
    const local = vs.find((v) => v.lang === loc && v.localService);
    if (local) return local;
    const any = vs.find((v) => v.lang === loc);
    if (any) return any;
  }
  return vs[0];
}

export interface SpeakOptions {
  rate?: number;
  voiceURI?: string;
}

/** Speak text. Resolves when finished (or immediately if TTS is unavailable). */
export function speak(text: string, lang: LangCode, o: SpeakOptions = {}, inSequence = false): Promise<void> {
  if (!ttsSupported()) return Promise.resolve();
  if (!inSequence) generation++; // a single utterance cancels any running sequence
  return new Promise((resolve) => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(lang, o.voiceURI);
    if (v) u.voice = v;
    u.lang = v?.lang ?? PREFERRED[lang][0];
    u.rate = o.rate ?? 1;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.speak(u);
    // Safety net: some engines never fire onend.
    setTimeout(resolve, Math.min(15000, 1500 + text.length * 120));
  });
}

/** Incremented on every stop, so queued sequences know to abandon their remaining lines. */
let generation = 0;

export function stopSpeaking() {
  generation++;
  if (ttsSupported()) speechSynthesis.cancel();
}

/** Speak several lines in order. Stops as soon as stopSpeaking() is called (e.g. on leaving a screen). */
export async function speakSequence(texts: string[], lang: LangCode, o: SpeakOptions = {}): Promise<void> {
  stopSpeaking();
  const mine = generation;
  for (const t of texts) {
    if (generation !== mine) return;
    await speak(t, lang, o, true);
  }
}

/* ---------------------------------------------------- speech recognition */

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function recognitionCtor(): (new () => RecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => RecognitionLike) | null;
}

export function recognitionSupported(): boolean {
  return recognitionCtor() !== null;
}

export interface RecognitionResult {
  transcripts: string[];
  confidence: number | null;
}

export class RecognitionError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/**
 * Listen once and return the recogniser's alternatives. Rejects with a
 * RecognitionError ('not-allowed', 'no-speech', 'network', …).
 */
export function listenOnce(lang: LangCode, timeoutMs = 8000): { promise: Promise<RecognitionResult>; stop: () => void } {
  const Ctor = recognitionCtor();
  if (!Ctor) return { promise: Promise.reject(new RecognitionError('unsupported')), stop: () => {} };
  const rec = new Ctor();
  rec.lang = PREFERRED[lang][0];
  rec.interimResults = false;
  rec.maxAlternatives = 5;
  rec.continuous = false;
  let settled = false;
  const promise = new Promise<RecognitionResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!settled) rec.stop();
    }, timeoutMs);
    rec.onresult = (e) => {
      settled = true;
      clearTimeout(timer);
      const first = e.results[0];
      const alts: string[] = [];
      let conf: number | null = null;
      for (let i = 0; i < first.length; i++) {
        alts.push(first[i].transcript);
        if (i === 0 && typeof first[i].confidence === 'number' && first[i].confidence > 0) conf = first[i].confidence;
      }
      resolve({ transcripts: alts, confidence: conf });
    };
    rec.onerror = (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new RecognitionError(e.error));
    };
    rec.onend = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new RecognitionError('no-speech'));
    };
    try {
      rec.start();
    } catch {
      settled = true;
      reject(new RecognitionError('start-failed'));
    }
  });
  return { promise, stop: () => rec.stop() };
}

export function recognitionErrorMessage(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access was blocked. You can allow it in your browser settings, or switch speaking off in Profile.';
    case 'no-speech':
      return 'No speech was detected. Try again a little closer to the microphone.';
    case 'network':
      return 'Speech recognition needs an internet connection in this browser.';
    case 'audio-capture':
      return 'No microphone was found.';
    case 'unsupported':
      return 'This browser does not support speech recognition.';
    default:
      return 'Speech recognition did not work this time.';
  }
}
