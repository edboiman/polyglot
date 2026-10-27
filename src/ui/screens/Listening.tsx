import { useMemo, useState } from 'react';
import { index, lessonOrder } from '../../data/courses';
import { type Exercise, choiceOptions, seededRng, shuffle, verbalize } from '../../engine/session';
import { Empty, PlayButtons, Screen, TapText, useAudio, useStopSpeechOnLeave } from '../components/common';
import { SessionRunner } from '../exercises/SessionRunner';
import { go } from '../router';
import { useStore } from '../store';

/**
 * Listening lab: word recognition, listen-and-type, sentence comprehension
 * and full dialogues — only from lessons the learner has completed.
 */
export function ListeningLab() {
  const { state } = useStore();
  const lang = state.currentLang;
  const p = state.langs[lang];
  const audio = useAudio(lang);
  useStopSpeechOnLeave();
  const [mode, setMode] = useState<'menu' | 'drill' | 'dialogues'>('menu');
  const idx = index(lang);
  const doneLessons = idx.lessons.filter((l) => p.lessons[l.id]?.completedAt || state.settings.freeNavigation);
  const doneIds = new Set(doneLessons.map((l) => l.id));

  const drill = useMemo<Exercise[]>(() => {
    const rng = seededRng(Date.now() % 7919);
    const words = shuffle([...idx.vocabById.values()].filter((v) => doneIds.has(v.lessonId) && !v.lemma.includes('?')), rng).slice(0, 6);
    const sentences = shuffle([...idx.sentenceById.values()].filter((s) => doneIds.has(s.lessonId)), rng).slice(0, 6);
    const out: Exercise[] = [];
    words.slice(0, 3).forEach((v) => out.push({ t: 'listenWord', vocabId: v.id }));
    sentences.slice(0, 3).forEach((s) => out.push({ t: 'listen', sentenceId: s.id }));
    words.slice(3).forEach((v) => out.push({ t: 'choice', vocabId: v.id, options: choiceOptions(lang, v, rng), audio: true }));
    sentences.slice(3).forEach((s) => out.push({ t: 'listen', sentenceId: s.id }));
    const mixed = shuffle(out, rng);
    return state.settings.typing ? mixed : mixed.map((e) => verbalize(lang, e, rng, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode === 'drill']);

  if (!audio.available) {
    return (
      <Screen title="Listening lab" back={() => go('practice')}>
        <Empty title="No voice for this language on this device.">
          <p>Listening practice uses your device's built-in text-to-speech. Install a {lang === 'es' ? 'Spanish' : lang === 'de' ? 'German' : 'French'} voice in your system settings (on iOS: Settings › Accessibility › Spoken Content › Voices; on Android: Text-to-speech settings), then reload. Reading practice still works without audio.</p>
        </Empty>
      </Screen>
    );
  }
  if (!doneLessons.length) {
    return (
      <Screen title="Listening lab" back={() => go('practice')}>
        <Empty title="Complete a lesson first.">
          <p>The lab only uses language you have already been taught.</p>
        </Empty>
      </Screen>
    );
  }
  if (mode === 'drill') return <SessionRunner lang={lang} exercises={drill} mode="practice" title="Listening practice" onExit={() => setMode('menu')} />;

  if (mode === 'dialogues') {
    return (
      <Screen title="Dialogues" back={() => setMode('menu')}>
        <p className="muted small">Listen first with the text hidden, then reveal it. Tap words for meanings.</p>
        {doneLessons.slice().sort((a, b) => lessonOrder(lang, b.id) - lessonOrder(lang, a.id)).map((l) => (
          <DialogueCard key={l.id} lessonId={l.id} />
        ))}
      </Screen>
    );
  }

  return (
    <Screen title="Listening lab" back={() => go('practice')}>
      <p className="muted">Voices are synthesised by your device. They are good for practice but are not perfect native pronunciation.</p>
      <div className="panel">
        <h2>Mixed listening drill</h2>
        <p className="muted small">Recognise words, type what you hear, and understand sentences. Normal and slow playback; transcripts on request.</p>
        <button className="btn primary wide" onClick={() => setMode('drill')}>Start drill</button>
      </div>
      <div className="panel">
        <h2>Dialogues</h2>
        <p className="muted small">Listen to the conversations from your lessons.</p>
        <button className="btn ghost wide" onClick={() => setMode('dialogues')}>Open dialogues</button>
      </div>
    </Screen>
  );
}

function DialogueCard({ lessonId }: { lessonId: string }) {
  const { state } = useStore();
  const lang = state.currentLang;
  const l = index(lang).lessonById.get(lessonId)!;
  const audio = useAudio(lang);
  const [show, setShow] = useState(false);
  const playAll = (slow: boolean) => void audio.sayAll(l.dialogue.map((d) => d.t), slow);
  return (
    <div className="panel">
      <h3>{l.title}</h3>
      <div className="row">
        <button className="btn ghost" onClick={() => playAll(false)}>Play</button>
        <button className="btn ghost" onClick={() => playAll(true)}>Play slowly</button>
        <button className="btn ghost" onClick={() => setShow((s) => !s)} aria-expanded={show}>{show ? 'Hide text' : 'Show text'}</button>
      </div>
      {show && (
        <ol className="dialogue">
          {l.dialogue.map((d, i) => (
            <li className="line" key={i}>
              <span className="who">{d.who}</span>
              <span className="said target"><TapText text={d.t} lang={lang} /></span>
              <span className="line-tools"><PlayButtons text={d.t} lang={lang} slow={false} /></span>
              <span className="trans">{d.en}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
