/**
 * Next-activity recommendation. Plain, ordered rules — no opaque model —
 * so the app can always say *why* it suggests something.
 *
 *  1. Resume an unfinished lesson.
 *  2. If ≥ 10 reviews are due and within today's review cap, review first.
 *  3. If a grammar concept is a current weakness, offer its workshop.
 *  4. If today's new-word target is not reached, continue to the next lesson.
 *     (The target is advisory: lessons stay open after it is reached.)
 *  5. If any reviews are due, review them.
 *  6. Otherwise suggest reading, conversation or listening practice.
 */

import { COURSES, conceptLabel, index, topicForConcept } from '../data/courses';
import type { LangCode } from '../data/types';
import { reviewBudget, weaknesses } from './analytics';
import { type LangProgress, type Settings, countNewToday } from './model';
import { contentUnlocked, nextLesson } from './session';

export type Recommendation =
  | { kind: 'resume'; lessonId: string; reason: string }
  | { kind: 'review'; due: number; reason: string }
  | { kind: 'grammar'; topicId: string; concept: string; reason: string }
  | { kind: 'lesson'; lessonId: string; reason: string }
  | { kind: 'story'; storyId: string; reason: string }
  | { kind: 'conversation'; conversationId: string; reason: string }
  | { kind: 'done'; reason: string };

export const REVIEW_FIRST_THRESHOLD = 10;

export function recommend(lang: LangCode, p: LangProgress, s: Settings, now: number): Recommendation {
  if (p.resume && index(lang).lessonById.has(p.resume.lessonId)) {
    return { kind: 'resume', lessonId: p.resume.lessonId, reason: 'You have a lesson in progress.' };
  }
  const due = reviewBudget(p, s.maxReviewsPerDay, now).available;
  if (due >= REVIEW_FIRST_THRESHOLD) {
    return { kind: 'review', due, reason: `${due} items are due. Reviewing them now, before they fade, is the most efficient use of your time.` };
  }
  const weak = weaknesses(p, now)[0];
  if (weak) {
    const topic = topicForConcept(lang, weak.concept);
    if (topic && contentUnlocked(lang, topic.unlockAfter, p, true)) {
      return {
        kind: 'grammar',
        topicId: topic.id,
        concept: weak.concept,
        reason: `You made ${weak.errors} mistakes with ${conceptLabel(lang, weak.concept)} in the last two weeks. A short focused practice should help.`,
      };
    }
  }
  const next = nextLesson(lang, p);
  const newToday = countNewToday(p, now);
  if (next && newToday < s.newPerDay) {
    return { kind: 'lesson', lessonId: next.id, reason: newToday ? 'Keep going with new material.' : 'Start today with something new.' };
  }
  if (due > 0) return { kind: 'review', due, reason: `${due} item${due === 1 ? '' : 's'} due for review.` };
  const c = COURSES[lang];
  const story = c.stories.find((st) => contentUnlocked(lang, st.unlockAfter, p, false) && !p.storiesRead[st.id]);
  if (story) return { kind: 'story', storyId: story.id, reason: 'Reading connected text builds comprehension with words you already know.' };
  const conv = c.conversations.find((cv) => contentUnlocked(lang, cv.unlockAfter, p, false) && !p.conversationsDone[cv.id]);
  if (conv) return { kind: 'conversation', conversationId: conv.id, reason: 'Put what you know to use in a conversation.' };
  if (next) {
    return { kind: 'lesson', lessonId: next.id, reason: `You've reached your daily goal of ${s.newPerDay} new words. Another lesson is fine if you have energy — or come back tomorrow.` };
  }
  return { kind: 'done', reason: 'You are all caught up. Nothing is due right now.' };
}
