import { analyzePhrase as concordanceLookup } from './concordance.js';

export async function analyzePhrase(phrase, sourceLang = 'ar', d1Binding = null) {
  return concordanceLookup(phrase, sourceLang, d1Binding);
}
