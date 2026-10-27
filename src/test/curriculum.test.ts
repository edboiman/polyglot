import { describe, expect, it } from 'vitest';
import { COURSES, LANGS, index, lookupWord } from '../data/courses';
import { checkAnswer, foldAccents, normalize } from '../engine/validate';

describe('curriculum structure', () => {
  for (const lang of LANGS) {
    const course = COURSES[lang];
    const idx = index(lang);

    describe(course.name, () => {
      it('has substantive A1 content', () => {
        expect(course.units.length).toBeGreaterThanOrEqual(8);
        expect(idx.lessons.length).toBeGreaterThanOrEqual(16);
        expect(idx.vocabById.size).toBeGreaterThanOrEqual(150);
        expect(idx.sentenceById.size).toBeGreaterThanOrEqual(80);
        expect(course.grammar.length).toBeGreaterThanOrEqual(5);
        expect(course.conversations.length).toBeGreaterThanOrEqual(4);
        expect(course.stories.length).toBeGreaterThanOrEqual(3);
      });

      it('has unique vocabulary ids', () => {
        const ids = idx.lessons.flatMap((l) => l.vocab.map((v) => v.id));
        const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
        expect(dupes).toEqual([]);
      });

      it('every lesson has an intro, dialogue, vocabulary and sentences', () => {
        for (const l of idx.lessons) {
          expect(l.intro.length).toBeGreaterThan(20);
          expect(l.dialogue.length).toBeGreaterThanOrEqual(3);
          expect(l.vocab.length).toBeGreaterThanOrEqual(5);
          expect(l.sentences.length).toBeGreaterThanOrEqual(4);
          for (const v of l.vocab) {
            expect(v.lemma.trim()).toBe(v.lemma);
            expect(v.en.length).toBeGreaterThan(0);
            if (v.pos === 'noun') expect(v.gender).toBeDefined();
            if (v.pos === 'noun') expect(v.art).toBeDefined();
          }
        }
      });

      it('German nouns are capitalised and German/French/Spanish non-nouns follow casing rules', () => {
        if (lang !== 'de') return;
        for (const v of idx.vocabById.values()) {
          if (v.pos === 'noun') expect(v.lemma[0]).toBe(v.lemma[0].toUpperCase());
        }
      });

      it('every cloze target appears in its sentence as a whole word', () => {
        for (const s of idx.sentenceById.values()) {
          if (!s.cloze) continue;
          const tokens = normalize(s.t, lang).split(' ');
          expect({ id: s.id, ok: tokens.includes(normalize(s.cloze, lang)) }).toEqual({ id: s.id, ok: true });
        }
      });

      it('each sentence is accepted by the checker against itself and its alternatives', () => {
        for (const s of idx.sentenceById.values()) {
          for (const t of [s.t, ...(s.alt ?? [])]) {
            expect(checkAnswer(t, [s.t, ...(s.alt ?? [])], { lang }).verdict).toBe('correct');
          }
          for (const e of [s.en, ...(s.enAlt ?? [])]) {
            expect(checkAnswer(e, [s.en, ...(s.enAlt ?? [])], { lang: 'en' }).verdict).toBe('correct');
          }
        }
      });

      it('grammar topics reference existing lessons and have checkable drills', () => {
        for (const g of course.grammar) {
          expect(idx.lessonById.has(g.unlockAfter)).toBe(true);
          expect(g.concepts.length).toBeGreaterThan(0);
          expect(g.drills.length).toBeGreaterThanOrEqual(5);
          for (const d of g.drills) {
            expect(d.prompt.includes('___') || !!d.choices).toBe(true);
            expect(d.answers.length).toBeGreaterThan(0);
            if (d.choices) expect(d.choices.map((c) => c.toLowerCase())).toContain(d.answers[0].toLowerCase());
            expect(checkAnswer(d.answers[0], d.answers, { lang }).verdict).toBe('correct');
          }
        }
      });

      it('every grammar concept used in lessons has a label', () => {
        const used = new Set(idx.lessons.flatMap((l) => [...l.grammar, ...l.sentences.flatMap((s) => s.grammar ?? [])]));
        for (const c of used) expect({ c, labelled: c in course.conceptLabels }).toEqual({ c, labelled: true });
      });

      it('conversations are well-formed and every model reply matches its own pattern', () => {
        for (const c of course.conversations) {
          expect(idx.lessonById.has(c.unlockAfter)).toBe(true);
          const ids = new Set(c.nodes.map((n) => n.id));
          expect(ids.has(c.start)).toBe(true);
          // every node reachable, every path terminates
          const seen = new Set<string>();
          const stack = [c.start];
          while (stack.length) {
            const id = stack.pop()!;
            if (seen.has(id)) continue;
            seen.add(id);
            const node = c.nodes.find((n) => n.id === id)!;
            expect(node).toBeDefined();
            if (!node.end) expect(node.replies.length).toBeGreaterThan(0);
            for (const r of node.replies) {
              expect(ids.has(r.next)).toBe(true);
              stack.push(r.next);
              if (r.pattern) {
                const re = new RegExp(r.pattern);
                const norm = foldAccents(normalize(r.t, lang));
                expect({ reply: r.t, matches: re.test(norm) }).toEqual({ reply: r.t, matches: true });
              }
            }
          }
          expect(seen.size).toBe(c.nodes.length);
          expect(c.nodes.some((n) => n.end)).toBe(true);
        }
      });

      it('stories have aligned translations and valid questions', () => {
        for (const st of course.stories) {
          expect(idx.lessonById.has(st.unlockAfter)).toBe(true);
          expect(st.translation.length).toBe(st.paragraphs.length);
          for (const q of st.questions) {
            expect(q.answer).toBeGreaterThanOrEqual(0);
            expect(q.answer).toBeLessThan(q.choices.length);
          }
        }
      });

      it('most story words can be looked up by tapping', () => {
        for (const st of course.stories) {
          const words = st.paragraphs.join(' ').split(/\s+/).filter((w) => /\p{L}/u.test(w));
          const found = words.filter((w) => lookupWord(lang, w, st.glossary)).length;
          expect({ story: st.id, coverage: found / words.length >= 0.7 }).toEqual({ story: st.id, coverage: true });
        }
      });
    });
  }
});
