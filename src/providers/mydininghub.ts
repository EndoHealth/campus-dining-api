import type { DiningProviderAdapter, ProviderFetchResult } from './types.js';
import { allergenKeysInIngredientText } from './allergen-text.js';
import type {
  AllergenFact,
  AllergenKey,
  DietaryTag,
  IngredientFact,
  MenuPrice,
  MenuQuery,
  NormalizedMenu,
  NormalizedMenuItem,
  NutritionFact,
  NutritionKey,
  NutritionUnit,
  SchoolCoverage,
} from '../types/dining.js';

type MyDiningHubSite = {
  origin: string;
  storeViewCode: string;
  campusUrlKey: string;
};

type GraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

type StoreOption = {
  is_active?: string;
  label?: string;
  title?: string;
  value?: string;
};

type StoreConfigData = {
  Commerce_storeConfig?: {
    allergens_intolerances?: StoreOption[];
    menu_preferences?: StoreOption[];
    nutrition_information_attributes?: StoreOption[];
  };
};

type StoreMetadata = {
  allergensByValue: Map<string, StoreOption>;
  menuPreferencesByValue: Map<string, StoreOption>;
  nutritionLabelsByValue: Map<string, string>;
};

type MyDiningHubLocationSummary = {
  commerceAttributes?: {
    uid?: string;
    url_key?: string;
    address_line_1?: string;
    address_line_2?: string;
    city_locality?: string;
    state_province?: string;
    postal_code?: string;
    timezone?: string;
  };
  aemAttributes?: {
    name?: string;
  };
};

type LocationsData = {
  getLocations?: MyDiningHubLocationSummary[];
};

type MyDiningHubStation = {
  id?: string | number;
  name?: string;
  description?: string;
  position?: string | number;
  meal_period_overrides?: Array<{
    meal_period_id?: string | number;
    name?: string;
    description?: string;
  }>;
};

type MyDiningHubMealPeriod = {
  id?: string | number;
  name?: string;
  position?: string | number;
};

type MyDiningHubLocationDetail = {
  commerceAttributes?: {
    uid?: string;
    url_key?: string;
    address_line_1?: string;
    address_line_2?: string;
    city_locality?: string;
    state_province?: string;
    postal_code?: string;
    timezone?: string;
    display_nutrition_information?: string | number | boolean;
    display_ingredients?: string | number | boolean;
    hasActiveMenus?: string | number | boolean;
    maxMenusDate?: string;
    children?: MyDiningHubStation[];
    meal_periods?: MyDiningHubMealPeriod[];
  };
  aemAttributes?: {
    name?: string;
    description?: {
      plaintext?: string;
    };
  };
};

type LocationData = {
  getLocation?: MyDiningHubLocationDetail;
};

type ProductAttribute = {
  name?: string;
  value?: unknown;
};

type ProductImage = {
  label?: string;
  roles?: string[];
  url?: string;
};

type ProductPrice = {
  final?: {
    amount?: {
      currency?: string;
      value?: string | number;
    };
  };
};

type MyDiningHubProduct = {
  id?: string | number;
  name?: string;
  sku?: string;
  images?: ProductImage[];
  attributes?: ProductAttribute[];
  price?: ProductPrice;
  options?: Array<{
    title?: string;
    values?: Array<{
      id?: string;
      title?: string;
      product?: MyDiningHubProduct;
    }>;
  }>;
};

type StationSkuMap = {
  simple?: string[];
  configurable?: Array<{
    sku?: string;
    variants?: string[];
  }>;
};

type LocationRecipesData = {
  getLocationRecipes?: {
    locationRecipesMap?: {
      skus?: string[];
      stationSkuMap?: Array<{
        id?: string | number;
        skus?: string[];
      }>;
      dateSkuMap?: Array<{
        date?: string;
        stations?: Array<{
          id?: string | number;
          skus?: StationSkuMap;
        }>;
      }>;
    };
    products?: {
      items?: MyDiningHubProduct[];
    };
  };
};

