import { describe, expect, it } from 'vitest';
import { confidenceTone, fmtHours, fmtMs, niceTicks, parseReason, providerLabel, stepLabel } from './format';

describe('niceTicks', () => {
  it('rounds up to a clean maximum starting at zero', () => {
    const t = niceTicks(11, 4, true);
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(11);
  });
  it('uses whole numbers for counts', () => {
    expect(niceTicks(3, 4, true).every(Number.isInteger)).toBe(true);
  });
  it('handles empty data', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
  });
  it('supports fractional axes', () => {
    expect(niceTicks(0.9, 4)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
});

describe('formatters', () => {
  it('formats durations', () => {
    expect(fmtMs(412)).toBe('412 ms');
    expect(fmtMs(1530)).toBe('1.5 s');
    expect(fmtMs(null)).toBe('');
  });
  it('formats time saved', () => {
    expect(fmtHours(0)).toBe('0 min');
    expect(fmtHours(0.35)).toBe('21 min');
    expect(fmtHours(2.04)).toBe('2.0 h');
  });
  it('labels known and unknown steps', () => {
    expect(stepLabel('classify_email')).toBe('Classify email');
    expect(stepLabel('send_sms')).toBe('Send sms');
  });
});

describe('approval reasons', () => {
  it('separates the rule from the sentence', () => {
    expect(parseReason('Invoice needs manager approval [invoice.total=12600.0 > 1000]')).toEqual({
      text: 'Invoice needs manager approval',
      rule: 'invoice.total=12600.0 > 1000',
    });
    expect(parseReason('Plain reason')).toEqual({ text: 'Plain reason', rule: null });
    expect(parseReason(null)).toEqual({ text: '', rule: null });
  });
});

describe('AI provenance', () => {
  it('names the provider in plain words', () => {
    expect(providerLabel('heuristic')).toBe('Built-in rules engine');
    expect(providerLabel('anthropic:claude-sonnet-5-5')).toBe('Claude (claude-sonnet-5-5)');
  });
  it('maps confidence to a tone', () => {
    expect(confidenceTone(0.95)).toBe('ok');
    expect(confidenceTone(0.7)).toBe('warn');
    expect(confidenceTone(0.3)).toBe('bad');
  });
});
