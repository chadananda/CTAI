import { describe, it, expect } from 'vitest';
import { STEPS, STATUS_MAP } from '../src/lib/agents/pipeline.js';

describe('STEPS', () => {
  it('defines 10 pipeline steps', () => {
    expect(STEPS).toHaveLength(10);
  });

  it('starts with segmentation phases', () => {
    expect(STEPS[0]).toBe('segment_phrases');
    expect(STEPS[1]).toBe('segment_sentences');
    expect(STEPS[2]).toBe('segment_paras');
    expect(STEPS[3]).toBe('segment_join');
  });

  it('follows with research', () => {
    expect(STEPS[4]).toBe('research');
  });

  it('has translation phases in correct order', () => {
    expect(STEPS[5]).toBe('render_round');
    expect(STEPS[6]).toBe('critique_round');
    expect(STEPS[7]).toBe('converge');
  });

  it('ends with assembly and review', () => {
    expect(STEPS[8]).toBe('assemble');
    expect(STEPS[9]).toBe('review');
  });

  it('has no duplicate steps', () => {
    const unique = new Set(STEPS);
    expect(unique.size).toBe(STEPS.length);
  });
});

describe('STATUS_MAP', () => {
  it('maps all segmentation steps to segmenting', () => {
    expect(STATUS_MAP.segment_phrases).toBe('segmenting');
    expect(STATUS_MAP.segment_sentences).toBe('segmenting');
    expect(STATUS_MAP.segment_paras).toBe('segmenting');
    expect(STATUS_MAP.segment_join).toBe('segmenting');
  });

  it('maps research to researching', () => {
    expect(STATUS_MAP.research).toBe('researching');
  });

  it('maps render_round to translating', () => {
    expect(STATUS_MAP.render_round).toBe('translating');
  });

  it('maps critique_round to deliberating', () => {
    expect(STATUS_MAP.critique_round).toBe('deliberating');
  });

  it('maps converge and assemble to assembling', () => {
    expect(STATUS_MAP.converge).toBe('assembling');
    expect(STATUS_MAP.assemble).toBe('assembling');
  });

  it('maps review to reviewing', () => {
    expect(STATUS_MAP.review).toBe('reviewing');
  });

  it('covers all STEPS', () => {
    for (const step of STEPS) {
      expect(STATUS_MAP[step]).toBeDefined();
    }
  });
});
