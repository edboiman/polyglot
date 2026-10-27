import { useEffect, useMemo, useState } from 'react';
import { index } from '../../data/courses';
import type { LangCode } from '../../data/types';
import { hasVoice, loadVoices, recognitionSupported } from '../../audio/speech';
import type { LessonResume } from '../../engine/model';
import { buildLesson, isValidExercise, seededRng } from '../../engine/session';
import { type SessionSnapshot, initSession, readSnapshot } from '../../engine/sessionState';
import { Empty, Screen } from '../components/common';
import { SessionRunner } from '../exercises/SessionRunner';
import { back, go } from '../router';
import { useStore } from '../store';

/** Restore a saved lesson session, accepting the full snapshot or the older position-only format. */
export function restoreSession(lang: LangCode, r: LessonResume | undefined): SessionSnapshot | null {
  if (!r) return null;
  const valid = (e: unknown) => isValidExercise(lang, e);
  const full = readSnapshot(r.snapshot, valid);
  if (full) return full;
  if (Array.isArray(r.queue) && typeof r.step === 'number' && r.queue.every(valid) && r.step >= 0 && r.step < r.queue.length) {
    const s = initSession(r.queue as SessionSnapshot['queue'], r.step);
    const answered = Math.max(0, Math.floor(r.answered ?? 0));
    const correct = Math.min(answered, Math.max(0, Math.floor(r.correct ?? 0)));
    return { ...s, stats: { ...s.stats, answered, correct } };
  }
  return null;
}

export function LessonScreen({ lessonId }: { lessonId: string }) {
  const { state, updateLang } = useStore();
  const lang = state.currentLang;
  const p = state.langs[lang];
  const lesson = index(lang).lessonById.get(lessonId);
  const saved = p.resume?.lessonId === lessonId ? p.resume : undefined;
  const restored = useMemo(() => restoreSession(lang, saved), [lang, saved?.savedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const [choice, setChoice] = useState<'ask' | 'resume' | 'fresh'>(saved ? 'ask' : 'fresh');
  // Wait for device voices so audio exercises are planned correctly.
  const [voicesReady, setVoicesReady] = useState(false);
  useEffect(() => {
    let alive = true;
    loadVoices().finally(() => alive && setVoicesReady(true));
    return () => {
      alive = false;
    };
  }, []);

  const plan = useMemo(() => {
    if (!lesson || !voicesReady || choice === 'ask') return null;
    if (choice === 'resume' && restored) return { snapshot: restored };
    return {
      exercises: buildLesson(lesson, p, {
        audio: hasVoice(lang),
        mic: state.settings.microphone && recognitionSupported(),
        rng: seededRng(Date.now() % 100000),
        now: Date.now(),
        typing: state.settings.typing,
      }),
    };
    // Built once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, choice, voicesReady]);

  if (!lesson) {
    return (
      <Screen title="Lesson" back={() => go('learn')}>
        <Empty title="This lesson isn't in the current course.">
          <p>You may have switched language. Pick a lesson from Learn.</p>
        </Empty>
      </Screen>
    );
  }

  if (choice === 'ask') {
    return (
      <Screen title={lesson.title} back={() => back('learn')}>
        <div className="panel">
          {restored ? (
            <>
              <p>You stopped partway through this lesson ({restored.stats.answered} answers so far). Pick up where you left off?</p>
              <div className="row">
                <button className="btn primary grow" onClick={() => setChoice('resume')}>Resume</button>
                <button className="btn ghost" onClick={() => { updateLang((x) => ({ ...x, resume: undefined })); setChoice('fresh'); }}>Start over</button>
              </div>
            </>
          ) : (
            <>
              <p>The saved position for this lesson can't be restored (the course content may have changed). The lesson will start from the beginning; your learning history is unaffected.</p>
              <button className="btn primary wide" onClick={() => { updateLang((x) => ({ ...x, resume: undefined })); setChoice('fresh'); }}>Start lesson</button>
            </>
          )}
        </div>
      </Screen>
    );
  }

  if (!plan) return <div className="boot" role="status">Preparing lesson…</div>;

  return (
    <SessionRunner
      key={choice}
      lang={lang}
      exercises={plan.exercises}
      snapshot={plan.snapshot}
      mode="lesson"
      lessonId={lesson.id}
      title={lesson.title}
      onExit={() => go('learn')}
    />
  );
}
