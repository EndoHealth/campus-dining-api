export type SupportStatus = 'confirmed' | 'needs_poc' | 'unsupported';

export type IntegrationStatus =
  | 'cataloged'
  | 'adapter_pending'
  | 'adapter_ready'
  | 'poc_required';

export type ProviderKind =
  | 'official_api'
  | 'official_html'
  | 'vendor_bonappetit'
  | 'vendor_campusdish'
  | 'vendor_dineoncampus'
  | 'vendor_foodpro'
  | 'vendor_mydininghub'
  | 'vendor_netnutrition'
  | 'vendor_nutrislice'
  | 'vendor_sodexo'
  | 'student_api';

export type Confidence = 'high' | 'medium' | 'low';

export type SchoolCoverage = {
  id: string;
  rank: number;
  name: string;
  aliases: string[];
  city: string;
  state: string;
  providerKind: ProviderKind;
  supportStatus: SupportStatus;
  integrationStatus: IntegrationStatus;
  confidence: Confidence;
  sourceUrl: string;
  notes: string;
};

export type CoverageSummary = {
  totalSchools: number;
  statusCounts: Record<SupportStatus, number>;
  integrationCounts: Record<IntegrationStatus, number>;
  providerCounts: Record<ProviderKind, number>;
  confirmedSchools: number;
  needsPocSchools: number;
  adapterReadySchools: number;
  generatedAt: string;
};

export type MenuQuery = {
  date?: string;
  meal?: string;
  locationId?: string;
};

export type MenuFetchState =
  | 'adapter_pending'
  | 'poc_required'
  | 'unsupported'
  | 'provider_error';

export type MenuPrice = {
  amount?: number;
  currency?: 'USD';
  displayText?: string;
};

export type NutritionUnit =
  | 'kcal'
  | 'g'
  | 'mg'
  | 'mcg'
  | 'iu'
  | 'percent_daily_value'
  | 'count'
  | 'other';

export type NutritionKey =
  | 'calories'
  | 'serving_size'
  | 'servings_per_container'
  | 'total_fat'
  | 'saturated_fat'
  | 'trans_fat'
  | 'cholesterol'
  | 'sodium'
  | 'total_carbohydrate'
  | 'dietary_fiber'
  | 'total_sugars'
  | 'added_sugars'
  | 'protein'
  | 'vitamin_d'
  | 'calcium'
  | 'iron'
  | 'potassium'
  | 'caffeine'
  | 'other';

export type NutritionFact = {
  key: NutritionKey;
  label: string;
  amount?: number;
  unit?: NutritionUnit;
  dailyValuePercent?: number;
  sourceText?: string;
};

export type AllergenKey =
  | 'milk'
  | 'egg'
  | 'fish'
  | 'crustacean_shellfish'
  | 'tree_nut'
  | 'peanut'
  | 'wheat'
  | 'soy'
  | 'sesame'
  | 'gluten'
  | 'other';

export type AllergenStatus = 'contains' | 'may_contain' | 'made_without' | 'unknown';

export type AllergenFact = {
  key: AllergenKey;
  label: string;
  status: AllergenStatus;
  sourceText?: string;
};

export type DietaryTag =
  | 'vegan'
  | 'vegetarian'
  | 'halal'
  | 'kosher'
  | 'gluten_free'
  | 'made_without_gluten'
  | 'dairy_free'
  | 'nut_free'
  | 'low_sodium'
  | 'low_carbon'
  | 'locally_sourced'
  | 'organic'
  | 'plant_forward'
  | 'spicy'
  | 'other';

export type IngredientFact = {
  name: string;
  normalizedName?: string;
  containsAllergenKeys?: AllergenKey[];
  sourceText?: string;
};

export type MenuItemAvailability = {
  status: 'available' | 'planned' | 'sold_out' | 'unavailable' | 'unknown';
  startTime?: string;
  endTime?: string;
  sourceText?: string;
};

export type NormalizedMenuItem = {
  id: string;
  sourceItemId?: string;
  name: string;
  normalizedName?: string;
  description?: string;
  category?: string;
  cuisine?: string;
  stationId?: string;
  stationName?: string;
  servingSizeText?: string;
  portionText?: string;
  price?: MenuPrice;
  availability: MenuItemAvailability;
  dietaryTags: DietaryTag[];
  allergens: AllergenFact[];
  ingredients: IngredientFact[];
  ingredientStatement?: string;
  nutrition: NutritionFact[];
  imageUrl?: string;
  itemUrl?: string;
  sourceUrl: string;
  sourceUpdatedAt?: string;
  raw?: unknown;
};

export type NormalizedMenu = {
  schoolId: string;
  providerKind: ProviderKind;
  sourceUrl: string;
  fetchedAt: string;
  sourceUpdatedAt?: string;
  freshnessMinutes?: number;
  locations: Array<{
    id: string;
    name: string;
    sourceLocationId?: string;
    address?: string;
    timezone?: string;
    date: string;
    periods: Array<{
      id: string;
      name: string;
      sourcePeriodId?: string;
      startTime?: string;
      endTime?: string;
      stations: Array<{
        id: string;
        name: string;
        sourceStationId?: string;
        items: NormalizedMenuItem[];
      }>;
    }>;
  }>;
};