type LocationContext = {
  summary: MyDiningHubLocationSummary;
  detail: MyDiningHubLocationDetail;
  urlKey: string;
  name: string;
  address: string | undefined;
  timezone: string | undefined;
};

const GRAPHQL_ENDPOINT =
  'https://api.elevate-dxp.com/api/mesh/c087f756-cc72-4649-a36f-3a41b700c519/graphql';
const CUSTOMER_GROUP = 'b6589fc6ab0dc82cf12099d1c2d40ab994e8410c';
const REQUEST_TIMEOUT_MS = 20000;
const LOCATION_DETAIL_CONCURRENCY = 4;
const RECIPE_CONCURRENCY = 4;

const MYDININGHUB_SITES: Record<string, MyDiningHubSite> = {
  uva: {
    origin: 'https://virginia.mydininghub.com',
    storeViewCode: 'ch_virginia_en',
    campusUrlKey: 'campus',
  },
  'uc-irvine': {
    origin: 'https://uci.mydininghub.com',
    storeViewCode: 'ch_uci_en',
    campusUrlKey: 'campus',
  },
};

const STORE_CONFIG_QUERY = `
  query StoreConfig {
    Commerce_storeConfig {
      allergens_intolerances {
        is_active
        label
        value
      }
      menu_preferences {
        is_active
        label
        title
        value
      }
      nutrition_information_attributes {
        label
        value
      }
    }
  }
`;

const LOCATIONS_QUERY = `
  query getLocations($campus_url_key: String!) {
    getLocations(campusUrlKey: $campus_url_key) {
      commerceAttributes {
        uid
        url_key
        address_line_1
        address_line_2
        city_locality
        state_province
        postal_code
        timezone
      }
      aemAttributes {
        name
      }
    }
  }
`;

const LOCATION_QUERY = `
  query getLocation($campus_url_key: String!, $location_url_key: String!) {
    getLocation(campusUrlKey: $campus_url_key, locationUrlKey: $location_url_key) {
      commerceAttributes {
        uid
        url_key
        address_line_1
        address_line_2
        city_locality
        state_province
        postal_code
        timezone
        display_nutrition_information
        display_ingredients
        hasActiveMenus
        maxMenusDate
        children {
          id
          name
          description
          position
          meal_period_overrides {
            meal_period_id
            name
            description
          }
        }
        meal_periods {
          id
          name
          position
        }
      }
      aemAttributes {
        name
        description {
          plaintext
        }
      }
    }
  }
`;

