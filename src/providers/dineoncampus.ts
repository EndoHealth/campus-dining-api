import type { MenuQuery, SchoolCoverage } from '../types/dining.js';
import type { DiningProviderAdapter, ProviderFetchResult } from './types.js';

export class DineOnCampusProvider implements DiningProviderAdapter {
  readonly provider = 'vendor_dineoncampus' as const;

  async fetchMenu(school: SchoolCoverage, _query: MenuQuery): Promise<ProviderFetchResult> {
    return {
      state: 'adapter_pending',
      provider: this.provider,
      sourceUrl: school.sourceUrl,
      reason:
        'DineOnCampus menu JSON paths are known, but direct server fetches from this runtime are blocked by Cloudflare 403. A production adapter needs a stable first-party fetch path; third-party proxy reads are intentionally not used.',
      error: 'cloudflare_403_direct_fetch',
    };
  }
}
