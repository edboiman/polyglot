/**
 * Milestones. Each badge rewards evidence of learning or retention, not raw
 * activity — e.g. "Retention keeper" needs accurate *scheduled* reviews.
 */

import { retention, streak } from '../engine/analytics';
import type { AppState } from '../engine/model';
import { LANGS } from '../data/courses';

export interface Badge {
  id: string;
  title: string;
  description: string;
  test: (s: AppState, now: number) => boolean;
}

const sum = (s: AppState, f: (l: AppState['langs']['es']) => number) => LANGS.reduce((a, l) => a + f(s.langs[l]), 0);
const lessonsDone = (l: AppState['langs']['es']) => Object.values(l.lessons).filter((x) => x.completedAt).length;

export const BADGES: Badge[] = [
  { id: 'first-lesson', title: 'First steps', description: 'Complete your first lesson.', test: (s) => sum(s, lessonsDone) >= 1 },
  { id: 'unit-one', title: 'Unit one', description: 'Complete every lesson in a first unit.', test: (s) => LANGS.some((l) => ['1-1', '1-2', '1-3'].every((k) => s.langs[l].lessons[`${l}-${k}`]?.completedAt)) },
  { id: 'words-50', title: '50 words', description: 'Study 50 different words or sentences in one language.', test: (s, n) => LANGS.some((l) => retention(s.langs[l], n).studiedItems >= 50) },
  { id: 'words-150', title: '150 words', description: 'Study 150 different words or sentences in one language.', test: (s, n) => LANGS.some((l) => retention(s.langs[l], n).studiedItems >= 150) },
  { id: 'reviews-100', title: 'Steady reviewer', description: 'Complete 100 scheduled reviews.', test: (s) => sum(s, (l) => l.reviewLog.filter((r) => r.due).length) >= 100 },
  {
    id: 'retention',
    title: 'Retention keeper',
    description: 'Recall at least 85% of 50+ scheduled reviews in a month.',
    test: (s, n) => LANGS.some((l) => {
      const r = retention(s.langs[l], n);
      return r.observedCount >= 50 && (r.observed ?? 0) >= 0.85;
    }),
  },
  { id: 'week', title: 'A week of practice', description: 'Practise on 7 days in a row (one rest day allowed).', test: (s, n) => streak(s, n).days >= 7 },
  { id: 'conversation', title: 'First conversation', description: 'Finish a practice conversation.', test: (s) => sum(s, (l) => Object.keys(l.conversationsDone).length) >= 1 },
  { id: 'reader', title: 'Reader', description: 'Read a story and answer its questions.', test: (s) => sum(s, (l) => Object.keys(l.storiesRead).length) >= 1 },
  { id: 'grammar', title: 'Pattern spotter', description: 'Score 80% or more in a grammar workshop.', test: (s) => LANGS.some((l) => Object.values(s.langs[l].grammarDone).some((g) => g.best >= 0.8)) },
  { id: 'polyglot', title: 'Polyglot', description: 'Complete a lesson in all three languages.', test: (s) => LANGS.every((l) => lessonsDone(s.langs[l]) >= 1) },
];

export function checkBadges(s: AppState, now: number): AppState {
  let badges = s.badges;
  for (const b of BADGES) {
    if (!badges[b.id] && b.test(s, now)) badges = { ...badges, [b.id]: now };
  }
  return badges === s.badges ? s : { ...s, badges };
}

/** Weekly challenge, rotating by ISO week; progress measured from this week's data. */
export function weeklyChallenge(s: AppState, now: number) {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day).getTime();
  const week = Math.floor(start / (7 * 86_400_000));
  const p = s.langs[s.currentLang];
  const log = p.reviewLog.filter((r) => r.t >= start);
  const att = p.attempts.filter((a) => a.t >= start);
  const options = [
    { title: 'Complete 40 scheduled reviews', goal: 40, value: log.filter((r) => r.due).length },
    { title: 'Answer 25 listening exercises correctly', goal: 25, value: att.filter((a) => a.skill === 'listening' && a.correct).length },
    { title: 'Write 20 correct sentences', goal: 20, value: att.filter((a) => a.skill === 'writing' && a.correct).length },
    { title: 'Practise on 5 different days', goal: 5, value: new Set(att.map((a) => new Date(a.t).toDateString())).size },
  ];
  return options[week % options.length];
}
