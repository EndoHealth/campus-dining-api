import type { MenuQuery, NormalizedMenu, ProviderKind, SchoolCoverage } from '../types/dining.js';

export type ProviderLocationSummary = {
  id: string;
  name: string;
  sourceLocationId?: string;
  address?: string;
  timezone?: string;
};

export type ProviderFetchResult =
  | {
      state: 'adapter_ready';
      provider: ProviderKind;
      fetchedAt: string;
      sourceUrl: string;
      data: NormalizedMenu;
    }
  | {
      state: 'adapter_pending' | 'poc_required' | 'unsupported' | 'provider_error';
      provider: ProviderKind;
      sourceUrl: string;
      reason: string;
      error?: string;
    };

export type ProviderLocationsResult =
  | {
      state: 'adapter_ready';
      provider: ProviderKind;
      fetchedAt: string;
      sourceUrl: string;
      locations: ProviderLocationSummary[];
    }
  | {
      state: 'adapter_pending' | 'poc_required' | 'unsupported' | 'provider_error';
      provider: ProviderKind;
      sourceUrl: string;
      reason: string;
      error?: string;
    };

export interface DiningProviderAdapter {
  readonly provider: ProviderKind;
  fetchMenu(school: SchoolCoverage, query: MenuQuery): Promise<ProviderFetchResult>;
  fetchLocations?(school: SchoolCoverage): Promise<ProviderLocationsResult>;
}
