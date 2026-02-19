import Anthropic from '@anthropic-ai/sdk';

let client;

function getClient() {
  if (!client) {
    const apiKey = import.meta.env?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
    client = new Anthropic({ apiKey });
  }
  return client;
}

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

export async function chat(prompt, opts = {}) {
  const res = await getClient().messages.create({
    model: opts.model || DEFAULT_MODEL,
    max_tokens: opts.maxTokens || 1024,
    system: opts.system || undefined,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.content[0].text;
}

export async function chatJSON(prompt, opts = {}) {
  const text = await chat(prompt, {
    ...opts,
    system: (opts.system || '') + '\nRespond with valid JSON only. No markdown fences, no commentary.',
  });
  const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(cleaned);
}
