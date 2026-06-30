import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { load } from 'cheerio';
import { chromium } from 'playwright-core';
import { allergenKeysInIngredientText } from './allergen-text.js';
import { fetchJson, fetchText } from './http.js';
import type { DiningProviderAdapter, ProviderFetchResult } from './types.js';
import type {
  AllergenFact,
  AllergenKey,
  DietaryTag,
  IngredientFact,
  MenuQuery,
  NormalizedMenu,
  NormalizedMenuItem,
  NutritionFact,
  NutritionKey,
  NutritionUnit,
  SchoolCoverage,
} from '../types/dining.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (
  data: Buffer
) => Promise<{ text: string; numpages: number; info?: { CreationDate?: string; ModDate?: string } }>;

type DartmouthMealItem = {
  id: string;
  remoteId?: string;
  itemName: string;
  mainLocationId?: string;
  mainLocationLabel?: string;
  recipeCategory?: string[];
  menuCategory?: string;
  imagePath?: string;
  datesAvailable?: Array<{
    date: string;
    menus?: DartmouthSourceMenu[];
  }>;
  ingredients?: string;
  containsAllergens?: Array<{ id?: string; label?: string }>;
  meetsPreferences?: Array<{ id?: string; label?: string }>;
  nutrients?: Array<{
    id?: string;
    label?: string;
    value?: number | string | null;
    unit?: string | null;
    percentDailyValue?: number | string | null;
  }>;
  portionSize?: string;
};

type DartmouthSourceMenu = {
  mealPeriod?: string;
  menuId?: number;
  publishingGroup?: string;
  subLocation?: string;
};

type DartmouthMealItemsResponse = {
  status: number;
  dates?: string[];
  mealItems?: DartmouthMealItem[];
};

type PurdueGraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

type PurdueStartLocationsData = {
  diningCourtCategories?: Array<{
    name?: string;
    diningCourts?: PurdueLocation[];
  }>;
};

type PurdueLocation = {
  id?: string;
  category?: string;
  name: string;
  formalName?: string;
  upcomingMeals?: Array<{
    name?: string;
    type?: string;
    startTime?: string;
    endTime?: string;
  }>;
};

type PurdueLocationMenuData = {
  diningCourtByName?: {
    id?: string;
    name: string;
    formalName?: string;
    address?: {
      street?: string;
      city?: string;
      state?: string;
      zip?: string;
    };
    dailyMenu?: {
      meals?: PurdueMeal[];
    };
  } | null;
};

type PurdueMeal = {
  name: string;
  status?: string;
  startTime?: string;
  endTime?: string;
  stations?: PurdueStation[];
};

type PurdueStation = {
  id: string;
  name: string;
  notes?: string | null;
  items?: PurdueMenuItemAppearance[];
};

type PurdueMenuItemAppearance = {
  specialName?: string | null;
  itemMenuId?: string;
  hasComponents?: boolean;
  item?: PurdueMenuItemSummary | null;
};

type PurdueMenuItemSummary = {
  isNutritionReady?: boolean;
  itemId: string;
  name: string;
  traits?: PurdueTrait[];
  components?: PurdueMenuItemSummary[] | null;
};

type PurdueItemDetailData = {
  itemByItemId?: PurdueItemDetail | null;
};

type PurdueItemDetail = PurdueMenuItemSummary & {
  ingredients?: string | null;
  nutritionFacts?: PurdueNutritionFact[];
};

type PurdueNutritionFact = {
  dailyValueLabel?: string | null;
  label?: string | null;
  name?: string | null;
  value?: number | null;
};

type PurdueTrait = {
  name?: string | null;
  type?: string | null;
};

type BerkeleyItemSeed = {
  id: string;
  sourceItemId: string;
  menuId: string;
  detailLocation: string;
  name: string;
  category?: string;
  stationId: string;
  stationName: string;
  periodName: string;
  iconLabels: string[];
  sourceUrl: string;
  availabilitySourceText?: string;
};

type BerkeleyItemDetail = {
  name?: string;
  servingSizeText?: string;
  ingredientStatement?: string;
  nutrition: NutritionFact[];
  allergens: AllergenFact[];
};

type StanfordSelectOption = {
  id: string;
  name: string;
};

type StanfordFormState = {
  fields: Record<string, string>;
  cookie?: string;
  locations: StanfordSelectOption[];
  meals: StanfordSelectOption[];
  dateOptions: string[];
};

type UiucDiningOption = {
  id: string;
  name: string;
};

type UiucScheduleRow = {
  diningOptionId: string;
  date: string;
  mealName: string;
  startTime?: string;
  endTime?: string;
};

type UiucMenuRow = {
  EventDate?: string;
  DiningMenuID?: number | string;
  ServingUnit?: string;
  Course?: string;
  CourseSort?: number;
  FormalName?: string;
  Meal?: string;
  Traits?: string;
  DiningOptionID?: number | string;
  ScheduleID?: number | string;
  ItemID?: number | string;
  Category?: string;
  EventDateGMT?: number;
};

type CaltechDayMenu = {
  date: string;
  dayName: string;
  sourceUrl: string;
  items: CaltechMenuItem[];
};

type CaltechMenuItem = {
  category: string;
  name: string;
  allergenText?: string;
};

type UscMenuResponse = {
  meals?: UscMeal[];
};

type UscMeal = {
  name?: string;
  stations?: UscStation[];
};

type UscStation = {
  station?: string;
  subtitle?: string;
  menu?: UscMenuItem[];
};

type UscMenuItem = {
  item?: string;
  dietary_preferences?: string[];
  allergens?: string[];
  preferences?: string[];
};

type UcsdVenueLink = {
  id: string;
  name?: string;
  url: string;
};

type UcsdItemSeed = {
  id: string;
  sourceItemId: string;
  name: string;
  itemUrl: string;
  periodName: string;
  stationId: string;
  stationName: string;
  iconLabels: string[];
  priceText?: string;
};

type UcsdItemDetail = {
  servingSizeText?: string;
  ingredientStatement?: string;
  ingredients: IngredientFact[];
  allergens: AllergenFact[];
  nutrition: NutritionFact[];
};

type BostonCollegeMenuRow = {
  ID?: string;
  Serve_Date?: string;
  Meal_Number?: string;
  Meal_Name?: string;
  Location_Number?: string;
  Location_Name?: string;
  Menu_Category_Number?: string;
  Menu_Category_Name?: string;
  Recipe_Number?: string;
  Recipe_Name?: string;
  Recipe_Print_As_Name?: string;
  Ingredient_List?: string;
  Allergens?: string;
  Selling_Price?: string;
  Recipe_Web_Codes?: string;
  Serving_Size?: string;
  Calories?: string;
  Total_Fat?: string;
  Total_Fat_DV?: string;
  Sat_Fat?: string;
  Sat_Fat_DV?: string;
  Trans_Fat?: string;
  Cholesterol?: string;
  Cholesterol_DV?: string;
  Sodium?: string;
  Sodium_DV?: string;
  Total_Carb?: string;
  Total_Carb_DV?: string;
  Dietary_Fiber?: string;
  Dietary_Fiber_DV?: string;
  Sugars?: string;
  Added_Sugar?: string;
  Protein?: string;
  Protein_DV?: string;
  Vitamin_D?: string;
  Vitamin_D_DV?: string;
  Calcium?: string;
  Calcium_DV?: string;
  Iron?: string;
  Iron_DV?: string;
  Potassium?: string;
  Potassium_DV?: string;
  Servings_Per_Container?: string;
  Vitamin_A?: string;
  Vitamin_A_DV?: string;
  Vitamin_C?: string;
  Vitamin_C_DV?: string;
  Serving_Size_Grams?: string;
  web_codes_fullnames?: string;
  web_codes_display_2?: string;
  web_codes_display_3?: string;
};

type NmcLocationLink = {
  id: string;
  name: string;
  url: string;
  baseUrl: string;
};

type NmcRecipeResponse = {
  success?: boolean;
  html?: string;
};

type NmcRecipeDetail = {
  servingSizeText?: string;
  ingredientStatement?: string;
  ingredients: IngredientFact[];
  allergens: AllergenFact[];
  dietaryTags: DietaryTag[];
  nutrition: NutritionFact[];
};

type BostonUniversityLocation = {
  id: string;
  name: string;
  url: string;
};

type ColumbiaPageData = {
  menuData: string;
  diningNodes: string;
  diningTerms: string;
  sourceUrl: string;
};

type ColumbiaMenuRecord = {
  nid?: string;
  title?: string;
  locations?: string[];
  date_range_fields?: ColumbiaDateRange[];
};

type ColumbiaDateRange = {
  date_from?: string;
  date_to?: string;
  menu_type?: string[];
  stations?: ColumbiaStation[];
};

type ColumbiaStation = {
  station?: string[];
  meals_paragraph?: ColumbiaMenuItem[];
};

type ColumbiaMenuItem = {
  title?: string;
  prefs?: string[];
  allergens?: string[];
};

type ColumbiaNodes = {
  locations?: ColumbiaLocation[];
};

type ColumbiaLocation = {
  nid?: string;
  title?: string;
  path?: string;
  address?: string;
};

type ColumbiaTerms = {
  types?: Record<string, { name?: string; tid?: string }>;
  stations?: Record<string, { name?: string; tid?: string }>;
};

type NorthwesternFlikLocation = {
  id: string;
  lid: string;
  name: string;
  cookieTitle: string;
  address?: string;
};

type NorthwesternFlikParsedItem = {
  stationName: string;
  name: string;
  dietaryTags: DietaryTag[];
  sourceText: string;
};

type UclaItemSeed = {
  sourceItemId: string;
  name: string;
  itemUrl: string;
  locationId: string;
  locationName: string;
  periodId: string;
  periodName: string;
  stationId: string;
  stationName: string;
  iconLabels: string[];
};

type UclaRecipeDetail = {
  name?: string;
  description?: string;
  servingSizeText?: string;
  ingredientStatement?: string;
  ingredients: IngredientFact[];
  allergens: AllergenFact[];
  dietaryTags: DietaryTag[];
  nutrition: NutritionFact[];
};

type UcDavisLocation = {
  id: string;
  name: string;
  url: string;
};

type UcDavisItemDetail = {
  description?: string;
  servingSizeText?: string;
  ingredientStatement?: string;
  ingredients: IngredientFact[];
  allergens: AllergenFact[];
  dietaryTags: DietaryTag[];
  nutrition: NutritionFact[];
};

type CheerioElement = NonNullable<Parameters<ReturnType<typeof load>>[0]>;

const BERKELEY_AJAX_URL = 'https://dining.berkeley.edu/wp-admin/admin-ajax.php';
const BERKELEY_DETAIL_CONCURRENCY = 8;
const BOSTON_COLLEGE_TODAY_MENU_URL = 'https://web.bc.edu/dining/menu/todayMenu_PROD.json';
const BOSTON_COLLEGE_FUTURE_MENU_URL = 'https://web.bc.edu/dining/menu/futureMenu_PROD.json';
const BOSTON_UNIVERSITY_LOCATIONS: BostonUniversityLocation[] = [
  {
    id: 'marciano',
    name: 'The Fresh Food Co. at Marciano Commons',
    url: 'https://www.bu.edu/dining/location/marciano/',
  },
  {
    id: 'west',
    name: 'The Fresh Food Co. at West Campus',
    url: 'https://www.bu.edu/dining/location/west/',
  },
];
const BOSTON_UNIVERSITY_LOCATION_CONCURRENCY = 1;
const COLUMBIA_PAGE_TIMEOUT_MS = 60000;
const COLUMBIA_MENU_DATA_TIMEOUT_MS = 30000;
const COLUMBIA_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const NMC_LOCATION_CONCURRENCY = 1;
const NMC_DETAIL_CONCURRENCY = 4;
const nmcRecipeDetailCache = new Map<string, Promise<NmcRecipeDetail>>();
const NORTHWESTERN_FLIK_BASE_URL = 'https://flikcafes.compass-usa.com';
const NORTHWESTERN_FLIK_MENU_PATH = '/northwestern/Pages/Menu.aspx';
const NORTHWESTERN_FLIK_LOCATIONS: NorthwesternFlikLocation[] = [
  {
    id: 'global-hub-marketplace',
    lid: 'a1',
    name: 'Global Hub Marketplace',
    cookieTitle: 'Global Hub Marketplace',
    address: '2211 Campus Dr, Evanston, IL 60208',
  },
  {
    id: 'inspiring-grounds-coffee-shop',
    lid: 'a2',
    name: 'Inspiring Grounds Coffee Shop',
    cookieTitle: 'Inspiring Grounds Coffee Shop',
  },
];
const PURDUE_GRAPHQL_URL = 'https://api.hfs.purdue.edu/menus/v3/GraphQL';
const PURDUE_DETAIL_CONCURRENCY = 8;
const STANFORD_MENU_URL = 'https://rdeapps.stanford.edu/dininghallmenu/';
const STANFORD_REQUEST_CONCURRENCY = 4;
const STANFORD_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const UIUC_MENU_PAGE = 'https://web.housing.illinois.edu/diningmenus';
const UIUC_MENU_API = 'https://web.housing.illinois.edu/DiningMenus/api/DiningMenu/GetOption/';
const UCLA_MENUS_AT_GLANCE_URL = 'https://dining.ucla.edu/menus-at-a-glance/';
const UCLA_BASE_URL = 'https://dining.ucla.edu';
const UCLA_DETAIL_CONCURRENCY = 8;
const uclaRecipeDetailCache = new Map<string, Promise<UclaRecipeDetail>>();
const UC_DAVIS_LOCATIONS: UcDavisLocation[] = [
  {
    id: 'segundo',
    name: 'Segundo DC',
    url: 'https://housing.ucdavis.edu/dining/dining-commons/segundo/',
  },
  {
    id: 'tercero',
    name: 'Tercero DC',
    url: 'https://housing.ucdavis.edu/dining/dining-commons/tercero/',
  },
  {
    id: 'cuarto',
    name: 'Cuarto DC',
    url: 'https://housing.ucdavis.edu/dining/dining-commons/cuarto/',
  },
];
const UC_DAVIS_LOCATION_CONCURRENCY = 2;
const USC_MENU_API = 'https://hospitality.usc.edu/wp-json/hsp-api/v1/get-res-dining-menus';
const USC_LOCATIONS = [
  { id: 'evk', name: "Everybody's Kitchen" },
  { id: 'parkside', name: 'Parkside Residential' },
  { id: 'university-village', name: 'USC Village' },
];
const UCSD_HOME_URL = 'https://hdh-web.ucsd.edu/dining/apps/diningservices';
const UCSD_BASE_URL = 'https://hdh-web.ucsd.edu';
const UCSD_DETAIL_CONCURRENCY = 8;
const UCSD_LOCATION_CONCURRENCY = 4;
const ucsdDetailCache = new Map<string, Promise<UcsdItemDetail>>();
const PURDUE_START_LOCATIONS_QUERY = `
  query getStartLocations {
    diningCourtCategories {
      name
      diningCourts {
        id
        category
        name
        formalName
        upcomingMeals {
          name
          type
          startTime
          endTime
        }
      }
    }
  }
`;
const PURDUE_LOCATION_MENU_QUERY = `
  query getLocationMenu($name: String!, $date: Date!) {
    diningCourtByName(name: $name) {
      address {
        city
        state
        street
        zip
      }
      formalName
      id
      name
      dailyMenu(date: $date) {
        meals {
          endTime
          startTime
          name
          status
          stations {
            id
            name
            notes
            items {
              specialName
              itemMenuId
              hasComponents
              item {
                isNutritionReady
                itemId
                name
                traits {
                  name
                  type
                }
                components {
                  name
                  isNutritionReady
                  itemId
                  traits {
                    name
                    type
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
const PURDUE_ITEM_DETAIL_QUERY = `
  query getItemDetail($id: Guid!) {
    itemByItemId(itemId: $id) {
      itemId
      name
      ingredients
      isNutritionReady
      nutritionFacts {
        dailyValueLabel
        label
        name
        value
      }
      traits {
        name
        type
      }
      components {
        itemId
        name
        isNutritionReady
        traits {
          name
          type
        }
      }
    }
  }
`;

export class OfficialHtmlProvider implements DiningProviderAdapter {
  readonly provider = 'official_html' as const;

  async fetchMenu(school: SchoolCoverage, query: MenuQuery): Promise<ProviderFetchResult> {
    if (school.id === 'stanford') {
      return fetchStanfordMenu(school, query);
    }

    if (school.id === 'rice') {
      return fetchRiceMenu(school, query);
    }

    if (school.id === 'ucla') {
      return fetchUclaMenu(school, query);
    }

    if (school.id === 'uc-davis') {
      return fetchUcDavisMenu(school, query);
    }

    if (school.id === 'usc') {
      return fetchUscMenu(school, query);
    }

    if (school.id === 'ucsd') {
      return fetchUcsdMenu(school, query);
    }

    if (school.id === 'unc' || school.id === 'georgetown') {
      return fetchNmcDiningMenu(school, query);
    }

    if (school.id === 'boston-college') {
      return fetchBostonCollegeMenu(school, query);
    }

    if (school.id === 'boston-university') {
      return fetchBostonUniversityMenu(school, query);
    }

    if (school.id === 'dartmouth') {
      return fetchDartmouthMenu(school, query);
    }

    if (school.id === 'uc-berkeley') {
      return fetchBerkeleyMenu(school, query);
    }

    if (school.id === 'purdue') {
      return fetchPurdueMenu(school, query);
    }

    if (school.id === 'uiuc') {
      return fetchUiucMenu(school, query);
    }

    if (school.id === 'caltech') {
      return fetchCaltechMenu(school, query);
    }

    if (school.id === 'northwestern') {
      return fetchNorthwesternFlikMenu(school, query);
    }

    if (school.id === 'columbia') {
      return fetchColumbiaMenu(school, query);
    }

    if (school.supportStatus === 'needs_poc') {
      return {
        state: 'poc_required',
        provider: this.provider,
        sourceUrl: school.sourceUrl,
        reason: 'Menu source is cataloged, but a live fetch proof-of-concept is still required.',
      };
    }

    if (school.supportStatus === 'unsupported') {
      return {
        state: 'unsupported',
        provider: this.provider,
        sourceUrl: school.sourceUrl,
        reason: 'This school is not currently supported.',
      };
    }

    return {
      state: 'adapter_pending',
      provider: this.provider,
      sourceUrl: school.sourceUrl,
      reason: 'Official HTML source is cataloged, but this school-specific adapter is not implemented yet.',
    };
  }
}

async function fetchNorthwesternFlikMenu(
  school: SchoolCoverage,
  query: MenuQuery
): Promise<ProviderFetchResult> {
  const fetchedAt = new Date().toISOString();
  const date = query.date ?? fetchedAt.slice(0, 10);

  try {
    const requestedLocation = query.locationId ? slugify(query.locationId) : undefined;
    const candidateLocations = NORTHWESTERN_FLIK_LOCATIONS.filter((location) => {
      if (!requestedLocation) return true;
      return (
        requestedLocation === location.id ||
        requestedLocation === location.lid ||
        slugify(location.name).includes(requestedLocation)
      );
    });

    const locations = (
      await mapWithConcurrencyLimit(
        candidateLocations.map((location) => () =>
          fetchNorthwesternFlikLocationMenu(location, date).catch(() => undefined)
        ),
        2
      )
    ).filter((location): location is NormalizedMenu['locations'][number] => Boolean(location));

    return {
      state: 'adapter_ready',
      provider: 'official_html',
      fetchedAt,
      sourceUrl: school.sourceUrl,
      data: {
        schoolId: school.id,
        providerKind: 'official_html',
        sourceUrl: school.sourceUrl,
        fetchedAt,
        freshnessMinutes: 0,
        locations,
      },
    };
  } catch (error) {
    return {
      state: 'provider_error',
      provider: 'official_html',
      sourceUrl: school.sourceUrl,
      reason: 'Northwestern Flik public PDF menu fetch or normalization failed.',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchNorthwesternFlikLocationMenu(
  location: NorthwesternFlikLocation,
  date: string
): Promise<NormalizedMenu['locations'][number] | undefined> {
  const menuPageUrl = northwesternFlikMenuPageUrl(location.lid);
  const menuHtml = await fetchNorthwesternFlikText(menuPageUrl, location);
  const pdfUrl = extractNorthwesternFlikPdfUrl(menuHtml, menuPageUrl);
  if (!pdfUrl || !isNorthwesternFlikPdfAvailableForDate(pdfUrl, date)) return undefined;

  const pdf = await fetchAndParseNorthwesternFlikPdf(pdfUrl, location);
  const items = parseNorthwesternFlikPdfText(pdf.text);
  if (items.length === 0) return undefined;

  const stationMap = new Map<string, NormalizedMenu['locations'][number]['periods'][number]['stations'][number]>();
  for (const item of items) {
    const stationId = `${location.id}-${slugify(item.stationName) || 'weekly-menu'}`;
    const station =
      stationMap.get(stationId) ??
      {
        id: stationId,
        name: item.stationName,
        sourceStationId: item.stationName,
        items: [],
      };

    station.items.push(normalizeNorthwesternFlikItem(item, {
      index: station.items.length,
      location,
      sourceUrl: pdfUrl,
      stationId,
    }));
    stationMap.set(stationId, station);
  }

  return {
    id: location.id,
    name: location.name,
    sourceLocationId: location.lid,
    address: location.address,
    timezone: 'America/Chicago',
    date,
    periods: [
      {
        id: `${location.id}-weekly-menu`,
        name: 'Weekly Menu',
        sourcePeriodId: 'weekly-pdf-menu',
        stations: [...stationMap.values()],
      },
    ],
  };
}

function normalizeNorthwesternFlikItem(
  item: NorthwesternFlikParsedItem,
  context: {
    index: number;
    location: NorthwesternFlikLocation;
    sourceUrl: string;
    stationId: string;
  }
): NormalizedMenuItem {
  return {
    id: `northwestern-${context.location.id}-${context.stationId}-${context.index}-${slugify(item.name)}`,
    sourceItemId: `${context.location.lid}:${item.stationName}:${item.name}`,
    name: item.name,
    normalizedName: item.name.toLowerCase(),
    category: item.stationName,
    stationId: context.stationId,
    stationName: item.stationName,
    availability: {
      status: 'planned',
      sourceText:
        'Flik/Compass weekly PDF menu; text extraction does not expose reliable per-day column assignment.',
    },
    dietaryTags: item.dietaryTags,
    allergens: [],
    ingredients: [],
    nutrition: [],
    itemUrl: context.sourceUrl,
    sourceUrl: context.sourceUrl,
    raw: {
      sourceText: item.sourceText,
    },
  };
}

export function parseNorthwesternFlikPdfText(text: string): NorthwesternFlikParsedItem[] {
  const items: NorthwesternFlikParsedItem[] = [];
  const seen = new Set<string>();
  let currentStation = '';

  for (const rawLine of normalizeNorthwesternFlikPdfText(text).split(/\r?\n/)) {
    const line = normalizeNorthwesternFlikPdfLine(rawLine);
    if (!line || shouldSkipNorthwesternFlikLine(line)) continue;

    const stationMatch = line.match(/^(Comfort|Vegetarian Option|Soup|Deli|Grill|Action|Pizza)\s*:?\s*(.*)$/i);
    const stationName = stationMatch ? normalizeNorthwesternStationName(stationMatch[1]) : currentStation;
    const sourceText = stationMatch ? stationMatch[2] : line;
    if (!stationName) continue;
    currentStation = stationName;

    if (stationName === 'Action' && /^closed$/i.test(sourceText)) continue;

    const itemNames =
      stationName === 'Soup'
        ? sourceText.split(/\s+\/\s+/).map((value) => cleanNorthwesternFlikItemName(value, stationName))
        : [cleanNorthwesternFlikItemName(sourceText, stationName)];

    for (const name of itemNames) {
      if (!name || shouldSkipNorthwesternFlikItemName(name)) continue;
      const key = `${stationName}:${name}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      items.push({
        stationName,
        name,
        dietaryTags: [],
        sourceText: stationMatch ? line : `${stationName}: ${line}`,
      });
    }
  }

  return items;
}