const LOCATION_RECIPES_QUERY = `
  query getLocationRecipes(
    $campusUrlKey: String!
    $locationUrlKey: String!
    $date: String!
    $mealPeriod: Int
    $viewType: Commerce_MenuViewType!
  ) {
    getLocationRecipes(
      campusUrlKey: $campusUrlKey
      locationUrlKey: $locationUrlKey
      date: $date
      mealPeriod: $mealPeriod
      viewType: $viewType
    ) {
      locationRecipesMap {
        skus
        stationSkuMap {
          id
          skus
        }
        dateSkuMap {
          date
          stations {
            id
            skus {
              simple
              configurable {
                sku
                variants
              }
            }
          }
        }
      }
      products {
        items {
          id
          name
          sku
          images {
            label
            roles
            url
          }
          attributes {
            name
            value
          }
          ... on Catalog_SimpleProductView {
            price {
              final {
                amount {
                  currency
                  value
                }
              }
            }
          }
          ... on Catalog_ComplexProductView {
            options {
              title
              values {
                id
                title
                ... on Catalog_ProductViewOptionValueProduct {
                  product {
                    name
                    sku
                    attributes {
                      name
                      value
                    }
                    price {
                      final {
                        amount {
                          value
                          currency
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const NUTRITION_MAPPINGS: Array<{
  attribute: string;
  key: NutritionKey;
  label: string;
  unit: NutritionUnit;
}> = [
  { attribute: 'calories', key: 'calories', label: 'Calories', unit: 'kcal' },
  { attribute: 'total_fat', key: 'total_fat', label: 'Total Fat', unit: 'g' },
  { attribute: 'saturated_fat', key: 'saturated_fat', label: 'Saturated Fat', unit: 'g' },
  { attribute: 'trans_fat', key: 'trans_fat', label: 'Trans Fat', unit: 'g' },
  { attribute: 'cholesterol', key: 'cholesterol', label: 'Cholesterol', unit: 'mg' },
  { attribute: 'sodium', key: 'sodium', label: 'Sodium', unit: 'mg' },
  {
    attribute: 'total_carbohydrates',
    key: 'total_carbohydrate',
    label: 'Total Carbohydrate',
    unit: 'g',
  },
  { attribute: 'dietary_fiber', key: 'dietary_fiber', label: 'Dietary Fiber', unit: 'g' },
  { attribute: 'sugars', key: 'total_sugars', label: 'Total Sugars', unit: 'g' },
  { attribute: 'includes_added_sugars', key: 'added_sugars', label: 'Added Sugars', unit: 'g' },
  { attribute: 'protein', key: 'protein', label: 'Protein', unit: 'g' },
  { attribute: 'calcium', key: 'calcium', label: 'Calcium', unit: 'mg' },
  { attribute: 'iron', key: 'iron', label: 'Iron', unit: 'mg' },
  { attribute: 'potassium', key: 'potassium', label: 'Potassium', unit: 'mg' },
  { attribute: 'vitamin_a', key: 'other', label: 'Vitamin A', unit: 'other' },
  { attribute: 'vitamin_c', key: 'other', label: 'Vitamin C', unit: 'other' },
];

export class MyDiningHubProvider implements DiningProviderAdapter {
  readonly provider = 'vendor_mydininghub' as const;

  async fetchMenu(school: SchoolCoverage, query: MenuQuery): Promise<ProviderFetchResult> {
    const site = MYDININGHUB_SITES[school.id];
    if (!site) {
      return {
        state: 'adapter_pending',
        provider: this.provider,
        sourceUrl: school.sourceUrl,
        reason: 'MyDiningHub source is cataloged, but this school-specific site config is missing.',
      };
    }

    const fetchedAt = new Date().toISOString();
    const date = query.date ?? fetchedAt.slice(0, 10);

    try {
      const [metadata, locationSummaries] = await Promise.all([
        fetchStoreMetadata(site),
        fetchLocations(site, query.locationId),
      ]);
      const locations = await fetchLocationContexts(site, locationSummaries);
      const locationMenus = await mapWithConcurrency(
        locations.filter((location) => isActiveMenuLocation(location.detail)),
        LOCATION_DETAIL_CONCURRENCY,
        (location) => fetchLocationMenu(school, site, location, metadata, date, query.meal)
      );

      const menu: NormalizedMenu = {
        schoolId: school.id,
        providerKind: this.provider,
        sourceUrl: school.sourceUrl,
        fetchedAt,
        freshnessMinutes: 0,
        locations: locationMenus.filter((location) => location.periods.length > 0),
      };

      return {
        state: 'adapter_ready',
        provider: this.provider,
        fetchedAt,
        sourceUrl: school.sourceUrl,
        data: menu,
      };
    } catch (error) {
      return {
        state: 'provider_error',
        provider: this.provider,
        sourceUrl: school.sourceUrl,
        reason: 'MyDiningHub GraphQL menu fetch failed.',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

async function fetchStoreMetadata(site: MyDiningHubSite): Promise<StoreMetadata> {
  const data = await fetchGraphql<StoreConfigData>(site, {
    operationName: 'StoreConfig',
    query: STORE_CONFIG_QUERY,
  });
  const config = data.Commerce_storeConfig;

  return {
    allergensByValue: buildOptionMap(config?.allergens_intolerances),
    menuPreferencesByValue: buildOptionMap(config?.menu_preferences),
    nutritionLabelsByValue: new Map(
      (config?.nutrition_information_attributes ?? [])
        .filter((option) => option.value && option.label)
        .map((option) => [String(option.value), String(option.label)])
    ),
  };
}

async function fetchLocations(site: MyDiningHubSite, locationId?: string) {
  const data = await fetchGraphql<LocationsData>(site, {
    operationName: 'getLocations',
    query: LOCATIONS_QUERY,
    variables: {
      campus_url_key: site.campusUrlKey,
    },
  });

  const summaries = (data.getLocations ?? []).filter(
    (location) => location.commerceAttributes?.url_key
  );
  if (!locationId) return summaries;

  const needle = locationId.toLowerCase();
  return summaries.filter((location) => {
    const urlKey = location.commerceAttributes?.url_key?.toLowerCase() ?? '';
    const uid = String(location.commerceAttributes?.uid ?? '').toLowerCase();
    const name = location.aemAttributes?.name?.toLowerCase() ?? '';
    return urlKey === needle || uid === needle || urlKey.includes(needle) || slugify(name).includes(needle);
  });
}

async function fetchLocationContexts(
  site: MyDiningHubSite,
  summaries: MyDiningHubLocationSummary[]
): Promise<LocationContext[]> {
  const contexts = await mapWithConcurrency<MyDiningHubLocationSummary, LocationContext | undefined>(
    summaries,
    LOCATION_DETAIL_CONCURRENCY,
    async (summary) => {
    const urlKey = summary.commerceAttributes?.url_key;
    if (!urlKey) return undefined;

    const data = await fetchGraphql<LocationData>(site, {
      operationName: 'getLocation',
      query: LOCATION_QUERY,
      variables: {
        campus_url_key: site.campusUrlKey,
        location_url_key: urlKey,
      },
      refererPath: `/en/location/${urlKey}`,
    });
    const detail = data.getLocation;
    if (!detail) return undefined;

    const commerce = detail.commerceAttributes ?? summary.commerceAttributes;
    const name = normalizeWhitespace(detail.aemAttributes?.name) ?? normalizeWhitespace(summary.aemAttributes?.name);
    if (!commerce?.url_key || !name) return undefined;

    return {
      summary,
      detail,
      urlKey: commerce.url_key,
      name,
      address: formatAddress(commerce),
      timezone: normalizeWhitespace(commerce.timezone),
    } satisfies LocationContext;
    }
  );

  return contexts.filter((context): context is LocationContext => Boolean(context));
}

async function fetchLocationMenu(
  school: SchoolCoverage,
  site: MyDiningHubSite,
  location: LocationContext,
  metadata: StoreMetadata,
  date: string,
  meal?: string
): Promise<NormalizedMenu['locations'][number]> {
  const mealNeedle = meal?.toLowerCase();
  const mealPeriods = [...(location.detail.commerceAttributes?.meal_periods ?? [])]
    .filter((period) => period.id !== undefined && period.name)
    .filter((period) => !mealNeedle || period.name?.toLowerCase().includes(mealNeedle))
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));

  const periods = await mapWithConcurrency(mealPeriods, RECIPE_CONCURRENCY, async (period) => {
    try {
      const recipes = await fetchLocationRecipes(site, location.urlKey, date, Number(period.id));
      return normalizePeriod(school, site, location, metadata, date, period, recipes);
    } catch {
      return {
        id: `${location.urlKey}-${String(period.id)}`,
        name: period.name ?? 'Menu',
        sourcePeriodId: String(period.id),
        stations: [],
      };
    }
  });

  return {
    id: location.urlKey,
    name: location.name,
    sourceLocationId: location.detail.commerceAttributes?.uid ?? location.urlKey,
    address: location.address,
    timezone: location.timezone,
    date,
    periods: periods.filter((period) => period.stations.some((station) => station.items.length > 0)),
  };
}

async function fetchLocationRecipes(
  site: MyDiningHubSite,
  locationUrlKey: string,
  date: string,
  mealPeriod: number
) {
  const data = await fetchGraphql<LocationRecipesData>(site, {
    operationName: 'getLocationRecipes',
    query: LOCATION_RECIPES_QUERY,
    variables: {
      campusUrlKey: site.campusUrlKey,
      locationUrlKey,
      date,
      mealPeriod,
      viewType: 'DAILY',
    },
    refererPath: `/en/location/${locationUrlKey}`,
  });

  return data.getLocationRecipes;
}

function normalizePeriod(
  school: SchoolCoverage,
  site: MyDiningHubSite,
  location: LocationContext,
  metadata: StoreMetadata,
  date: string,
  period: MyDiningHubMealPeriod,
  recipes: LocationRecipesData['getLocationRecipes']
): NormalizedMenu['locations'][number]['periods'][number] {
  const products = recipes?.products?.items ?? [];
  const productBySku = indexProductsBySku(products);
  const stationById = new Map(
    (location.detail.commerceAttributes?.children ?? [])
      .filter((station) => station.id !== undefined)
      .map((station) => [String(station.id), station] as const)
  );
  const dateSkuMap = recipes?.locationRecipesMap?.dateSkuMap?.find((entry) => entry.date === date)
    ?? recipes?.locationRecipesMap?.dateSkuMap?.[0];
  const sourceStations = dateSkuMap?.stations ?? [];

  if (sourceStations.length === 0) {
    const items = products
      .map((product, index) =>
        normalizeProduct(school, site, location, metadata, date, period, 'menu', 'Menu', product, index)
      )
      .filter((item): item is NormalizedMenuItem => Boolean(item));

    return {
      id: `${location.urlKey}-${String(period.id)}`,
      name: period.name ?? 'Menu',
      sourcePeriodId: String(period.id),
      stations: items.length
        ? [
            {
              id: `${location.urlKey}-${String(period.id)}-menu`,
              name: 'Menu',
              sourceStationId: 'menu',
              items,
            },
          ]
        : [],
    };
  }

  const stations = sourceStations
    .map((stationEntry) => {
      const sourceStationId = String(stationEntry.id ?? 'menu');
      const stationMeta = stationById.get(sourceStationId);
      const stationName = normalizeStationName(stationMeta, period) ?? 'Menu';
      const stationId = `${location.urlKey}-${String(period.id)}-${slugify(sourceStationId) || 'menu'}`;
      const stationProducts = collectStationProducts(stationEntry.skus, productBySku);
      const items = stationProducts
        .map((product, index) =>
          normalizeProduct(
            school,
            site,
            location,
            metadata,
            date,
            period,
            stationId,
            stationName,
            product,
            index
          )
        )
        .filter((item): item is NormalizedMenuItem => Boolean(item));

      return {
        id: stationId,
        name: stationName,
        sourceStationId,
        items,
      };
    })
    .filter((station) => station.items.length > 0);

  return {
    id: `${location.urlKey}-${String(period.id)}`,
    name: period.name ?? 'Menu',
    sourcePeriodId: String(period.id),
    stations,
  };
}

function indexProductsBySku(products: MyDiningHubProduct[]) {
  const productBySku = new Map<string, MyDiningHubProduct>();

  const addProduct = (product?: MyDiningHubProduct) => {
    const sku = normalizeWhitespace(product?.sku);
    if (!sku || !product) return;

    const existing = productBySku.get(sku);
    if (!existing || scoreProductDetail(product) > scoreProductDetail(existing)) {
      productBySku.set(sku, product);
    }

    for (const option of product.options ?? []) {
      for (const value of option.values ?? []) {
        addProduct(value.product);
      }
    }
  };

  for (const product of products) {
    addProduct(product);
  }

  return productBySku;
}

function scoreProductDetail(product: MyDiningHubProduct) {
  return (product.attributes?.length ?? 0) + (product.options?.length ?? 0);
}

function normalizeProduct(
  school: SchoolCoverage,
  site: MyDiningHubSite,
  location: LocationContext,
  metadata: StoreMetadata,
  date: string,
  period: MyDiningHubMealPeriod,
  stationId: string,
  stationName: string,
  product: MyDiningHubProduct | undefined,
  index: number
): NormalizedMenuItem | undefined {
  if (!product) return undefined;

  const attributes = new Map(
    (product.attributes ?? [])
      .filter((attribute) => attribute.name)
      .map((attribute) => [String(attribute.name), attribute.value] as const)
  );
  const sku = normalizeWhitespace(product.sku);
  const name =
    readText(attributes.get('marketing_name')) ?? normalizeWhitespace(product.name) ?? readText(attributes.get('name'));
  if (!name) return undefined;

  const sourceUrl = `${site.origin}/en/location/${location.urlKey}`;
  const ingredientStatement = readText(attributes.get('recipe_ingredients'));
  const servingSizeText = buildServingSizeText(attributes);
  const productKey = sku ?? (slugify(name) || String(index));

  return {
    id: `${school.id}-${location.urlKey}-${date}-${String(period.id)}-${slugify(productKey) || index}`,
    sourceItemId: sku ?? readText(attributes.get('recipe_id')),
    name,
    normalizedName: name.toLowerCase(),
    description: readText(attributes.get('marketing_description')),
    stationId,
    stationName,
    servingSizeText,
    price: normalizePrice(product.price),
    availability: {
      status: 'planned',
    },
    dietaryTags: normalizeDietaryTags(attributes, metadata),
    allergens: normalizeAllergens(attributes, metadata),
    ingredientStatement,
    ingredients: splitIngredients(ingredientStatement),
    nutrition: normalizeNutrition(attributes, metadata, servingSizeText),
    imageUrl: product.images?.find((image) => image.url)?.url,
    itemUrl: sourceUrl,
    sourceUrl,
    raw: {
      sku,
      recipeId: readText(attributes.get('recipe_id')),
      attributes: product.attributes,
    optionCount: product.options?.length ?? 0,
    },
  };
}

function collectStationProducts(
  skus: StationSkuMap | undefined,
  productBySku: Map<string, MyDiningHubProduct>
) {
  const ordered: MyDiningHubProduct[] = [];
  const seen = new Set<string>();
  const add = (sku?: string) => {
    const normalizedSku = normalizeWhitespace(sku);
    if (!normalizedSku || seen.has(normalizedSku)) return false;

    const product = productBySku.get(normalizedSku);
    if (!product) return false;

    ordered.push(product);
    seen.add(normalizedSku);
    return true;
  };

  for (const sku of skus?.simple ?? []) {
    add(sku);
  }

  for (const configurable of skus?.configurable ?? []) {
    let addedVariant = false;
    for (const variant of configurable.variants ?? []) {
      addedVariant = add(variant) || addedVariant;
    }

    if (!addedVariant) add(configurable.sku);
  }

  return ordered;
}

function normalizeNutrition(
  attributes: Map<string, unknown>,
  metadata: StoreMetadata,
  servingSizeText?: string
): NutritionFact[] {
  const facts: NutritionFact[] = [];

  if (servingSizeText) {
    facts.push({
      key: 'serving_size',
      label: 'Serving Size',
      sourceText: servingSizeText,
    });
  }

  for (const mapping of NUTRITION_MAPPINGS) {
    const raw = attributes.get(mapping.attribute);
    const sourceText = readText(raw);
    if (!sourceText || sourceText.toLowerCase() === 'n/a') continue;

    const amount = parseNumber(sourceText);
    if (amount === undefined) continue;

    facts.push({
      key: mapping.key,
      label: metadata.nutritionLabelsByValue.get(mapping.attribute) ?? mapping.label,
      amount,
      unit: mapping.unit,
      sourceText: `${mapping.label}: ${sourceText}`,
    });
  }

  return facts;
}

function normalizeAllergens(
  attributes: Map<string, unknown>,
  metadata: StoreMetadata
): AllergenFact[] {
  const facts: AllergenFact[] = [];
  const statement = readText(attributes.get('allergen_statement'));

  if (statement) {
    const lowerStatement = statement.toLowerCase();
    if (lowerStatement.includes('not available')) {
      facts.push({
        key: 'other',
        label: 'Allergen information unavailable',
        status: 'unknown',
        sourceText: statement,
      });
    } else {
      const status = lowerStatement.includes('may contain') ? 'may_contain' : 'contains';
      const labels = statement
        .replace(/^contains:\s*/i, '')
        .replace(/^may contain:\s*/i, '')
        .split(',')
        .map((part) => normalizeWhitespace(part))
        .filter((part): part is string => Boolean(part));

      for (const label of labels) {
        facts.push({
          key: mapAllergenKey(label),
          label,
          status,
          sourceText: statement,
        });
      }
    }
  }

  for (const value of readValues(attributes.get('allergens_intolerances'))) {
    if (value === '0') continue;

    const option = metadata.allergensByValue.get(value);
    const label = normalizeWhitespace(option?.label);
    if (!label) continue;

    facts.push({
      key: mapAllergenKey(label),
      label,
      status: 'contains',
      sourceText: value,
    });
  }

  return dedupeAllergens(facts);
}

function normalizeDietaryTags(
  attributes: Map<string, unknown>,
  metadata: StoreMetadata
): DietaryTag[] {
  const tags = new Set<DietaryTag>();

  for (const value of readValues(attributes.get('recipe_attributes'))) {
    const option = metadata.menuPreferencesByValue.get(value);
    const label = `${option?.label ?? ''} ${option?.title ?? ''}`.toLowerCase();
    if (!label.trim()) continue;

    if (label.includes('vegan')) tags.add('vegan');
    else if (label.includes('vegetarian')) tags.add('vegetarian');
    if (label.includes('halal')) tags.add('halal');
    if (label.includes('kosher')) tags.add('kosher');
    if (label.includes('made without gluten') || label.includes('gluten free')) {
      tags.add('made_without_gluten');
    }
    if (label.includes('plant forward')) tags.add('plant_forward');
    if (label.includes('coolfood') || label.includes('climate') || label.includes('low carbon')) {
      tags.add('low_carbon');
    }
    if (label.includes('local')) tags.add('locally_sourced');
    if (label.includes('organic')) tags.add('organic');
    if (label.includes('spicy')) tags.add('spicy');
  }

  return [...tags];
}

function buildServingSizeText(attributes: Map<string, unknown>) {
  const combined = readText(attributes.get('serving_combined'));
  if (combined && combined.toLowerCase() !== 'n/a') return combined;

  const size = readText(attributes.get('serving_size'));
  const fraction = readText(attributes.get('serving_fraction'));
  const unit = readText(attributes.get('serving_unit'));
  const amount = firstMeaningful(size, fraction);
  const parts = [amount, unit].filter((part): part is string => Boolean(part && part.toLowerCase() !== 'n/a'));
  return parts.length ? parts.join(' ') : undefined;
}

function normalizePrice(price?: ProductPrice): MenuPrice | undefined {
  const amount = price?.final?.amount;
  const value =
    typeof amount?.value === 'number' ? amount.value : amount?.value ? Number(amount.value) : undefined;
  if (value === undefined || !Number.isFinite(value)) return undefined;

  return {
    amount: value,
    currency: amount?.currency === 'USD' ? 'USD' : undefined,
    displayText: `${amount?.currency === 'USD' ? '$' : ''}${value.toFixed(2)}`,
  };
}

async function fetchGraphql<T>(
  site: MyDiningHubSite,
  request: {
    operationName: string;
    query: string;
    variables?: Record<string, unknown>;
    refererPath?: string;
  }
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = new URL(GRAPHQL_ENDPOINT);
  const storeCode = site.storeViewCode.replace(/_[^_]+$/, '');

  url.searchParams.set('operationName', request.operationName);
  url.searchParams.set('query', request.query);
  if (request.variables) {
    url.searchParams.set('variables', JSON.stringify(request.variables));
  }

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json,*/*',
        'accept-language': 'en-US,en;q=0.9',
        'x-api-key': 'ElevateAPIProd',
        'magento-store-code': storeCode,
        'magento-website-code': storeCode,
        'magento-store-view-code': site.storeViewCode,
        store: site.storeViewCode,
        'magento-customer-group': CUSTOMER_GROUP,
        origin: site.origin,
        referer: `${site.origin}${request.refererPath ?? '/en/locations'}`,
        'user-agent':
          'campus-dining-api/0.1 (+https://github.com/endo-ai/campus-dining-api)',
      },
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from MyDiningHub ${request.operationName}: ${text.slice(0, 300)}`);
    }

    const payload = JSON.parse(text) as GraphqlResponse<T>;
    if (payload.errors?.length) {
      throw new Error(
        `GraphQL ${request.operationName} error: ${payload.errors
          .map((error) => error.message ?? 'unknown error')
          .join('; ')}`
      );
    }
    if (!payload.data) {
      throw new Error(`GraphQL ${request.operationName} returned no data.`);
    }

    return payload.data;
  } finally {
    clearTimeout(timeout);
  }
}

