// Shared cost estimation constants for translation pipeline
// Update these values as real job data reveals actual costs.

export const CHARS_PER_WORD = { ar: 4.5, fa: 5 };
export const CHARS_PER_PARA = { ar: 400, fa: 450 };
export const COST_PER_PARA = {
  seg: 0.20,       // 4 Sonnet passes for segmentation
  research: 0.05,  // 1 Jafar lookup + Claude reference packet
  trans: 0.75,     // 3 translators × 2–3 rounds + convergence
  assembly: 0.05,  // Final assembly + fidelity review
};
export const CUSHION = 1.5; // 50% buffer for retries, variance, complex texts

const PER_PARA_TOTAL = (COST_PER_PARA.seg + COST_PER_PARA.research + COST_PER_PARA.trans + COST_PER_PARA.assembly) * CUSHION;

// Estimate cost for a work given its word_count and language
export function estimateCost(w) {
  if (!w.word_count) return null;
  const lang = w.language || 'ar';
  const chars = w.word_count * (CHARS_PER_WORD[lang] || 4.5);
  const paras = Math.max(1, Math.ceil(chars / (CHARS_PER_PARA[lang] || 400)));
  const seg = Math.round(paras * COST_PER_PARA.seg * CUSHION * 100) / 100;
  const research = Math.round(paras * COST_PER_PARA.research * CUSHION * 100) / 100;
  const trans = Math.round(paras * COST_PER_PARA.trans * CUSHION * 100) / 100;
  const assembly = Math.round(paras * COST_PER_PARA.assembly * CUSHION * 100) / 100;
  const total = Math.round(paras * PER_PARA_TOTAL * 100) / 100;
  return { paras, seg, research, trans, assembly, total };
}

export function fmtCost(n) {
  return n < 1 ? `${Math.round(n * 100)}¢` : `$${n.toFixed(0)}`;
}
