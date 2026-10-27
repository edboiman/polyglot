import { useState } from 'react';
import { index } from '../../data/courses';
import { addXp, ensureCard, recordAttempt } from '../../engine/model';
import { Empty, PlayButtons, Screen, TapText, useAudio, useStopSpeechOnLeave } from '../components/common';
import { go } from '../router';
import { useStore } from '../store';

export function StoryScreen({ storyId }: { storyId: string }) {
  const { state, updateLang } = useStore();
  const lang = state.currentLang;
  const p = state.langs[lang];
  const story = index(lang).storyById.get(storyId);
  const audio = useAudio(lang);
  useStopSpeechOnLeave();
  const [showTr, setShowTr] = useState<Record<number, boolean>>({});
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const savedIds = new Set(Object.values(p.cards).filter((c) => c.saved).map((c) => c.itemId));

  if (!story) {
    return (
      <Screen title="Story" back={() => go('practice')}>
        <Empty title="This story isn't in the current course." />
      </Screen>
    );
  }

  const save = (vocabId: string) =>
    updateLang((x) => ensureCard(ensureCard(x, 'r', vocabId, Date.now(), true), 'p', vocabId, Date.now(), true));

  const answer = (qi: number, ci: number) => {
    if (answers[qi] !== undefined) return;
    const next = { ...answers, [qi]: ci };
    setAnswers(next);
    const ok = ci === story.questions[qi].answer;
    const now = Date.now();
    updateLang((x) => {
      let n = recordAttempt(x, { t: now, skill: 'reading', correct: ok });
      if (ok) n = addXp(n, 2, now);
      if (Object.keys(next).length === story.questions.length) {
        const score = story.questions.filter((q, k) => next[k] === q.answer).length / story.questions.length;
        n = { ...n, storiesRead: { ...n.storiesRead, [story.id]: { score: Math.max(score, n.storiesRead[story.id]?.score ?? 0), at: now } } };
      }
      return n;
    });
  };

  const allDone = Object.keys(answers).length === story.questions.length;
  const score = story.questions.filter((q, k) => answers[k] === q.answer).length;

  return (
    <Screen title={story.title} back={() => go('practice')}>
      <p className="muted small">{story.level} · Tap any word to see its meaning and add it to your reviews.</p>
      {audio.available && (
        <button className="btn ghost" onClick={() => void audio.sayAll(story.paragraphs)}>Listen to the whole story</button>
      )}
      <article className="story" lang={lang}>
        {story.paragraphs.map((para, i) => (
          <div key={i} className="para">
            <p className="target"><TapText text={para} lang={lang} glossary={story.glossary} onSave={save} savedIds={savedIds} /></p>
            <div className="para-tools">
              <PlayButtons text={para} lang={lang} label="Paragraph" />
              <button className="mini" onClick={() => setShowTr((s) => ({ ...s, [i]: !s[i] }))} aria-expanded={!!showTr[i]}>
                {showTr[i] ? 'Hide translation' : 'Translation'}
              </button>
            </div>
            {showTr[i] && <p className="trans" lang="en">{story.translation[i]}</p>}
          </div>
        ))}
      </article>

      <section className="questions">
        <h2>Comprehension</h2>
        {story.questions.map((q, qi) => (
          <div key={qi} className="panel">
            <p className="target">{q.q}</p>
            <div className="choices">
              {q.choices.map((c, ci) => {
                const picked = answers[qi];
                const cls = picked === undefined ? '' : ci === q.answer ? ' right' : ci === picked ? ' wrong' : '';
                return (
                  <button key={ci} className={`choice${cls}`} onClick={() => answer(qi, ci)} disabled={picked !== undefined} lang={lang}>{c}</button>
                );
              })}
            </div>
            {answers[qi] !== undefined && <p className="muted small" role="status">{q.explain}</p>}
          </div>
        ))}
        {allDone && (
          <div className="panel">
            <p><strong>{score} of {story.questions.length}</strong> correct.</p>
            <button className="btn primary wide" onClick={() => go('practice')}>Done</button>
          </div>
        )}
      </section>
    </Screen>
  );
}
