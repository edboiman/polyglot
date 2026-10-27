import { useEffect, useRef, useState, type FormEvent } from 'react';
import { COURSES, index } from '../../data/courses';
import type { Conversation, ConversationReply } from '../../data/types';
import { aiReady, chat, splitFeedback, tutorSystemPrompt, type ChatMessage } from '../../ai/tutor';
import { listenOnce, recognitionErrorMessage, recognitionSupported, RecognitionError } from '../../audio/speech';
import { addXp } from '../../engine/model';
import { matchReply } from '../../engine/conversation';
import { Empty, PlayButtons, Screen, TapText, useAudio, useStopSpeechOnLeave } from '../components/common';
import { IconMic } from '../components/icons';
import { go } from '../router';
import { useStore } from '../store';

interface Turn {
  who: 'npc' | 'me' | 'note';
  t: string;
  en?: string;
}

export function ConversationScreen({ conversationId }: { conversationId: string }) {
  const { state } = useStore();
  const lang = state.currentLang;
  const conv = index(lang).conversationById.get(conversationId);
  const [mode, setMode] = useState<'script' | 'ai'>('script');
  if (!conv) {
    return (
      <Screen title="Conversation" back={() => go('practice')}>
        <Empty title="This conversation isn't in the current course." />
      </Screen>
    );
  }
  const ai = aiReady(state.settings.ai);
  return (
    <Screen
      title={conv.title}
      back={() => go('practice')}
      actions={ai ? (
        <button className="mini" onClick={() => setMode(mode === 'script' ? 'ai' : 'script')}>{mode === 'script' ? 'Free chat (AI)' : 'Guided'}</button>
      ) : undefined}
    >
      {mode === 'script' ? <Scripted conv={conv} /> : <AiChat conv={conv} />}
    </Screen>
  );
}

