import { describe, expect, it } from 'vitest';
import { buildCoverageSummary } from '../src/data/coverage.js';
import { TOP_50_SCHOOLS } from '../src/data/top50-schools.js';

describe('top 50 coverage catalog', () => {
  it('contains exactly 50 ranked schools', () => {
    expect(TOP_50_SCHOOLS).toHaveLength(50);
    expect(new Set(TOP_50_SCHOOLS.map((school) => school.id)).size).toBe(50);
  });

  it('tracks confirmed and POC-required schools explicitly', () => {
    const summary = buildCoverageSummary('2026-06-29T00:00:00.000Z');

    expect(summary.totalSchools).toBe(50);
    expect(summary.confirmedSchools).toBe(50);
    expect(summary.needsPocSchools).toBe(0);
    expect(summary.statusCounts.unsupported).toBe(0);
    expect(summary.adapterReadySchools).toBe(47);
    expect(summary.integrationCounts.adapter_ready).toBe(47);
  });
});
