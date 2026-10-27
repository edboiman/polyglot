import { useEffect, useRef, useState } from 'react';
import { COURSES, LANGS } from '../../data/courses';
import type { LangCode } from '../../data/types';
import { aiReady, chat, endpointAllowed, endpointIdentity } from '../../ai/tutor';
import { loadVoices, recognitionSupported, speak, ttsSupported, voicesFor } from '../../audio/speech';
import { type AppState, type Settings, emptyLang } from '../../engine/model';
import { ImportError, exportBackup, hasUndoImport, importBackup, undoImport } from '../../storage/persistence';
import { OfflineStatus } from '../components/OfflineStatus';
import { useStore } from '../store';
import { LangSwitcher } from './Home';

export function Profile() {
  const { state, update, replace, backend, flush, status } = useStore();
  const [canUndo, setCanUndo] = useState(false);
  useEffect(() => {
    if (backend) hasUndoImport(backend).then(setCanUndo);
  }, [backend, state.revision]);
  const s = state.settings;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => update((st) => ({ ...st, settings: { ...st.settings, [k]: v } }));
  const [msg, setMsg] = useState('');
  const [voices, setVoices] = useState<Record<LangCode, SpeechSynthesisVoice[]>>({ es: [], de: [], fr: [] });
  const fileRef = useRef<HTMLInputElement>(null);
  const [aiMsg, setAiMsg] = useState('');

  useEffect(() => {
    loadVoices().then(() => setVoices({ es: voicesFor('es'), de: voicesFor('de'), fr: voicesFor('fr') }));
  }, []);

  const doExport = async () => {
    await flush();
    const data = JSON.stringify(exportBackup(state), null, 1);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `polyglot-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setMsg('Backup downloaded.');
  };

  const doImport = async (f: File) => {
    if (!backend) return;
    if (status.kind !== 'ok') return setMsg('Saving is paused in this tab, so a backup cannot be imported. Reload first.');
    if (f.size > 10 * 1024 * 1024) return setMsg('This file is too large to be a Polyglot backup.');
    if (!confirm('Replace the progress on this device with the backup? (Your current data is kept and can be restored with “Undo last import”.)')) return;
    try {
      await flush();
      const { state: next, dropped } = await importBackup(backend, state, await f.text());
      replace(next);
      setMsg(`Backup restored.${dropped ? ` ${dropped} item(s) for content no longer in the course were skipped.` : ''} AI settings on this device were left unchanged.`);
    } catch (e) {
      setMsg(e instanceof ImportError ? e.message : 'The backup could not be read.');
    }
  };

  const doUndo = async () => {
    if (!backend || !confirm('Restore the progress you had before the last import?')) return;
    try {
      await flush();
      const prev = await undoImport(backend, state);
      if (prev) {
        replace(prev);
        setMsg('Previous progress restored.');
      } else setMsg('There is nothing to restore.');
    } catch {
      setMsg('The previous progress could not be restored.');
    }
  };

  /** Changing the endpoint clears a saved key: a key is only ever sent to the endpoint it was entered for. */
  const setEndpoint = (endpoint: string) => {
    const keep = s.ai.apiKey && endpointIdentity(endpoint) === endpointIdentity(s.ai.keyEndpoint);
    set('ai', { ...s.ai, endpoint, apiKey: keep ? s.ai.apiKey : '', keyEndpoint: keep ? s.ai.keyEndpoint : '' });
  };
  const setKey = (apiKey: string) => set('ai', { ...s.ai, apiKey, keyEndpoint: apiKey ? s.ai.endpoint : '' });

  const resetLang = (l: LangCode) => {
    if (!confirm(`Delete all ${COURSES[l].name} progress? This cannot be undone (export a backup first if unsure).`)) return;
    update((st): AppState => ({ ...st, langs: { ...st.langs, [l]: emptyLang(l) } }));
    setMsg(`${COURSES[l].name} progress reset.`);
  };

  const testAi = async () => {
    setAiMsg('Testing…');
    try {
      const r = await chat(s.ai, [{ role: 'user', content: 'Reply with the single word: ok' }]);
      setAiMsg(`Connected. The model replied: “${r.slice(0, 40)}”`);
    } catch (e) {
      setAiMsg(e instanceof Error ? e.message : 'Connection failed.');
    }
  };

  return (
    <div className="screen profile">
      <header className="screen-head"><h1>Profile</h1></header>
      {msg && <p className="toast" role="status">{msg}</p>}

      <section className="panel">
        <h2>Language</h2>
        <p className="muted small">Each language keeps its own progress. Switching never erases or mixes anything.</p>
        <LangSwitcher />
      </section>

      <section className="panel">
        <h2>Goals and workload</h2>
        <label className="field">
          <span>Daily goal</span>
          <select value={s.dailyGoalXp} onChange={(e) => set('dailyGoalXp', Number(e.target.value))}>
            <option value={20}>Light — 20 XP (about 5 min)</option>
            <option value={50}>Regular — 50 XP (about 10–15 min)</option>
            <option value={100}>Serious — 100 XP (about 25 min)</option>
            <option value={150}>Intense — 150 XP (about 40 min)</option>
          </select>
        </label>
        <label className="field">
          <span>Daily target for new words</span>
          <select value={s.newPerDay} onChange={(e) => set('newPerDay', Number(e.target.value))}>
            {[5, 10, 15, 20, 30].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <small className="muted">A target, not a lock: once you reach it, Home suggests reviewing instead, but lessons stay open. Each new word adds future reviews.</small>
        </label>
        <label className="field">
          <span>Review limit per day</span>
          <select value={s.maxReviewsPerDay} onChange={(e) => set('maxReviewsPerDay', Number(e.target.value))}>
            {[30, 50, 100, 200, 9999].map((n) => <option key={n} value={n}>{n === 9999 ? 'No limit' : n}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Target recall</span>
          <select value={s.desiredRetention} onChange={(e) => set('desiredRetention', Number(e.target.value))}>
            <option value={0.85}>85% — fewer reviews</option>
            <option value={0.9}>90% — recommended</option>
            <option value={0.95}>95% — more reviews</option>
          </select>
          <small className="muted">The scheduler times each review for when your predicted recall falls to this level.</small>
        </label>
        <Toggle label="Track streaks" hint="One missed day per week is forgiven automatically. No reminders are sent." checked={s.streaks} onChange={(v) => set('streaks', v)} />
        <Toggle
          label="Typing exercises"
          hint={s.typing
            ? 'On: some answers are typed in the target language.'
            : 'Off: you answer by speaking aloud (checked by speech recognition when available, otherwise you hear the answer and rate yourself) or by choosing an option.'}
          checked={s.typing}
          onChange={(v) => set('typing', v)}
        />
        <Toggle label="Allow skipping ahead" hint="Open any lesson without completing earlier ones." checked={s.freeNavigation} onChange={(v) => set('freeNavigation', v)} />
      </section>

      <section className="panel">
        <h2>Display and accessibility</h2>
        <label className="field">
          <span>Theme</span>
          <select value={s.theme} onChange={(e) => set('theme', e.target.value as Settings['theme'])}>
            <option value="system">Match device</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label className="field">
          <span>Text size</span>
          <select value={s.fontScale} onChange={(e) => set('fontScale', Number(e.target.value))}>
            <option value={0.9}>Small</option>
            <option value={1}>Default</option>
            <option value={1.15}>Large</option>
            <option value={1.3}>Extra large</option>
          </select>
        </label>
        <label className="field">
          <span>Translations in dialogues</span>
          <select value={s.showTranslations} onChange={(e) => set('showTranslations', e.target.value as Settings['showTranslations'])}>
            <option value="always">Always show</option>
            <option value="tap">Show on tap</option>
            <option value="never">Hide</option>
          </select>
        </label>
        <Toggle label="Reduce motion" checked={s.reduceMotion} onChange={(v) => set('reduceMotion', v)} />
      </section>

      <section className="panel">
        <h2>Audio and speaking</h2>
        {!ttsSupported() && <p className="warn">This browser has no text-to-speech. Lessons work without audio; listening exercises are skipped.</p>}
        <Toggle label="Play words automatically" checked={s.autoplayAudio} onChange={(v) => set('autoplayAudio', v)} />
        <label className="field">
          <span>Speech speed</span>
          <select value={s.speechRate} onChange={(e) => set('speechRate', Number(e.target.value))}>
            <option value={0.8}>Slower</option>
            <option value={1}>Normal</option>
            <option value={1.15}>Faster</option>
          </select>
        </label>
        {LANGS.map((l) => (
          <label className="field" key={l}>
            <span>{COURSES[l].name} voice</span>
            <span className="row">
              <select value={s.voiceURI[l]} onChange={(e) => set('voiceURI', { ...s.voiceURI, [l]: e.target.value })} disabled={!voices[l].length}>
                <option value="">{voices[l].length ? 'Automatic' : 'No voice installed'}</option>
                {voices[l].map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
              </select>
              {voices[l].length > 0 && <button className="mini" onClick={() => speak(l === 'es' ? 'Hola, ¿qué tal?' : l === 'de' ? 'Hallo, wie geht\'s?' : 'Bonjour, ça va ?', l, { voiceURI: s.voiceURI[l] || undefined, rate: s.speechRate })}>Test</button>}
            </span>
          </label>
        ))}
        <p className="muted small">Voices come from your device and are synthesised — useful for practice, but not a perfect model of native pronunciation.</p>
        <Toggle
          label="Speaking exercises with the microphone"
          hint={recognitionSupported() ? 'Uses your browser\'s speech recognition (some browsers send audio to their own service). It checks whether your words were understood, not your accent.' : 'Speech recognition is not available in this browser; speaking exercises use self-check instead.'}
          checked={s.microphone}
          onChange={(v) => set('microphone', v)}
        />
      </section>

      <section className="panel">
        <h2>AI conversation partner (optional)</h2>
        <p className="muted small">
          Connect any OpenAI-compatible chat endpoint (a local model server, or a provider you have an account with) for free-form conversation. Nothing is sent unless this is on. The key is stored only on this device; anyone using this browser can see it.
        </p>
        <Toggle label="Enable AI partner" checked={s.ai.enabled} onChange={(v) => set('ai', { ...s.ai, enabled: v })} />
        {s.ai.enabled && (
          <>
            <label className="field"><span>Endpoint URL</span><input value={s.ai.endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://api.example.com/v1" inputMode="url" autoCapitalize="off" />
              {s.ai.endpoint && !endpointAllowed(s.ai.endpoint) && <small className="warn">Use an https:// address. Plain http:// only works for a server on this same device (localhost).</small>}
              <small className="muted">Changing the address clears the saved key.</small></label>
            <label className="field"><span>Model name</span><input value={s.ai.model} onChange={(e) => set('ai', { ...s.ai, model: e.target.value })} placeholder="model-name" autoCapitalize="off" /></label>
            <label className="field"><span>API key</span><input type="password" value={s.ai.apiKey} onChange={(e) => setKey(e.target.value)} autoComplete="off" /></label>
            <button className="btn ghost" onClick={testAi} disabled={!aiReady(s.ai)}>Test connection</button>
            {aiMsg && <p className="small" role="status">{aiMsg}</p>}
          </>
        )}
      </section>

      <section className="panel">
        <h2>Backup</h2>
        <p className="muted small">Progress is saved automatically on this device ({backend?.name === 'indexeddb' ? 'IndexedDB' : backend?.name === 'localstorage' ? 'local storage' : 'memory only — export to keep it'}). Export a file to move it to another device or keep it safe.</p>
        <div className="row">
          <button className="btn primary grow" onClick={doExport}>Export backup</button>
          <button className="btn ghost grow" onClick={() => fileRef.current?.click()}>Import backup</button>
        </div>
        {canUndo && <button className="link" onClick={doUndo}>Undo last import</button>}
        <p className="muted small">Backups never include AI settings or keys, and importing one never changes them.</p>
        <OfflineStatus />
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ''; }} />
      </section>

      <section className="panel">
        <h2>Reset</h2>
        <div className="row wrap">
          {LANGS.map((l) => <button key={l} className="btn danger-ghost" onClick={() => resetLang(l)}>Reset {COURSES[l].name}</button>)}
        </div>
      </section>

      <p className="muted small center">Polyglot 1.0 · runs entirely in your browser · no account needed</p>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <span>
        <span>{label}</span>
        {hint && <small className="muted">{hint}</small>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
