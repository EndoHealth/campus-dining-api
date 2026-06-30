import { describe, expect, it } from 'vitest';
import { getFoodTruckAdaptersForSchool } from '../src/food-trucks/adapters.js';

describe('food truck adapters', () => {
  it('fetches UC Davis dated food truck windows', async () => {
    const adapter = getFoodTruckAdaptersForSchool('uc-davis')[0];
    const result = await adapter.fetch('2026-06-30', 'uc-davis');

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    expect(result.serviceWindows.length).toBeGreaterThan(0);
    expect(result.serviceWindows[0].vendor?.name).toBe("Shah's Halal");
    expect(result.serviceWindows[0].startTime).toBe('10:00');
    expect(result.serviceWindows[0].location.type).toBe('food_truck');
  }, 15000);

  it('fetches MIT recurring Wednesday food truck windows', async () => {
    const adapter = getFoodTruckAdaptersForSchool('mit')[0];
    const result = await adapter.fetch('2026-07-01', 'mit');

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    expect(result.serviceWindows.map((window) => window.vendor?.name)).toEqual([
      'Jamaica Mi Hungry',
      'Tandoor and Curry',
      'Zaaki',
    ]);
  }, 15000);

  it('fetches Boston.gov explicit campus food truck windows for Northeastern', async () => {
    const adapter = getFoodTruckAdaptersForSchool('northeastern')[0];
    const result = await adapter.fetch('2026-06-30', 'northeastern');

    expect(result.state).toBe('adapter_ready');
    if (result.state !== 'adapter_ready') return;

    expect(result.serviceWindows).toHaveLength(1);
    expect(result.serviceWindows[0].vendor?.name).toBe('Matilda');
    expect(result.serviceWindows[0].location.name).toContain('Northeastern University');
  }, 15000);
});