function buildOptionMap(options?: StoreOption[]) {
  return new Map(
    (options ?? [])
      .filter((option) => option.value && option.is_active !== '0')
      .map((option) => [String(option.value), option] as const)
  );
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index] as T, index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker())
  );
  return results;
}

function isActiveMenuLocation(detail: MyDiningHubLocationDetail) {
  return toBoolean(detail.commerceAttributes?.hasActiveMenus)
    && (detail.commerceAttributes?.meal_periods?.length ?? 0) > 0;
}

function toBoolean(value: unknown) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function normalizeStationName(station: MyDiningHubStation | undefined, period: MyDiningHubMealPeriod) {
  const override = station?.meal_period_overrides?.find(
    (candidate) => String(candidate.meal_period_id) === String(period.id)
  );
  return normalizeWhitespace(override?.name) ?? normalizeWhitespace(station?.name);
}

function formatAddress(address?: MyDiningHubLocationSummary['commerceAttributes']) {
  const parts = [
    address?.address_line_1,
    address?.address_line_2,
    address?.city_locality,
    address?.state_province,
    address?.postal_code,
  ]
    .map((part) => normalizeWhitespace(part))
    .filter((part): part is string => Boolean(part));

  return parts.length ? parts.join(', ') : undefined;
}

function readText(value: unknown) {
  if (typeof value === 'string') return normalizeWhitespace(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function readValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => readText(entry))
      .filter((entry): entry is string => Boolean(entry));
  }

  const text = readText(value);
  return text ? [text] : [];
}

