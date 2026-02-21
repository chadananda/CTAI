// Pure utility functions for the translation pipeline
// Extracted for testability — no cloudflare:workers dependency

export const MAX_BLOCK_WORDS = 2000;
export const MAX_DELIB_ROUNDS = 3;
export const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
export const MODEL = 'claude-sonnet-4-5-20250929';
export const PRICING = { input: 3.00, output: 15.00 };
export const RESEND_API = 'https://api.resend.com/emails';

export function generateId(length = 21) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

export function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Split paragraphs into blocks of ≤ maxWords words each.
 * Returns array of { texts: string[], paraIndices: number[] }
 */
export function splitIntoBlocks(paragraphs, maxWords = MAX_BLOCK_WORDS) {
  const blocks = [];
  let currentBlock = { texts: [], paraIndices: [] };
  let currentWords = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const paraText = typeof paragraphs[i] === 'string' ? paragraphs[i] : (paragraphs[i].text || '');
    const wc = wordCount(paraText);
    if (currentWords + wc > maxWords && currentBlock.texts.length > 0) {
      blocks.push(currentBlock);
      currentBlock = { texts: [], paraIndices: [] };
      currentWords = 0;
    }
    currentBlock.texts.push(paraText);
    currentBlock.paraIndices.push(i);
    currentWords += wc;
  }
  if (currentBlock.texts.length > 0) blocks.push(currentBlock);

  return blocks;
}

/**
 * Build a JSON Response (for the fetch handler)
 */
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Parse JSON from AI response text, handling markdown fences and surrounding text.
 */
export function parseAIJson(text) {
  const cleaned = text.replace(/```(?:json)?\s*\n?/g, '').replace(/\n?\s*```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');
    const start = first === -1 ? firstBracket : firstBracket === -1 ? first : Math.min(first, firstBracket);
    const lastBrace = cleaned.lastIndexOf('}');
    const lastBracket = cleaned.lastIndexOf(']');
    const end = Math.max(lastBrace, lastBracket);
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error(`Failed to parse JSON: ${cleaned.slice(0, 200)}`);
  }
}

/**
 * Calculate cost from token usage.
 */
export function calculateCost(tokensIn, tokensOut, pricing = PRICING) {
  return ((tokensIn || 0) * pricing.input + (tokensOut || 0) * pricing.output) / 1_000_000;
}

/**
 * Determine block status label for display.
 */
export function getBlockStatusLabel(status, delibRound) {
  const labels = {
    pending: 'Pending',
    researching: 'Researching',
    translating: 'Translating',
    deliberating: delibRound > 0 ? `Deliberation R${delibRound}` : 'Deliberating',
    converging: 'Converging',
    complete: 'Complete',
    failed: 'Failed',
  };
  return labels[status] || 'Unknown';
}

/**
 * Calculate overall progress percentage for a job.
 * Segmentation = 1 unit, each block = 1 unit, finalization = 1 unit.
 */
export function calculateProgress({ totalBlocks, blocksDone, status }) {
  if (status === 'complete') return 100;
  if (status === 'failed') return 0;

  const segDone = totalBlocks > 0 ? 1 : 0;
  const finDone = status === 'complete' ? 1 : 0;
  const total = 1 + (totalBlocks || 0) + 1; // seg + blocks + finalize
  const done = segDone + (blocksDone || 0) + finDone;

  return total > 0 ? Math.round((done / total) * 100) : 0;
}

/**
 * Validate block status transition.
 */
export const VALID_BLOCK_STATUSES = ['pending', 'researching', 'translating', 'deliberating', 'converging', 'complete', 'failed'];

export const VALID_JOB_STATUSES = ['pending', 'paid', 'segmenting', 'researching', 'translating', 'deliberating', 'assembling', 'reviewing', 'complete', 'failed'];

/**
 * Build unsubscribe HMAC token (simplified version for workers).
 */
export function buildUnsubscribeUrl(origin, userId, token) {
  return `${origin}/api/email/unsubscribe?uid=${userId}&token=${token}`;
}
