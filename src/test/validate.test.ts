import { describe, expect, it } from 'vitest';
import { COURSES } from '../data/courses';
import { checkAnswer, gradeFromResult, levenshtein, normalize } from '../engine/validate';

const es = { lang: 'es' as const, articles: COURSES.es.articles };
const de = { lang: 'de' as const, articles: COURSES.de.articles };
const fr = { lang: 'fr' as const, articles: COURSES.fr.articles };

describe('normalize', () => {
  it('ignores case, punctuation and inverted marks', () => {
    expect(normalize('¿Cómo te llamas?', 'es')).toBe('cómo te llamas');
    expect(normalize('  Hola,   ANA! ', 'es')).toBe('hola ana');
  });
  it('unifies apostrophes in French', () => {
    expect(normalize('J’ai faim', 'fr')).toBe("j'ai faim");
  });
  it('expands English contractions', () => {
    expect(normalize("I'm fine, it's okay", 'en')).toBe('i am fine it is okay');
    expect(normalize("I don't eat meat", 'en')).toBe('i do not eat meat');
  });
});

describe('levenshtein', () => {
  it('counts an adjacent swap as one edit', () => {
    expect(levenshtein('teh', 'the')).toBe(1);
    expect(levenshtein('casa', 'casa')).toBe(0);
    expect(levenshtein('gato', 'pato')).toBe(1);
  });
});

describe('checkAnswer — accepting legitimate answers', () => {
  it('accepts exact answers regardless of punctuation and case', () => {
    expect(checkAnswer('me llamo ana', ['Me llamo Ana.'], es).verdict).toBe('correct');
  });
  it('accepts listed alternatives', () => {
    expect(checkAnswer('Soy Pablo', ['Yo soy Pablo.', 'Soy Pablo.'], es).verdict).toBe('correct');
  });
  it('accepts Spanish answers that drop the subject pronoun', () => {
    expect(checkAnswer('Tengo un hermano', ['Yo tengo un hermano.'], es).verdict).toBe('correct');
  });
  it('accepts English contractions and their expansions', () => {
    expect(checkAnswer("I'm thirty", ['I am thirty.'], { lang: 'en' }).verdict).toBe('correct');
    expect(checkAnswer('I do not eat meat', ["I don't eat meat."], { lang: 'en' }).verdict).toBe('correct');
  });
  it('ignores a leading article or "to" for single English words when loose', () => {
    expect(checkAnswer('the house', ['house'], { lang: 'en', loose: true }).verdict).toBe('correct');
    expect(checkAnswer('eat', ['to eat'], { lang: 'en', loose: true }).verdict).toBe('correct');
  });
  it('accepts ae/oe/ue/ss for German umlauts and ß', () => {
    const r = checkAnswer('Ich heisse Anna', ['Ich heiße Anna.'], de);
    expect(r.verdict).toBe('correct');
    expect(checkAnswer('muede', ['müde'], de).verdict).toBe('correct');
  });
});

describe('checkAnswer — lenient but informative', () => {
  it('accepts a missing accent as "almost" and names the word', () => {
    const r = checkAnswer('adios', ['adiós'], es);
    expect(r.verdict).toBe('almost');
    expect(r.issues[0].kind).toBe('accent');
    expect(r.feedback.join(' ')).toContain('adiós');
  });
  it('tolerates a small typo in a long content word', () => {
    const r = checkAnswer('el aeropuerot', ['el aeropuerto'], es);
    expect(r.verdict).toBe('almost');
    expect(r.issues.some((i) => i.kind === 'typo')).toBe(true);
  });
  it('treats a doubled letter as a typo, not an ending error', () => {
    expect(checkAnswer('la manzanna', ['la manzana'], es).verdict).toBe('almost');
  });
  it('accepts a noun without its article as "almost" when allowed, with a reminder', () => {
    const r = checkAnswer('madre', ['la madre'], { ...es, articleOptional: true });
    expect(r.verdict).toBe('almost');
    expect(r.issues[0].kind).toBe('article');
    const f = checkAnswer('eau', ["l'eau"], { ...fr, articleOptional: true });
    expect(f.verdict).toBe('almost');
  });
});

describe('checkAnswer — catching real mistakes', () => {
  it('never treats a one-letter article change as a typo', () => {
    const r = checkAnswer('el madre', ['la madre'], es);
    expect(r.verdict).toBe('wrong');
    expect(r.issues[0].kind).toBe('article');
    expect(r.feedback.join(' ')).toMatch(/feminine/);
  });
  it('flags German case errors in articles', () => {
    const r = checkAnswer('Wir fahren mit der Bus', ['Wir fahren mit dem Bus.'], de);
    expect(r.verdict).toBe('wrong');
    expect(r.issues.map((i) => i.kind)).toContain('article');
  });
  it('identifies wrong verb endings', () => {
    const r = checkAnswer('yo habla español', ['yo hablo español'], es);
    expect(r.verdict).toBe('wrong');
    expect(r.issues[0]).toMatchObject({ kind: 'ending', got: 'habla', want: 'hablo' });
  });
  it('identifies adjective agreement as an ending error', () => {
    const r = checkAnswer('la camisa blanco', ['la camisa blanca'], es);
    expect(r.issues[0].kind).toBe('ending');
  });
  it('distinguishes est / es in French', () => {
    expect(checkAnswer('il es grand', ['il est grand'], fr).verdict).toBe('wrong');
  });
  it('reports word-order mistakes', () => {
    const r = checkAnswer('Am Samstag ich spiele Fußball', ['Am Samstag spiele ich Fußball.'], de);
    expect(r.verdict).toBe('wrong');
    expect(r.issues[0].kind).toBe('wordOrder');
  });
  it('reports missing and extra words', () => {
    const r = checkAnswer('Quiero café con leche', ['Quiero un café con leche.'], es);
    expect(r.issues).toContainEqual({ kind: 'missingWord', want: 'un' });
    const r2 = checkAnswer('I am very very well', ['I am very well'], { lang: 'en' });
    expect(r2.issues.some((i) => i.kind === 'extraWord')).toBe(true);
  });
  it('rejects empty answers', () => {
    expect(checkAnswer('   ', ['hola'], es).verdict).toBe('wrong');
  });
  it('always shows the correct answer when wrong', () => {
    const r = checkAnswer('nada', ['Buenos días'], es);
    expect(r.feedback[r.feedback.length - 1]).toBe('Correct answer: Buenos días');
  });
});

describe('gradeFromResult', () => {
  it('maps verdicts to FSRS grades', () => {
    expect(gradeFromResult(checkAnswer('hola', ['hola'], es), false)).toBe(3);
    expect(gradeFromResult(checkAnswer('hola', ['hola'], es), true)).toBe(2);
    expect(gradeFromResult(checkAnswer('adios', ['adiós'], es), false)).toBe(2);
    expect(gradeFromResult(checkAnswer('gracias', ['adiós'], es), false)).toBe(1);
  });
});
