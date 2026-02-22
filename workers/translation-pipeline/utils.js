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

// --- Index-based segmentation utilities ---

/**
 * Tokenize source text into words, extracting * delimiters as mandatory phrase boundaries.
 * Returns { words: string[], mandatoryBreaks: number[] }
 * mandatoryBreaks contains the indices in the cleaned words array where a new phrase must begin
 * (i.e., the word immediately after each *).
 */
export function tokenizeWords(sourceText) {
  const raw = sourceText.split(/\s+/).filter(Boolean);
  const words = [];
  const mandatoryBreaks = [];

  for (const token of raw) {
    if (token === '*') {
      // Next word must start a new phrase
      mandatoryBreaks.push(words.length);
    } else {
      words.push(token);
    }
  }
  return { words, mandatoryBreaks };
}

/**
 * Build compact numbered word list: "0:بسم 1:الله 2:الرحمن 3:الرحيم"
 */
export function buildNumberedWordList(words) {
  return words.map((w, i) => `${i}:${w}`).join(' ');
}

/**
 * Build numbered phrase list for Pass 2 input.
 * "P0: بسم الله الرحمن الرحيم\nP1: قل هو الله أحد"
 */
export function buildNumberedPhraseList(phrases) {
  return phrases.map((p, i) => `P${i}: ${p.text}`).join('\n');
}

/**
 * Build numbered sentence list with type annotations for Pass 3 input.
 * "S0 [prose]: بسم الله...\nS1 [verse_couplet]: ..."
 */
export function buildNumberedSentenceList(sentences) {
  return sentences.map((s, i) => `S${i} [${s.type}]: ${s.text}`).join('\n');
}

/**
 * Validate that an index array is sorted ascending, in range [0, max), and starts with 0.
 */
export function validateIndices(indices, max, label) {
  const errors = [];
  if (!Array.isArray(indices) || indices.length === 0) {
    errors.push(`${label}: empty or not an array`);
    return { valid: false, errors };
  }
  if (indices[0] !== 0) {
    errors.push(`${label}: must start with 0, got ${indices[0]}`);
  }
  for (let i = 0; i < indices.length; i++) {
    if (typeof indices[i] !== 'number' || indices[i] < 0 || indices[i] >= max) {
      errors.push(`${label}[${i}]: ${indices[i]} out of range [0, ${max})`);
    }
    if (i > 0 && indices[i] <= indices[i - 1]) {
      errors.push(`${label}[${i}]: ${indices[i]} not strictly ascending (prev: ${indices[i - 1]})`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Split words into processing windows of ~windowSize characters each.
 * Returns array of { startIdx, endIdx } (endIdx is exclusive).
 * Does NOT handle overlap/carry-forward — caller is responsible.
 */
export function windowWords(words, windowSize = 5000) {
  if (words.length === 0) return [];
  const windows = [];
  let startIdx = 0;
  let charCount = 0;

  for (let i = 0; i < words.length; i++) {
    // +1 for the space separator (or the index prefix in numbered format)
    charCount += words[i].length + String(i).length + 2; // "idx:word "
    if (charCount >= windowSize && i > startIdx) {
      windows.push({ startIdx, endIdx: i });
      startIdx = i;
      charCount = words[i].length + String(i).length + 2;
    }
  }
  // Final window
  if (startIdx < words.length) {
    windows.push({ startIdx, endIdx: words.length });
  }
  return windows;
}

/**
 * Build the full nested paragraph structure from index arrays.
 * All text is reconstructed from the original words array — never from LLM output.
 */
export function buildStructureFromIndices({ words, phraseStarts, sentenceStarts, sentenceTypes, paragraphStarts, verseRanges }) {
  // Build phrases from word indices
  const phrases = [];
  for (let i = 0; i < phraseStarts.length; i++) {
    const start = phraseStarts[i];
    const end = i + 1 < phraseStarts.length ? phraseStarts[i + 1] : words.length;
    const text = words.slice(start, end).join(' ');
    // Determine if this phrase is in a verse range
    const verse = (verseRanges || []).some(([vs, ve]) => start >= vs && start < ve);
    phrases.push({ text, verse });
  }

  // Build sentences from phrase indices
  const sentences = [];
  for (let i = 0; i < sentenceStarts.length; i++) {
    const start = sentenceStarts[i];
    const end = i + 1 < sentenceStarts.length ? sentenceStarts[i + 1] : phrases.length;
    const sentPhrases = phrases.slice(start, end);
    const text = sentPhrases.map(p => p.text).join(' ');
    const type = sentenceTypes?.[String(start)] || 'prose';
    sentences.push({ text, type, phrases: sentPhrases });
  }

  // Build paragraphs from sentence indices
  const paragraphs = [];
  for (let i = 0; i < paragraphStarts.length; i++) {
    const start = paragraphStarts[i];
    const end = i + 1 < paragraphStarts.length ? paragraphStarts[i + 1] : sentences.length;
    const paraSentences = sentences.slice(start, end);
    const text = paraSentences.map(s => s.text).join(' ');
    // Derive paragraph type from sentence types
    const types = new Set(paraSentences.map(s => s.type));
    let type;
    if (types.size === 1 && types.has('prose')) type = 'prose';
    else if (types.size >= 1 && !types.has('prose')) type = 'verse_stanza';
    else type = 'mixed';
    paragraphs.push({ text, type, sentences: paraSentences });
  }

  return { paragraphs };
}
