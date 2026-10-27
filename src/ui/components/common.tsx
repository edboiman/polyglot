import { useEffect, useState, type ReactNode } from 'react';
import { lookupWord } from '../../data/courses';
import type { LangCode } from '../../data/types';
import { hasVoice, loadVoices, speak, speakSequence, stopSpeaking } from '../../audio/speech';
import { useStore } from '../store';
import { IconBack, IconSlow, IconSpeaker } from './icons';

/** Text-to-speech availability for a language, re-checked once voices load. */
export function useAudio(lang: LangCode) {
  const { state } = useStore();
  const [ready, setReady] = useState(() => hasVoice(lang));
  useEffect(() => {
    let alive = true;
    loadVoices().then(() => alive && setReady(hasVoice(lang)));
    return () => {
      alive = false;
    };
  }, [lang]);
  const opts = (slow: boolean) => ({ rate: (slow ? 0.65 : 1) * state.settings.speechRate, voiceURI: state.settings.voiceURI[lang] || undefined });
  const say = (text: string, slow = false) => speak(text, lang, opts(slow));
  const sayAll = (texts: string[], slow = false) => speakSequence(texts, lang, opts(slow));
  return { available: ready, say, sayAll };
}

/** Stop any speech when the calling screen unmounts. */
export function useStopSpeechOnLeave() {
  useEffect(() => () => stopSpeaking(), []);
}

export function PlayButtons({ text, lang, slow = true, label = 'Play' }: { text: string; lang: LangCode; slow?: boolean; label?: string }) {
  const a = useAudio(lang);
  if (!a.available) return null;
  return (
    <span className="play-row">
      <button type="button" className="icon-btn" onClick={() => a.say(text)} aria-label={`${label} at normal speed`}>
        <IconSpeaker />
      </button>
      {slow && (
        <button type="button" className="icon-btn" onClick={() => a.say(text, true)} aria-label={`${label} slowly`}>
          <IconSlow />
        </button>
      )}
    </span>
  );
}

/**
 * Target-language text in which every word can be tapped for a gloss.
 * `onSave` adds the looked-up vocabulary item to review.
 */
export function TapText({
  text,
  lang,
  glossary,
  onSave,
  savedIds,
}: {
  text: string;
  lang: LangCode;
  glossary?: Record<string, string>;
  onSave?: (vocabId: string) => void;
  savedIds?: Set<string>;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const a = useAudio(lang);
  const parts = text.split(/(\s+)/);
  return (
    <span className="tap-text">
      {parts.map((p, i) => {
        if (/^\s+$/.test(p) || !p) return p;
        const hit = lookupWord(lang, p, glossary);
        if (!hit) return <span key={i}>{p}</span>;
        return (
          <span key={i} className="tap-wrap">
            <button type="button" className={`tap-word${open === i ? ' on' : ''}`} onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
              {p}
            </button>
            {open === i && (
              <span className="gloss" role="dialog" aria-label={`Meaning of ${p}`}>
                <span className="gloss-text">{hit.gloss}</span>
                <span className="gloss-actions">
                  {a.available && (
                    <button type="button" className="mini" onClick={() => a.say(p.replace(/[¿?¡!.,;:«»"“”…()]/g, ''))}>
                      Listen
                    </button>
                  )}
                  {onSave && hit.vocab && (
                    <button type="button" className="mini" disabled={savedIds?.has(hit.vocab.id)} onClick={() => onSave(hit.vocab!.id)}>
                      {savedIds?.has(hit.vocab.id) ? 'In review' : 'Add to review'}
                    </button>
                  )}
                  <button type="button" className="mini" onClick={() => setOpen(null)}>
                    Close
                  </button>
                </span>
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

export function Meter({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="meter" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <div className="meter-fill" style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function Screen({ title, back, children, actions }: { title: string; back?: () => void; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="screen">
      <header className="screen-head">
        {back && (
          <button type="button" className="icon-btn" onClick={back} aria-label="Back">
            <IconBack />
          </button>
        )}
        <h1>{title}</h1>
        <div className="screen-actions">{actions}</div>
      </header>
      {children}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
