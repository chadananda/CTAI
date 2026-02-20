import { describe, it, expect } from 'vitest';
import { parseJSON, DEFAULT_MODEL, PRICING } from '../src/lib/agents/provider.js';

describe('parseJSON', () => {
  it('parses clean JSON', () => {
    const result = parseJSON('{"key": "value"}');
    expect(result).toEqual({ key: 'value' });
  });

  it('strips markdown json fences', () => {
    const result = parseJSON('```json\n{"key": "value"}\n```');
    expect(result).toEqual({ key: 'value' });
  });

  it('strips plain markdown fences', () => {
    const result = parseJSON('```\n{"items": [1, 2]}\n```');
    expect(result).toEqual({ items: [1, 2] });
  });

  it('extracts JSON object from surrounding text', () => {
    const result = parseJSON('Here is the result:\n{"data": true}\nEnd of response.');
    expect(result).toEqual({ data: true });
  });

  it('extracts JSON array from surrounding text', () => {
    const result = parseJSON('Results:\n[1, 2, 3]\nDone.');
    expect(result).toEqual([1, 2, 3]);
  });

  it('handles nested JSON', () => {
    const input = '{"outer": {"inner": [1, 2, {"deep": true}]}}';
    const result = parseJSON(input);
    expect(result.outer.inner[2].deep).toBe(true);
  });

  it('throws on completely invalid input', () => {
    expect(() => parseJSON('no json here at all')).toThrow('Failed to parse JSON');
  });

  it('handles whitespace around fences', () => {
    const result = parseJSON('  ```json  \n  {"a": 1}  \n  ```  ');
    expect(result).toEqual({ a: 1 });
  });
});

describe('PRICING', () => {
  it('has Sonnet pricing', () => {
    expect(PRICING['claude-sonnet-4-5-20250929']).toBeDefined();
    expect(PRICING['claude-sonnet-4-5-20250929'].input).toBe(3.00);
    expect(PRICING['claude-sonnet-4-5-20250929'].output).toBe(15.00);
  });

  it('has Haiku pricing', () => {
    expect(PRICING['claude-haiku-4-5-20251001']).toBeDefined();
    expect(PRICING['claude-haiku-4-5-20251001'].input).toBe(0.80);
  });
});

describe('DEFAULT_MODEL', () => {
  it('uses Sonnet as default', () => {
    expect(DEFAULT_MODEL).toBe('claude-sonnet-4-5-20250929');
  });
});
