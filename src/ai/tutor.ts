/**
 * Optional AI conversation partner.
 *
 * Works with any OpenAI-compatible Chat Completions endpoint the learner
 * configures (a local model server, or a hosted provider with their own key).
 * Nothing is sent anywhere unless the learner enables this in Profile and
 * supplies an endpoint. Scripted conversations never depend on it.
 *
 * Note: a browser app cannot keep an API key secret from the person using
 * it; the key is stored only on this device and never included in backups
 * unless the learner explicitly chooses to.
 */

import type { LangCode } from '../data/types';

export interface AiConfig {
  enabled: boolean;
  endpoint: string;
  model: string;
  apiKey: string;
  keyEndpoint?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const LANG_NAME: Record<LangCode, string> = { es: 'Spanish', de: 'German', fr: 'French' };

/**
 * Endpoints must use HTTPS. Plain HTTP is allowed only for this device's own
 * loopback address (a local model server during development); a phone's
 * "localhost" is the phone itself, not your computer.
 */
export function endpointAllowed(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return false;
  }
  if (u.protocol === 'https:') return true;
  return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
}

/** Stable identity of an endpoint (origin + path), used to bind a stored key to the endpoint it was entered for. */
export function endpointIdentity(url: string): string {
  try {
    const u = new URL(url.trim());
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return '';
  }
}

export function aiReady(c: AiConfig): boolean {
  return c.enabled && endpointAllowed(c.endpoint) && c.model.trim().length > 0;
}

const TIMEOUT_MS = 30_000;

export function tutorSystemPrompt(lang: LangCode, situation: string, knownWords: string[]): string {
  return [
    `You are a friendly ${LANG_NAME[lang]} conversation partner for an A1 (beginner) learner whose first language is English.`,
    `Situation: ${situation}`,
    'Rules:',
    `- Reply in simple ${LANG_NAME[lang]} (A1 level): short sentences, present tense, common words.`,
    knownWords.length ? `- Prefer these words the learner has studied: ${knownWords.slice(0, 120).join(', ')}.` : '',
    '- Keep each reply to one or two sentences and end with a simple question to keep the conversation going.',
    '- After your reply, on a new line starting with "Feedback:", give one short note in English about the learner\'s last message: praise what was right and correct at most one important mistake. If it was correct, say so briefly.',
    '- Never claim to judge pronunciation.',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function chat(c: AiConfig, messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
  const url = c.endpoint.trim().replace(/\/+$/, '');
  const full = /\/chat\/completions$/.test(url) ? url : `${url}/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // The key is bound to the endpoint it was entered for and is never sent to a different one.
  if (c.apiKey) {
    if (!c.keyEndpoint || endpointIdentity(c.keyEndpoint) !== endpointIdentity(c.endpoint)) {
      throw new Error('The saved API key belongs to a different endpoint. Re-enter the key for this endpoint in Profile.');
    }
    headers.Authorization = `Bearer ${c.apiKey}`;
  }
  if (!endpointAllowed(full)) throw new Error('The AI endpoint must use https:// (or http://localhost on this device).');
  // Time out stalled requests, and also stop when the caller cancels.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const onAbort = () => ctl.abort();
  signal?.addEventListener('abort', onAbort);
  let res: Response;
  try {
    res = await fetch(full, {
      method: 'POST',
      headers,
      signal: ctl.signal,
      body: JSON.stringify({ model: c.model, messages, temperature: 0.6, max_tokens: 220 }),
    });
  } catch (e) {
    if (ctl.signal.aborted && !signal?.aborted) throw new Error('The AI service timed out after 30 seconds.');
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`The AI service answered ${res.status}${text ? `: ${text.slice(0, 160)}` : ''}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('The AI service returned an empty reply.');
  return content.trim();
}

/** Split "reply\nFeedback: note" into its parts. */
export function splitFeedback(text: string): { reply: string; feedback?: string } {
  const m = text.match(/^([\s\S]*?)\n+\s*Feedback:\s*([\s\S]+)$/i);
  if (!m) return { reply: text };
  return { reply: m[1].trim(), feedback: m[2].trim() };
}
