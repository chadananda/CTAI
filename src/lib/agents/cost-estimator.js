// Cost estimation for translation pipeline
// Rates are stored in KV (SESSIONS namespace, key: "cost_model")
// and tunable by admin via /api/admin/cost-model
// Falls back to sensible defaults if KV has no config yet

const DEFAULT_MODEL = {
  // Average characters per paragraph by language
  charsPerPara: { ar: 400, fa: 450 },
  // Cost per paragraph (USD) — initial estimates, refined from real job data
  costs: {
    segmentation: 0.20,   // 4 Sonnet passes × ~$0.05 each
    research: 0.05,       // 1 Jafar lookup + Claude reference packet
    translation: 0.75,    // 3 translators × up to 3 rounds (avg 2 rounds) + convergence
    assembly: 0.05,       // final assembly + fidelity review
  },
  cushion: 1.5,           // 50% buffer for retries, variance, complex texts
  // Metadata from last calibration
  lastCalibrated: null,
  calibrationNote: 'Initial estimates — not yet calibrated from real data',
  jobsSampled: 0,
};

// Load cost model from KV, falling back to defaults
export async function loadCostModel(kv) {
  if (!kv) return { ...DEFAULT_MODEL };
  try {
    const stored = await kv.get('cost_model', 'json');
    if (stored) return { ...DEFAULT_MODEL, ...stored };
  } catch {
    // KV read failed, use defaults
  }
  return { ...DEFAULT_MODEL };
}

// Save updated cost model to KV
export async function saveCostModel(kv, model) {
  if (!kv) throw new Error('KV not available');
  await kv.put('cost_model', JSON.stringify(model));
}

// Estimate cost using the provided model (or defaults)
export function estimateCost({ text, lang = 'ar', model = null }) {
  const m = model || DEFAULT_MODEL;
  const charCount = text.length;
  const avgCharsPerPara = (m.charsPerPara || DEFAULT_MODEL.charsPerPara)[lang] || 400;
  const estimatedParagraphs = Math.max(1, Math.ceil(charCount / avgCharsPerPara));
  const costs = m.costs || DEFAULT_MODEL.costs;
  const perParagraph = costs.segmentation + costs.research + costs.translation + costs.assembly;
  const baseCost = estimatedParagraphs * perParagraph;
  const cushion = m.cushion || DEFAULT_MODEL.cushion;
  const totalCost = baseCost * cushion;

  return {
    charCount,
    estimatedParagraphs,
    costPerParagraph: Math.round(perParagraph * 100) / 100,
    baseCost: Math.round(baseCost * 100) / 100,
    cushion,
    totalCost: Math.round(totalCost * 100) / 100,
    breakdown: {
      segmentation: Math.round(estimatedParagraphs * costs.segmentation * 100) / 100,
      research: Math.round(estimatedParagraphs * costs.research * 100) / 100,
      translation: Math.round(estimatedParagraphs * costs.translation * 100) / 100,
      assembly: Math.round(estimatedParagraphs * costs.assembly * 100) / 100,
    },
    modelVersion: m.lastCalibrated || 'defaults',
    jobsSampled: m.jobsSampled || 0,
  };
}

// Estimate cost for a work from the catalog (using character count)
export function estimateWorkCost({ charCount, lang = 'ar', model = null }) {
  return estimateCost({ text: 'x'.repeat(charCount), lang, model });
}

// Calibrate cost model from actual completed job data
// Called by admin after observing real costs
export function calibrateFromJobs(jobs, currentModel) {
  if (!jobs.length) return currentModel;

  // Calculate actual cost per paragraph from completed jobs
  const dataPoints = { segmentation: [], research: [], translation: [], assembly: [] };

  for (const job of jobs) {
    if (!job.phases || !job.paragraphCount) continue;
    const paraCount = job.paragraphCount;

    for (const phase of job.phases) {
      const cost = phase.cost_usd || 0;
      if (phase.phase.startsWith('segment_')) {
        dataPoints.segmentation.push(cost / paraCount);
      } else if (phase.phase === 'research') {
        dataPoints.research.push(cost / paraCount);
      } else if (['render_round', 'critique_round', 'converge'].includes(phase.phase)) {
        dataPoints.translation.push(cost / paraCount);
      } else if (['assemble', 'review'].includes(phase.phase)) {
        dataPoints.assembly.push(cost / paraCount);
      }
    }
  }

  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const newCosts = { ...currentModel.costs };

  // Only update rates that have enough data (3+ data points)
  if (dataPoints.segmentation.length >= 3) newCosts.segmentation = Math.round(avg(dataPoints.segmentation) * 100) / 100;
  if (dataPoints.research.length >= 3) newCosts.research = Math.round(avg(dataPoints.research) * 100) / 100;
  if (dataPoints.translation.length >= 3) newCosts.translation = Math.round(avg(dataPoints.translation) * 100) / 100;
  if (dataPoints.assembly.length >= 3) newCosts.assembly = Math.round(avg(dataPoints.assembly) * 100) / 100;

  return {
    ...currentModel,
    costs: newCosts,
    lastCalibrated: new Date().toISOString(),
    jobsSampled: jobs.length,
    calibrationNote: `Calibrated from ${jobs.length} completed jobs`,
  };
}

export { DEFAULT_MODEL };
