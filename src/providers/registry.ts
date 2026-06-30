import type {
  DiningProviderAdapter,
  ProviderFetchResult,
  ProviderLocationsResult,
} from './types.js';
import { BonAppetitProvider } from './bonappetit.js';
import { DineOnCampusProvider } from './dineoncampus.js';
import { FoodProProvider } from './foodpro.js';
import { MyDiningHubProvider } from './mydininghub.js';
import { NetNutritionProvider } from './netnutrition.js';
import { NutrisliceProvider } from './nutrislice.js';
import { OfficialApiProvider } from './official-api.js';
import { OfficialHtmlProvider } from './official-html.js';
import { SodexoProvider } from './sodexo.js';
import { StudentApiProvider } from './student-api.js';
import type { MenuQuery, ProviderKind, SchoolCoverage } from '../types/dining.js';
import {
  enrichMenuAllergensFromIngredients,
  enrichMenuDietaryTagsFromSourceText,
} from './enrichment.js';

class CatalogOnlyProvider implements DiningProviderAdapter {
  constructor(readonly provider: ProviderKind) {}

  async fetchMenu(school: SchoolCoverage, _query: MenuQuery): Promise<ProviderFetchResult> {
    if (school.supportStatus === 'needs_poc') {
      return {
        state: 'poc_required',
        provider: school.providerKind,
        sourceUrl: school.sourceUrl,
        reason: 'Menu source is cataloged, but a live fetch proof-of-concept is still required.',
      };
    }

    if (school.supportStatus === 'unsupported') {
      return {
        state: 'unsupported',
        provider: school.providerKind,
        sourceUrl: school.sourceUrl,
        reason: 'This school is not currently supported.',
      };
    }

    return {
      state: 'adapter_pending',
      provider: school.providerKind,
      sourceUrl: school.sourceUrl,
      reason: 'Source availability is confirmed; normalized live menu adapter is not implemented yet.',
    };
  }
}

const providers = new Map<ProviderKind, DiningProviderAdapter>();

export function getProviderAdapter(provider: ProviderKind): DiningProviderAdapter {
  const existing = providers.get(provider);
  if (existing) {
    return existing;
  }

  const adapter =
    provider === 'vendor_nutrislice'
      ? new NutrisliceProvider()
      : provider === 'vendor_bonappetit'
        ? new BonAppetitProvider()
      : provider === 'vendor_dineoncampus'
        ? new DineOnCampusProvider()
      : provider === 'vendor_foodpro'
        ? new FoodProProvider()
      : provider === 'vendor_mydininghub'
      ? new MyDiningHubProvider()
      : provider === 'vendor_sodexo'
        ? new SodexoProvider()
      : provider === 'vendor_netnutrition'
        ? new NetNutritionProvider()
      : provider === 'student_api'
        ? new StudentApiProvider()
      : provider === 'official_api'
        ? new OfficialApiProvider()
        : provider === 'official_html'
          ? new OfficialHtmlProvider()
        : new CatalogOnlyProvider(provider);
  const enrichedAdapter = new IngredientAllergenEnrichmentProvider(adapter);
  providers.set(provider, enrichedAdapter);
  return enrichedAdapter;
}

class IngredientAllergenEnrichmentProvider implements DiningProviderAdapter {
  readonly provider: ProviderKind;

  constructor(private readonly adapter: DiningProviderAdapter) {
    this.provider = adapter.provider;
  }

  async fetchMenu(school: SchoolCoverage, query: MenuQuery): Promise<ProviderFetchResult> {
    const result = await this.adapter.fetchMenu(school, query);
    if (result.state !== 'adapter_ready') return result;

    return {
      ...result,
      data: enrichMenuDietaryTagsFromSourceText(enrichMenuAllergensFromIngredients(result.data)),
    };
  }

  async fetchLocations(school: SchoolCoverage): Promise<ProviderLocationsResult> {
    if (!this.adapter.fetchLocations) {
      return {
        state: 'poc_required',
        provider: school.providerKind,
        sourceUrl: school.sourceUrl,
        reason: 'This provider does not expose a lightweight cafeteria location list yet.',
      };
    }

    return this.adapter.fetchLocations(school);
  }
}