function Scripted({ conv }: { conv: Conversation }) {
  const { state, updateLang } = useStore();
  const lang = conv.lang;
  const audio = useAudio(lang);
  useStopSpeechOnLeave();
  const canSpeak = recognitionSupported() && state.settings.microphone;
  const [nodeId, setNodeId] = useState(conv.start);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [options, setOptions] = useState(false);
  const [miss, setMiss] = useState(false);
  const [listening, setListening] = useState(false);
  const [micErr, setMicErr] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const node = conv.nodes.find((n) => n.id === nodeId)!;

  useEffect(() => {
    setTurns((t) => [...t, { who: 'npc', t: node.npc.t, en: node.npc.en }]);
    if (state.settings.autoplayAudio && audio.available) void audio.say(node.npc.t);
    if (node.end) {
      const now = Date.now();
      updateLang((p) => addXp({ ...p, conversationsDone: { ...p.conversationsDone, [conv.id]: now } }, 5, now));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [turns, options, miss]);

  const choose = (r: ConversationReply, how: 'typed' | 'spoken' | 'picked', exact: boolean, said?: string) => {
    const notes: Turn[] = [];
    if (how !== 'picked') {
      // Conversations are practice: matching the topic is not the same as a checked sentence,
      // so no turn (matched or not) is recorded as a writing/speaking attempt for mastery.
      if (!exact) notes.push({ who: 'note', t: `Understood the topic (your wording wasn't checked). A typical way to say it: “${r.t}”` });
      else if (r.feedback) notes.push({ who: 'note', t: r.feedback });
    }
    setTurns((t) => [...t, { who: 'me', t: said ?? r.t, en: how === 'picked' ? r.en : undefined }, ...notes]);
    setInput('');
    setOptions(false);
    setMiss(false);
    setNodeId(r.next);
  };

  const submit = (e: FormEvent, text = input, how: 'typed' | 'spoken' = 'typed') => {
    e.preventDefault();
    if (!text.trim()) return;
    const m = matchReply(conv, nodeId, text);
    if (m) choose(m.reply, how, m.exact, text);
    else {
      setMiss(true);
    }
  };

  const stopMic = useRef<() => void>(() => {});
  useEffect(() => () => stopMic.current(), []);

  const speakAnswer = async () => {
    setListening(true);
    setMicErr('');
    try {
      const rec = listenOnce(lang);
      stopMic.current = rec.stop;
      const r = await rec.promise;
      const best = r.transcripts.find((t) => matchReply(conv, nodeId, t)) ?? r.transcripts[0] ?? '';
      setInput(best);
      const m = matchReply(conv, nodeId, best);
      if (m) choose(m.reply, 'spoken', m.exact, best);
      else setMiss(true);
    } catch (e) {
      setMicErr(recognitionErrorMessage(e instanceof RecognitionError ? e.code : 'unknown'));
    } finally {
      setListening(false);
    }
  };

  return (
    <div className="convo">
      <p className="muted small">{conv.situation} {state.settings.typing ? 'Type or say your reply.' : 'Say your reply aloud.'} Tap words for meanings.</p>
      <div className="bubbles" aria-live="polite">
        {turns.map((t, i) =>
          t.who === 'note' ? (
            <p key={i} className="bubble-note">{t.t}</p>
          ) : (
            <div key={i} className={`bubble ${t.who}`}>
              {t.who === 'npc' && <span className="bubble-who">{conv.npcName}</span>}
              <span className="target">{t.who === 'npc' ? <TapText text={t.t} lang={lang} /> : t.t}</span>
              {t.who === 'npc' && <Reveal en={t.en!} mode={state.settings.showTranslations} />}
              {t.who === 'npc' && <PlayButtons text={t.t} lang={lang} />}
              {t.who === 'me' && t.en && <span className="muted small">{t.en}</span>}
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>
      {node.end ? (
        <div className="panel">
          <p><strong>Conversation complete.</strong> Try it again and choose different answers, or say things in your own words.</p>
          <div className="row">
            <button className="btn ghost" onClick={() => { setTurns([]); setNodeId(conv.start); }}>Again</button>
            <button className="btn primary grow" onClick={() => go('practice')}>Done</button>
          </div>
        </div>
      ) : (
        <form className="reply" onSubmit={submit}>
          {node.task && <p className="task">Your turn: {node.task}</p>}
          {miss && (
            <p className="warn" role="status">
              I couldn't match that to what's expected here. Your sentence may still be fine — free answers can't always be checked reliably. Try rephrasing, or look at the options.
            </p>
          )}
          {micErr && <p className="warn">{micErr}</p>}
          {state.settings.typing ? (
            <>
              <div className="reply-row">
                <input className="answer" value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Reply in ${COURSES[lang].name}`} lang={lang} autoComplete="off" autoCapitalize="off" spellCheck={false} aria-label="Your reply" />
                {canSpeak && (
                  <button type="button" className={`icon-btn mic${listening ? ' live' : ''}`} onClick={speakAnswer} disabled={listening} aria-label="Say your reply">
                    <IconMic />
                  </button>
                )}
              </div>
              <div className="row">
                <button type="submit" className="btn primary grow">Send</button>
                <button type="button" className="btn ghost" onClick={() => setOptions((o) => !o)} aria-expanded={options}>{options ? 'Hide options' : 'Show options'}</button>
              </div>
            </>
          ) : (
            <>
              {canSpeak ? (
                <button type="button" className={`mic-btn${listening ? ' live' : ''}`} onClick={speakAnswer} disabled={listening} aria-label="Say your reply">
                  <IconMic size={30} />
                  <span>{listening ? 'Listening…' : 'Tap and reply'}</span>
                </button>
              ) : (
                <p className="muted small">Say your reply aloud, then tap the option closest to what you said.</p>
              )}
              {input && miss && <p className="small">Heard: <span className="target">“{input}”</span></p>}
              {canSpeak && (
                <button type="button" className="btn ghost wide" onClick={() => setOptions((o) => !o)} aria-expanded={options}>{options ? 'Hide options' : 'Show options'}</button>
              )}
            </>
          )}
          {(options || (!state.settings.typing && !canSpeak)) && (
            <div className="choices">
              {node.replies.map((r) => (
                <button type="button" key={r.t} className="choice" onClick={() => choose(r, 'picked', true)} lang={lang}>
                  <span className="target">{r.t}</span>
                  <span className="muted small">{r.en}</span>
                </button>
              ))}
            </div>
          )}
        </form>
      )}
    </div>
  );
}

function Reveal({ en, mode }: { en: string; mode: 'always' | 'tap' | 'never' }) {
  const [show, setShow] = useState(mode === 'always');
  if (mode === 'never') return null;
  return show ? <span className="trans">{en}</span> : <button className="mini" onClick={() => setShow(true)}>English</button>;
}

const MAX_TURNS = 12;

function AiChat({ conv }: { conv: Conversation }) {
  const { state } = useStore();
  const lang = conv.lang;
  const p = state.langs[lang];
  const known = Object.values(p.cards).filter((c) => c.kind !== 's').map((c) => index(lang).vocabById.get(c.itemId)?.lemma).filter((x): x is string => !!x);
  const [msgs, setMsgs] = useState<ChatMessage[]>([{ role: 'system', content: tutorSystemPrompt(lang, conv.situation, known) }]);
  const [shown, setShown] = useState<{ who: 'npc' | 'me'; t: string; fb?: string }[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const abort = useRef<AbortController | null>(null);
  const started = useRef(false);
  useEffect(() => () => abort.current?.abort(), []);

  const send = async (text: string) => {
    const next: ChatMessage[] = [...msgs, { role: 'user', content: text }];
    setMsgs(next);
    if (text !== '(start)') setShown((s) => [...s, { who: 'me', t: text }]);
    setBusy(true);
    setErr('');
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      // Send the system prompt plus only the most recent turns to keep requests small.
      const bounded = [next[0], ...next.slice(1).slice(-MAX_TURNS)];
      const out = await chat(state.settings.ai, bounded, ctl.signal);
      if (ctl.signal.aborted) return;
      const { reply, feedback } = splitFeedback(out);
      setMsgs((m) => [...m, { role: 'assistant', content: out }]);
      setShown((s) => [...s, { who: 'npc', t: reply, fb: text === '(start)' ? undefined : feedback }]);
    } catch (e) {
      if (ctl.signal.aborted && !(e instanceof Error && /timed out/.test(e.message))) return;
      setErr(e instanceof Error ? e.message : 'The AI partner did not respond.');
    } finally {
      if (abort.current === ctl) setBusy(false);
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void send('(start)');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="convo">
      <p className="muted small">
        Free conversation with your configured AI partner ({state.settings.ai.model}). Its feedback is generated by a language model and can be wrong; it does not count toward your mastery scores.
      </p>
      <div className="bubbles" aria-live="polite">
        {shown.map((t, i) => (
          <div key={i} className={`bubble ${t.who}`}>
            <span className="target">{t.who === 'npc' ? <TapText text={t.t} lang={lang} /> : t.t}</span>
            {t.who === 'npc' && <PlayButtons text={t.t} lang={lang} />}
            {t.fb && <span className="bubble-fb">{t.fb}</span>}
          </div>
        ))}
        {busy && <p className="muted small">Thinking…</p>}
      </div>
      {err && <p className="warn">{err} The guided conversation still works without AI.</p>}
      <form className="reply" onSubmit={(e) => { e.preventDefault(); if (input.trim() && !busy) { void send(input.trim()); setInput(''); } }}>
        <div className="reply-row">
          <input className="answer" value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Reply in ${COURSES[lang].name}`} lang={lang} autoComplete="off" aria-label="Your message" />
        </div>
        <button className="btn primary wide" disabled={busy}>Send</button>
      </form>
    </div>
  );
}
