// Anthropic API provider — direct fetch, Workers-compatible
// Follows the pattern from relevance.js
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
// Sonnet pricing (per million tokens)
const PRICING = {
  'claude-sonnet-4-5-20250929': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
};
export async function callAnthropic({ apiKey, model = DEFAULT_MODEL, system, messages, maxTokens = 4096, json = false }) {
  const systemPrompt = json
    ? `${system}\n\nYou MUST respond with valid JSON only. No commentary, no markdown fences.`
    : system;
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    const err = new Error(`Anthropic API ${res.status}: ${errBody.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const response = await res.json();
  const text = response.content[0].text;
  const usage = response.usage || {};
  const pricing = PRICING[model] || PRICING[DEFAULT_MODEL];
  const cost = ((usage.input_tokens || 0) * pricing.input + (usage.output_tokens || 0) * pricing.output) / 1_000_000;
  const result = {
    text,
    tokensIn: usage.input_tokens || 0,
    tokensOut: usage.output_tokens || 0,
    cost,
    model,
  };
  if (json) {
    result.data = parseJSON(text);
  }
  return result;
}
function parseJSON(text) {
  // Strip markdown fences if present
  const cleaned = text.replace(/```(?:json)?\s*\n?/g, '').replace(/\n?\s*```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try extracting { ... } or [ ... ] block
    const firstBrace = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');
    const first = firstBrace === -1 ? firstBracket : firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket);
    const lastBrace = cleaned.lastIndexOf('}');
    const lastBracket = cleaned.lastIndexOf(']');
    const last = Math.max(lastBrace, lastBracket);
    if (first !== -1 && last > first) {
      return JSON.parse(cleaned.slice(first, last + 1));
    }
    throw new Error(`Failed to parse JSON from AI response: ${cleaned.slice(0, 200)}`);
  }
}
export { DEFAULT_MODEL, PRICING, parseJSON };
