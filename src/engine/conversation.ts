/**
 * Matching free answers in scripted conversations.
 *
 * `exact` means the answer matched an accepted phrasing (checked language).
 * A topic-pattern match only means the meaning was recognised; it advances
 * the conversation but is not evidence of accurate writing or speaking.
 */

import { COURSES, knownWords } from '../data/courses';
import type { Conversation, ConversationReply } from '../data/types';
import { checkAnswer, foldAccents, normalize } from './validate';

export type Match = { reply: ConversationReply; exact: boolean } | null;

export function matchReply(conv: Conversation, nodeId: string, text: string): Match {
  const node = conv.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  for (const r of node.replies) {
    const res = checkAnswer(text, [r.t, ...(r.accept ?? [])], { lang: conv.lang, articles: COURSES[conv.lang].articles, knownWords: knownWords(conv.lang) });
    if (res.verdict !== 'wrong') return { reply: r, exact: true };
  }
  const norm = foldAccents(normalize(text, conv.lang));
  for (const r of node.replies) if (r.pattern && new RegExp(r.pattern).test(norm)) return { reply: r, exact: false };
  return null;
}
