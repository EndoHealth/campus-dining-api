import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('routes', () => {
  it('serves health', async () => {
    const response = await app.request('/health');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
  });

  it('searches schools by alias', async () => {
    const response = await app.request('/v1/schools?query=stanford');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.schools).toHaveLength(1);
    expect(body.schools[0].id).toBe('stanford');
  });

  it(
    'fetches live normalized menus for Princeton FoodPro',
    async () => {
      const response = await app.request('/v1/schools/princeton/menus?date=2026-06-29&meal=lunch');
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.school.id).toBe('princeton');
      expect(body.result.state).toBe('adapter_ready');
      expect(body.result.data.locations[0].periods[0].stations[0].items[0].nutrition.length).toBeGreaterThan(0);
    },
    15000
  );
});