function normalizeNorthwesternFlikPdfText(text: string) {
  return text
    .replace(/\bC\s*\r?\n\s*omfort:/g, 'Comfort:')
    .replace(/\s+Vegetarian Option:/g, '\nVegetarian Option:');
}

function normalizeNorthwesternFlikPdfLine(value: string) {
  return normalizeWhitespace(
    value
      .replace(/\u00a0/g, ' ')
      .replace(/[‐‑‒–—]/g, '-')
      .replace(/\s*,\s*/g, ', ')
      .replace(/\s+:/g, ':')
      .replace(/FIT\b/g, '')
  );
}

function shouldSkipNorthwesternFlikLine(line: string) {
  return (
    /^[MTWF]$/i.test(line) ||
    /^Th$/i.test(line) ||
    /^Before placing your order/i.test(line) ||
    /^If a person in your party/i.test(line) ||
    /^June\s+\d+/i.test(line) ||
    /^Monday\s+-\s+Friday$/i.test(line) ||
    /^Breakfast Hours:?/i.test(line) ||
    /^Lunch Hours:?/i.test(line) ||
    /^Grill Station/i.test(line) ||
    /^\d{1,2}:\d{2}\s*(AM|PM)/i.test(line) ||
    /^Closed$/i.test(line)
  );
}

function normalizeNorthwesternStationName(value: string) {
  const normalized = normalizeWhitespace(value.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase()));
  return normalized ?? value;
}

function cleanNorthwesternFlikItemName(value: string, stationName: string) {
  let name = normalizeWhitespace(
    value
      .replace(/\bFIT\b/gi, '')
      .replace(/\s*,\s*Pizza$/i, ' Pizza')
      .replace(/\s+,\s*/g, ', ')
      .replace(/,+$/g, '')
      .replace(/\s{2,}/g, ' ')
  );
  if (!name) return undefined;
  if (stationName === 'Pizza' && !/\bpizza\b/i.test(name)) {
    name = `${name} Pizza`;
  }
  return normalizeWhitespace(name);
}

function shouldSkipNorthwesternFlikItemName(value: string) {
  return (
    value.length < 3 ||
    /^closed$/i.test(value) ||
    /^breakfast$/i.test(value) ||
    /^lunch$/i.test(value) ||
    /^\d{1,2}:\d{2}/.test(value)
  );
}

async function fetchNorthwesternFlikText(url: string, location: NorthwesternFlikLocation) {
  const response = await fetch(url, {
    headers: northwesternFlikHeaders(location, 'text/html,*/*;q=0.8'),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching Northwestern Flik page ${url}`);
  }

  return response.text();
}

async function fetchAndParseNorthwesternFlikPdf(pdfUrl: string, location: NorthwesternFlikLocation) {
  const response = await fetch(pdfUrl, {
    headers: northwesternFlikHeaders(location, 'application/pdf,*/*;q=0.8'),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching Northwestern Flik PDF ${pdfUrl}`);
  }

  return pdfParse(Buffer.from(await response.arrayBuffer()));
}

function northwesternFlikHeaders(location: NorthwesternFlikLocation, accept: string) {
  return {
    accept,
    'accept-language': 'en-US,en;q=0.9',
    cookie: `dwsLocationInformation=ID=${location.lid}&Title=${location.cookieTitle}`,
    'user-agent': 'Mozilla/5.0 (compatible; campus-dining-api/0.1)',
  };
}

function northwesternFlikMenuPageUrl(lid: string) {
  const url = new URL(NORTHWESTERN_FLIK_MENU_PATH, NORTHWESTERN_FLIK_BASE_URL);
  url.searchParams.set('lid', lid);
  return url.toString();
}

function extractNorthwesternFlikPdfUrl(html: string, pageUrl: string) {
  const $ = load(html);
  const iframeSrc = $('#pdfMenuIframe').attr('src') ?? $('#pdfMenuIframe').attr('ddf_src');
  if (!iframeSrc) return undefined;

  const parsedIframe = new URL(decodeHtmlText(iframeSrc), pageUrl);
  const sourcePdf = parsedIframe.searchParams.get('url');
  if (!sourcePdf?.toLowerCase().includes('.pdf')) return undefined;
  return sourcePdf;
}

function isNorthwesternFlikPdfAvailableForDate(pdfUrl: string, date: string) {
  const parsedDate = parseNorthwesternFlikPdfStartDate(pdfUrl);
  if (!parsedDate) return true;

  const queryDate = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(queryDate)) return false;

  const startDate = Date.parse(`${parsedDate}T00:00:00.000Z`);
  const endDate = startDate + 5 * 24 * 60 * 60 * 1000;
  return queryDate >= startDate && queryDate < endDate;
}

function parseNorthwesternFlikPdfStartDate(pdfUrl: string) {
  const decoded = decodeURIComponent(pdfUrl);
  const match = decoded.match(/(\d{2})\.(\d{2})\.(\d{2})/);
  if (!match) return undefined;

  const [, month, day, year] = match;
  return `20${year}-${month}-${day}`;
}

