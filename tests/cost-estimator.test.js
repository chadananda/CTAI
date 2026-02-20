import { describe, it, expect } from 'vitest';
import { estimateCost, estimateWorkCost, calibrateFromJobs, loadCostModel, DEFAULT_MODEL } from '../src/lib/agents/cost-estimator.js';

describe('estimateCost', () => {
  it('estimates cost for Arabic text using default model', () => {
    const result = estimateCost({ text: 'x'.repeat(800), lang: 'ar' });
    // 800 chars / 400 chars per para = 2 paragraphs
    // Per para: 0.20 + 0.05 + 0.75 + 0.05 = 1.05
    // Base: 2 * 1.05 = 2.10
    // With 1.5 cushion: 3.15
    expect(result.estimatedParagraphs).toBe(2);
    expect(result.costPerParagraph).toBe(1.05);
    expect(result.baseCost).toBe(2.10);
    expect(result.totalCost).toBe(3.15);
    expect(result.charCount).toBe(800);
  });

  it('estimates cost for Persian text with different chars per para', () => {
    const result = estimateCost({ text: 'x'.repeat(900), lang: 'fa' });
    // 900 / 450 = 2 paragraphs
    expect(result.estimatedParagraphs).toBe(2);
    expect(result.totalCost).toBe(3.15);
  });

  it('returns at least 1 paragraph for short text', () => {
    const result = estimateCost({ text: 'hello', lang: 'ar' });
    expect(result.estimatedParagraphs).toBe(1);
    expect(result.totalCost).toBe(1.58); // 1 * 1.05 * 1.5 = 1.575, rounded to 1.58
  });

  it('uses custom model rates when provided', () => {
    const model = {
      ...DEFAULT_MODEL,
      costs: { segmentation: 0.10, research: 0.02, translation: 0.50, assembly: 0.03 },
      cushion: 1.0,
    };
    const result = estimateCost({ text: 'x'.repeat(400), lang: 'ar', model });
    // 1 para * 0.65 * 1.0 = 0.65
    expect(result.costPerParagraph).toBe(0.65);
    expect(result.totalCost).toBe(0.65);
  });

  it('returns breakdown by phase', () => {
    const result = estimateCost({ text: 'x'.repeat(400), lang: 'ar' });
    expect(result.breakdown).toHaveProperty('segmentation');
    expect(result.breakdown).toHaveProperty('research');
    expect(result.breakdown).toHaveProperty('translation');
    expect(result.breakdown).toHaveProperty('assembly');
    expect(result.breakdown.segmentation).toBe(0.20);
    expect(result.breakdown.translation).toBe(0.75);
  });

  it('falls back to defaults when model is null', () => {
    const result = estimateCost({ text: 'x'.repeat(400), lang: 'ar', model: null });
    expect(result.costPerParagraph).toBe(1.05);
  });
});

describe('estimateWorkCost', () => {
  it('estimates from character count alone', () => {
    const result = estimateWorkCost({ charCount: 800, lang: 'ar' });
    expect(result.estimatedParagraphs).toBe(2);
    expect(result.totalCost).toBe(3.15);
  });
});

describe('calibrateFromJobs', () => {
  it('returns current model when no jobs provided', () => {
    const result = calibrateFromJobs([], DEFAULT_MODEL);
    expect(result).toEqual(DEFAULT_MODEL);
  });

  it('only updates rates with 3+ data points', () => {
    const jobs = [
      { paragraphCount: 1, phases: [
        { phase: 'segment_phrases', cost_usd: 0.10 },
        { phase: 'research', cost_usd: 0.03 },
      ]},
      { paragraphCount: 1, phases: [
        { phase: 'segment_sentences', cost_usd: 0.12 },
        { phase: 'research', cost_usd: 0.04 },
      ]},
    ];
    // Only 2 data points for each, should not update
    const result = calibrateFromJobs(jobs, DEFAULT_MODEL);
    expect(result.costs.segmentation).toBe(DEFAULT_MODEL.costs.segmentation);
    expect(result.costs.research).toBe(DEFAULT_MODEL.costs.research);
  });

  it('calibrates segmentation rate from 3+ segment phases', () => {
    const jobs = [
      { paragraphCount: 2, phases: [
        { phase: 'segment_phrases', cost_usd: 0.20 },
        { phase: 'segment_sentences', cost_usd: 0.24 },
        { phase: 'segment_paras', cost_usd: 0.16 },
      ]},
    ];
    // 3 data points: 0.20/2=0.10, 0.24/2=0.12, 0.16/2=0.08 → avg 0.10
    const result = calibrateFromJobs(jobs, DEFAULT_MODEL);
    expect(result.costs.segmentation).toBe(0.10);
    expect(result.jobsSampled).toBe(1);
    expect(result.lastCalibrated).toBeTruthy();
  });

  it('calibrates translation rate from render/critique/converge phases', () => {
    const jobs = [
      { paragraphCount: 1, phases: [
        { phase: 'render_round', cost_usd: 0.30 },
        { phase: 'critique_round', cost_usd: 0.25 },
        { phase: 'converge', cost_usd: 0.20 },
      ]},
    ];
    // 3 data points: 0.30, 0.25, 0.20 → avg 0.25
    const result = calibrateFromJobs(jobs, DEFAULT_MODEL);
    expect(result.costs.translation).toBe(0.25);
  });

  it('skips jobs with no phases', () => {
    const jobs = [
      { paragraphCount: 1, phases: null },
      { paragraphCount: 0, phases: [{ phase: 'segment_phrases', cost_usd: 0.10 }] },
    ];
    const result = calibrateFromJobs(jobs, DEFAULT_MODEL);
    // Should not crash and rates should stay default
    expect(result.costs.segmentation).toBe(DEFAULT_MODEL.costs.segmentation);
  });
});

describe('loadCostModel', () => {
  it('returns defaults when KV is null', async () => {
    const model = await loadCostModel(null);
    expect(model.costs.segmentation).toBe(0.20);
    expect(model.cushion).toBe(1.5);
  });

  it('returns defaults when KV read fails', async () => {
    const fakeKv = { get: () => { throw new Error('KV down'); } };
    const model = await loadCostModel(fakeKv);
    expect(model.costs.segmentation).toBe(0.20);
  });

  it('merges stored model with defaults', async () => {
    const stored = { costs: { segmentation: 0.15 }, cushion: 1.2 };
    const fakeKv = { get: () => stored };
    const model = await loadCostModel(fakeKv);
    expect(model.costs.segmentation).toBe(0.15);
    expect(model.cushion).toBe(1.2);
    // Should still have defaults for non-overridden fields
    expect(model.charsPerPara).toBeDefined();
  });
});
