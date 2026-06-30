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

  it('serves the school dining calendar page', async () => {
    const response = await app.request('/schools/princeton');
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('Princeton University Dining Calendar');
    expect(body).toContain('Food trucks');
    expect(body).toContain('/service-windows?date=');
    expect(body).toContain("fetch('/v1/schools/' + encodeURIComponent(school.id) + '/locations')");
    expect(body).toContain("locationId=' + encodeURIComponent(activeLocationId)");
    expect(body).toContain('fetchLocationOptions().finally(fetchMenu)');
  });

  it('returns 404 for unknown school calendar pages', async () => {
    const response = await app.request('/schools/unknown-school');

    expect(response.status).toBe(404);
  });

  it('serves demo summary rows with school ids for calendar links', async () => {
    const response = await app.request('/v1/demo-summary');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.richSchools[0].schoolId).toBe('princeton');
    expect(body.pendingSchools[0]).toEqual({
      schoolId: 'uchicago',
      name: 'University of Chicago',
    });
  });

  it(
    'serves lightweight cafeteria locations when provider supports it',
    async () => {
      const response = await app.request('/v1/schools/yale/locations');
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.school.id).toBe('yale');
      expect(body.result.state).toBe('adapter_ready');
      expect(body.result.locations.length).toBeGreaterThan(1);
      expect(body.result.locations[0]).toHaveProperty('id');
      expect(body.result.locations[0]).toHaveProperty('name');
    },
    15000
  );

  it(
    'fetches live normalized menus for Princeton FoodPro',
    async () => {
      const response = await app.request('/v1/schools/princeton/menus?date=2026-06-29&meal=lunch');
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.school.id).toBe('princeton');
      expect(body.result.state).toBe('adapter_ready');
      expect(body.result.data.locations[0].periods[0].stations[0].items[0].nutrition.length).toBeGreaterThan(0);

      const cachedResponse = await app.request('/v1/schools/princeton/menus?date=2026-06-29&meal=lunch');
      expect(cachedResponse.status).toBe(200);
      expect(cachedResponse.headers.get('X-Campus-Cache')).toBe('HIT');
    },
    15000
  );
});