function firstMeaningful(...values: Array<string | undefined>) {
  return values.find((value) => value && value.toLowerCase() !== 'n/a');
}

function parseNumber(value: string) {
  const match = value.match(/-?[\d.]+/);
  if (!match) return undefined;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function dedupeAllergens(facts: AllergenFact[]) {
  const deduped = new Map<string, AllergenFact>();
  for (const fact of facts) {
    deduped.set(`${fact.key}:${fact.label.toLowerCase()}:${fact.status}`, fact);
  }
  return [...deduped.values()];
}

function splitIngredients(statement?: string): IngredientFact[] {
  if (!statement) return [];

  return splitIngredientNames(statement)
    .map((ingredient) => normalizeWhitespace(ingredient))
    .filter((ingredient): ingredient is string => Boolean(ingredient))
    .map((name) => ({
      name,
      normalizedName: name.toLowerCase(),
      containsAllergenKeys: ingredientAllergens(name),
      sourceText: name,
    }));
}

function splitIngredientNames(statement: string) {
  const ingredients: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of statement) {
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);

    if ((char === ',' || char === ';') && depth === 0) {
      ingredients.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  ingredients.push(current);
  return ingredients;
}

function ingredientAllergens(name: string): AllergenKey[] {
  return allergenKeysInIngredientText(name);
}

function mapAllergenKey(label: string): AllergenKey {
  const value = label.toLowerCase();
  if (value.includes('milk') || value.includes('dairy')) return 'milk';
  if (value.includes('egg')) return 'egg';
  if (value.includes('fish')) return 'fish';
  if (value.includes('shellfish') || value.includes('shrimp') || value.includes('crab')) {
    return 'crustacean_shellfish';
  }
  if (value.includes('tree nut') || value.includes('almond') || value.includes('walnut')) {
    return 'tree_nut';
  }
  if (value.includes('peanut')) return 'peanut';
  if (value.includes('wheat')) return 'wheat';
  if (value.includes('soy')) return 'soy';
  if (value.includes('sesame')) return 'sesame';
  if (value.includes('gluten')) return 'gluten';
  return 'other';
}

function normalizeWhitespace(value?: string | null) {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