async function fetchColumbiaMenu(
  school: SchoolCoverage,
  query: MenuQuery
): Promise<ProviderFetchResult> {
  const fetchedAt = new Date().toISOString();
  const date = query.date ?? fetchedAt.slice(0, 10);

  try {
    const pageData = await fetchColumbiaPageData(school.sourceUrl);
    const menu = normalizeColumbiaMenuFromPageData(school, { ...query, date }, pageData, fetchedAt);

    if (menu.locations.length === 0) {
      return {
        state: 'provider_error',
        provider: 'official_html',
        sourceUrl: school.sourceUrl,
        reason: 'Columbia official menu_data did not include menu items for the requested date or filters.',
      };
    }

    return {
      state: 'adapter_ready',
      provider: 'official_html',
      fetchedAt,
      sourceUrl: school.sourceUrl,
      data: menu,
    };
  } catch (error) {
    return {
      state: 'provider_error',
      provider: 'official_html',
      sourceUrl: school.sourceUrl,
      reason: 'Columbia official menu browser extraction failed.',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchColumbiaPageData(sourceUrl: string): Promise<ColumbiaPageData> {
  const executablePath = findChromeExecutable();
  if (!executablePath) {
    throw new Error('No Chrome executable found. Set CHROME_PATH to enable Columbia menu extraction.');
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath,
  });

  try {
    const page = await browser.newPage({ userAgent: COLUMBIA_USER_AGENT });
    await page.goto(sourceUrl, {
      waitUntil: 'domcontentloaded',
      timeout: COLUMBIA_PAGE_TIMEOUT_MS,
    });
    await page.waitForFunction(
      () => {
        const values = window as unknown as Record<string, unknown>;
        return (
          typeof values.menu_data === 'string' &&
          typeof values.dining_nodes === 'string' &&
          typeof values.dining_terms === 'string'
        );
      },
      { timeout: COLUMBIA_MENU_DATA_TIMEOUT_MS }
    );

    const pageData = await page.evaluate((currentSourceUrl) => {
      const values = window as unknown as Record<string, unknown>;
      return {
        menuData: String(values.menu_data),
        diningNodes: String(values.dining_nodes),
        diningTerms: String(values.dining_terms),
        sourceUrl: currentSourceUrl,
      };
    }, sourceUrl);
    return pageData;
  } finally {
    await browser.close();
  }
}

function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.GOOGLE_CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter((value): value is string => Boolean(value));

  return candidates.find((candidate) => {
    try {
      return existsSync(candidate);
    } catch {
      return false;
    }
  });
}

export function normalizeColumbiaMenuFromPageData(
  school: SchoolCoverage,
  query: MenuQuery,
  pageData: ColumbiaPageData,
  fetchedAt: string
): NormalizedMenu {
  const date = query.date ?? fetchedAt.slice(0, 10);
  const records = JSON.parse(pageData.menuData) as ColumbiaMenuRecord[];
  const nodes = JSON.parse(pageData.diningNodes) as ColumbiaNodes;
  const terms = JSON.parse(pageData.diningTerms) as ColumbiaTerms;
  const locationById = new Map(
    (nodes.locations ?? [])
      .filter((location) => location.nid)
      .map((location) => [String(location.nid), location])
  );
  const requestedMeal = query.meal ? slugify(query.meal) : undefined;
  const requestedLocation = query.locationId ? slugify(query.locationId) : undefined;
  const locationMap = new Map<string, NormalizedMenu['locations'][number]>();

  for (const record of records) {
    const locationIds = record.locations?.length ? record.locations : ['columbia'];
    for (const range of record.date_range_fields ?? []) {
      if (!range.date_from?.startsWith(date)) continue;
      const periodName = normalizeColumbiaPeriodName(range, terms);
      if (requestedMeal && slugify(periodName) !== requestedMeal) continue;

      for (const locationId of locationIds) {
        const sourceLocation = locationById.get(locationId);
        const locationName = decodeHtmlText(sourceLocation?.title ?? 'Columbia Dining');
        const normalizedLocationId = slugify(locationName || locationId);
        if (
          requestedLocation &&
          requestedLocation !== slugify(locationId) &&
          requestedLocation !== normalizedLocationId
        ) {
          continue;
        }

        const location =
          locationMap.get(normalizedLocationId) ??
          {
            id: normalizedLocationId,
            name: locationName,
            sourceLocationId: locationId,
            address: normalizeHtmlText(sourceLocation?.address),
            timezone: 'America/New_York',
            date,
            periods: [],
          };

        const period = {
          id: `${normalizedLocationId}-${slugify(periodName)}-${range.date_from}`,
          name: periodName,
          sourcePeriodId: range.menu_type?.join(','),
          startTime: range.date_from,
          endTime: range.date_to,
          stations: normalizeColumbiaStations(school, pageData, record, range, terms, periodName),
        };

        if (period.stations.some((station) => station.items.length > 0)) {
          location.periods.push(period);
          locationMap.set(normalizedLocationId, location);
        }
      }
    }
  }

  return {
    schoolId: school.id,
    providerKind: 'official_html',
    sourceUrl: pageData.sourceUrl,
    fetchedAt,
    freshnessMinutes: 0,
    locations: [...locationMap.values()].filter((location) => location.periods.length > 0),
  };
}

function normalizeColumbiaStations(
  school: SchoolCoverage,
  pageData: ColumbiaPageData,
  record: ColumbiaMenuRecord,
  range: ColumbiaDateRange,
  terms: ColumbiaTerms,
  periodName: string
) {
  return (range.stations ?? [])
    .map((station, stationIndex) => {
      const stationName = normalizeColumbiaStationName(station, terms);
      const stationId = slugify(stationName || `station-${stationIndex + 1}`);
      const items = (station.meals_paragraph ?? [])
        .map((item, itemIndex) =>
          normalizeColumbiaItem(
            school,
            pageData.sourceUrl,
            record,
            range,
            station,
            stationName,
            stationId,
            periodName,
            item,
            itemIndex
          )
        )
        .filter((item): item is NormalizedMenuItem => Boolean(item));

      return {
        id: stationId,
        name: stationName,
        sourceStationId: station.station?.join(','),
        items,
      };
    })
    .filter((station) => station.items.length > 0);
}

function normalizeColumbiaItem(
  school: SchoolCoverage,
  sourceUrl: string,
  record: ColumbiaMenuRecord,
  range: ColumbiaDateRange,
  station: ColumbiaStation,
  stationName: string,
  stationId: string,
  periodName: string,
  item: ColumbiaMenuItem,
  itemIndex: number
): NormalizedMenuItem | undefined {
  const name = normalizeWhitespace(decodeHtmlText(item.title ?? ''));
  if (!name) return undefined;

  const allergenLabels = (item.allergens ?? [])
    .map((label) => normalizeWhitespace(decodeHtmlText(label)))
    .filter((label): label is string => Boolean(label));
  const dietaryLabels = (item.prefs ?? [])
    .map((label) => normalizeWhitespace(decodeHtmlText(label)))
    .filter((label): label is string => Boolean(label));

  return {
    id: `${school.id}-${range.date_from}-${stationId}-${itemIndex}-${slugify(name)}`,
    sourceItemId: `${record.nid ?? record.title ?? 'menu'}-${range.date_from}-${station.station?.join('-') ?? stationId}-${itemIndex}`,
    name,
    normalizedName: name.toLowerCase(),
    stationId,
    stationName,
    availability: {
      status: 'planned',
      startTime: range.date_from,
      endTime: range.date_to,
      sourceText: `${periodName} ${range.date_from ?? ''}-${range.date_to ?? ''}`.trim(),
    },
    dietaryTags: normalizeColumbiaDietaryTags(dietaryLabels),
    allergens: allergenLabels.map((label) => ({
      key: mapAllergenKey(label),
      label,
      status: 'contains' as const,
      sourceText: label,
    })),
    ingredients: [],
    nutrition: [],
    sourceUrl,
    raw: {
      menuTitle: record.title,
      periodName,
      stationName,
      prefs: item.prefs,
      allergens: item.allergens,
    },
  };
}

function normalizeColumbiaPeriodName(range: ColumbiaDateRange, terms: ColumbiaTerms) {
  const labels = (range.menu_type ?? [])
    .map((typeId) => normalizeWhitespace(decodeHtmlText(terms.types?.[typeId]?.name ?? typeId)))
    .filter((label): label is string => Boolean(label));
  return labels.join(' & ') || 'Menu';
}

function normalizeColumbiaStationName(station: ColumbiaStation, terms: ColumbiaTerms) {
  const labels = (station.station ?? [])
    .map((stationId) => normalizeWhitespace(decodeHtmlText(terms.stations?.[stationId]?.name ?? stationId)))
    .filter((label): label is string => Boolean(label));
  return labels.join(' / ') || 'Menu';
}

function normalizeColumbiaDietaryTags(labels: string[]): DietaryTag[] {
  const tags = new Set<DietaryTag>();
  for (const label of labels) {
    const value = label.toLowerCase();
    if (value.includes('gluten free')) tags.add('gluten_free');
    if (value.includes('halal')) tags.add('halal');
    if (value.includes('kosher')) tags.add('kosher');
    if (value.includes('vegan')) tags.add('vegan');
    else if (value.includes('vegetarian')) tags.add('vegetarian');
  }
  return [...tags];
}

function normalizeHtmlText(value?: string) {
  if (!value) return undefined;
  return normalizeWhitespace(decodeHtmlText(load(value).text()));
}

async function fetchCaltechMenu(
  school: SchoolCoverage,
  query: MenuQuery
): Promise<ProviderFetchResult> {
  const fetchedAt = new Date().toISOString();
  const date = query.date ?? fetchedAt.slice(0, 10);

  try {
    const sheetUrls = await discoverCaltechSheetCsvUrls(school.sourceUrl);
    const dayMenus = (
      await Promise.all(
        sheetUrls.map(async (sourceUrl) => parseCaltechCsvMenu(sourceUrl, await fetchText(sourceUrl)))
      )
    ).filter((menu): menu is CaltechDayMenu => Boolean(menu));
    const matchingDays = dayMenus.filter((day) => day.date === date);

    if (matchingDays.length === 0) {
      return {
        state: 'provider_error',
        provider: 'official_html',
        sourceUrl: school.sourceUrl,
        reason: 'Caltech published meal plan sheets did not include the requested menu date.',
      };
    }

    const periods = matchingDays.map((day) => {
      const items = day.items.map((item, index) => normalizeCaltechItem(school, day, item, index));
      return {
        id: `meal-plan-${day.date}`,
        name: 'Meal Plan',
        sourcePeriodId: day.dayName,
        stations: [
          {
            id: `meal-plan-${day.date}-menu`,
            name: 'Meal Plan Menu',
            sourceStationId: day.sourceUrl,
            items,
          },
        ],
      };
    });

    const menu: NormalizedMenu = {
      schoolId: school.id,
      providerKind: 'official_html',
      sourceUrl: school.sourceUrl,
      fetchedAt,
      freshnessMinutes: 0,
      locations: [
        {
          id: 'meal-plan',
          name: 'Caltech Meal Plan',
          sourceLocationId: 'meal-plan',
          date,
          periods,
        },
      ],
    };

    return {
      state: 'adapter_ready',
      provider: 'official_html',
      fetchedAt,
      sourceUrl: school.sourceUrl,
      data: menu,
    };
  } catch (error) {
    return {
      state: 'provider_error',
      provider: 'official_html',
      sourceUrl: school.sourceUrl,
      reason: 'Caltech official meal plan fetch failed.',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const CALTECH_FALLBACK_PAGES = [
  'https://caltechdining.my.canva.site/meal-plan-menus',
  'https://caltechdining.my.canva.site/mealplanmenu',
  'https://caltechdining.my.canva.site/next-week-meal-plan',
];

async function discoverCaltechSheetCsvUrls(sourceUrl: string) {
  const queue = [sourceUrl, ...CALTECH_FALLBACK_PAGES];
  const visited = new Set<string>();
  const sheets = new Set<string>();

  while (queue.length > 0 && visited.size < 8) {
    const pageUrl = queue.shift();
    if (!pageUrl || visited.has(pageUrl)) continue;
    visited.add(pageUrl);

    const html = await fetchText(pageUrl);
    for (const sheetUrl of extractCaltechSheetUrls(html)) {
      sheets.add(toCaltechCsvUrl(sheetUrl));
    }
    for (const canvaUrl of extractCaltechCanvaUrls(html)) {
      if (!visited.has(canvaUrl)) queue.push(canvaUrl);
    }
  }

  return [...sheets];
}

function extractCaltechCanvaUrls(html: string) {
  const decoded = decodeHtmlText(html);
  const urls = new Set<string>();

  for (const match of decoded.matchAll(/https:\/\/caltechdining\.my\.canva\.site\/[a-z0-9-]+/gi)) {
    urls.add(cleanUrl(match[0]));
  }

  return [...urls];
}

function extractCaltechSheetUrls(html: string) {
  const decoded = decodeHtmlText(html);
  const candidates = new Set<string>();

  for (const match of decoded.matchAll(/https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/[^"'<>\\\s]+/gi)) {
    candidates.add(cleanUrl(match[0]));
  }

  for (const match of decoded.matchAll(/\burl=([^"'<>\\\s]+)/gi)) {
    try {
      const value = cleanUrl(decodeURIComponent(match[1] ?? ''));
      if (value.includes('docs.google.com/spreadsheets')) candidates.add(value);
    } catch {
      // Ignore non-URL encoded iframe params.
    }
  }

  return [...candidates].filter((url) => url.includes('/pubhtml') && url.includes('gid='));
}

function toCaltechCsvUrl(sheetUrl: string) {
  const decoded = decodeHtmlText(sheetUrl);
  const id = decoded.match(/\/spreadsheets\/d\/e\/([^/]+)\//)?.[1];
  const gid = new URL(decoded).searchParams.get('gid');
  if (!id || !gid) {
    throw new Error(`Could not parse Caltech Google Sheets URL: ${sheetUrl}`);
  }
  return `https://docs.google.com/spreadsheets/d/e/${id}/pub?gid=${gid}&single=true&output=csv`;
}

function parseCaltechCsvMenu(sourceUrl: string, csv: string): CaltechDayMenu | undefined {
  const rows = parseCsvRows(csv).map((row) => row.map((cell) => normalizeWhitespace(cell) ?? ''));
  const heading = rows[0] ?? [];
  const dayName = heading[0];
  const date = parseCaltechDate(heading[2]);
  if (!dayName || !date) return undefined;

  const items: CaltechMenuItem[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const category = row[0];
    const name = row[2] || row[1];
    if (/^allergens:?$/i.test(category)) continue;
    if (!name || /^allergens:?$/i.test(name)) continue;

    const nextRow = rows[index + 1] ?? [];
    const allergenText = normalizeCaltechAllergenText(nextRow);

    items.push({
      category: category || name,
      name,
      allergenText,
    });
  }

  return {
    date,
    dayName,
    sourceUrl,
    items,
  };
}

function normalizeCaltechAllergenText(row: string[]) {
  const hasAllergenLabel = row.some((cell) => /^allergens:?$/i.test(cell));
  if (!hasAllergenLabel) return undefined;
  const value = row.find((cell) => cell && !/^allergens:?$/i.test(cell));
  return normalizeWhitespace(value);
}

function normalizeCaltechItem(
  school: SchoolCoverage,
  day: CaltechDayMenu,
  item: CaltechMenuItem,
  index: number
): NormalizedMenuItem {
  return {
    id: `${school.id}-${day.date}-${index}-${slugify(item.name)}`,
    sourceItemId: `${day.dayName}-${index}`,
    name: item.name,
    normalizedName: item.name.toLowerCase(),
    category: item.category,
    availability: {
      status: 'planned',
      sourceText: `${day.dayName} ${day.date}`,
    },
    dietaryTags: normalizeCaltechDietaryTags(item.category, item.name),
    allergens: normalizeCaltechAllergens(item.allergenText),
    ingredients: [],
    nutrition: [],
    sourceUrl: day.sourceUrl,
    raw: {
      dayName: day.dayName,
      category: item.category,
      allergenText: item.allergenText,
    },
  };
}

function normalizeCaltechDietaryTags(category: string, name: string): DietaryTag[] {
  const value = `${category} ${name}`.toLowerCase();
  const tags = new Set<DietaryTag>();
  if (value.includes('vegan')) tags.add('vegan');
  if (value.includes('vegetarian')) tags.add('vegetarian');
  return [...tags];
}

function normalizeCaltechAllergens(value?: string): AllergenFact[] {
  return splitCommaList(value)
    .map((label) => label.replace(/^allergens:\s*/i, ''))
    .map((label) => normalizeWhitespace(label))
    .filter((label): label is string => Boolean(label))
    .filter((label) => !/^allergens:?$/i.test(label))
    .map((label) => ({
      key: mapAllergenKey(label),
      label,
      status: 'contains' as const,
      sourceText: label,
    }));
}

function parseCaltechDate(value?: string) {
  const match = value?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return undefined;
  const [, month, day, year] = match;
  return `${year}-${month?.padStart(2, '0')}-${day?.padStart(2, '0')}`;
}

function parseCsvRows(csv: string) {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(current);
      rows.push(row);
      row = [];
      current = '';
      continue;
    }

    current += char;
  }

  if (current || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  return rows;
}

function decodeHtmlText(value: string) {
  return value
    .replace(/\\\//g, '/')
    .replace(/\\u0026/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&#61;/g, '=')
    .replace(/&quot;/g, '"');
}

function cleanUrl(value: string) {
  return decodeHtmlText(value).replace(/\\+$/g, '').replace(/[),.;]+$/g, '');
}

async function fetchNmcDiningMenu(
  school: SchoolCoverage,
  query: MenuQuery
): Promise<ProviderFetchResult> {
  const fetchedAt = new Date().toISOString();
  const date = query.date ?? fetchedAt.slice(0, 10);

  try {
    const menuHoursUrl = withDateParam(school.sourceUrl, date);
    const html = await fetchText(menuHoursUrl, 30000);
    const locationLinks = parseNmcLocationLinks(html, school.sourceUrl, date, query.locationId);
    const locations = (
      await mapWithConcurrencyLimit(
        locationLinks.map((location) => () =>
          fetchNmcLocationMenu(school, location, date, query.meal).catch(() => undefined)
        ),
        NMC_LOCATION_CONCURRENCY
      )
    ).filter((location): location is NormalizedMenu['locations'][number] => Boolean(location));

    if (locations.length === 0) {
      return {
        state: 'provider_error',
        provider: school.providerKind,
        sourceUrl: school.sourceUrl,
        reason: 'NMC Dining location pages returned no menu items for the requested date or filters.',
      };
    }

    return {
      state: 'adapter_ready',
      provider: school.providerKind,
      sourceUrl: school.sourceUrl,
      fetchedAt,
      data: {
        schoolId: school.id,
        providerKind: school.providerKind,
        sourceUrl: school.sourceUrl,
        fetchedAt,
        freshnessMinutes: 0,
        locations,
      },
    };
  } catch (error) {
    return {
      state: 'provider_error',
      provider: school.providerKind,
      sourceUrl: school.sourceUrl,
      reason: 'NMC Dining menu fetch failed.',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseNmcLocationLinks(
  html: string,
  sourceUrl: string,
  date: string,
  locationId?: string
): NmcLocationLink[] {
  const $ = load(html);
  const baseUrl = new URL(sourceUrl).origin;
  const locationNeedle = locationId?.toLowerCase();
  const links = new Map<string, NmcLocationLink>();

  $('a.open-now-location-link[href*="/locations/"]').each((_index, element) => {
    const href = $(element).attr('href');
    if (!href) return;

    const url = new URL(href, baseUrl);
    if (url.origin !== baseUrl || !url.pathname.includes('/locations/')) return;
    url.searchParams.set('date', date);

    const id = slugify(url.pathname.split('/').filter(Boolean).at(-1) ?? '');
    const name = normalizeWhitespace($(element).text()) ?? id;
    if (!id || !name) return;
    if (locationNeedle && locationNeedle !== id && locationNeedle !== slugify(name)) return;

    links.set(id, {
      id,
      name,
      url: url.toString(),
      baseUrl,
    });
  });

  return [...links.values()];
}

async function fetchNmcLocationMenu(
  school: SchoolCoverage,
  location: NmcLocationLink,
  date: string,
  meal?: string
): Promise<NormalizedMenu['locations'][number] | undefined> {
  const html = await fetchText(location.url, 30000);
  const $ = load(html);
  const locationName = normalizeWhitespace($('h1').first().text()) ?? location.name;
  const mealNeedle = meal?.toLowerCase();
  const periods: NormalizedMenu['locations'][number]['periods'] = [];
  const itemsToHydrate: NormalizedMenuItem[] = [];

  $('.c-tab').each((_periodIndex, periodElement) => {
    const tabId = $(periodElement).attr('id');
    const periodLabel =
      normalizeWhitespace($(`button[aria-controls="${tabId}"]`).first().text()) ??
      normalizeWhitespace($(periodElement).find('h2, h3').first().text()) ??
      'Menu';
    const { name: periodName, startTime, endTime } = parseNmcPeriodLabel(periodLabel);
    if (mealNeedle && periodName.toLowerCase() !== mealNeedle) return;

    const stations: NormalizedMenu['locations'][number]['periods'][number]['stations'] = [];

    $(periodElement)
      .find('.menu-station')
      .each((_stationIndex, stationElement) => {
        const stationName =
          normalizeWhitespace($(stationElement).find('.toggle-menu-station-data').first().text()) ?? 'Menu';
        const stationId = `${location.id}-${slugify(periodName)}-${slugify(stationName)}`;
        const items: NormalizedMenuItem[] = [];

        $(stationElement)
          .find('.menu-item-li')
          .each((_itemIndex, itemElement) => {
            const item = normalizeNmcItem($, itemElement, {
              school,
              location,
              date,
              periodName,
              stationId,
              stationName,
            });
            if (!item) return;
            items.push(item);
            itemsToHydrate.push(item);
          });

        if (items.length > 0) {
          stations.push({
            id: stationId,
            name: stationName,
            sourceStationId: stationName,
            items,
          });
        }
      });

    if (stations.length > 0) {
      periods.push({
        id: `${location.id}-${slugify(periodName)}`,
        name: periodName,
        sourcePeriodId: periodLabel,
        startTime,
        endTime,
        stations,
      });
    }
  });

  const recipeIds = [...new Set(itemsToHydrate.map((item) => item.sourceItemId).filter((id): id is string => Boolean(id)))];
  const details = await mapWithConcurrencyLimit(
    recipeIds.map((recipeId) => () => getNmcRecipeDetail(location.baseUrl, recipeId).catch(() => undefined)),
    NMC_DETAIL_CONCURRENCY
  );
  const detailByRecipeId = new Map<string, NmcRecipeDetail>();
  recipeIds.forEach((recipeId, index) => {
    const detail = details[index];
    if (detail) detailByRecipeId.set(recipeId, detail);
  });

  for (const item of itemsToHydrate) {
    if (!item.sourceItemId) continue;
    const detail = detailByRecipeId.get(item.sourceItemId);
    if (!detail) continue;

    item.servingSizeText = detail.servingSizeText;
    item.ingredientStatement = detail.ingredientStatement;
    item.ingredients = detail.ingredients;
    item.allergens = mergeAllergenFacts([...item.allergens, ...detail.allergens]);
    item.dietaryTags = mergeDietaryTags([...item.dietaryTags, ...detail.dietaryTags]);
    item.nutrition = detail.nutrition;
  }

  if (itemsToHydrate.length === 0) return undefined;

  return {
    id: location.id,
    name: locationName,
    sourceLocationId: location.id,
    timezone: 'America/New_York',
    date,
    periods,
  };
}

function normalizeNmcItem(
  $: ReturnType<typeof load>,
  itemElement: CheerioElement,
  context: {
    school: SchoolCoverage;
    location: NmcLocationLink;
    date: string;
    periodName: string;
    stationId: string;
    stationName: string;
  }
): NormalizedMenuItem | undefined {
  const itemLink = $(itemElement).find('a.show-nutrition').first();
  const name = normalizeWhitespace(itemLink.text());
  const recipeId = normalizeWhitespace(String(itemLink.attr('data-recipe') ?? ''));
  if (!name || !recipeId) return undefined;

  const classNames = normalizeWhitespace(itemLink.attr('class')) ?? '';
  const searchableText = normalizeWhitespace($(itemElement).attr('data-searchable'));

  return {
    id: `${context.school.id}-${context.location.id}-${slugify(context.periodName)}-${slugify(context.stationName)}-${recipeId}`,
    sourceItemId: recipeId,
    name,
    normalizedName: name.toLowerCase(),
    category: context.stationName,
    stationId: context.stationId,
    stationName: context.stationName,
    availability: { status: 'planned' },
    dietaryTags: normalizeNmcDietaryTags(classNames),
    allergens: normalizeNmcAllergens(classNames),
    ingredientStatement: searchableText,
    ingredients: splitIngredients(searchableText),
    nutrition: [],
    itemUrl: `${context.location.url}#recipe-${recipeId}`,
    sourceUrl: context.location.url,
    raw: {
      recipeId,
      classes: classNames,
    },
  };
}

function getNmcRecipeDetail(baseUrl: string, recipeId: string) {
  const cacheKey = `${baseUrl}:${recipeId}`;
  const cached = nmcRecipeDetailCache.get(cacheKey);
  if (cached) return cached;

  const url = `${baseUrl}/wp-content/themes/nmc_dining/ajax-content/recipe.php?recipe=${encodeURIComponent(
    recipeId
  )}&hide_allergens=0`;
  const promise = fetchJson<NmcRecipeResponse>(url, 30000).then((response) => parseNmcRecipeDetail(response.html ?? ''));
  nmcRecipeDetailCache.set(cacheKey, promise);
  return promise;
}

function parseNmcRecipeDetail(html: string): NmcRecipeDetail {
  const $ = load(html);
  $('style, script').remove();

  const nutrition = normalizeNmcNutrition($);
  const servingSizeText = nutrition.find((fact) => fact.key === 'serving_size')?.sourceText?.replace(/^Serving Size:\s*/i, '');
  const bodyText = normalizeWhitespace($('body').text()) ?? '';
  const ingredientStatement = normalizeNmcIngredientStatement(bodyText);

  return {
    servingSizeText,
    ingredientStatement,
    ingredients: splitIngredients(ingredientStatement),
    allergens: normalizeNmcDetailAllergens(bodyText),
    dietaryTags: normalizeNmcDetailDietaryTags($),
    nutrition,
  };
}

function normalizeNmcNutrition($: ReturnType<typeof load>): NutritionFact[] {
  const facts: NutritionFact[] = [];

  $('.nutrition-facts-table tr, table tr').each((_index, row) => {
    const sourceText = normalizeWhitespace($(row).text());
    if (!sourceText) return;
    const fact = parseNmcNutritionRow(sourceText);
    if (fact) facts.push(fact);
  });

  return facts;
}

function parseNmcNutritionRow(sourceText: string): NutritionFact | undefined {
  const servingMatch = sourceText.match(/^Amount Per Serving\s+(.+)$/i);
  if (servingMatch) {
    const servingSize = normalizeWhitespace(servingMatch[1]);
    return {
      key: 'serving_size',
      label: 'Serving Size',
      sourceText: servingSize ? `Serving Size: ${servingSize}` : sourceText,
    };
  }

  const label = [
    'Total Carbohydrate',
    'Dietary Fiber',
    'Added Sugar',
    'Saturated Fat',
    'Trans Fat',
    'Total Fat',
    'Cholesterol',
    'Vitamin D',
    'Potassium',
    'Calories',
    'Sodium',
    'Sugars',
    'Protein',
    'Calcium',
    'Iron',
  ].find((candidate) => sourceText.toLowerCase().startsWith(candidate.toLowerCase()));
  if (!label) return undefined;

  const valueText = normalizeWhitespace(sourceText.slice(label.length));
  const amount = parseNumber(valueText);
  if (amount === undefined) return undefined;

  return {
    key: mapNutritionKey(label),
    label,
    amount,
    unit: label === 'Calories' ? 'kcal' : mapNmcNutritionUnit(valueText),
    dailyValuePercent: parseDailyValuePercent(valueText?.match(/(\d+(?:\.\d+)?)%/)?.[0]),
    sourceText,
  };
}

function mapNmcNutritionUnit(value?: string): NutritionUnit | undefined {
  const unit = value?.toLowerCase().match(/\b(g|mg|mcg|iu)\b/)?.[1];
  if (unit === 'g') return 'g';
  if (unit === 'mg') return 'mg';
  if (unit === 'mcg') return 'mcg';
  if (unit === 'iu') return 'iu';
  return undefined;
}

function normalizeNmcDetailAllergens(bodyText: string): AllergenFact[] {
  const match = bodyText.match(/Allergens\s+(.+?)\s+Amount Per Serving/i);
  if (!match) return [];
  return splitCommaList(match[1]).map((label) => ({
    key: mapNmcAllergenLabel(label),
    label,
    status: 'contains' as const,
    sourceText: label,
  }));
}

function normalizeNmcDetailDietaryTags($: ReturnType<typeof load>): DietaryTag[] {
  const labels = $('svg title, .recipe-icon-wrap title')
    .toArray()
    .map((element) => normalizeWhitespace($(element).text()))
    .filter((label): label is string => Boolean(label));
  return mergeDietaryTags(labels.flatMap((label) => dietaryTagFromLabel(label)));
}

function normalizeNmcAllergens(classNames: string): AllergenFact[] {
  const facts: AllergenFact[] = [];
  const classSet = new Set(classNames.split(/\s+/));
  const allergenClasses: Array<[string, string]> = [
    ['allergen-has_egg', 'Egg'],
    ['allergen-has_soy', 'Soy'],
    ['allergen-has_wheat', 'Wheat'],
    ['allergen-has_milk', 'Milk'],
    ['allergen-has_fish', 'Fish'],
    ['allergen-has_shellfish', 'Shellfish'],
    ['allergen-has_peanut', 'Peanut'],
    ['allergen-has_tree_nuts', 'Tree Nuts'],
    ['allergen-has_sesame', 'Sesame'],
    ['allergen-has_gluten', 'Gluten'],
  ];

  for (const [className, label] of allergenClasses) {
    if (!classSet.has(className)) continue;
    facts.push({
      key: mapNmcAllergenLabel(label),
      label,
      status: 'contains',
      sourceText: className,
    });
  }

  return facts;
}

function mapNmcAllergenLabel(label: string): AllergenKey {
  const value = label.toLowerCase();
  if (value.includes('shellfish')) return 'crustacean_shellfish';
  if (value.includes('tree nut')) return 'tree_nut';
  if (value.includes('peanut')) return 'peanut';
  if (value.includes('sesame')) return 'sesame';
  if (value.includes('gluten')) return 'gluten';
  if (value.includes('wheat')) return 'wheat';
  if (value.includes('milk')) return 'milk';
  if (value.includes('egg')) return 'egg';
  if (value.includes('fish')) return 'fish';
  if (value.includes('soy')) return 'soy';
  return 'other';
}

function normalizeNmcDietaryTags(classNames: string): DietaryTag[] {
  return mergeDietaryTags(
    classNames
      .split(/\s+/)
      .filter((className) => className.startsWith('prop-'))
      .flatMap((className) => dietaryTagFromLabel(className.replace(/^prop-/, '').replace(/_/g, '-')))
  );
}

function dietaryTagFromLabel(label: string): DietaryTag[] {
  const value = label.toLowerCase().replace(/_/g, '-');
  const tags: DietaryTag[] = [];
  if (value.includes('vegan')) tags.push('vegan');
  if (value.includes('vegetarian')) tags.push('vegetarian');
  if (value.includes('made-without-gluten')) tags.push('made_without_gluten');
  if (value.includes('gluten-free')) tags.push('gluten_free');
  if (value.includes('halal')) tags.push('halal');
  if (value.includes('kosher')) tags.push('kosher');
  if (value.includes('cool-food')) tags.push('low_carbon');
  return tags;
}

function normalizeNmcIngredientStatement(bodyText: string) {
  const match = bodyText.match(
    /Ingredients:\s+(.+?)(?:\s+2,000 calories|\s+Additional nutrition|\s+Additional information|\s+Since we operate|\s+Consumer Advisory|$)/i
  );
  return normalizeIngredientStatement(match?.[1]);
}

function parseNmcPeriodLabel(label: string) {
  const name = normalizeWhitespace(label.replace(/\(.+\)/, '')) ?? label;
  const timeMatch = label.match(/\(([^)]+)\)/);
  const [startTime, endTime] = (timeMatch?.[1] ?? '')
    .split('-')
    .map((part) => normalizeNmcTime(part));
  return { name, startTime, endTime };
}

function normalizeNmcTime(value?: string) {
  const normalized = normalizeWhitespace(value?.toLowerCase());
  if (!normalized) return undefined;
  if (normalized === 'noon') return '12:00';

  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (!match) return undefined;

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? '0');
  const meridian = match[3];
  if (meridian === 'pm' && hour !== 12) hour += 12;
  if (meridian === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function mergeAllergenFacts(allergens: AllergenFact[]) {
  const byKey = new Map<string, AllergenFact>();
  for (const allergen of allergens) {
    byKey.set(`${allergen.key}:${allergen.status}`, allergen);
  }
  return [...byKey.values()];
}

function mergeDietaryTags(tags: DietaryTag[]) {
  return [...new Set(tags)];
}

async function fetchBostonCollegeMenu(
  school: SchoolCoverage,
  query: MenuQuery
): Promise<ProviderFetchResult> {
  const fetchedAt = new Date().toISOString();
  const date = query.date ?? fetchedAt.slice(0, 10);
  const targetServeDate = toBostonCollegeDate(date);

  try {
    const todayRows = await fetchJson<BostonCollegeMenuRow[]>(BOSTON_COLLEGE_TODAY_MENU_URL, 30000);
    let sourceRows = todayRows;
    let sourceUrl = BOSTON_COLLEGE_TODAY_MENU_URL;

    if (!sourceRows.some((row) => normalizeWhitespace(row.Serve_Date) === targetServeDate)) {
      sourceRows = await fetchJson<BostonCollegeMenuRow[]>(BOSTON_COLLEGE_FUTURE_MENU_URL, 30000);
      sourceUrl = BOSTON_COLLEGE_FUTURE_MENU_URL;
    }

    const mealNeedle = query.meal?.toLowerCase();
    const locationNeedle = query.locationId?.toLowerCase();
    const rows = sourceRows.filter((row) => {
      const serveDate = normalizeWhitespace(row.Serve_Date);
      if (serveDate !== targetServeDate) return false;

      const locationId = normalizeWhitespace(row.Location_Number);
      const locationName = normalizeWhitespace(row.Location_Name);
      if (
        locationNeedle &&
        locationNeedle !== locationId?.toLowerCase() &&
        (!locationName || slugify(locationName) !== locationNeedle)
      ) {
        return false;
      }

      const mealName = normalizeBostonCollegeName(row.Meal_Name);
      return !mealNeedle || mealName.toLowerCase() === mealNeedle;
    });

    const locations = normalizeBostonCollegeLocations(school, rows, date, sourceUrl);

    if (locations.length === 0) {
      return {
        state: 'provider_error',
        provider: school.providerKind,
        sourceUrl: school.sourceUrl,
        reason: 'Boston College dining JSON returned no menu items for the requested date or filters.',
      };
    }

    return {
      state: 'adapter_ready',
      provider: school.providerKind,
      sourceUrl: school.sourceUrl,
      fetchedAt,
      data: {
        schoolId: school.id,
        providerKind: school.providerKind,
        sourceUrl: school.sourceUrl,
        fetchedAt,
        freshnessMinutes: 0,
        locations,
      },
    };
  } catch (error) {
    return {
      state: 'provider_error',
      provider: school.providerKind,
      sourceUrl: school.sourceUrl,
      reason: 'Boston College dining JSON menu fetch failed.',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeBostonCollegeLocations(
  school: SchoolCoverage,
  rows: BostonCollegeMenuRow[],
  date: string,
  sourceUrl: string
): NormalizedMenu['locations'] {
  const locationMap = new Map<string, NormalizedMenu['locations'][number]>();
  const periodMaps = new Map<string, Map<string, NormalizedMenu['locations'][number]['periods'][number]>>();
  const stationMaps = new Map<string, Map<string, NormalizedMenu['locations'][number]['periods'][number]['stations'][number]>>();

  for (const row of rows) {
    const item = normalizeBostonCollegeItem(school, row, date, sourceUrl);
    if (!item) continue;

    const locationName = normalizeWhitespace(row.Location_Name) ?? 'Boston College Dining';
    const locationId = normalizeWhitespace(row.Location_Number) ?? slugify(locationName);
    const periodName = normalizeBostonCollegeName(row.Meal_Name);
    const periodId = normalizeWhitespace(row.Meal_Number) ?? slugify(periodName);
    const stationName = normalizeWhitespace(row.Menu_Category_Name) ?? 'Menu';
    const stationId = normalizeWhitespace(row.Menu_Category_Number) ?? slugify(stationName);

    let location = locationMap.get(locationId);
    if (!location) {
      location = {
        id: locationId,
        name: locationName,
        sourceLocationId: locationId,
        timezone: 'America/New_York',
        date,
        periods: [],
      };
      locationMap.set(locationId, location);
      periodMaps.set(locationId, new Map());
      stationMaps.set(locationId, new Map());
    }

    const locationPeriodMap = periodMaps.get(locationId)!;
    const periodKey = `${locationId}:${periodId}`;
    let period = locationPeriodMap.get(periodKey);
    if (!period) {
      period = {
        id: `${locationId}-${slugify(periodName)}`,
        name: periodName,
        sourcePeriodId: periodId,
        stations: [],
      };
      location.periods.push(period);
      locationPeriodMap.set(periodKey, period);
    }

    const locationStationMap = stationMaps.get(locationId)!;
    const stationKey = `${periodKey}:${stationId}`;
    let station = locationStationMap.get(stationKey);
    if (!station) {
      station = {
        id: `${locationId}-${slugify(periodName)}-${slugify(stationName)}`,
        name: stationName,
        sourceStationId: stationId,
        items: [],
      };
      period.stations.push(station);
      locationStationMap.set(stationKey, station);
    }

    station.items.push(item);
  }

  return [...locationMap.values()].filter((location) =>
    location.periods.some((period) => period.stations.some((station) => station.items.length > 0))
  );
}

function normalizeBostonCollegeItem(
  school: SchoolCoverage,
  row: BostonCollegeMenuRow,
  date: string,
  sourceUrl: string
): NormalizedMenuItem | undefined {
  const name = normalizeWhitespace(row.Recipe_Print_As_Name) ?? normalizeWhitespace(row.Recipe_Name);
  if (!name) return undefined;

  const locationId = normalizeWhitespace(row.Location_Number) ?? 'bc';
  const periodName = normalizeBostonCollegeName(row.Meal_Name);
  const stationName = normalizeWhitespace(row.Menu_Category_Name) ?? 'Menu';
  const stationId = `${locationId}-${slugify(periodName)}-${slugify(stationName)}`;
  const sourceItemId = [
    locationId,
    row.Meal_Number,
    row.Menu_Category_Number,
    row.Recipe_Number,
    row.ID,
    date,
  ]
    .filter(Boolean)
    .join('-');
  const ingredientStatement = normalizeBostonCollegeIngredientStatement(row.Ingredient_List);

  return {
    id: `${school.id}-${slugify(sourceItemId || `${locationId}-${periodName}-${stationName}-${name}`)}`,
    sourceItemId: sourceItemId || undefined,
    name,
    normalizedName: name.toLowerCase(),
    category: stationName,
    stationId,
    stationName,
    servingSizeText: normalizeWhitespace(row.Serving_Size),
    price: normalizeBostonCollegePrice(row.Selling_Price),
    availability: { status: 'planned' },
    dietaryTags: normalizeBostonCollegeDietaryTags(row),
    allergens: normalizeBostonCollegeAllergens(row.Allergens),
    ingredientStatement,
    ingredients: splitIngredients(ingredientStatement),
    nutrition: normalizeBostonCollegeNutrition(row),
    sourceUrl,
    raw: {
      id: row.ID,
      serveDate: row.Serve_Date,
      mealNumber: row.Meal_Number,
      locationNumber: row.Location_Number,
      menuCategoryNumber: row.Menu_Category_Number,
      recipeNumber: row.Recipe_Number,
      webCodes: row.Recipe_Web_Codes,
      webCodeNames: row.web_codes_fullnames,
    },
  };
}

function normalizeBostonCollegeNutrition(row: BostonCollegeMenuRow): NutritionFact[] {
  const facts: NutritionFact[] = [];
  const servingSize = normalizeWhitespace(row.Serving_Size);
  if (servingSize) {
    facts.push({
      key: 'serving_size',
      label: 'Serving Size',
      sourceText: `Serving Size: ${servingSize}`,
    });
  }

  facts.push(
    ...[
      makeBostonCollegeNutritionFact('servings_per_container', 'Servings Per Container', row.Servings_Per_Container, undefined, 'count'),
      makeBostonCollegeNutritionFact('calories', 'Calories', row.Calories, undefined, 'kcal'),
      makeBostonCollegeNutritionFact('total_fat', 'Total Fat', row.Total_Fat, row.Total_Fat_DV),
      makeBostonCollegeNutritionFact('saturated_fat', 'Saturated Fat', row.Sat_Fat, row.Sat_Fat_DV),
      makeBostonCollegeNutritionFact('trans_fat', 'Trans Fat', row.Trans_Fat),
      makeBostonCollegeNutritionFact('cholesterol', 'Cholesterol', row.Cholesterol, row.Cholesterol_DV),
      makeBostonCollegeNutritionFact('sodium', 'Sodium', row.Sodium, row.Sodium_DV),
      makeBostonCollegeNutritionFact('total_carbohydrate', 'Total Carbohydrate', row.Total_Carb, row.Total_Carb_DV),
      makeBostonCollegeNutritionFact('dietary_fiber', 'Dietary Fiber', row.Dietary_Fiber, row.Dietary_Fiber_DV),
      makeBostonCollegeNutritionFact('total_sugars', 'Total Sugars', row.Sugars),
      makeBostonCollegeNutritionFact('added_sugars', 'Added Sugars', row.Added_Sugar),
      makeBostonCollegeNutritionFact('protein', 'Protein', row.Protein, row.Protein_DV),
      makeBostonCollegeNutritionFact('vitamin_d', 'Vitamin D', row.Vitamin_D, row.Vitamin_D_DV),
      makeBostonCollegeNutritionFact('calcium', 'Calcium', row.Calcium, row.Calcium_DV),
      makeBostonCollegeNutritionFact('iron', 'Iron', row.Iron, row.Iron_DV),
      makeBostonCollegeNutritionFact('potassium', 'Potassium', row.Potassium, row.Potassium_DV),
      makeBostonCollegeNutritionFact('other', 'Vitamin A', row.Vitamin_A, row.Vitamin_A_DV),
      makeBostonCollegeNutritionFact('other', 'Vitamin C', row.Vitamin_C, row.Vitamin_C_DV),
    ].filter((fact): fact is NutritionFact => Boolean(fact))
  );

  return facts;
}

function makeBostonCollegeNutritionFact(
  key: NutritionKey,
  label: string,
  value?: string,
  dailyValue?: string,
  defaultUnit?: NutritionUnit
): NutritionFact | undefined {
  const sourceValue = normalizeWhitespace(value);
  if (!sourceValue) return undefined;

  const amount = parseNumber(sourceValue);
  const unit = defaultUnit ?? mapBostonCollegeNutritionUnit(sourceValue);

  return {
    key,
    label,
    amount,
    unit,
    dailyValuePercent: parseDailyValuePercent(dailyValue),
    sourceText: `${label}: ${sourceValue}`,
  };
}

function mapBostonCollegeNutritionUnit(value: string): NutritionUnit | undefined {
  const match = value.toLowerCase().match(/[a-z%]+$/);
  const unit = match?.[0];
  if (!unit) return undefined;
  if (unit === 'g') return 'g';
  if (unit === 'mg') return 'mg';
  if (unit === 'mcg') return 'mcg';
  if (unit === 'iu') return 'iu';
  if (unit === '%') return 'percent_daily_value';
  return 'other';
}

function normalizeBostonCollegeAllergens(value?: string): AllergenFact[] {
  const facts = new Map<string, AllergenFact>();
  const labels = splitCommaList(value);

  for (const label of labels) {
    const key = mapBostonCollegeAllergenKey(label);
    facts.set(key, {
      key,
      label,
      status: 'contains',
      sourceText: label,
    });
  }

  return [...facts.values()];
}

function mapBostonCollegeAllergenKey(label: string): AllergenKey {
  const value = label.toLowerCase();
  if (value.includes('shellfish')) return 'crustacean_shellfish';
  if (value.includes('tree nut')) return 'tree_nut';
  if (value.includes('peanut')) return 'peanut';
  if (value.includes('soy')) return 'soy';
  if (value.includes('sesame')) return 'sesame';
  if (value.includes('gluten')) return 'gluten';
  if (value.includes('wheat')) return 'wheat';
  if (value.includes('milk')) return 'milk';
  if (value.includes('egg')) return 'egg';
  if (value.includes('fish')) return 'fish';
  return 'other';
}

function normalizeBostonCollegeDietaryTags(row: BostonCollegeMenuRow): DietaryTag[] {
  const tags = new Set<DietaryTag>();
  const labels = [
    ...splitSpaceList(row.Recipe_Web_Codes),
    ...splitCommaList(row.web_codes_fullnames),
    ...splitCommaList(row.web_codes_display_2),
    ...splitCommaList(row.web_codes_display_3),
  ];

  for (const label of labels) {
    const value = label.toLowerCase();
    if (value === 'vgn' || value === 'vn' || value.includes('vegan')) tags.add('vegan');
    if (value === 'vgt' || value === 'vg' || value.includes('vegetarian')) tags.add('vegetarian');
    if (value === 'gf' || value.includes('gluten friendly') || value.includes('made without gluten')) {
      tags.add('made_without_gluten');
    }
    if (value.includes('gluten free')) tags.add('gluten_free');
    if (value.includes('halal')) tags.add('halal');
    if (value.includes('kosher')) tags.add('kosher');
  }

  return [...tags];
}

function normalizeBostonCollegeIngredientStatement(value?: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return undefined;

  const decoded = stripHtmlText(stripHtmlText(normalized));
  return normalizeIngredientStatement(decoded);
}

function stripHtmlText(value: string) {
  return load(`<div>${value}</div>`).root().text().replace(/\uFFFD/g, "'");
}

function normalizeBostonCollegePrice(value?: string) {
  const displayText = normalizeWhitespace(value);
  if (!displayText) return undefined;
  const amount = parseNumber(displayText);
  return {
    amount,
    currency: 'USD' as const,
    displayText: displayText.startsWith('$') ? displayText : `$${displayText}`,
  };
}

function normalizeBostonCollegeName(value?: string) {
  const normalized = normalizeWhitespace(value)?.toLowerCase();
  if (!normalized) return 'Menu';
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toBostonCollegeDate(date: string) {
  const [year, month, day] = date.split('-');
  return `${month}/${day}/${year}`;
}

async function fetchBostonUniversityMenu(
  school: SchoolCoverage,
  query: MenuQuery
): Promise<ProviderFetchResult> {
  const fetchedAt = new Date().toISOString();
  const date = query.date ?? fetchedAt.slice(0, 10);
  const locationNeedle = query.locationId?.toLowerCase();
  const candidateLocations = BOSTON_UNIVERSITY_LOCATIONS.filter((location) => {
    if (!locationNeedle) return true;
    return (
      location.id === locationNeedle ||
      slugify(location.name).includes(locationNeedle) ||
      location.name.toLowerCase().includes(locationNeedle)
    );
  });

  try {
    const locations = await mapWithConcurrencyLimit(
      candidateLocations.map((location) => () =>
        fetchBostonUniversityLocationMenu(location, school, date, query.meal)
      ),
      BOSTON_UNIVERSITY_LOCATION_CONCURRENCY
    );
    const activeLocations = locations.filter((location) =>
      location.periods.some((period) => period.stations.some((station) => station.items.length > 0))
    );

    if (activeLocations.length === 0) {
      return {
        state: 'provider_error',
        provider: school.providerKind,
        sourceUrl: school.sourceUrl,
        reason: 'Boston University dining pages returned no menu items for the requested date or filters.',
      };
    }

    return {
      state: 'adapter_ready',
      provider: school.providerKind,
      sourceUrl: school.sourceUrl,
      fetchedAt,
      data: {
        schoolId: school.id,
        providerKind: school.providerKind,
        sourceUrl: school.sourceUrl,
        fetchedAt,
        freshnessMinutes: 0,
        locations: activeLocations,
      },
    };
  } catch (error) {
    return {
      state: 'provider_error',
      provider: school.providerKind,
      sourceUrl: school.sourceUrl,
      reason: 'Boston University dining page fetch failed.',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchBostonUniversityLocationMenu(
  location: BostonUniversityLocation,
  school: SchoolCoverage,
  date: string,
  meal?: string
): Promise<NormalizedMenu['locations'][number]> {
  const html = await fetchText(location.url, 45000);
  const $ = load(html);
  const periods: NormalizedMenu['locations'][number]['periods'] = [];
  const mealNeedle = meal?.toLowerCase();

  $(`.js-menu-bydate[data-menudate="${date}"] > li.menu-meal-period`).each((_periodIndex, periodElement) => {
    const period = normalizeBostonUniversityPeriod($, periodElement, location, school, mealNeedle);
    if (period?.stations.some((station) => station.items.length > 0)) {
      periods.push(period);
    }
  });

  return {
    id: location.id,
    name: location.name,
    sourceLocationId: location.id,
    timezone: 'America/New_York',
    date,
    periods,
  };
}

function normalizeBostonUniversityPeriod(
  $: ReturnType<typeof load>,
  periodElement: CheerioElement,
  location: BostonUniversityLocation,
  school: SchoolCoverage,
  mealNeedle?: string
) {
  const $period = $(periodElement);
  const periodName = normalizeWhitespace($period.find('.js-meal-period-name').first().text()) ?? 'Menu';
  if (mealNeedle && !periodName.toLowerCase().includes(mealNeedle)) return undefined;

  const periodSlug = $period.find('.js-meal-period-name').first().attr('data-meal-period-slug') ?? slugify(periodName);
  const timeRange = parseBostonUniversityTimeRange(
    normalizeWhitespace($period.find('.js-meal-period-times').first().text())
  );
  const stationMap = new Map<string, NormalizedMenu['locations'][number]['periods'][number]['stations'][number]>();

  $period.find('> ol.menu-dishes > li.menu-item').each((itemIndex, itemElement) => {
    const item = normalizeBostonUniversityItem(
      $,
      itemElement,
      school,
      location,
      periodSlug,
      periodName,
      itemIndex,
      timeRange
    );
    if (!item) return;

    const stationKey = item.stationId ?? slugify(item.stationName ?? 'Menu');
    let station = stationMap.get(stationKey);
    if (!station) {
      station = {
        id: stationKey,
        name: item.stationName ?? 'Menu',
        sourceStationId: item.stationName,
        items: [],
      };
      stationMap.set(stationKey, station);
    }
    station.items.push(item);
  });

  return {
    id: `${location.id}-${periodSlug}`,
    name: periodName,
    sourcePeriodId: periodSlug,
    startTime: timeRange.startTime,
    endTime: timeRange.endTime,
    stations: [...stationMap.values()],
  };
}

function normalizeBostonUniversityItem(
  $: ReturnType<typeof load>,
  itemElement: CheerioElement,
  school: SchoolCoverage,
  location: BostonUniversityLocation,
  periodSlug: string,
  periodName: string,
  itemIndex: number,
  timeRange: { startTime?: string; endTime?: string; sourceText?: string }
): NormalizedMenuItem | undefined {
  const $item = $(itemElement);
  const wrapper = $item.find('> .menu-item-wrapper').first();
  const name = normalizeWhitespace(wrapper.find('.menu-item-title').first().text());
  if (!name) return undefined;

  const stationName = normalizeWhitespace(wrapper.find('.js-sortby-station').first().text()) ?? 'Menu';
  const stationId = `${location.id}-${periodSlug}-${slugify(stationName) || 'menu'}`;
  const facts = $item.find('> .nutrition-facts').first();
  const servingSizeText = normalizeBostonUniversityServingSize(
    normalizeWhitespace(facts.find('.nutrition-serving-size').first().text())
  );
  const ingredientStatement = normalizeBostonUniversityIngredientStatement(
    normalizeWhitespace(facts.find('.nutrition-facts-ingredients').first().text())
  );
  const sourceItemId =
    normalizeWhitespace(wrapper.attr('data-menu-id')) ??
    `${location.id}-${periodSlug}-${slugify(stationName)}-${slugify(name)}-${itemIndex}`;

  return {
    id: `${school.id}-${slugify(sourceItemId)}`,
    sourceItemId,
    name,
    normalizedName: name.toLowerCase(),
    description: normalizeWhitespace(wrapper.find('.menu-description').first().text()),
    category: stationName,
    stationId,
    stationName,
    servingSizeText,
    availability: {
      status: 'planned',
      startTime: timeRange.startTime,
      endTime: timeRange.endTime,
      sourceText: timeRange.sourceText,
    },
    dietaryTags: normalizeBostonUniversityDietaryTags(
      wrapper
        .find('.menu-item-dietary-restriction li')
        .toArray()
        .map((element) => normalizeWhitespace($(element).text()))
        .filter((label): label is string => Boolean(label))
    ),
    allergens: normalizeBostonUniversityAllergens(
      facts
        .find('.nutrition-facts-allergens li')
        .toArray()
        .map((element) => normalizeWhitespace($(element).text()))
        .filter((label): label is string => Boolean(label))
    ),
    ingredientStatement,
    ingredients: splitIngredients(ingredientStatement),
    nutrition: normalizeBostonUniversityNutrition($, facts.get(0), servingSizeText),
    sourceUrl: location.url,
    raw: {
      locationId: location.id,
      periodName,
      periodSlug,
      stationName,
    },
  };
}

function normalizeBostonUniversityNutrition(
  $: ReturnType<typeof load>,
  factsElement?: CheerioElement,
  servingSizeText?: string
): NutritionFact[] {
  const nutrition: NutritionFact[] = [];
  if (servingSizeText) {
    nutrition.push({
      key: 'serving_size',
      label: 'Serving Size',
      sourceText: `Serving Size: ${servingSizeText}`,
    });
  }
  if (!factsElement) return nutrition;

  const facts = $(factsElement);
  facts.find('table.nutrition-label tbody tr').each((_index, row) => {
    const label = normalizeWhitespace($(row).find('.nutrition-label-nutrient').first().text());
    const amountText = normalizeWhitespace($(row).find('.nutrition-label-amount').first().text());
    if (!label || !amountText) return;
    const fact = makeHtmlNutritionFact(label, amountText, normalizeWhitespace($(row).find('.nutrition-label-percentage').first().text()));
    if (fact) nutrition.push(fact);
  });

  facts.find('table.nutrition-vitamins tbody tr').each((_index, row) => {
    const label = normalizeWhitespace($(row).find('.nutrition-label-nutrient').first().text());
    const dailyValuePercent = parseDailyValuePercent(
      normalizeWhitespace($(row).find('.nutrition-label-percentage').first().text())
    );
    if (!label || dailyValuePercent === undefined) return;
    nutrition.push({
      key: mapNutritionKey(label),
      label,
      unit: 'percent_daily_value',
      dailyValuePercent,
      sourceText: `${label}: ${dailyValuePercent}% DV`,
    });
  });

  return mergeNutritionFacts(nutrition);
}

function normalizeBostonUniversityServingSize(value?: string) {
  return normalizeWhitespace(value?.replace(/^serving size\s*/i, ''));
}

function normalizeBostonUniversityIngredientStatement(value?: string) {
  return normalizeIngredientStatement(value?.replace(/^ingredients:\s*/i, ''));
}

function normalizeBostonUniversityDietaryTags(labels: string[]): DietaryTag[] {
  return normalizeUclaDietaryTags(labels);
}

function normalizeBostonUniversityAllergens(labels: string[]): AllergenFact[] {
  return normalizeUclaAllergens(labels);
}

function parseBostonUniversityTimeRange(value?: string) {
  const [rawStart, rawEnd] = value?.split(/\s*-\s*/) ?? [];
  return {
    startTime: normalizeNmcTime(rawStart),
    endTime: normalizeNmcTime(rawEnd),
    sourceText: value,
  };
}

async function fetchUclaMenu(
  school: SchoolCoverage,
  query: MenuQuery
): Promise<ProviderFetchResult> {
  const fetchedAt = new Date().toISOString();
  const date = query.date ?? fetchedAt.slice(0, 10);
  const sourceUrl = withDateParam(UCLA_MENUS_AT_GLANCE_URL, date);

  try {
    const html = await fetchText(sourceUrl, 30000);
    const seeds = parseUclaItemSeeds(html, query, date);
    if (seeds.length === 0) {
      return {
        state: 'provider_error',
        provider: school.providerKind,
        sourceUrl: school.sourceUrl,
        reason: 'UCLA at-a-glance page returned no menu items for the requested date or filters.',
      };
    }

    const itemResults = await mapWithConcurrencyLimit(
      seeds.map((seed) => async () => ({
        seed,
        detail: await getUclaRecipeDetail(seed.itemUrl).catch(() => emptyUclaRecipeDetail()),
      })),
      UCLA_DETAIL_CONCURRENCY
    );
    const locations = normalizeUclaLocations(school, date, itemResults);

    return {
      state: 'adapter_ready',
      provider: school.providerKind,
      sourceUrl: school.sourceUrl,
      fetchedAt,
      data: {
        schoolId: school.id,
        providerKind: school.providerKind,
        sourceUrl,
        fetchedAt,
        freshnessMinutes: 0,
        locations,
      },
    };
  } catch (error) {
    return {
      state: 'provider_error',
      provider: school.providerKind,
      sourceUrl: school.sourceUrl,
      reason: 'UCLA dining menu page fetch failed.',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseUclaItemSeeds(html: string, query: MenuQuery, date: string): UclaItemSeed[] {
  const $ = load(html);
  const mealNeedle = query.meal?.toLowerCase();
  const locationNeedle = query.locationId?.toLowerCase();
  const seeds: UclaItemSeed[] = [];

  $('.at-a-glance-menu').each((_menuIndex, menuElement) => {
    const $menu = $(menuElement);
    const periodId = normalizeWhitespace($menu.attr('id')?.replace(/menu$/i, '')) ?? 'menu';
    const periodName = normalizeUclaPeriodName(periodId, $menu.children('h2').first().text());
    if (mealNeedle && !periodName.toLowerCase().includes(mealNeedle)) return;

    $menu.find('.at-a-glance-menu__dining-location').each((_locationIndex, locationElement) => {
      const $location = $(locationElement);
      const locationName = normalizeWhitespace($location.find('h3').first().text()) ?? 'UCLA Dining';
      const locationId = slugify(locationName);
      if (
        locationNeedle &&
        locationNeedle !== locationId &&
        !locationName.toLowerCase().includes(locationNeedle)
      ) {
        return;
      }

      $location.find('.at-a-glance-menu__meal-station').each((_stationIndex, stationElement) => {
        const $station = $(stationElement);
        const stationName = normalizeWhitespace($station.find('h4').first().text()) ?? 'Menu';
        const stationId = `${locationId}-${periodId}-${slugify(stationName) || 'menu'}`;

        $station.find('li').each((_itemIndex, itemElement) => {
          const $item = $(itemElement);
          const link = $item.find('a[href*="recipe="]').first();
          const href = normalizeWhitespace(link.attr('href'));
          const name = normalizeWhitespace(link.text());
          if (!href || !name) return;

          const itemUrl = new URL(href, UCLA_BASE_URL).toString();
          const sourceItemId = new URL(itemUrl).searchParams.get('recipe') ?? `${date}-${locationId}-${periodId}-${stationId}-${name}`;
          const iconLabels = $item
            .find('img.meal-station__allergen-icon')
            .toArray()
            .map((element) => normalizeWhitespace($(element).attr('alt')) ?? normalizeWhitespace($(element).attr('title')))
            .filter((label): label is string => Boolean(label));

          seeds.push({
            sourceItemId,
            name,
            itemUrl,
            locationId,
            locationName,
            periodId,
            periodName,
            stationId,
            stationName,
            iconLabels,
          });
        });
      });
    });
  });

  return seeds;
}

function normalizeUclaLocations(
  school: SchoolCoverage,
  date: string,
  itemResults: Array<{ seed: UclaItemSeed; detail: UclaRecipeDetail }>
): NormalizedMenu['locations'] {
  const locationMap = new Map<string, NormalizedMenu['locations'][number]>();
  const periodMaps = new Map<string, Map<string, NormalizedMenu['locations'][number]['periods'][number]>>();
  const stationMaps = new Map<string, Map<string, NormalizedMenu['locations'][number]['periods'][number]['stations'][number]>>();

  for (const { seed, detail } of itemResults) {
    let location = locationMap.get(seed.locationId);
    if (!location) {
      location = {
        id: seed.locationId,
        name: seed.locationName,
        sourceLocationId: seed.locationId,
        timezone: 'America/Los_Angeles',
        date,
        periods: [],
      };
      locationMap.set(seed.locationId, location);
      periodMaps.set(seed.locationId, new Map());
      stationMaps.set(seed.locationId, new Map());
    }

    const locationPeriodMap = periodMaps.get(seed.locationId)!;
    let period = locationPeriodMap.get(seed.periodId);
    if (!period) {
      period = {
        id: `${seed.locationId}-${seed.periodId}`,
        name: seed.periodName,
        sourcePeriodId: seed.periodId,
        stations: [],
      };
      location.periods.push(period);
      locationPeriodMap.set(seed.periodId, period);
    }

    const locationStationMap = stationMaps.get(seed.locationId)!;
    const stationKey = `${seed.periodId}:${seed.stationId}`;
    let station = locationStationMap.get(stationKey);
    if (!station) {
      station = {
        id: seed.stationId,
        name: seed.stationName,
        sourceStationId: seed.stationName,
        items: [],
      };
      period.stations.push(station);
      locationStationMap.set(stationKey, station);
    }

    station.items.push(normalizeUclaItem(school, seed, detail));
  }

  return [...locationMap.values()].filter((location) =>
    location.periods.some((period) => period.stations.some((station) => station.items.length > 0))
  );
}

function normalizeUclaItem(
  school: SchoolCoverage,
  seed: UclaItemSeed,
  detail: UclaRecipeDetail
): NormalizedMenuItem {
  const name = detail.name ?? seed.name;
  return {
    id: `${school.id}-${seed.locationId}-${seed.periodId}-${seed.stationId}-${seed.sourceItemId}`,
    sourceItemId: seed.sourceItemId,
    name,
    normalizedName: name.toLowerCase(),
    description: detail.description,
    category: seed.stationName,
    stationId: seed.stationId,
    stationName: seed.stationName,
    servingSizeText: detail.servingSizeText,
    availability: { status: 'planned' },
    dietaryTags: mergeDietaryTags([
      ...normalizeUclaDietaryTags(seed.iconLabels),
      ...detail.dietaryTags,
    ]),
    allergens: mergeAllergens([
      ...normalizeUclaAllergens(seed.iconLabels),
      ...detail.allergens,
    ]),
    ingredientStatement: detail.ingredientStatement,
    ingredients: detail.ingredients,
    nutrition: detail.nutrition,
    itemUrl: seed.itemUrl,
    sourceUrl: seed.itemUrl,
    raw: {
      locationName: seed.locationName,
      periodName: seed.periodName,
      stationName: seed.stationName,
      iconLabels: seed.iconLabels,
    },
  };
}

async function getUclaRecipeDetail(itemUrl: string) {
  const existing = uclaRecipeDetailCache.get(itemUrl);
  if (existing) return existing;

  const promise = fetchText(itemUrl, 30000).then(parseUclaRecipeDetail);
  uclaRecipeDetailCache.set(itemUrl, promise);
  return promise;
}

function parseUclaRecipeDetail(html: string): UclaRecipeDetail {
  const $ = load(html);
  const nutritionRoot = $('#nutrition');
  const ingredientRoot = $('#ingredient_list');
  const metadataLabels = $('.single-metadata-item-wrapper')
    .toArray()
    .flatMap((element) => [
      normalizeWhitespace($(element).text()),
      normalizeWhitespace($(element).find('img').first().attr('alt')),
    ])
    .filter((label): label is string => Boolean(label));
  const ingredientNames = ingredientRoot
    .find('ul.nolispace > li')
    .toArray()
    .map((element) => normalizeWhitespace($(element).text()))
    .filter((ingredient): ingredient is string => Boolean(ingredient));
  const ingredientStatement = normalizeIngredientStatement(ingredientNames.join(', '));
  const allergenStatementLabels = parseUclaAllergenStatement(ingredientRoot.text());

  return {
    name: normalizeWhitespace($('.single-name').first().text()),
    description: normalizeWhitespace($('.single-description').first().text()),
    servingSizeText: parseUclaServingSize(nutritionRoot.text()),
    ingredientStatement,
    ingredients: splitIngredients(ingredientStatement),
    allergens: normalizeUclaAllergens([...metadataLabels, ...allergenStatementLabels]),
    dietaryTags: normalizeUclaDietaryTags(metadataLabels),
    nutrition: normalizeUclaNutrition($, nutritionRoot.get(0)),
  };
}

function normalizeUclaNutrition(
  $: ReturnType<typeof load>,
  nutritionElement?: CheerioElement
): NutritionFact[] {
  const nutrition: NutritionFact[] = [];
  if (!nutritionElement) return nutrition;

  const root = $(nutritionElement);
  const servingSizeText = parseUclaServingSize(root.text());
  if (servingSizeText) {
    nutrition.push({
      key: 'serving_size',
      label: 'Serving Size',
      sourceText: `Serving Size: ${servingSizeText}`,
    });
  }

  const calories = parseNumber(root.find('.single-calories').first().clone().children('span').remove().end().text());
  if (calories !== undefined) {
    nutrition.push({
      key: 'calories',
      label: 'Calories',
      amount: calories,
      unit: 'kcal',
      sourceText: `Calories: ${calories}`,
    });
  }

  root.find('table.nutritive-table tbody tr').each((_rowIndex, row) => {
    const cells = $(row).find('td').toArray();
    for (let index = 0; index < cells.length; index += 2) {
      const label = normalizeWhitespace($(cells[index]).find('span').first().text());
      if (!label) continue;
      const amountText = normalizeWhitespace($(cells[index]).clone().children('span').remove().end().text());
      const dailyValueText = normalizeWhitespace($(cells[index + 1]).text());
      const fact = makeHtmlNutritionFact(label, amountText, dailyValueText);
      if (fact) nutrition.push(fact);
    }
  });

  return mergeNutritionFacts(nutrition);
}

function parseUclaServingSize(value?: string) {
  const match = normalizeWhitespace(value)?.match(/Serving Size:\s*(.+?)\s*(?:Calories|$)/i);
  return normalizeWhitespace(match?.[1]);
}

function parseUclaAllergenStatement(value?: string) {
  const normalized = normalizeWhitespace(value);
  const match = normalized?.match(/Allergens\*?:\s*(.+?)(?:\* If|Please be advised|$)/i);
  if (!match) return [];
  return splitCommaList(match[1]);
}

function normalizeUclaDietaryTags(labels: string[]): DietaryTag[] {
  const tags = new Set<DietaryTag>();
  for (const label of labels) {
    const value = label.toLowerCase();
    if (value.includes('vegan')) tags.add('vegan');
    else if (value.includes('vegetarian')) tags.add('vegetarian');
    else if (value.includes('halal')) tags.add('halal');
    else if (value.includes('kosher')) tags.add('kosher');
    else if (value.includes('low-carbon') || value.includes('low carbon')) tags.add('low_carbon');
    else if (value.includes('gluten free') || value.includes('gluten-free')) tags.add('gluten_free');
  }
  return [...tags];
}

function normalizeUclaAllergens(labels: string[]): AllergenFact[] {
  const facts = labels
    .map((label) => normalizeWhitespace(label?.replace(/^contains\s+/i, '')))
    .filter((label): label is string => Boolean(label))
    .map((label) => ({
      key: mapUclaAllergenKey(label),
      label,
      status: 'contains' as const,
      sourceText: label,
    }))
    .filter((fact) => fact.key !== 'other');
  return mergeAllergensByKey(facts);
}

function mapUclaAllergenKey(label: string): AllergenKey {
  const value = label.toLowerCase().replace(/[-_]+/g, ' ');
  if (value.includes('dairy') || value.includes('milk')) return 'milk';
  if (value.includes('egg')) return 'egg';
  if (value.includes('crustacean') || value.includes('shellfish')) return 'crustacean_shellfish';
  if (value.includes('fish')) return 'fish';
  if (value.includes('tree nut')) return 'tree_nut';
  if (value.includes('peanut')) return 'peanut';
  if (value.includes('wheat')) return 'wheat';
  if (value.includes('soy')) return 'soy';
  if (value.includes('sesame')) return 'sesame';
  if (value.includes('gluten')) return 'gluten';
  return 'other';
}

function normalizeUclaPeriodName(periodId: string, heading?: string) {
  const value = normalizeWhitespace(heading)?.toLowerCase() ?? periodId.toLowerCase();
  if (value.includes('breakfast')) return 'Breakfast';
  if (value.includes('lunch')) return 'Lunch';
  if (value.includes('dinner')) return 'Dinner';
  return periodId.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function emptyUclaRecipeDetail(): UclaRecipeDetail {
  return {
    ingredients: [],
    allergens: [],
    dietaryTags: [],
    nutrition: [],
  };
}

function makeHtmlNutritionFact(
  label: string,
  amountText?: string,
  dailyValueText?: string
): NutritionFact | undefined {
  const sourceAmount = normalizeWhitespace(amountText);
  const dailyValuePercent = parseDailyValuePercent(dailyValueText);
  if (!sourceAmount && dailyValuePercent === undefined) return undefined;

  const parsed = parseNutritionAmountUnit(sourceAmount);
  const key = mapNutritionKey(label);
  return {
    key,
    label,
    amount: parsed.amount,
    unit: key === 'calories' ? 'kcal' : parsed.unit,
    dailyValuePercent,
    sourceText: `${label}: ${sourceAmount ?? ''}`.trim(),
  };
}

function parseNutritionAmountUnit(value?: string): { amount?: number; unit?: NutritionUnit } {
  const match = value?.match(/(-?\d+(?:\.\d+)?)\s*([A-Za-zµ%]+)?/);
  if (!match) return {};
  const amount = Number(match[1]);
  return {
    amount: Number.isFinite(amount) ? amount : undefined,
    unit: mapNutritionUnit(match[2]),
  };
}

function mergeNutritionFacts(nutrition: NutritionFact[]) {
  const byKey = new Map<string, NutritionFact>();
  for (const fact of nutrition) {
    byKey.set(`${fact.key}:${fact.label}`, fact);
  }
  return [...byKey.values()];
}

function mergeAllergensByKey(allergens: AllergenFact[]) {
  const byKey = new Map<string, AllergenFact>();
  for (const allergen of allergens) {
    byKey.set(`${allergen.key}:${allergen.status}`, allergen);
  }
  return [...byKey.values()];
}

async function fetchUcDavisMenu(
  school: SchoolCoverage,
  query: MenuQuery
): Promise<ProviderFetchResult> {
  const fetchedAt = new Date().toISOString();
  const date = query.date ?? fetchedAt.slice(0, 10);
  const locationNeedle = query.locationId ? slugify(query.locationId) : undefined;
  const locationsToFetch = UC_DAVIS_LOCATIONS.filter(
    (location) =>
      !locationNeedle ||
      location.id === locationNeedle ||
      slugify(location.name) === locationNeedle
  );

  try {
    const locations = (
      await mapWithConcurrencyLimit(
        locationsToFetch.map((location) => () => fetchUcDavisLocationMenu(school, location, date, query.meal)),
        UC_DAVIS_LOCATION_CONCURRENCY
      )
    ).filter((location) => location.periods.length > 0);

    if (locations.length === 0) {
      return {
        state: 'provider_error',
        provider: school.providerKind,
        sourceUrl: school.sourceUrl,
        reason: 'UC Davis dining pages returned no menu items for the requested date or filters.',
      };
    }

    return {
      state: 'adapter_ready',
      provider: school.providerKind,
      fetchedAt,
      sourceUrl: school.sourceUrl,
      data: {
        schoolId: school.id,
        providerKind: school.providerKind,
        sourceUrl: school.sourceUrl,
        fetchedAt,
        freshnessMinutes: 0,
        locations,
      },
    };
  } catch (error) {
    return {
      state: 'provider_error',
      provider: school.providerKind,
      sourceUrl: school.sourceUrl,
      reason: 'UC Davis dining page fetch failed.',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchUcDavisLocationMenu(
  school: SchoolCoverage,
  location: UcDavisLocation,
  date: string,
  meal?: string
): Promise<NormalizedMenu['locations'][number]> {
  const html = await fetchText(location.url, 45000);
  const $ = load(html);
  const dayId = ucDavisDayId(date);
  const $day = $(`#${dayId}`).first();
  const mealNeedle = meal ? slugify(meal) : undefined;
  const periods: NormalizedMenu['locations'][number]['periods'] = [];

  $day.find('.stickyMealHeader').each((_periodIndex, header) => {
    const periodName = normalizeWhitespace($(header).text()) ?? 'Menu';
    if (mealNeedle && slugify(periodName) !== mealNeedle) return;

    const period: NormalizedMenu['locations'][number]['periods'][number] = {
      id: `${location.id}-${slugify(periodName)}`,
      name: periodName,
      sourcePeriodId: slugify(periodName),
      stations: [],
    };
    let $cursor = $(header).next();

    while ($cursor.length > 0 && !$cursor.is('.stickyMealHeader')) {
      $cursor.children('div').each((stationIndex, stationElement) => {
        const stationName = ucDavisStationName($(stationElement).attr('class'), stationIndex);
        const station = ensureStation(period, stationName);

        $(stationElement)
          .find('.nutrition-panel')
          .each((itemIndex, panel) => {
            const name = normalizeWhitespace($(panel).text());
            const detailHref = normalizeWhitespace($(panel).attr('href'));
            if (!name || !detailHref) return;

            const detail = parseUcDavisItemDetail($, detailHref);
            station.items.push({
              id: `${school.id}-${location.id}-${date}-${slugify(periodName)}-${slugify(stationName)}-${itemIndex}-${slugify(name)}`,
              sourceItemId: detailHref.replace(/^#/, ''),
              name,
              normalizedName: name.toLowerCase(),
              description: detail.description,
              stationId: station.id,
              stationName,
              servingSizeText: detail.servingSizeText,
              availability: {
                status: 'planned',
              },
              dietaryTags: detail.dietaryTags,
              allergens: detail.allergens,
              ingredientStatement: detail.ingredientStatement,
              ingredients: detail.ingredients,
              nutrition: detail.nutrition,
              sourceUrl: location.url,
              raw: {
                detailHref,
                dayId,
                periodName,
                stationName,
              },
            });
          });
      });

      $cursor = $cursor.next();
    }

    period.stations = period.stations.filter((station) => station.items.length > 0);
    if (period.stations.length === 0) return;

    periods.push(period);
  });

  return {
    id: location.id,
    name: location.name,
    sourceLocationId: location.id,
    timezone: 'America/Los_Angeles',
    date,
    periods,
  };
}

function parseUcDavisItemDetail(
  $: ReturnType<typeof load>,
  detailHref: string
): UcDavisItemDetail {
  const $detail = $(detailHref).find('.mealDetails').first();
  const descriptionParts: string[] = [];
  const allergens: AllergenFact[] = [];
  const nutrition: NutritionFact[] = [];
  let servingSizeText: string | undefined;
  let ingredientStatement: string | undefined;

  const dietaryTags = normalizeUcDavisDietaryTags(
    $detail
      .find('img[alt]')
      .map((_index, image) => $(image).attr('alt') ?? '')
      .get()
  );

  $detail.find('p.underline').each((_index, paragraph) => {
    const $paragraph = $(paragraph);
    const label = normalizeWhitespace($paragraph.find('strong').first().text().replace(/:$/, ''));
    const text = normalizeWhitespace($paragraph.text());
    if (!text) return;

    if (!label) {
      descriptionParts.push(text);
      return;
    }

    const value = normalizeWhitespace(text.replace($paragraph.find('strong').first().text(), '').replace(/^:\s*/, ''));
    if (!value) return;

    const normalizedLabel = label.toLowerCase();
    if (normalizedLabel === 'contains') {
      allergens.push(...normalizeUcDavisAllergens(value));
      return;
    }

    if (normalizedLabel === 'serving size') {
      servingSizeText = value;
      return;
    }

    if (normalizedLabel === 'ingredients') {
      ingredientStatement = normalizeIngredientStatement(value);
      return;
    }

    const fact = normalizeUcDavisNutritionFact(label, value);
    if (fact) nutrition.push(fact);
  });

  return {
    description: normalizeWhitespace(descriptionParts.join(' ')),
    servingSizeText,
    ingredientStatement,
    ingredients: splitIngredients(ingredientStatement),
    allergens: mergeAllergensByKey(allergens),
    dietaryTags,
    nutrition: mergeNutritionFacts(nutrition),
  };
}

function normalizeUcDavisNutritionFact(label: string, value: string): NutritionFact | undefined {
  const amount = parseNumber(value);
  if (amount === undefined) return undefined;

  const key = mapUcDavisNutritionKey(label);
  const unitFromLabel = label.match(/\(([^)]+)\)/)?.[1];
  const unit = key === 'calories' ? 'kcal' : mapNutritionUnit(unitFromLabel) ?? ucDavisDefaultNutritionUnit(key);

  return {
    key,
    label,
    amount,
    unit,
    sourceText: `${label}: ${value}`,
  };
}

function mapUcDavisNutritionKey(label: string): NutritionKey {
  const normalized = label.toLowerCase();
  if (normalized.includes('calorie')) return 'calories';
  if (normalized.startsWith('fat')) return 'total_fat';
  if (normalized.startsWith('carbohydrate')) return 'total_carbohydrate';
  if (normalized.startsWith('sugar')) return 'total_sugars';
  if (normalized.startsWith('protein')) return 'protein';
  return mapNutritionKey(label);
}

function ucDavisDefaultNutritionUnit(key: NutritionKey): NutritionUnit | undefined {
  if (key === 'total_fat' || key === 'total_carbohydrate' || key === 'total_sugars' || key === 'protein') {
    return 'g';
  }
  return undefined;
}

function normalizeUcDavisAllergens(value: string): AllergenFact[] {
  return splitCommaList(value.replace(/\.$/, '')).map((label) => ({
    key: mapAllergenKey(label),
    label,
    status: 'contains' as const,
    sourceText: label,
  }));
}

function normalizeUcDavisDietaryTags(labels: string[]): DietaryTag[] {
  const tags = new Set<DietaryTag>();
  for (const label of labels) {
    const value = label.toLowerCase();
    if (value.includes('vegan')) tags.add('vegan');
    else if (value.includes('vegetarian')) tags.add('vegetarian');
    else if (value.includes('halal')) tags.add('halal');
    else if (value.includes('kosher')) tags.add('kosher');
    else if (value.includes('gluten')) tags.add('gluten_free');
  }
  return [...tags];
}

function ucDavisStationName(className: string | undefined, stationIndex: number) {
  const color = className
    ?.split(/\s+/)
    .find((value) => ['red', 'yellow', 'blue', 'green', 'purple', 'pink'].includes(value));
  if (!color) return `Zone ${stationIndex + 1}`;
  return `${color[0]?.toUpperCase()}${color.slice(1)} Zone`;
}

function ucDavisDayId(date: string) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const parsed = new Date(`${date}T12:00:00Z`);
  return days[parsed.getUTCDay()] ?? 'monday';
}

async function fetchUscMenu(
  school: SchoolCoverage,
  query: MenuQuery
): Promise<ProviderFetchResult> {
  const fetchedAt = new Date().toISOString();
  const date = query.date ?? fetchedAt.slice(0, 10);

  try {
    const [year, month, day] = date.split('-');
    const mealNeedle = query.meal?.toLowerCase();
    const locationNeedle = query.locationId?.toLowerCase();
    const selectedLocations = USC_LOCATIONS.filter(
      (location) => !locationNeedle || location.id === locationNeedle || slugify(location.name) === locationNeedle
    );

    const locations = await mapWithConcurrencyLimit(
      selectedLocations.map((location) => async () => {
        const url = `${USC_MENU_API}/${location.id}?y=${year}&m=${month}&d=${day}`;
        const response = await fetchJson<UscMenuResponse>(url, 30000);
        const periods = (response.meals ?? [])
          .map((meal) => normalizeUscPeriod(school, location, date, meal))
          .filter((period) => period.stations.some((station) => station.items.length > 0))
          .filter((period) => !mealNeedle || period.name.toLowerCase() === mealNeedle);

        if (periods.length === 0) return undefined;

        const normalizedLocation: NormalizedMenu['locations'][number] = {
          id: location.id,
          name: location.name,
          sourceLocationId: location.id,
          date,
          periods,
        };
        return normalizedLocation;
      }),
      3
    );

    const normalizedLocations = locations.filter(
      (location): location is NormalizedMenu['locations'][number] => Boolean(location)
    );

    if (normalizedLocations.length === 0) {
      return {
        state: 'provider_error',
        provider: school.providerKind,
        sourceUrl: school.sourceUrl,
        reason: 'USC dining REST endpoint returned no menu items for the requested date or filters.',
      };
    }

    return {
      state: 'adapter_ready',
      provider: school.providerKind,
      sourceUrl: school.sourceUrl,
      fetchedAt,
      data: {
        schoolId: school.id,
        providerKind: school.providerKind,
        sourceUrl: school.sourceUrl,
        fetchedAt,
        freshnessMinutes: 0,
        locations: normalizedLocations,
      },
    };
  } catch (error) {
    return {
      state: 'provider_error',
      provider: school.providerKind,
      sourceUrl: school.sourceUrl,
      reason: 'USC dining REST menu fetch failed.',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeUscPeriod(
  school: SchoolCoverage,
  location: (typeof USC_LOCATIONS)[number],
  date: string,
  meal: UscMeal
): NormalizedMenu['locations'][number]['periods'][number] {
  const periodName = normalizeWhitespace(meal.name) ?? 'Menu';
  const stations = (meal.stations ?? [])
    .map((station, index) => normalizeUscStation(school, location, date, periodName, station, index))
    .filter((station) => station.items.length > 0);

  return {
    id: `${location.id}-${slugify(periodName)}`,
    name: periodName,
    sourcePeriodId: periodName,
    stations,
  };
}

function normalizeUscStation(
  school: SchoolCoverage,
  location: (typeof USC_LOCATIONS)[number],
  date: string,
  periodName: string,
  station: UscStation,
  index: number
) {
  const stationName = normalizeWhitespace(station.station) ?? `Station ${index + 1}`;
  const stationId = `${location.id}-${slugify(periodName)}-${slugify(stationName)}`;
  const items = (station.menu ?? [])
    .map((item) => normalizeUscItem(school, location, date, periodName, stationId, stationName, item))
    .filter((item): item is NormalizedMenuItem => Boolean(item));

  return {
    id: stationId,
    name: stationName,
    sourceStationId: stationName,
    items,
  };
}

function normalizeUscItem(
  school: SchoolCoverage,
  location: (typeof USC_LOCATIONS)[number],
  date: string,
  periodName: string,
  stationId: string,
  stationName: string,
  item: UscMenuItem
): NormalizedMenuItem | undefined {
  const name = normalizeWhitespace(item.item);
  if (!name) return undefined;

  const sourceItemId = `${location.id}-${date}-${periodName}-${stationName}-${name}`;
  const labels = [...(item.dietary_preferences ?? []), ...(item.allergens ?? []), ...(item.preferences ?? [])];

  return {
    id: `${school.id}-${slugify(sourceItemId)}`,
    sourceItemId: slugify(sourceItemId),
    name,
    normalizedName: name.toLowerCase(),
    stationId,
    stationName,
    availability: { status: 'planned' },
    dietaryTags: normalizeUscDietaryTags(labels),
    allergens: normalizeUscAllergens(labels),
    ingredients: [],
    nutrition: [],
    sourceUrl: school.sourceUrl,
    raw: {
      locationId: location.id,
      periodName,
      stationName,
      dietary_preferences: item.dietary_preferences,
      allergens: item.allergens,
      preferences: item.preferences,
    },
  };
}

function normalizeUscDietaryTags(labels: string[]): DietaryTag[] {
  const tags = new Set<DietaryTag>();

  for (const label of labels) {
    const normalized = label.toLowerCase();
    if (normalized.includes('vegan')) tags.add('vegan');
    if (normalized.includes('vegetarian')) tags.add('vegetarian');
    if (normalized.includes('halal')) tags.add('halal');
  }

  return [...tags];
}

function normalizeUscAllergens(labels: string[]): AllergenFact[] {
  const facts = new Map<string, AllergenFact>();

  for (const label of labels) {
    const key = mapUscAllergenKey(label);
    if (!key) continue;

    facts.set(key, {
      key,
      label: labelizeUscAllergen(label),
      status: key === 'other' && label.toLowerCase().includes('not-analyzed') ? 'unknown' : 'contains',
      sourceText: label,
    });
  }

  return [...facts.values()];
}

function mapUscAllergenKey(label: string): AllergenKey | undefined {
  const value = label.toLowerCase();
  if (value.includes('dairy') || value.includes('milk')) return 'milk';
  if (value.includes('egg')) return 'egg';
  if (value.includes('shellfish')) return 'crustacean_shellfish';
  if (value.includes('fish')) return 'fish';
  if (value.includes('tree-nut') || value.includes('tree nut')) return 'tree_nut';
  if (value.includes('peanut')) return 'peanut';
  if (value.includes('wheat')) return 'wheat';
  if (value.includes('gluten')) return 'gluten';
  if (value.includes('soy')) return 'soy';
  if (value.includes('sesame')) return 'sesame';
  if (value.includes('pork') || value.includes('not-analyzed')) return 'other';
  return undefined;
}

function labelizeUscAllergen(label: string) {
  if (label === 'dairy') return 'Milk';
  if (label === 'eggs') return 'Eggs';
  return label
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace('Not Analyzed', 'Food Not Analyzed for Allergens');
}

async function fetchUcsdMenu(
  school: SchoolCoverage,
  query: MenuQuery
): Promise<ProviderFetchResult> {
  const fetchedAt = new Date().toISOString();
  const date = query.date ?? fetchedAt.slice(0, 10);

  try {
    const homeHtml = await fetchText(UCSD_HOME_URL, 30000);
    const venueLinks = parseUcsdVenueLinks(homeHtml, query.locationId);
    const locations = (
      await mapWithConcurrencyLimit(
        venueLinks.map((venue) => () => fetchUcsdVenueMenu(school, venue, date, query.meal)),
        UCSD_LOCATION_CONCURRENCY
      )
    ).filter((location): location is NormalizedMenu['locations'][number] => Boolean(location));

    if (locations.length === 0) {
      return {
        state: 'provider_error',
        provider: school.providerKind,
        sourceUrl: school.sourceUrl,
        reason: 'UCSD dining menu pages returned no menu items for the requested date or filters.',
      };
    }

    return {
      state: 'adapter_ready',
      provider: school.providerKind,
      sourceUrl: school.sourceUrl,
      fetchedAt,
      data: {
        schoolId: school.id,
        providerKind: school.providerKind,
        sourceUrl: school.sourceUrl,
        fetchedAt,
        freshnessMinutes: 0,
        locations,
      },
    };
  } catch (error) {
    return {
      state: 'provider_error',
      provider: school.providerKind,
      sourceUrl: school.sourceUrl,
      reason: 'UCSD dining menu fetch failed.',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseUcsdVenueLinks(html: string, locationId?: string): UcsdVenueLink[] {
  const $ = load(html);
  const links = new Map<string, UcsdVenueLink>();
  const locationNeedle = locationId?.toLowerCase();

  $('a.info-link[href*="/Restaurants/Venue_V3"]').each((_index, element) => {
    const href = $(element).attr('href');
    if (!href) return;

    const url = new URL(href, UCSD_BASE_URL).toString();
    const parsedUrl = new URL(url);
    const locId = parsedUrl.searchParams.get('locId') ?? 'unknown';
    const subLocNum = parsedUrl.searchParams.get('subLocNum') ?? '00';
    const locDetId = parsedUrl.searchParams.get('locDetID') ?? `${locId}-${subLocNum}`;
    const id = `${locId}-${subLocNum}-${locDetId}`;
    const name = normalizeWhitespace(
      $(element).closest('.station').find('.station-title, h3, h4, .title').first().text()
    );

    if (
      locationNeedle &&
      locationNeedle !== id.toLowerCase() &&
      locationNeedle !== locDetId.toLowerCase() &&
      (!name || slugify(name) !== locationNeedle)
    ) {
      return;
    }

    links.set(id, { id, name, url });
  });

  return [...links.values()];
}

async function fetchUcsdVenueMenu(
  school: SchoolCoverage,
  venue: UcsdVenueLink,
  date: string,
  meal?: string
): Promise<NormalizedMenu['locations'][number] | undefined> {
  const html = await fetchText(venue.url, 30000);
  const $ = load(html);
  const locationName = normalizeWhitespace($('#station-title').text()) ?? venue.name ?? venue.id;
  const mealNeedle = meal?.toLowerCase().replace(/\s+/g, '_');
  const periods: NormalizedMenu['locations'][number]['periods'] = [];

  $('.meal-category').each((_periodIndex, periodElement) => {
    const sourcePeriodId = $(periodElement).attr('id') ?? normalizeWhitespace($(periodElement).find('h2').first().text());
    const periodName = normalizeUcsdPeriodName(sourcePeriodId);
    if (!periodName) return;
    if (mealNeedle && slugify(periodName).replace(/-/g, '_') !== mealNeedle) return;

    const stationMap = new Map<string, NormalizedMenu['locations'][number]['periods'][number]['stations'][number]>();
    $(periodElement)
      .find('.menu-category-section')
      .each((_sectionIndex, sectionElement) => {
        const sectionStationName = normalizeWhitespace(
          $(sectionElement).find('.panel-heading .sublocs, .menu-cat-secondary h3').first().text()
        );

        $(sectionElement)
          .find('.station-list')
          .each((_stationIndex, stationElement) => {
            const stationName =
              sectionStationName ??
              normalizeUcsdStationName($(stationElement).attr('class')) ??
              `Station ${stationMap.size + 1}`;
            const stationId = `${venue.id}-${slugify(periodName)}-${slugify(stationName)}`;
            const station =
              stationMap.get(stationId) ??
              ({
                id: stationId,
                name: stationName,
                sourceStationId: stationName,
                items: [],
              } satisfies NormalizedMenu['locations'][number]['periods'][number]['stations'][number]);
            stationMap.set(stationId, station);

            const seen = new Set<string>();
            $(stationElement)
              .find('.menU-item-row')
              .each((_itemIndex, itemElement) => {
                const seed = parseUcsdItemSeed($, itemElement, {
                  venue,
                  periodName,
                  stationId,
                  stationName,
                });
                if (!seed) return;

                const key = `${seed.itemUrl}:${seed.stationId}:${seed.periodName}`;
                if (seen.has(key)) return;
                seen.add(key);
                station.items.push({
                  id: `${school.id}-${venue.id}-${slugify(periodName)}-${slugify(stationName)}-${slugify(seed.sourceItemId)}`,
                  sourceItemId: seed.sourceItemId,
                  name: seed.name,
                  normalizedName: seed.name.toLowerCase(),
                  stationId,
                  stationName,
                  price: normalizeUcsdPrice(seed.priceText),
                  availability: { status: 'planned' },
                  dietaryTags: normalizeUcsdDietaryTags(seed.iconLabels),
                  allergens: normalizeUcsdAllergens(seed.iconLabels),
                  ingredients: [],
                  nutrition: [],
                  itemUrl: seed.itemUrl,
                  sourceUrl: venue.url,
                  raw: {
                    locationId: venue.id,
                    periodName,
                    stationName,
                    iconLabels: seed.iconLabels,
                  },
                });
              });
          });
      });

    const stations = [...stationMap.values()].filter((station) => station.items.length > 0);
    if (stations.length === 0) return;

    periods.push({
      id: `${venue.id}-${slugify(periodName)}`,
      name: periodName,
      sourcePeriodId,
      stations,
    });
  });

  const items = periods.flatMap((period) => period.stations.flatMap((station) => station.items));
  const details = await mapWithConcurrencyLimit(
    items.map((item) => () => (item.itemUrl ? getUcsdItemDetail(item.itemUrl) : Promise.resolve(undefined))),
    UCSD_DETAIL_CONCURRENCY
  );
  items.forEach((item, index) => {
    const detail = details[index];
    if (!detail) return;

    item.servingSizeText = detail.servingSizeText;
    item.ingredientStatement = detail.ingredientStatement;
    item.ingredients = detail.ingredients;
    item.nutrition = detail.nutrition;
    item.allergens = mergeUcsdAllergens([...item.allergens, ...detail.allergens]);
  });

  if (items.length === 0) return undefined;

  return {
    id: venue.id,
    name: locationName,
    sourceLocationId: venue.id,
    date,
    periods,
  };
}

function parseUcsdItemSeed(
  $: ReturnType<typeof load>,
  itemElement: CheerioElement,
  context: {
    venue: UcsdVenueLink;
    periodName: string;
    stationId: string;
    stationName: string;
  }
): UcsdItemSeed | undefined {
  const detailHref =
    $(itemElement).find('a.sublocsitem[href*="/Nutrition/Nutritionfacts2"]').first().attr('href') ??
    $(itemElement).find('a.info-link[href*="/Nutrition/Nutritionfacts2"]').first().attr('href');
  if (!detailHref) return undefined;

  const itemUrl = new URL(detailHref, UCSD_BASE_URL).toString();
  const parsedUrl = new URL(itemUrl);
  const sourceItemId = `${parsedUrl.searchParams.get('id') ?? 'unknown'}-${
    parsedUrl.searchParams.get('recId') ?? 'unknown'
  }`;
  const name = normalizeWhitespace($(itemElement).find('a.sublocsitem').first().text());
  if (!name) return undefined;

  const iconLabels = $(itemElement)
    .find('.nutrition-icons img[title], img[title*="Contains"], img[title*="Vegan"], img[title*="Vegetarian"]')
    .toArray()
    .map((icon) => normalizeWhitespace($(icon).attr('title')))
    .filter((label): label is string => Boolean(label));

  return {
    id: `${context.venue.id}-${context.periodName}-${context.stationName}-${sourceItemId}`,
    sourceItemId,
    name,
    itemUrl,
    periodName: context.periodName,
    stationId: context.stationId,
    stationName: context.stationName,
    iconLabels: [...new Set(iconLabels)],
    priceText: normalizeWhitespace($(itemElement).find('.item-price').first().text()),
  };
}

function getUcsdItemDetail(itemUrl: string) {
  const cached = ucsdDetailCache.get(itemUrl);
  if (cached) return cached;

  const promise = fetchText(itemUrl, 30000).then(parseUcsdItemDetail);
  ucsdDetailCache.set(itemUrl, promise);
  return promise;
}

function parseUcsdItemDetail(html: string): UcsdItemDetail {
  const $ = load(html);
  const servingSizeText = normalizeWhitespace(
    $('p')
      .toArray()
      .map((element) => normalizeWhitespace($(element).text()))
      .find((text) => text?.toLowerCase().startsWith('serving size'))
  );
  const ingredientStatement = normalizeWhitespace(
    $('h2')
      .filter((_index, element) => $(element).text().trim().toLowerCase() === 'ingredients')
      .first()
      .nextAll('p')
      .first()
      .text()
  );

  const nutrition: NutritionFact[] = [];
  $('table[summary="Amount per serving"] tbody tr').each((_index, row) => {
    const label = normalizeWhitespace($(row).find('th').first().text());
    const value = normalizeWhitespace($(row).find('td').first().text());
    if (!label || !value) return;
    const fact = parseUcsdNutritionFact(`${label} ${value}`);
    if (fact) nutrition.push(fact);
  });

  $('table[summary="Nutrition Values per serving size"] tbody tr').each((_index, row) => {
    const cells = $(row).find('td').toArray();
    for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 2) {
      const sourceText = normalizeWhitespace($(cells[cellIndex]).text());
      if (!sourceText) continue;
      const fact = parseUcsdNutritionFact(sourceText, normalizeWhitespace($(cells[cellIndex + 1]).text()));
      if (fact) nutrition.push(fact);
    }
  });

  const allergens = normalizeUcsdAllergens(
    $('#allergens .card-footer span, #allergens img[title]')
      .toArray()
      .map((element) => normalizeWhitespace($(element).text()) ?? normalizeWhitespace($(element).attr('title')))
      .filter((label): label is string => Boolean(label))
  );

  return {
    servingSizeText,
    ingredientStatement,
    ingredients: splitIngredients(ingredientStatement),
    allergens,
    nutrition: mergeUcsdNutrition(nutrition),
  };
}

function parseUcsdNutritionFact(sourceText: string, dailyValueText?: string): NutritionFact | undefined {
  const normalized = sourceText.replace(/\u00a0/g, ' ').trim();
  const match = normalized.match(/^(.+?)\s+(-?\d+(?:\.\d+)?)\s*([A-Za-z%]+)?$/);
  if (!match) return undefined;

  const [, label, rawAmount, rawUnit] = match;
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount)) return undefined;

  const cleanLabel = normalizeWhitespace(label) ?? label;
  return {
    key: mapUcsdNutritionKey(cleanLabel),
    label: cleanLabel,
    amount,
    unit: cleanLabel.toLowerCase() === 'calories' ? 'kcal' : mapUcsdNutritionUnit(rawUnit),
    dailyValuePercent: parseDailyValuePercent(dailyValueText),
    sourceText: normalized,
  };
}

function mapUcsdNutritionKey(label: string): NutritionKey {
  const value = label.toLowerCase();
  if (value === 'calories') return 'calories';
  if (value.includes('total fat')) return 'total_fat';
  if (value.includes('sat. fat') || value.includes('saturated')) return 'saturated_fat';
  if (value.includes('trans fat')) return 'trans_fat';
  if (value.includes('cholesterol')) return 'cholesterol';
  if (value.includes('sodium')) return 'sodium';
  if (value.includes('tot. carb') || value.includes('carbohydrate')) return 'total_carbohydrate';
  if (value.includes('dietary fiber')) return 'dietary_fiber';
  if (value.includes('sugars')) return 'total_sugars';
  if (value.includes('protein')) return 'protein';
  return 'other';
}

function mapUcsdNutritionUnit(unit?: string): NutritionUnit | undefined {
  const value = unit?.toLowerCase();
  if (!value) return undefined;
  if (value === 'g') return 'g';
  if (value === 'mg') return 'mg';
  if (value === 'mcg') return 'mcg';
  if (value === 'iu') return 'iu';
  if (value === '%') return 'percent_daily_value';
  return 'other';
}

function normalizeUcsdPeriodName(value?: string) {
  const normalized = normalizeWhitespace(value?.replace(/_/g, ' '));
  if (!normalized) return undefined;
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeUcsdStationName(className?: string) {
  const match = className?.match(/station_([^\s]+)/);
  return normalizeWhitespace(match?.[1]?.replace(/_/g, ' '));
}

function normalizeUcsdPrice(value?: string) {
  const displayText = normalizeWhitespace(value);
  if (!displayText) return undefined;
  return {
    amount: parseNumber(displayText),
    currency: 'USD' as const,
    displayText,
  };
}

function normalizeUcsdDietaryTags(labels: string[]): DietaryTag[] {
  const tags = new Set<DietaryTag>();

  for (const label of labels) {
    const value = label.toLowerCase();
    if (value.includes('vegan')) tags.add('vegan');
    if (value.includes('vegetarian')) tags.add('vegetarian');
  }

  return [...tags];
}

function normalizeUcsdAllergens(labels: string[]): AllergenFact[] {
  const facts: AllergenFact[] = [];

  for (const label of labels) {
    const key = mapUcsdAllergenKey(label);
    if (!key) continue;
    facts.push({
      key,
      label: normalizeWhitespace(label.replace(/^Contains\s+/i, '')) ?? label,
      status: 'contains',
      sourceText: label,
    });
  }

  return mergeUcsdAllergens(facts);
}

function mapUcsdAllergenKey(label: string): AllergenKey | undefined {
  const value = label.toLowerCase();
  if (value.includes('dairy') || value.includes('milk')) return 'milk';
  if (value.includes('egg')) return 'egg';
  if (value.includes('shellfish')) return 'crustacean_shellfish';
  if (value.includes('fish')) return 'fish';
  if (value.includes('tree nut')) return 'tree_nut';
  if (value.includes('peanut')) return 'peanut';
  if (value.includes('wheat')) return 'wheat';
  if (value.includes('soy')) return 'soy';
  if (value.includes('sesame')) return 'sesame';
  if (value.includes('gluten')) return 'gluten';
  return undefined;
}

function mergeUcsdAllergens(allergens: AllergenFact[]) {
  const byKey = new Map<string, AllergenFact>();
  for (const allergen of allergens) {
    byKey.set(`${allergen.key}:${allergen.status}:${allergen.sourceText ?? allergen.label}`, allergen);
  }
  return [...byKey.values()];
}

function mergeUcsdNutrition(nutrition: NutritionFact[]) {
  const byKey = new Map<string, NutritionFact>();
  for (const fact of nutrition) {
    byKey.set(`${fact.key}:${fact.label}`, fact);
  }
  return [...byKey.values()];
}

async function fetchRiceMenu(
  school: SchoolCoverage,
  query: MenuQuery
): Promise<ProviderFetchResult> {
  const fetchedAt = new Date().toISOString();
  const date = query.date ?? fetchedAt.slice(0, 10);

  try {
    const html = await fetchText(school.sourceUrl, 30000);
    const $ = load(html);
    const mealNeedle = query.meal?.toLowerCase();
    const dayIndex = weekdayIndexFromMonday(date);
    const periods = [
      normalizeRicePeriod($, school, date, 'Lunch', '#block-daylunch', dayIndex, mealNeedle),
      normalizeRicePeriod($, school, date, 'Dinner', '#block-daydinner', dayIndex, mealNeedle),
    ].filter(
      (period): period is NormalizedMenu['locations'][number]['periods'][number] =>
        period !== undefined && period.stations.length > 0
    );

    const menu: NormalizedMenu = {
      schoolId: school.id,
      providerKind: 'official_html',
      sourceUrl: school.sourceUrl,
      fetchedAt,
      freshnessMinutes: 0,
      locations:
        periods.length > 0
          ? [
              {
                id: 'rice-dining',
                name: 'Rice Dining',
                sourceLocationId: 'rice-dining',
                timezone: 'America/Chicago',
                date,
                periods,
              },
            ]
          : [],
    };

    return {
      state: 'adapter_ready',
      provider: 'official_html',
      fetchedAt,
      sourceUrl: school.sourceUrl,
      data: menu,
    };
  } catch (error) {
    return {
      state: 'provider_error',
      provider: 'official_html',
      sourceUrl: school.sourceUrl,
      reason: 'Rice dining server-rendered menu fetch failed.',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeRicePeriod(
  $: ReturnType<typeof load>,
  school: SchoolCoverage,
  date: string,
  mealName: string,
  blockSelector: string,
  dayIndex: number,
  mealNeedle?: string
): NormalizedMenu['locations'][number]['periods'][number] | undefined {
  if (mealNeedle && !mealName.toLowerCase().includes(mealNeedle)) return undefined;

  const container = $(`${blockSelector} > .views-element-container`)
    .eq(dayIndex)
    .find('.featured-container')
    .first();
  if (container.length === 0) return undefined;

  const periodId = slugify(mealName);
  const stations: NormalizedMenu['locations'][number]['periods'][number]['stations'] = [];
  let currentServery = 'Menu';
  let currentStation:
    | NormalizedMenu['locations'][number]['periods'][number]['stations'][number]
    | undefined;

  container.children('a, h3, .menu-items').each((_index, element) => {
    const tag = element.tagName.toLowerCase();
    if (tag === 'a') {
      currentServery = normalizeWhitespace($(element).text()) ?? currentServery;
      currentStation = undefined;
      return;
    }

    if (tag === 'h3') {
      const chefStation = normalizeWhitespace($(element).text()) ?? 'Menu';
      const stationName = `${currentServery} - ${chefStation}`;
      currentStation = {
        id: `${periodId}-${slugify(stationName)}`,
        name: stationName,
        sourceStationId: stationName,
        items: [],
      };
      stations.push(currentStation);
      return;
    }

    if (!currentStation) {
      currentStation = {
        id: `${periodId}-${slugify(currentServery)}`,
        name: currentServery,
        sourceStationId: currentServery,
        items: [],
      };
      stations.push(currentStation);
    }

    const item = normalizeRiceItem($, element, {
      school,
      date,
      mealName,
      station: currentStation,
      itemIndex: currentStation.items.length,
    });
    if (item) currentStation.items.push(item);
  });

  const nonEmptyStations = stations.filter((station) => station.items.length > 0);
  if (nonEmptyStations.length === 0) return undefined;

  return {
    id: periodId,
    name: mealName,
    sourcePeriodId: mealName,
    stations: nonEmptyStations,
  };
}

function normalizeRiceItem(
  $: ReturnType<typeof load>,
  element: CheerioElement,
  context: {
    school: SchoolCoverage;
    date: string;
    mealName: string;
    station: NormalizedMenu['locations'][number]['periods'][number]['stations'][number];
    itemIndex: number;
  }
): NormalizedMenuItem | undefined {
  const name = normalizeWhitespace($(element).find('.mname').first().text());
  if (!name) return undefined;

  const labels = $(element)
    .find('[data-content]')
    .map((_index, labelElement) => normalizeWhitespace($(labelElement).attr('data-content')))
    .get()
    .filter((label): label is string => Boolean(label));

  return {
    id: `${context.school.id}-${context.date}-${slugify(context.mealName)}-${
      context.station.id
    }-${context.itemIndex}-${slugify(name)}`,
    name,
    normalizedName: name.toLowerCase(),
    stationId: context.station.id,
    stationName: context.station.name,
    availability: {
      status: 'planned',
    },
    dietaryTags: normalizeRiceDietaryTags(labels),
    allergens: normalizeRiceAllergens(labels),
    ingredients: [],
    nutrition: [],
    sourceUrl: context.school.sourceUrl,
    raw: {
      labels,
    },
  };
}

function normalizeRiceDietaryTags(labels: string[]): DietaryTag[] {
  const tags = new Set<DietaryTag>();
  for (const label of labels) {
    const value = label.toLowerCase();
    if (value === 'vegan') tags.add('vegan');
    else if (value === 'vegetarian') tags.add('vegetarian');
    else if (value === 'halal') tags.add('halal');
    else if (value.includes('without gluten') || value === 'gluten free') tags.add('gluten_free');
  }
  return [...tags];
}

function normalizeRiceAllergens(labels: string[]): AllergenFact[] {
  const allergens: AllergenFact[] = [];
  for (const label of labels) {
    const key = mapRiceAllergenKey(label);
    if (key) {
      allergens.push({
        key,
        label,
        status: 'contains',
        sourceText: label,
      });
    }
  }
  return allergens;
}

function mapRiceAllergenKey(label: string): AllergenKey | undefined {
  const value = label.toLowerCase();
  if (value === 'dairy') return 'milk';
  if (value === 'eggs') return 'egg';
  if (value === 'fish') return 'fish';
  if (value === 'shellfish') return 'crustacean_shellfish';
  if (value === 'tree nuts') return 'tree_nut';
  if (value === 'peanuts') return 'peanut';
  if (value === 'gluten') return 'gluten';
  if (value === 'soy') return 'soy';
  if (value === 'sesame') return 'sesame';
  return undefined;
}

function weekdayIndexFromMonday(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return (day + 6) % 7;
}

async function fetchStanfordMenu(
  school: SchoolCoverage,
  query: MenuQuery
): Promise<ProviderFetchResult> {
  const fetchedAt = new Date().toISOString();
  const date = query.date ?? fetchedAt.slice(0, 10);
  const stanfordDate = toStanfordDate(date);

  try {
    const formState = await getStanfordFormState();
    const locationNeedle = query.locationId?.toLowerCase();
    const mealNeedle = query.meal?.toLowerCase();
    const locations = formState.locations.filter((location) => {
      if (!locationNeedle) return true;
      const slug = slugify(location.name);
      return (
        location.id.toLowerCase() === locationNeedle ||
        slug === locationNeedle ||
        slug.includes(locationNeedle) ||
        location.name.toLowerCase().includes(locationNeedle)
      );
    });
    const meals = formState.meals.filter((meal) => {
      if (!mealNeedle) return true;
      return meal.id.toLowerCase().includes(mealNeedle) || meal.name.toLowerCase().includes(mealNeedle);
    });

    const tasks: Array<() => Promise<NormalizedMenu['locations'][number] | undefined>> = [];
    for (const location of locations) {
      tasks.push(async () => {
        const periods = await Promise.all(
          meals.map(async (meal) => {
            const html = await postStanfordMenu(formState, location.id, stanfordDate, meal.id);
            return normalizeStanfordPeriod(school, location, meal, date, html);
          })
        );
        const validPeriods = periods.filter(
          (period): period is NormalizedMenu['locations'][number]['periods'][number] =>
            period !== undefined && period.stations.length > 0
        );
        if (validPeriods.length === 0) return undefined;

        return {
          id: slugify(location.name) || location.id,
          name: location.name,
          sourceLocationId: location.id,
          timezone: 'America/Los_Angeles',
          date,
          periods: validPeriods,
        };
      });
    }

    const locationResults = await mapWithConcurrencyLimit(tasks, STANFORD_REQUEST_CONCURRENCY);
    const menu: NormalizedMenu = {
      schoolId: school.id,
      providerKind: 'official_html',
      sourceUrl: school.sourceUrl,
      fetchedAt,
      freshnessMinutes: 0,
      locations: locationResults.filter(
        (location): location is NormalizedMenu['locations'][number] =>
          location !== undefined && location.periods.length > 0
      ),
    };

    return {
      state: 'adapter_ready',
      provider: 'official_html',
      fetchedAt,
      sourceUrl: school.sourceUrl,
      data: menu,
    };
  } catch (error) {
    return {
      state: 'provider_error',
      provider: 'official_html',
      sourceUrl: school.sourceUrl,
      reason: 'Stanford dining hall WebForms menu fetch failed.',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function getStanfordFormState(): Promise<StanfordFormState> {
  const response = await fetch(STANFORD_MENU_URL, {
    headers: {
      accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': STANFORD_USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching Stanford dining form`);
  }

  const cookie = response.headers
    .get('set-cookie')
    ?.split(',')
    .map((part) => part.split(';')[0])
    .join('; ');
  const html = await response.text();
  const $ = load(html);
  const fields: Record<string, string> = {};
  $('input').each((_index, inputElement) => {
    const name = normalizeWhitespace($(inputElement).attr('name'));
    if (name) fields[name] = $(inputElement).attr('value') ?? '';
  });

  return {
    fields,
    cookie,
    locations: parseStanfordOptions($, '#MainContent_lstLocations'),
    meals: parseStanfordOptions($, '#MainContent_lstMealType'),
    dateOptions: parseStanfordOptions($, '#MainContent_lstDay').map((option) => option.id),
  };
}

function parseStanfordOptions($: ReturnType<typeof load>, selector: string): StanfordSelectOption[] {
  return $(selector)
    .find('option')
    .map((_index, optionElement) => {
      const id = normalizeWhitespace($(optionElement).attr('value'));
      const name = normalizeWhitespace($(optionElement).text());
      return id && name ? { id, name } : undefined;
    })
    .get()
    .filter((option): option is StanfordSelectOption => Boolean(option));
}

async function postStanfordMenu(
  formState: StanfordFormState,
  locationId: string,
  date: string,
  mealId: string
) {
  const body = new URLSearchParams(formState.fields);
  body.set('ctl00$MainContent$lstLocations', locationId);
  body.set('ctl00$MainContent$lstDay', formState.dateOptions.includes(date) ? date : date);
  body.set('ctl00$MainContent$lstMealType', mealId);
  body.set('ctl00$MainContent$btnRefresh', 'Refresh');

  const headers: Record<string, string> = {
    accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    'content-type': 'application/x-www-form-urlencoded',
    referer: STANFORD_MENU_URL,
    'user-agent': STANFORD_USER_AGENT,
  };
  if (formState.cookie) headers.cookie = formState.cookie;

  const response = await fetch(STANFORD_MENU_URL, {
    method: 'POST',
    headers,
    body,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching Stanford ${locationId} ${mealId}`);
  }
  return response.text();
}

function normalizeStanfordPeriod(
  school: SchoolCoverage,
  location: StanfordSelectOption,
  meal: StanfordSelectOption,
  date: string,
  html: string
): NormalizedMenu['locations'][number]['periods'][number] | undefined {
  const $ = load(html);
  const stationId = `${slugify(location.name) || location.id}-${slugify(meal.name) || meal.id}-menu`;
  const items: NormalizedMenuItem[] = [];

  $('.clsMenuItem').each((itemIndex, itemElement) => {
    const name = normalizeWhitespace($(itemElement).find('.clsLabel_Name').first().text());
    if (!name) return;

    const ingredientStatement = normalizeStanfordIngredientStatement(
      $(itemElement).find('.clsLabel_Ingredients').first().text()
    );
    const containsAllergens = parseStanfordAllergenLabels(
      $(itemElement).find('.clsLabel_Allergens').first().text()
    ).map((label) => normalizeStanfordAllergen(label, 'contains'));
    const traceAllergens = parseStanfordAllergenLabels(
      $(itemElement).find('.clsLabel_TraceAllergens').first().text()
    ).map((label) => normalizeStanfordAllergen(label, 'may_contain'));

    items.push({
      id: `${school.id}-${location.id}-${date}-${slugify(meal.name) || meal.id}-${itemIndex}-${slugify(name)}`,
      name,
      normalizedName: name.toLowerCase(),
      description: normalizeWhitespace($(itemElement).find('.clsLabel_Description').first().text()),
      stationId,
      stationName: 'Menu',
      availability: {
        status: 'planned',
      },
      dietaryTags: normalizeStanfordDietaryTags($(itemElement).attr('class') ?? ''),
      allergens: mergeAllergens([...containsAllergens, ...traceAllergens]),
      ingredientStatement,
      ingredients: splitIngredients(ingredientStatement),
      nutrition: [],
      sourceUrl: STANFORD_MENU_URL,
      raw: {
        locationId: location.id,
        mealId: meal.id,
        classes: $(itemElement).attr('class'),
      },
    });
  });

  if (items.length === 0) return undefined;

  return {
    id: `${slugify(location.name) || location.id}-${slugify(meal.name) || meal.id}`,
    name: meal.name,
    sourcePeriodId: meal.id,
    stations: [
      {
        id: stationId,
        name: 'Menu',
        sourceStationId: 'Menu',
        items,
      },
    ],
  };
}

function normalizeStanfordIngredientStatement(value?: string) {
  const normalized = normalizeWhitespace(value?.replace(/^Ingredients:\s*/i, ''));
  return normalized || undefined;
}

function parseStanfordAllergenLabels(value?: string) {
  return (value ?? '')
    .replace(/^Allergens:\s*/i, '')
    .replace(/^Made on shared equipment with\s*/i, '')
    .split(',')
    .map((label) => normalizeWhitespace(label))
    .filter((label): label is string => Boolean(label));
}

function normalizeStanfordAllergen(
  label: string,
  status: AllergenFact['status']
): AllergenFact {
  return {
    key: mapStanfordAllergenKey(label),
    label,
    status,
    sourceText: label,
  };
}

function mapStanfordAllergenKey(label: string): AllergenKey {
  const value = label.toLowerCase().replace(/[^a-z]/g, '');
  if (value.includes('milk')) return 'milk';
  if (value.includes('egg')) return 'egg';
  if (value.includes('shellfish')) return 'crustacean_shellfish';
  if (value.includes('fish')) return 'fish';
  if (value.includes('treenut') || value.includes('coconut')) return 'tree_nut';
  if (value.includes('peanut')) return 'peanut';
  if (value.includes('wheat')) return 'wheat';
  if (value.includes('soy')) return 'soy';
  if (value.includes('sesame')) return 'sesame';
  if (value.includes('gluten')) return 'gluten';
  return 'other';
}

function normalizeStanfordDietaryTags(className: string): DietaryTag[] {
  const tags = new Set<DietaryTag>();
  if (/\bclsGF_Row\b/.test(className)) tags.add('gluten_free');
  if (/\bclsVGN_Row\b/.test(className)) tags.add('vegan');
  else if (/\bclsV_Row\b/.test(className)) tags.add('vegetarian');
  if (/\bclsHALAL_Row\b/.test(className)) tags.add('halal');
  if (/\bclsKOSHER_Row\b/.test(className)) tags.add('kosher');
  return [...tags];
}

async function fetchUiucMenu(
  school: SchoolCoverage,
  query: MenuQuery
): Promise<ProviderFetchResult> {
  const fetchedAt = new Date().toISOString();
  const date = query.date ?? fetchedAt.slice(0, 10);

  try {
    const html = await fetchText(UIUC_MENU_PAGE, 30000);
    const $ = load(html);
    const options = parseUiucOptions($, query.locationId);
    const scheduleRows = parseUiucScheduleRows($, date);
    const results = await Promise.all(
      options.map(async (option) => ({
        option,
        rows: await fetchUiucOptionRows(option.id, date),
      }))
    );

    const locations = results
      .map(({ option, rows }) =>
        normalizeUiucLocation(school, option, rows, scheduleRows, date, query.meal)
      )
      .filter(
        (location): location is NormalizedMenu['locations'][number] =>
          location !== undefined && location.periods.length > 0
      );

    const menu: NormalizedMenu = {
      schoolId: school.id,
      providerKind: 'official_html',
      sourceUrl: school.sourceUrl,
      fetchedAt,
      freshnessMinutes: 0,
      locations,
    };

    return {
      state: 'adapter_ready',
      provider: 'official_html',
      fetchedAt,
      sourceUrl: school.sourceUrl,
      data: menu,
    };
  } catch (error) {
    return {
      state: 'provider_error',
      provider: 'official_html',
      sourceUrl: school.sourceUrl,
      reason: 'UIUC Dining Menus public JSON fetch failed.',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseUiucOptions($: ReturnType<typeof load>, locationId?: string): UiucDiningOption[] {
  const locationNeedle = locationId?.toLowerCase();
  const options: UiucDiningOption[] = [];
  const seen = new Set<string>();

  $('#dineop option, #retailop option').each((_index, optionElement) => {
    const id = normalizeWhitespace($(optionElement).attr('id'));
    const name =
      normalizeWhitespace($(optionElement).attr('value')) ??
      normalizeWhitespace($(optionElement).text());
    if (!id || id === '0' || !name || seen.has(id)) return;

    const locationSlug = slugify(name);
    if (
      locationNeedle &&
      id.toLowerCase() !== locationNeedle &&
      !locationSlug.includes(locationNeedle) &&
      !name.toLowerCase().includes(locationNeedle)
    ) {
      return;
    }

    seen.add(id);
    options.push({ id, name });
  });

  return options;
}

function parseUiucScheduleRows($: ReturnType<typeof load>, date: string) {
  const rows = new Map<string, UiucScheduleRow>();
  $('#sTable tbody tr').each((_index, rowElement) => {
    const cells = $(rowElement)
      .find('td')
      .map((_cellIndex, cellElement) => normalizeWhitespace($(cellElement).text()) ?? '')
      .get();
    const [diningOptionId, scheduleDate, _day, mealName, _start24, _end24, startTime, endTime] =
      cells;
    if (!diningOptionId || scheduleDate !== date || !mealName) return;

    rows.set(uiucScheduleKey(diningOptionId, mealName), {
      diningOptionId,
      date: scheduleDate,
      mealName,
      startTime,
      endTime,
    });
  });
  return rows;
}

async function fetchUiucOptionRows(optionId: string, date: string): Promise<UiucMenuRow[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(UIUC_MENU_API, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        accept: 'application/json, text/javascript, */*; q=0.01',
        'accept-language': 'en-US,en;q=0.9',
        'content-type': 'application/json; charset=utf-8',
        origin: 'https://web.housing.illinois.edu',
        referer: UIUC_MENU_PAGE,
        'user-agent':
          'campus-dining-api/0.1 (+https://github.com/endo-ai/campus-dining-api)',
        'x-requested-with': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        DiningOptionID: optionId,
        mealDate: date,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching UIUC dining option ${optionId}`);
    }

    const text = await response.text();
    return JSON.parse(text) as UiucMenuRow[];
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeUiucLocation(
  school: SchoolCoverage,
  option: UiucDiningOption,
  rows: UiucMenuRow[],
  scheduleRows: Map<string, UiucScheduleRow>,
  date: string,
  meal?: string
): NormalizedMenu['locations'][number] | undefined {
  const mealNeedle = meal?.toLowerCase();
  const locationSlug = slugify(option.name) || option.id;
  const periodMap = new Map<string, NormalizedMenu['locations'][number]['periods'][number]>();

  for (const row of rows) {
    const itemName = normalizeWhitespace(row.FormalName);
    const mealName = normalizeWhitespace(row.Meal) ?? 'Menu';
    if (!itemName || (mealNeedle && !mealName.toLowerCase().includes(mealNeedle))) continue;

    let period = periodMap.get(mealName);
    if (!period) {
      const schedule = scheduleRows.get(uiucScheduleKey(option.id, mealName));
      period = {
        id: `${locationSlug}-${slugify(mealName) || 'menu'}`,
        name: mealName,
        sourcePeriodId: normalizeWhitespace(String(row.ScheduleID ?? '')) ?? mealName,
        startTime: schedule?.startTime,
        endTime: schedule?.endTime,
        stations: [],
      };
      periodMap.set(mealName, period);
    }

    const stationName = normalizeWhitespace(row.ServingUnit) ?? normalizeWhitespace(row.Category) ?? 'Menu';
    const stationSlug = slugify(stationName) || 'menu';
    let station = period.stations.find((candidate) => candidate.sourceStationId === stationName);
    if (!station) {
      station = {
        id: `${period.id}-${stationSlug}`,
        name: stationName,
        sourceStationId: stationName,
        items: [],
      };
      period.stations.push(station);
    }

    const traits = splitUiucTraits(row.Traits);
    station.items.push({
      id: `${school.id}-${option.id}-${date}-${slugify(mealName) || 'menu'}-${
        row.DiningMenuID ?? row.ItemID ?? station.items.length
      }`,
      sourceItemId: normalizeWhitespace(String(row.ItemID ?? '')),
      name: itemName,
      normalizedName: itemName.toLowerCase(),
      category: normalizeWhitespace(row.Course) ?? normalizeWhitespace(row.Category),
      stationId: station.id,
      stationName,
      availability: {
        status: 'planned',
      },
      dietaryTags: normalizeUiucDietaryTags(traits),
      allergens: normalizeUiucAllergens(traits),
      ingredients: [],
      nutrition: [],
      sourceUrl: UIUC_MENU_API,
      raw: row,
    });
  }

  const periods = [...periodMap.values()]
    .map((period) => ({
      ...period,
      stations: period.stations.filter((station) => station.items.length > 0),
    }))
    .filter((period) => period.stations.length > 0)
    .sort((left, right) => uiucMealOrder(left.name) - uiucMealOrder(right.name));

  if (periods.length === 0) return undefined;

  return {
    id: locationSlug,
    name: option.name,
    sourceLocationId: option.id,
    timezone: 'America/Chicago',
    date,
    periods,
  };
}

function splitUiucTraits(value?: string) {
  return (value ?? '')
    .split(',')
    .map((trait) => normalizeWhitespace(trait))
    .filter((trait): trait is string => Boolean(trait));
}

function normalizeUiucDietaryTags(traits: string[]): DietaryTag[] {
  const tags = new Set<DietaryTag>();
  for (const trait of traits) {
    const value = trait.toLowerCase();
    if (value === 'vegan') tags.add('vegan');
    else if (value === 'vegetarian') tags.add('vegetarian');
    else if (value === 'halal') tags.add('halal');
    else if (value === 'kosher') tags.add('kosher');
    else if (value === 'jain') tags.add('other');
    else if (value.includes('gluten free')) tags.add('gluten_free');
  }
  return [...tags];
}

function normalizeUiucAllergens(traits: string[]): AllergenFact[] {
  const allergens: AllergenFact[] = [];
  for (const trait of traits) {
    const key = mapUiucAllergenKey(trait);
    if (key) {
      allergens.push({
        key,
        label: trait,
        status: 'contains',
        sourceText: trait,
      });
    }
  }
  return allergens;
}

function mapUiucAllergenKey(label: string): AllergenKey | undefined {
  const value = label.toLowerCase();
  if (value === 'milk') return 'milk';
  if (value === 'eggs' || value === 'egg') return 'egg';
  if (value === 'fish') return 'fish';
  if (value.includes('shellfish') || value.includes('crustacean')) return 'crustacean_shellfish';
  if (value === 'tree nuts' || value === 'tree nut') return 'tree_nut';
  if (value === 'peanuts' || value === 'peanut') return 'peanut';
  if (value === 'wheat') return 'wheat';
  if (value === 'soy') return 'soy';
  if (value === 'sesame') return 'sesame';
  if (value === 'gluten') return 'gluten';
  if (['corn', 'msg', 'red dye', 'sulfites'].includes(value)) return 'other';
  return undefined;
}

function uiucScheduleKey(diningOptionId: string, mealName: string) {
  return `${diningOptionId}:${mealName.toLowerCase()}`;
}

function uiucMealOrder(mealName: string) {
  const value = mealName.toLowerCase();
  if (value.includes('breakfast')) return 1;
  if (value === 'lunch') return 2;
  if (value.includes('light lunch')) return 3;
  if (value === 'dinner') return 4;
  if (value.includes('kosher lunch')) return 5;
  if (value.includes('kosher dinner')) return 6;
  return 7;
}

async function fetchBerkeleyMenu(
  school: SchoolCoverage,
  query: MenuQuery
): Promise<ProviderFetchResult> {
  const fetchedAt = new Date().toISOString();
  const date = query.date ?? fetchedAt.slice(0, 10);

  try {
    const html = await postBerkeleyAjax({
      action: 'cald_filter_xml',
      location: '',
      mealperiod: '',
      date: toCompactDate(date),
    });
    const $ = load(html);
    const mealNeedle = query.meal?.toLowerCase();
    const locationNeedle = query.locationId?.toLowerCase();
    const detailCache = new Map<string, Promise<BerkeleyItemDetail>>();
    const detailTasks: Array<() => Promise<void>> = [];
    const locations: NormalizedMenu['locations'] = [];

    $('.cafe-location > li').each((_locationIndex, locationElement) => {
      const locationName =
        normalizeWhitespace($(locationElement).find('> .location-title .cafe-title').first().text()) ??
        normalizeWhitespace($(locationElement).attr('class')?.replace(/\b(location-name|\d{8})\b/g, '')) ??
        'Dining Location';
      const locationId = slugify(locationName) || 'menu';

      if (
        locationNeedle &&
        locationId !== locationNeedle &&
        !locationId.includes(locationNeedle) &&
        !locationName.toLowerCase().includes(locationNeedle)
      ) {
        return;
      }

      const statusText = normalizeWhitespace(
        $(locationElement).find('> .location-title .status').first().text()
      );
      const hoursText = $(locationElement)
        .find('> .status-period-wrap .times span')
        .map((_index, element) => normalizeWhitespace($(element).text()))
        .get()
        .filter((value): value is string => Boolean(value))
        .join('; ');
      const availabilitySourceText = [statusText, hoursText].filter(Boolean).join('; ') || undefined;
      const location: NormalizedMenu['locations'][number] = {
        id: locationId,
        name: locationName,
        sourceLocationId: locationName,
        date,
        periods: [],
      };

      $(locationElement)
        .find('> .status-period-wrap > .meal-period > li')
        .each((_periodIndex, periodElement) => {
          const periodName = normalizeBerkeleyPeriodName($, periodElement);
          if (mealNeedle && !periodName.toLowerCase().includes(mealNeedle)) return;

          const periodId = slugify(periodName) || 'menu';
          const period: NormalizedMenu['locations'][number]['periods'][number] = {
            id: `${locationId}-${periodId}`,
            name: periodName,
            sourcePeriodId: periodName,
            stations: [],
          };

          $(periodElement)
            .find('> .recipes-main-wrap > .cat-name')
            .each((_stationIndex, stationElement) => {
              const stationName =
                normalizeWhitespace($(stationElement).children('span').first().text()) ?? 'Menu';
              const stationId = slugify(stationName) || 'menu';
              const station: NormalizedMenu['locations'][number]['periods'][number]['stations'][number] = {
                id: `${locationId}-${periodId}-${stationId}`,
                name: stationName,
                sourceStationId: stationName,
                items: [],
              };

              $(stationElement)
                .find('> ul.recipe-name > li.recip')
                .each((itemIndex, itemElement) => {
                  const seed = parseBerkeleyItemSeed($, itemElement, {
                    date,
                    itemIndex,
                    locationId,
                    periodId,
                    stationId: station.id,
                    stationName,
                    periodName,
                    category: stationName,
                    sourceUrl: school.sourceUrl,
                    availabilitySourceText,
                  });
                  if (!seed) return;

                  detailTasks.push(async () => {
                    const detail = await getBerkeleyItemDetail(seed, detailCache);
                    station.items.push(normalizeBerkeleyItem(seed, detail));
                  });
                });

              if (station.items.length > 0 || $(stationElement).find('> ul.recipe-name > li.recip').length > 0) {
                period.stations.push(station);
              }
            });

          if (period.stations.length > 0) {
            location.periods.push(period);
          }
        });

      if (location.periods.length > 0) {
        locations.push(location);
      }
    });

    await runWithConcurrency(detailTasks, BERKELEY_DETAIL_CONCURRENCY);

    const menu: NormalizedMenu = {
      schoolId: school.id,
      providerKind: 'official_html',
      sourceUrl: school.sourceUrl,
      fetchedAt,
      freshnessMinutes: 0,
      locations: locations
        .map((location) => ({
          ...location,
          periods: location.periods
            .map((period) => ({
              ...period,
              stations: period.stations.filter((station) => station.items.length > 0),
            }))
            .filter((period) => period.stations.length > 0),
        }))
        .filter((location) => location.periods.length > 0),
    };

    return {
      state: 'adapter_ready',
      provider: 'official_html',
      fetchedAt,
      sourceUrl: school.sourceUrl,
      data: menu,
    };
  } catch (error) {
    return {
      state: 'provider_error',
      provider: 'official_html',
      sourceUrl: school.sourceUrl,
      reason: 'Berkeley dining menu AJAX fetch failed.',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseBerkeleyItemSeed(
  $: ReturnType<typeof load>,
  itemElement: CheerioElement,
  context: {
    date: string;
    itemIndex: number;
    locationId: string;
    periodId: string;
    stationId: string;
    stationName: string;
    periodName: string;
    category: string;
    sourceUrl: string;
    availabilitySourceText?: string;
  }
): BerkeleyItemSeed | undefined {
  const name = normalizeWhitespace($(itemElement).children('span').first().text());
  const detailLocation = normalizeWhitespace($(itemElement).attr('data-location'));
  const sourceItemId = normalizeWhitespace($(itemElement).attr('data-id'));
  const menuId = normalizeWhitespace($(itemElement).attr('data-menuid'));
  if (!name || !detailLocation || !sourceItemId || !menuId) return undefined;

  return {
    id: `uc-berkeley-${context.locationId}-${context.date}-${context.periodId}-${context.itemIndex}-${sourceItemId}-${menuId}`,
    sourceItemId,
    menuId,
    detailLocation,
    name,
    category: context.category,
    stationId: context.stationId,
    stationName: context.stationName,
    periodName: context.periodName,
    iconLabels: parseBerkeleyIconLabels($, itemElement),
    sourceUrl: context.sourceUrl,
    availabilitySourceText: context.availabilitySourceText,
  };
}

function parseBerkeleyIconLabels($: ReturnType<typeof load>, itemElement: CheerioElement) {
  const labels = new Set<string>();
  $(itemElement)
    .find('.allg-tooltip, img[alt]')
    .each((_index, element) => {
      const label = normalizeWhitespace(
        element.tagName === 'img' ? $(element).attr('alt') : $(element).text()
      );
      if (!label || label.toLowerCase() === 'co2') return;
      labels.add(label);
    });
  return [...labels];
}

function normalizeBerkeleyPeriodName($: ReturnType<typeof load>, periodElement: CheerioElement) {
  const label = $(periodElement).children('span').first().clone();
  label.children().remove();
  return normalizeWhitespace(label.text()) ?? 'Menu';
}

async function getBerkeleyItemDetail(
  seed: BerkeleyItemSeed,
  cache: Map<string, Promise<BerkeleyItemDetail>>
) {
  const key = `${seed.detailLocation}:${seed.sourceItemId}:${seed.menuId}`;
  const existing = cache.get(key);
  if (existing) return existing;

  const promise = postBerkeleyAjax({
    action: 'get_recipe_details',
    location: seed.detailLocation,
    id: seed.sourceItemId,
    menu_id: seed.menuId,
  }).then(parseBerkeleyItemDetail);
  cache.set(key, promise);
  return promise;
}

function parseBerkeleyItemDetail(html: string): BerkeleyItemDetail {
  const $ = load(html);
  const servingSizeText = normalizeWhitespace(
    $('.serving-size').first().text().replace(/^Serving Size:\s*/i, '')
  );
  const ingredientStatement = normalizeIngredientStatement($('.ingredients .content').first().text());
  const allergenLabels = $('.allergens span')
    .map((_index, element) => normalizeWhitespace($(element).text()))
    .get()
    .filter((label): label is string => Boolean(label));

  return {
    name: normalizeWhitespace($('.title h5').first().text()),
    servingSizeText,
    ingredientStatement,
    nutrition: normalizeBerkeleyNutrition($),
    allergens: normalizeKnownAllergens(allergenLabels),
  };
}

function normalizeBerkeleyItem(seed: BerkeleyItemSeed, detail: BerkeleyItemDetail): NormalizedMenuItem {
  const name = detail.name ?? seed.name;
  const allergens = mergeAllergens([...normalizeKnownAllergens(seed.iconLabels), ...detail.allergens]);

  return {
    id: seed.id,
    sourceItemId: seed.sourceItemId,
    name,
    normalizedName: name.toLowerCase(),
    category: seed.category,
    stationId: seed.stationId,
    stationName: seed.stationName,
    servingSizeText: detail.servingSizeText,
    availability: {
      status: 'planned',
      sourceText: seed.availabilitySourceText,
    },
    dietaryTags: normalizeBerkeleyDietaryTags(seed.iconLabels),
    allergens,
    ingredientStatement: detail.ingredientStatement,
    ingredients: splitIngredients(detail.ingredientStatement),
    nutrition: detail.nutrition,
    sourceUrl: seed.sourceUrl,
    raw: {
      menuId: seed.menuId,
      detailLocation: seed.detailLocation,
      periodName: seed.periodName,
      iconLabels: seed.iconLabels,
    },
  };
}

function normalizeBerkeleyNutrition($: ReturnType<typeof load>): NutritionFact[] {
  const facts: NutritionFact[] = [];

  $('.nutration-details li, .nutrition-details li').each((_index, element) => {
    const labelText = normalizeWhitespace(
      $(element).find('span').first().text().replace(/:$/, '')
    );
    if (!labelText) return;

    const valueText = normalizeWhitespace(
      $(element).clone().children('span').remove().end().text()
    );
    const unitMatch = labelText.match(/\(([^)]+)\)/);
    const label = normalizeWhitespace(labelText.replace(/\([^)]*\)/g, '')) ?? labelText;
    const amount = parseNumber(valueText);

    facts.push({
      key: mapNutritionKey(label),
      label,
      amount,
      unit: mapNutritionUnit(unitMatch?.[1]) ?? (label.toLowerCase().includes('calorie') ? 'kcal' : undefined),
      sourceText: `${labelText}: ${valueText ?? ''}`.trim(),
    });
  });

  return facts;
}

function normalizeBerkeleyDietaryTags(labels: string[]): DietaryTag[] {
  const tags = new Set<DietaryTag>();
  for (const label of labels) {
    const value = label.toLowerCase();
    if (value.includes('vegan')) tags.add('vegan');
    else if (value.includes('vegetarian')) tags.add('vegetarian');
    else if (value.includes('halal')) tags.add('halal');
    else if (value.includes('kosher')) tags.add('kosher');
    else if (value.includes('gluten free') || value.includes('gluten-free')) tags.add('gluten_free');
    else if (value.includes('low carbon')) tags.add('low_carbon');
  }
  return [...tags];
}

function normalizeKnownAllergens(labels: string[]): AllergenFact[] {
  return labels
    .map((label) => normalizeWhitespace(label))
    .filter((label): label is string => Boolean(label))
    .map((label) => ({
      key: mapAllergenKey(label),
      label,
      status: 'contains' as const,
      sourceText: label,
    }))
    .filter((fact) => fact.key !== 'other');
}

function mergeAllergens(allergens: AllergenFact[]) {
  const deduped = new Map<string, AllergenFact>();
  for (const allergen of allergens) {
    deduped.set(`${allergen.key}:${allergen.label.toLowerCase()}:${allergen.status}`, allergen);
  }
  return [...deduped.values()];
}

async function postBerkeleyAjax(data: Record<string, string>, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(BERKELEY_AJAX_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'x-requested-with': 'XMLHttpRequest',
        'user-agent': 'campus-dining-api/0.1 (+https://github.com/endo-ai/campus-dining-api)',
      },
      body: new URLSearchParams(data),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching Berkeley dining AJAX`);
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPurdueMenu(
  school: SchoolCoverage,
  query: MenuQuery
): Promise<ProviderFetchResult> {
  const fetchedAt = new Date().toISOString();
  const date = query.date ?? fetchedAt.slice(0, 10);

  try {
    const startData = await postPurdueGraphql<PurdueStartLocationsData>(PURDUE_START_LOCATIONS_QUERY);
    const locationNeedle = query.locationId?.toLowerCase();
    const candidateLocations = (startData.diningCourtCategories ?? [])
      .flatMap((category) => category.diningCourts ?? [])
      .filter((location) => location.upcomingMeals?.length)
      .filter((location) => {
        if (!locationNeedle) return true;
        return (
          location.name.toLowerCase() === locationNeedle ||
          slugify(location.name).includes(locationNeedle) ||
          location.id?.toLowerCase() === locationNeedle
        );
      });

    const locationMenus = await Promise.all(
      candidateLocations.map((location) => fetchPurdueLocationMenu(location, date, query.meal, school.sourceUrl))
    );

    const menu: NormalizedMenu = {
      schoolId: school.id,
      providerKind: 'official_html',
      sourceUrl: school.sourceUrl,
      fetchedAt,
      freshnessMinutes: 0,
      locations: locationMenus.filter((location) => location.periods.length > 0),
    };

    return {
      state: 'adapter_ready',
      provider: 'official_html',
      fetchedAt,
      sourceUrl: school.sourceUrl,
      data: menu,
    };
  } catch (error) {
    return {
      state: 'provider_error',
      provider: 'official_html',
      sourceUrl: school.sourceUrl,
      reason: 'Purdue dining GraphQL menu fetch failed.',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchPurdueLocationMenu(
  location: PurdueLocation,
  date: string,
  meal?: string,
  sourceUrl?: string
): Promise<NormalizedMenu['locations'][number]> {
  const data = await postPurdueGraphql<PurdueLocationMenuData>(PURDUE_LOCATION_MENU_QUERY, {
    name: location.name,
    date,
  });
  const sourceLocation = data.diningCourtByName;
  const mealNeedle = meal?.toLowerCase();
  const detailCache = new Map<string, Promise<PurdueItemDetail | undefined>>();
  const detailTasks: Array<() => Promise<void>> = [];
  const periods: NormalizedMenu['locations'][number]['periods'] = [];

  for (const sourceMeal of sourceLocation?.dailyMenu?.meals ?? []) {
    if (mealNeedle && !sourceMeal.name.toLowerCase().includes(mealNeedle)) continue;

    const period = {
      id: slugify(sourceMeal.name) || 'menu',
      name: sourceMeal.name,
      sourcePeriodId: sourceMeal.name,
      startTime: sourceMeal.startTime,
      endTime: sourceMeal.endTime,
      stations: [] as NormalizedMenu['locations'][number]['periods'][number]['stations'],
    };

    for (const sourceStation of sourceMeal.stations ?? []) {
      const station = {
        id: sourceStation.id,
        name: sourceStation.name,
        sourceStationId: sourceStation.id,
        items: [] as NormalizedMenuItem[],
      };

      for (const sourceAppearance of sourceStation.items ?? []) {
        const summary = sourceAppearance.item;
        if (!summary?.itemId || !summary.name) continue;

        detailTasks.push(async () => {
          const detail = await getPurdueItemDetail(summary.itemId, detailCache);
          station.items.push(
            normalizePurdueItem(
              sourceAppearance,
              detail ?? summary,
              sourceMeal,
              sourceStation,
              sourceUrl ?? PURDUE_GRAPHQL_URL
            )
          );
        });
      }

      period.stations.push(station);
    }

    periods.push(period);
  }

  await runWithConcurrency(detailTasks, PURDUE_DETAIL_CONCURRENCY);

  return {
    id: location.id ?? slugify(location.name),
    name: sourceLocation?.formalName ?? location.formalName ?? location.name,
    sourceLocationId: sourceLocation?.id ?? location.id,
    address: formatPurdueAddress(sourceLocation?.address),
    date,
    periods: periods
      .map((period) => ({
        ...period,
        stations: period.stations.filter((station) => station.items.length > 0),
      }))
      .filter((period) => period.stations.length > 0),
  };
}

function normalizePurdueItem(
  sourceAppearance: PurdueMenuItemAppearance,
  item: PurdueItemDetail | PurdueMenuItemSummary,
  sourceMeal: PurdueMeal,
  sourceStation: PurdueStation,
  sourceUrl: string
): NormalizedMenuItem {
  const detail = item as PurdueItemDetail;
  const ingredientStatement = normalizeWhitespace(detail.ingredients ?? undefined);
  const traits = detail.traits ?? item.traits ?? [];

  return {
    id: `purdue-${sourceAppearance.itemMenuId ?? item.itemId}`,
    sourceItemId: item.itemId,
    name: sourceAppearance.specialName ?? item.name,
    normalizedName: (sourceAppearance.specialName ?? item.name).toLowerCase(),
    stationId: sourceStation.id,
    stationName: sourceStation.name,
    servingSizeText: normalizePurdueServingSize(detail.nutritionFacts ?? []),
    availability: {
      status: mapPurdueAvailability(sourceMeal.status),
      startTime: sourceMeal.startTime,
      endTime: sourceMeal.endTime,
      sourceText: sourceMeal.status,
    },
    dietaryTags: normalizePurdueDietaryTags(traits),
    allergens: normalizePurdueAllergens(traits),
    ingredientStatement,
    ingredients: splitIngredients(ingredientStatement),
    nutrition: normalizePurdueNutrition(detail.nutritionFacts ?? []),
    sourceUrl,
    raw: {
      itemMenuId: sourceAppearance.itemMenuId,
      hasComponents: sourceAppearance.hasComponents,
      isNutritionReady: item.isNutritionReady,
      components: item.components?.map((component) => ({
        itemId: component.itemId,
        name: component.name,
        isNutritionReady: component.isNutritionReady,
        traits: component.traits,
      })),
    },
  };
}

async function getPurdueItemDetail(
  itemId: string,
  cache: Map<string, Promise<PurdueItemDetail | undefined>>
) {
  const existing = cache.get(itemId);
  if (existing) return existing;

  const promise = postPurdueGraphql<PurdueItemDetailData>(PURDUE_ITEM_DETAIL_QUERY, {
    id: itemId,
  }).then((data) => data.itemByItemId ?? undefined);
  cache.set(itemId, promise);
  return promise;
}

function normalizePurdueNutrition(facts: PurdueNutritionFact[]): NutritionFact[] {
  return facts
    .filter((fact) => normalizeWhitespace(fact.name) !== 'Serving Size')
    .map((fact) => {
      const name = normalizeWhitespace(fact.name) ?? 'Nutrition';
      const parsed = parsePurdueNutritionLabel(fact.label);
      const dailyValuePercent = parseDailyValuePercent(fact.dailyValueLabel);
      const key = mapNutritionKey(name.replace(/\s+/g, ''));
      return {
        key,
        label: name,
        amount: typeof fact.value === 'number' ? fact.value : parsed.amount,
        unit: parsed.unit ?? (key === 'calories' ? 'kcal' : undefined),
        dailyValuePercent,
        sourceText: `${name}: ${fact.label ?? fact.value ?? ''}`.trim(),
      };
    });
}

function normalizePurdueServingSize(facts: PurdueNutritionFact[]) {
  return normalizeWhitespace(facts.find((fact) => fact.name === 'Serving Size')?.label);
}

function parsePurdueNutritionLabel(label?: string | null): { amount?: number; unit?: NutritionUnit } {
  const match = label?.match(/([\d.]+)\s*([a-zA-Z]+)/);
  if (!match) return {};
  return {
    amount: Number(match[1]),
    unit: mapNutritionUnit(match[2]),
  };
}

function parseDailyValuePercent(value?: string | null) {
  const match = value?.match(/([\d.]+)/);
  return match ? Number(match[1]) : undefined;
}

function normalizePurdueAllergens(traits: PurdueTrait[]): AllergenFact[] {
  return traits
    .filter((trait) => trait.type?.toLowerCase() === 'allergen')
    .map((trait) => normalizeWhitespace(trait.name))
    .filter((name): name is string => Boolean(name))
    .map((name) => ({
      key: mapAllergenKey(name),
      label: name,
      status: 'contains' as const,
      sourceText: name,
    }));
}

function normalizePurdueDietaryTags(traits: PurdueTrait[]): DietaryTag[] {
  const tags = new Set<DietaryTag>();
  for (const trait of traits) {
    const value = trait.name?.toLowerCase() ?? '';
    if (trait.type?.toLowerCase() !== 'preference') continue;
    if (value.includes('vegan')) tags.add('vegan');
    else if (value.includes('vegetarian')) tags.add('vegetarian');
    else if (value.includes('gluten')) tags.add('gluten_free');
    else if (value.includes('halal')) tags.add('halal');
  }
  return [...tags];
}

function mapPurdueAvailability(status?: string) {
  const normalized = status?.toLowerCase();
  if (normalized === 'open') return 'available';
  if (normalized === 'closed') return 'unavailable';
  return 'planned';
}

function formatPurdueAddress(
  address?: NonNullable<NonNullable<PurdueLocationMenuData['diningCourtByName']>['address']>
) {
  if (!address) return undefined;
  return [address.street, address.city, address.state, address.zip]
    .map((part) => normalizeWhitespace(part))
    .filter((part): part is string => Boolean(part))
    .join(', ');
}

async function postPurdueGraphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(PURDUE_GRAPHQL_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'campus-dining-api/0.1 (+https://github.com/endo-ai/campus-dining-api)',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching Purdue GraphQL`);
    }

    const body = (await response.json()) as PurdueGraphqlResponse<T>;
    if (body.errors?.length) {
      throw new Error(body.errors.map((error) => error.message).join('; '));
    }
    if (!body.data) {
      throw new Error('Purdue GraphQL response did not include data.');
    }
    return body.data;
  } finally {
    clearTimeout(timeout);
  }
}

async function runWithConcurrency(tasks: Array<() => Promise<void>>, concurrency: number) {
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const index = nextIndex;
      nextIndex += 1;
      await tasks[index]?.();
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker())
  );
}

async function mapWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const index = nextIndex;
      nextIndex += 1;
      const task = tasks[index];
      if (task) results[index] = await task();
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker())
  );
  return results;
}

async function fetchDartmouthMenu(
  school: SchoolCoverage,
  query: MenuQuery
): Promise<ProviderFetchResult> {
  const fetchedAt = new Date().toISOString();
  const date = query.date ?? fetchedAt.slice(0, 10);
  const apiDate = toDartmouthDate(date);

  try {
    const response = await fetchJson<DartmouthMealItemsResponse>(
      `https://menu.dartmouth.edu/menuapi/mealitems?dates=${apiDate}`,
      20000
    );
    const mealNeedle = query.meal?.toLowerCase();
    const locationNeedle = query.locationId?.toLowerCase();
    const locationMap = new Map<string, NormalizedMenu['locations'][number]>();

    for (const sourceItem of response.mealItems ?? []) {
      const sourceDate = sourceItem.datesAvailable?.find((entry) => entry.date === apiDate);
      if (!sourceDate?.menus?.length || !sourceItem.itemName?.trim()) continue;

      const locationId = sourceItem.mainLocationId ?? slugify(sourceItem.mainLocationLabel ?? 'menu');
      const locationName = sourceItem.mainLocationLabel ?? 'Dining Menu';
      if (
        locationNeedle &&
        locationId.toLowerCase() !== locationNeedle &&
        !slugify(locationName).includes(locationNeedle)
      ) {
        continue;
      }

      for (const sourceMenu of sourceDate.menus) {
        const mealName = sourceMenu.mealPeriod ?? 'Menu';
        if (mealNeedle && !mealName.toLowerCase().includes(mealNeedle)) continue;

        const location = ensureLocation(locationMap, locationId, locationName, date);
        const period = ensurePeriod(location, mealName);
        const stationName = sourceMenu.subLocation ?? sourceMenu.publishingGroup ?? sourceItem.menuCategory ?? 'Menu';
        const station = ensureStation(period, stationName);
        station.items.push(
          normalizeDartmouthItem(sourceItem, sourceMenu, station.id, station.name, school.sourceUrl)
        );
      }
    }

    const menu: NormalizedMenu = {
      schoolId: school.id,
      providerKind: 'official_html',
      sourceUrl: school.sourceUrl,
      fetchedAt,
      freshnessMinutes: 0,
      locations: [...locationMap.values()].filter((location) => location.periods.length > 0),
    };

    return {
      state: 'adapter_ready',
      provider: 'official_html',
      fetchedAt,
      sourceUrl: school.sourceUrl,
      data: menu,
    };
  } catch (error) {
    return {
      state: 'provider_error',
      provider: 'official_html',
      sourceUrl: school.sourceUrl,
      reason: 'Dartmouth dining menu API fetch failed.',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function ensureLocation(
  locationMap: Map<string, NormalizedMenu['locations'][number]>,
  locationId: string,
  locationName: string,
  date: string
) {
  const existing = locationMap.get(locationId);
  if (existing) return existing;

  const location = {
    id: locationId,
    name: locationName,
    sourceLocationId: locationId,
    date,
    periods: [],
  };
  locationMap.set(locationId, location);
  return location;
}

function ensurePeriod(location: NormalizedMenu['locations'][number], mealName: string) {
  const id = slugify(mealName) || 'menu';
  const existing = location.periods.find((period) => period.id === id);
  if (existing) return existing;

  const period = {
    id,
    name: mealName,
    sourcePeriodId: mealName,
    stations: [],
  };
  location.periods.push(period);
  return period;
}

function ensureStation(
  period: NormalizedMenu['locations'][number]['periods'][number],
  stationName: string
) {
  const id = slugify(stationName) || 'menu';
  const existing = period.stations.find((station) => station.id === id);
  if (existing) return existing;

  const station = {
    id,
    name: stationName,
    sourceStationId: stationName,
    items: [],
  };
  period.stations.push(station);
  return station;
}

function normalizeDartmouthItem(
  sourceItem: DartmouthMealItem,
  sourceMenu: DartmouthSourceMenu,
  stationId: string,
  stationName: string,
  sourceUrl: string
): NormalizedMenuItem {
  const ingredientStatement = normalizeIngredientStatement(sourceItem.ingredients);

  return {
    id: `dartmouth-${sourceMenu.menuId ?? sourceItem.id}`,
    sourceItemId: sourceItem.id,
    name: sourceItem.itemName.trim(),
    normalizedName: sourceItem.itemName.trim().toLowerCase(),
    category: sourceItem.menuCategory ?? sourceItem.recipeCategory?.[0],
    stationId,
    stationName,
    servingSizeText: normalizeWhitespace(sourceItem.portionSize),
    availability: {
      status: 'planned',
    },
    dietaryTags: normalizeDietaryTags(sourceItem.meetsPreferences ?? []),
    allergens: normalizeAllergens(sourceItem.containsAllergens ?? []),
    ingredientStatement,
    ingredients: splitIngredients(ingredientStatement),
    nutrition: normalizeNutrition(sourceItem.nutrients ?? []),
    imageUrl: normalizeWhitespace(sourceItem.imagePath),
    sourceUrl,
    raw: {
      remoteId: sourceItem.remoteId,
      menuId: sourceMenu.menuId,
      recipeCategory: sourceItem.recipeCategory,
      publishingGroup: sourceMenu.publishingGroup,
      subLocation: sourceMenu.subLocation,
    },
  };
}

function normalizeNutrition(nutrients: NonNullable<DartmouthMealItem['nutrients']>): NutritionFact[] {
  const facts: NutritionFact[] = [];

  for (const nutrient of nutrients) {
    const label = normalizeWhitespace(nutrient.label);
    if (!label) continue;

    const amount = typeof nutrient.value === 'number' ? nutrient.value : Number(nutrient.value);
    const dailyValuePercent =
      typeof nutrient.percentDailyValue === 'number'
        ? nutrient.percentDailyValue
        : Number(nutrient.percentDailyValue);

    facts.push({
      key: mapNutritionKey(nutrient.id ?? label),
      label,
      amount: Number.isFinite(amount) ? amount : undefined,
      unit: mapNutritionUnit(nutrient.unit),
      dailyValuePercent: Number.isFinite(dailyValuePercent) ? dailyValuePercent : undefined,
      sourceText: `${label}: ${nutrient.value ?? ''}${nutrient.unit ?? ''}`.trim(),
    });
  }

  return facts;
}

function mapNutritionKey(value: string): NutritionKey {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (normalized.includes('caloriesfromfat')) return 'other';
  if (normalized.includes('calorie')) return 'calories';
  if (normalized.includes('saturatedfat')) return 'saturated_fat';
  if (normalized.includes('transfat')) return 'trans_fat';
  if (normalized.includes('totalfat') || normalized.includes('totallipidfat')) return 'total_fat';
  if (normalized.includes('cholesterol')) return 'cholesterol';
  if (normalized.includes('sodium')) return 'sodium';
  if (normalized.includes('totalcarbohydrate') || normalized === 'carbohydrate') return 'total_carbohydrate';
  if (normalized.includes('fiber')) return 'dietary_fiber';
  if (normalized.includes('addedsugar')) return 'added_sugars';
  if (normalized.includes('totalsugars') || normalized === 'sugar' || normalized === 'sugars') return 'total_sugars';
  if (normalized.includes('protein')) return 'protein';
  if (normalized.includes('vitamind')) return 'vitamin_d';
  if (normalized.includes('calcium')) return 'calcium';
  if (normalized.includes('iron')) return 'iron';
  if (normalized.includes('potassium')) return 'potassium';
  return 'other';
}

function mapNutritionUnit(unit?: string | null): NutritionUnit | undefined {
  const normalized = unit?.toLowerCase().replace('µ', 'mc');
  if (!normalized) return undefined;
  if (normalized === 'gm' || normalized === 'g') return 'g';
  if (normalized === 'mg') return 'mg';
  if (normalized === 'mcg') return 'mcg';
  if (normalized === 'kcal') return 'kcal';
  if (normalized === 'iu') return 'iu';
  return 'other';
}

function normalizeDietaryTags(preferences: Array<{ label?: string }>): DietaryTag[] {
  const tags = new Set<DietaryTag>();
  for (const preference of preferences) {
    const value = preference.label?.toLowerCase() ?? '';
    if (value.includes('vegan')) tags.add('vegan');
    else if (value.includes('vegetarian')) tags.add('vegetarian');
    else if (value.includes('gluten-free') || value.includes('gluten free')) tags.add('gluten_free');
    else if (value.includes('halal')) tags.add('halal');
    else if (value.includes('kosher')) tags.add('kosher');
  }
  return [...tags];
}

function normalizeAllergens(allergens: Array<{ label?: string }>): AllergenFact[] {
  return allergens
    .map((allergen) => normalizeWhitespace(allergen.label))
    .filter((label): label is string => Boolean(label))
    .map((label) => ({
      key: mapAllergenKey(label),
      label,
      status: 'contains' as const,
      sourceText: label,
    }));
}

function mapAllergenKey(label: string): AllergenKey {
  const value = label.toLowerCase();
  if (value.includes('dairy') || value.includes('milk')) return 'milk';
  if (value.includes('egg')) return 'egg';
  if (value.includes('fish')) return 'fish';
  if (value.includes('shellfish') || value.includes('shrimp') || value.includes('crab')) return 'crustacean_shellfish';
  if (value.includes('tree nut') || value.includes('almond') || value.includes('walnut')) return 'tree_nut';
  if (value.includes('peanut')) return 'peanut';
  if (value.includes('wheat')) return 'wheat';
  if (value.includes('soy')) return 'soy';
  if (value.includes('sesame')) return 'sesame';
  if (value.includes('gluten')) return 'gluten';
  return 'other';
}

function normalizeIngredientStatement(value?: string) {
  const normalized = normalizeWhitespace(value);
  if (
    !normalized ||
    normalized.toLowerCase() === 'no ingredients' ||
    normalized.toLowerCase() === 'not available'
  ) {
    return undefined;
  }
  return normalized;
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
  const openers = new Set(['(', '[', '{']);
  const closers = new Set([')', ']', '}']);

  for (const char of statement) {
    if (openers.has(char)) depth += 1;
    if (closers.has(char)) depth = Math.max(0, depth - 1);

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

function splitCommaList(value?: string) {
  return (value ?? '')
    .split(',')
    .map((part) => normalizeWhitespace(part))
    .filter((part): part is string => Boolean(part));
}

function splitSpaceList(value?: string) {
  return (value ?? '')
    .split(/\s+/)
    .map((part) => normalizeWhitespace(part))
    .filter((part): part is string => Boolean(part));
}

function ingredientAllergens(name: string): AllergenKey[] {
  return allergenKeysInIngredientText(name);
}

function toDartmouthDate(date: string) {
  return date.replace(/-/g, '');
}

function toStanfordDate(date: string) {
  const [year, month, day] = date.split('-');
  return `${Number(month)}/${Number(day)}/${year}`;
}

function toCompactDate(date: string) {
  return date.replace(/-/g, '');
}

function withDateParam(url: string, date: string) {
  const parsedUrl = new URL(url);
  parsedUrl.searchParams.set('date', date);
  return parsedUrl.toString();
}

function parseNumber(value?: string) {
  const match = value?.match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const amount = Number(match[0]);
  return Number.isFinite(amount) ? amount : undefined;
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
