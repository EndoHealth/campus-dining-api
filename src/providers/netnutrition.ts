import { load } from 'cheerio';
import { allergenKeysInIngredientText } from './allergen-text.js';
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

type NetNutritionLocation = {
  id: string;
  name: string;
  oid: number;
};

type NetNutritionConfig = {
  schoolId: string;
  label: string;
  baseUrl: string;
  locations: NetNutritionLocation[];
};

type NetNutritionPanel = {
  id?: string;
  html?: string;
};

type NetNutritionPanelResponse = {
  success?: boolean;
  panels?: NetNutritionPanel[];
};

type NetNutritionMenuLink = {
  id: string;
  name: string;
  date?: string;
};

type NetNutritionItemSeed = {
  id: string;
  name: string;
  category: string;
  servingSizeText?: string;
  iconLabels: string[];
};

type NutritionLabelDetail = {
  servingSizeText?: string;
  ingredientStatement?: string;
  ingredients: IngredientFact[];
  allergens: AllergenFact[];
  nutrition: NutritionFact[];
};

const DUKE_BASE_URL = 'https://netnutrition.cbord.com/nn-prod/duke';
const UW_BASE_URL = 'https://nutrition.hfs.uw.edu/NetNutrition/1';
const NET_NUTRITION_TIMEOUT_MS = 30000;
const LOCATION_CONCURRENCY = 3;
const MENU_CONCURRENCY = 1;
const ITEM_CONCURRENCY = 4;

const DUKE_LOCATIONS: NetNutritionLocation[] = [
  { id: 'bella-union', name: 'Bella Union', oid: 5 },
  { id: 'ginger-and-soy', name: 'Ginger and Soy', oid: 24 },
  { id: 'gyotaku', name: 'Gyotaku', oid: 25 },
  { id: 'il-forno', name: 'Il Forno', oid: 22 },
  { id: 'jbs', name: "JB's", oid: 6 },
  { id: 'nasher', name: 'Nasher', oid: 19 },
  { id: 'panda', name: 'Panda', oid: 16 },
  { id: 'red-mango', name: 'Red Mango', oid: 20 },
  { id: 'sazon', name: 'Sazon', oid: 23 },
  { id: 'krafthouse', name: 'Krafthouse', oid: 29 },
  { id: 'the-loop', name: 'The Loop', oid: 17 },
  { id: 'farmstead', name: 'Farmstead', oid: 11 },
  { id: 'tandoor', name: 'Tandoor', oid: 21 },
  { id: 'beyu-blue', name: 'Beyu Blue', oid: 26 },
  { id: 'cafe', name: 'CaFe', oid: 13 },
  { id: 'cafe-300', name: 'Cafe 300', oid: 28 },
  { id: 'marketplace', name: 'Marketplace', oid: 3 },
  { id: 'mcdonalds', name: "McDonald's", oid: 18 },
  { id: 'panera', name: 'Panera', oid: 30 },
  { id: 'saladalia', name: 'Saladalia', oid: 14 },
  { id: 'sprout', name: 'Sprout', oid: 10 },
  { id: 'pitchforks', name: "Pitchfork's", oid: 7 },
  { id: 'skillet', name: 'Skillet', oid: 8 },
  { id: 'trinity-cafe', name: 'Trinity Cafe', oid: 4 },
  { id: 'zwelis', name: "Zweli's", oid: 31 },
];

const UW_LOCATIONS: NetNutritionLocation[] = [
  { id: 'local-point-plate', name: 'Local Point - Plate', oid: 2 },
  { id: 'local-point-deli', name: 'Local Point - Deli', oid: 3 },
  { id: 'local-point-dub-street', name: 'Local Point - Dub Street', oid: 4 },
  { id: 'local-point-global-kitchen', name: 'Local Point - Global Kitchen', oid: 5 },
  { id: 'local-point-tero', name: 'Local Point - Tero', oid: 6 },
  { id: 'local-point-salad-bar', name: 'Local Point - Salad Bar', oid: 7 },
  { id: 'local-point-pizza', name: 'Local Point - Pizza', oid: 8 },
  { id: 'center-table-plate', name: 'Center Table - Plate', oid: 10 },
  { id: 'center-table-market-deli', name: 'Center Table - Market Deli', oid: 11 },
  { id: 'center-table-seared', name: 'Center Table - Seared', oid: 12 },
  { id: 'center-table-noodle', name: 'Center Table - Noodle', oid: 13 },
  { id: 'center-table-global', name: 'Center Table - Global', oid: 14 },
  { id: 'center-table-select', name: 'Center Table - Select', oid: 15 },
  { id: 'center-table-quench', name: 'Center Table - Quench', oid: 16 },
  { id: 'center-table-salad-bar', name: 'Center Table - Salad Bar', oid: 17 },
  { id: 'husky-den-cantina', name: 'Husky Den - Cantina', oid: 19 },
  { id: 'husky-den-dub-street', name: 'Husky Den - Dub Street', oid: 20 },
  { id: 'husky-den-firecracker', name: 'Husky Den - Firecracker', oid: 21 },
  { id: 'husky-den-glacie-creamery', name: 'Husky Den - Glacie Creamery', oid: 22 },
  { id: 'husky-den-katora', name: 'Husky Den - Katora', oid: 23 },
  { id: 'husky-den-motosurf', name: 'Husky Den - Motosurf', oid: 24 },
  { id: 'husky-den-red-radish', name: 'Husky Den - Red Radish', oid: 25 },
  { id: 'husky-den-pizza', name: 'Husky Den - Pizza', oid: 26 },
  { id: 'cultivate', name: 'Cultivate', oid: 27 },
  { id: 'pizza-at-oliver', name: 'Pizza @ Oliver', oid: 28 },
  { id: 'dawg-bites', name: 'Dawg Bites', oid: 29 },
  { id: 'by-george', name: 'By George', oid: 30 },
];

const NET_NUTRITION_CONFIGS: NetNutritionConfig[] = [
  {
    schoolId: 'duke',
    label: 'Duke',
    baseUrl: DUKE_BASE_URL,
    locations: DUKE_LOCATIONS,
  },
  {
    schoolId: 'washington',
    label: 'UW',
    baseUrl: UW_BASE_URL,
    locations: UW_LOCATIONS,
  },
];

export class NetNutritionProvider implements DiningProviderAdapter {
  readonly provider = 'vendor_netnutrition' as const;

  async fetchMenu(school: SchoolCoverage, query: MenuQuery): Promise<ProviderFetchResult> {
    const fetchedAt = new Date().toISOString();
    const date = query.date ?? fetchedAt.slice(0, 10);

    const config = NET_NUTRITION_CONFIGS.find((candidate) => candidate.schoolId === school.id);
    if (!config) {
      return {
        state: 'poc_required',
        provider: this.provider,
        sourceUrl: school.sourceUrl,
        reason: 'NetNutrition source is cataloged, but this school-specific adapter is not implemented yet.',
      };
    }

    try {
      const locations = filterLocations(config.locations, query.locationId);
      const normalizedLocations = await mapWithConcurrency(locations, LOCATION_CONCURRENCY, (location) =>
        fetchNetNutritionLocationMenu(config, school, location, date, query.meal).catch(() =>
          emptyLocation(location, date)
        )
      );

      const menu: NormalizedMenu = {
        schoolId: school.id,
        providerKind: this.provider,
        sourceUrl: school.sourceUrl,
        fetchedAt,
        freshnessMinutes: 0,
        locations: normalizedLocations.filter((location) => location.periods.length > 0),
      };

      if (menu.locations.length === 0) {
        return {
          state: 'provider_error',
          provider: this.provider,
          sourceUrl: school.sourceUrl,
          reason: `NetNutrition returned no current ${config.label} menu items for the requested filters.`,
        };
      }

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
        reason: 'NetNutrition provider fetch failed.',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

function emptyLocation(location: NetNutritionLocation, date: string): NormalizedMenu['locations'][number] {
  return {
    id: location.id,
    name: location.name,
    sourceLocationId: String(location.oid),
    date,
    periods: [],
  };
}

async function fetchNetNutritionLocationMenu(
  config: NetNutritionConfig,
  school: SchoolCoverage,
  location: NetNutritionLocation,
  date: string,
  meal?: string
): Promise<NormalizedMenu['locations'][number]> {
  const session = await createNetNutritionSession(config.baseUrl);
  const locationResponse = await session.postJson<NetNutritionPanelResponse>(
    'Unit/SelectUnitFromSideBar',
    `unitOid=${location.oid}`
  );
  const menuLinks = parseMenuLinks(panelHtml(locationResponse, 'menuPanel'), date, meal);
  const periods = await mapWithConcurrency(menuLinks, MENU_CONCURRENCY, (menuLink) =>
    fetchNetNutritionMenuPeriod(config, session, school, location, menuLink, date)
  );
  const directSeeds = menuLinks.length === 0 ? parseItemSeeds(panelHtml(locationResponse, 'itemPanel')) : [];
  if (directSeeds.length > 0) {
    periods.push(
      await normalizeDirectItemPanel(config, session, school, location, date, meal ?? 'All Day', directSeeds)
    );
  }

  return {
    id: location.id,
    name: location.name,
    sourceLocationId: String(location.oid),
    date,
    periods: periods.filter((period) => period.stations.some((station) => station.items.length > 0)),
  };
}

async function fetchNetNutritionMenuPeriod(
  config: NetNutritionConfig,
  session: NetNutritionSession,
  school: SchoolCoverage,
  location: NetNutritionLocation,
  menuLink: NetNutritionMenuLink,
  date: string
): Promise<NormalizedMenu['locations'][number]['periods'][number]> {
  const menuResponse = await session.postJson<NetNutritionPanelResponse>(
    'Menu/SelectMenu',
    `menuOid=${menuLink.id}`
  );
  const seeds = parseItemSeeds(panelHtml(menuResponse, 'itemPanel'));
  const items = await mapWithConcurrency(seeds, ITEM_CONCURRENCY, async (seed, index) => {
    const detail = await fetchNutritionLabelDetail(session, seed.id).catch(() => emptyNutritionLabelDetail());
    return normalizeNetNutritionItem(config, school, location, menuLink, seed, detail, date, index);
  });
  return groupItemsByStation(location, menuLink, items);
}

async function normalizeDirectItemPanel(
  config: NetNutritionConfig,
  session: NetNutritionSession,
  school: SchoolCoverage,
  location: NetNutritionLocation,
  date: string,
  periodName: string,
  seeds: NetNutritionItemSeed[]
): Promise<NormalizedMenu['locations'][number]['periods'][number]> {
  const menuLink = {
    id: `unit-${location.oid}-direct`,
    name: normalizeWhitespace(periodName) ?? 'All Day',
    date,
  };
  const items = await mapWithConcurrency(seeds, ITEM_CONCURRENCY, async (seed, index) => {
    const detail = await fetchNutritionLabelDetail(session, seed.id).catch(() => emptyNutritionLabelDetail());
    return normalizeNetNutritionItem(config, school, location, menuLink, seed, detail, date, index);
  });
  return groupItemsByStation(location, menuLink, items);
}

function groupItemsByStation(
  location: NetNutritionLocation,
  menuLink: NetNutritionMenuLink,
  items: NormalizedMenuItem[]
): NormalizedMenu['locations'][number]['periods'][number] {
  const stationMap = new Map<string, NormalizedMenu['locations'][number]['periods'][number]['stations'][number]>();

  for (const item of items) {
    const stationName = item.category ?? 'Menu';
    const stationId = slugify(stationName) || 'menu';
    const station =
      stationMap.get(stationId) ??
      {
        id: `${location.id}-${slugify(menuLink.name)}-${stationId}`,
        name: stationName,
        sourceStationId: stationName,
        items: [],
      };
    station.items.push({
      ...item,
      stationId: station.id,
      stationName: station.name,
    });
    stationMap.set(stationId, station);
  }

  return {
    id: `${location.id}-${menuLink.id}`,
    name: menuLink.name,
    sourcePeriodId: menuLink.id,
    stations: [...stationMap.values()],
  };
}

function emptyNutritionLabelDetail(): NutritionLabelDetail {
  return {
    ingredients: [],
    allergens: [],
    nutrition: [],
  };
}

async function fetchNutritionLabelDetail(
  session: NetNutritionSession,
  detailOid: string,
  menuOid?: string
): Promise<NutritionLabelDetail> {
  const body = new URLSearchParams({ detailOid });
  if (menuOid && !menuOid.includes('direct')) body.set('menuOid', menuOid);
  const html = await session.postText('NutritionDetail/ShowItemNutritionLabel', body.toString());
  const $ = load(html);
  const servingSizeText = normalizeWhitespace($('.cbo_nn_LabelBottomBorderLabel .inline-div-right').first().text());
  const ingredientStatement = normalizeIngredientStatement($('.cbo_nn_LabelIngredients').first().text());
  const ingredients = splitIngredients(ingredientStatement);
  const allergens = normalizeAllergens(splitCommaList($('.cbo_nn_LabelAllergens').first().text()));
  const nutrition = parseNutritionFacts($);

  return {
    servingSizeText,
    ingredientStatement,
    ingredients,
    allergens,
    nutrition,
  };
}

function normalizeNetNutritionItem(
  config: NetNutritionConfig,
  school: SchoolCoverage,
  location: NetNutritionLocation,
  menuLink: NetNutritionMenuLink,
  seed: NetNutritionItemSeed,
  detail: NutritionLabelDetail,
  date: string,
  index: number
): NormalizedMenuItem {
  const allergens = mergeAllergens([...normalizeAllergens(seed.iconLabels), ...detail.allergens]);

  return {
    id: `${school.id}-${location.id}-${date}-${menuLink.id}-${index}-${slugify(seed.name)}`,
    sourceItemId: seed.id,
    name: seed.name,
    normalizedName: seed.name.toLowerCase(),
    category: seed.category,
    stationName: seed.category,
    servingSizeText: detail.servingSizeText ?? seed.servingSizeText,
    availability: {
      status: 'planned',
    },
    dietaryTags: normalizeDietaryTags(seed.iconLabels),
    allergens,
    ingredientStatement: detail.ingredientStatement,
    ingredients: detail.ingredients,
    nutrition: detail.nutrition,
    sourceUrl: `${config.baseUrl}/Menu/SelectMenu`,
    raw: {
      locationOid: location.oid,
      menuOid: menuLink.id,
      menuDate: menuLink.date,
      detailOid: seed.id,
      iconLabels: seed.iconLabels,
    },
  };
}

function parseMenuLinks(html: string, date: string, meal?: string): NetNutritionMenuLink[] {
  const $ = load(html);
  const links: NetNutritionMenuLink[] = [];
  const mealNeedle = meal ? slugify(meal) : undefined;

  $('a.cbo_nn_menuLink').each((_index, element) => {
    const onclick = $(element).attr('onclick') ?? '';
    const id = onclick.match(/menuListSelectMenu\((\d+)\)/)?.[1];
    const name = normalizeWhitespace($(element).text());
    if (!id || !name) return;
    if (mealNeedle && !mealMatches(name, mealNeedle)) return;

    const dateText = normalizeWhitespace($(element).closest('section.card').find('header').first().text());
    const linkDate = dateText ? parseDisplayDate(dateText) : undefined;
    if (linkDate && linkDate !== date) return;

    links.push({ id, name, date: linkDate });
  });

  return dedupeBy(links, (link) => `${link.id}:${link.name}:${link.date ?? 'current'}`);
}

function parseItemSeeds(html: string): NetNutritionItemSeed[] {
  const $ = load(html);
  const categoryById = new Map<string, string>();
  const seeds: NetNutritionItemSeed[] = [];

  $('tr.cbo_nn_itemGroupRow').each((_index, row) => {
    const id =
      $(row).attr('data-categoryid') ??
      $(row)
        .attr('onclick')
        ?.match(/toggleCourseItems\(this,\s*(\d+)\)/)?.[1];
    const name = normalizeWhitespace(
      $(row).find('div[role="button"]').first().clone().children().remove().end().text()
    );
    if (id && name) categoryById.set(id, name.replace(/\s+$/, ''));
  });

  $('tr.cbo_nn_itemPrimaryRow[data-categoryid], tr.cbo_nn_itemAlternateRow[data-categoryid]').each((_index, row) => {
    const $row = $(row);
    const categoryId = $row.attr('data-categoryid') ?? '';
    const category = categoryById.get(categoryId) ?? 'Menu';
    const link = $row.find('a.cbo_nn_itemHover').first();
    const name = normalizeWhitespace(link.clone().children().remove().end().text());
    const detailOid =
      link.attr('id')?.match(/showNutrition_(\d+)/)?.[1] ??
      link.attr('onkeyup')?.match(/KeyUp\(event,(\d+)\)/)?.[1] ??
      link.attr('onclick')?.match(/OnClick\(event,(\d+)\)/)?.[1];
    if (!detailOid || !name) return;

    const servingSizeText = normalizeWhitespace($row.children('td').eq(2).text());
    const iconLabels = link
      .find('img[alt], img[title]')
      .map((_iconIndex, icon) => normalizeIconLabel($(icon).attr('title') ?? $(icon).attr('alt')))
      .get()
      .filter((label): label is string => Boolean(label));

    seeds.push({
      id: detailOid,
      name,
      category,
      servingSizeText,
      iconLabels,
    });
  });

  return seeds;
}

function parseNutritionFacts($: ReturnType<typeof load>): NutritionFact[] {
  const nutrition: NutritionFact[] = [];
  const caloriesText = normalizeWhitespace($('.cbo_nn_LabelSubHeader .font-22').first().text());
  const caloriesAmount = parseNumber(caloriesText);
  if (caloriesText) {
    nutrition.push({
      key: 'calories',
      label: 'Calories',
      amount: caloriesAmount,
      unit: 'kcal',
      sourceText: `Calories: ${caloriesText}`,
    });
  }

  $('.cbo_nn_LabelBorderedSubHeader, .cbo_nn_LabelNoBorderSubHeader').each((_index, element) => {
    const left = $(element).find('.inline-div-left').first();
    const label = normalizeNutritionLabel(left.find('span').first().text());
    const amountText = normalizeWhitespace(left.find('span').slice(1).text()) ?? '';
    if (!label || label === 'Ingredients') return;

    const key = mapNutritionKey(label);
    if (!key) return;

    const parsed = parseAmountAndUnit(amountText);
    const dailyValueText = normalizeWhitespace($(element).find('.inline-div-right').first().text());
    const dailyValuePercent = parseNumber(dailyValueText);
    nutrition.push({
      key,
      label,
      amount: parsed.amount,
      unit: key === 'calories' ? 'kcal' : parsed.unit,
      dailyValuePercent,
      sourceText: `${label}: ${amountText}`.trim(),
    });
  });

  return dedupeBy(nutrition, (fact) => `${fact.key}:${fact.label}:${fact.sourceText ?? ''}`);
}

async function createNetNutritionSession(baseUrl: string) {
  let cookie = '';
  const response = await fetchWithTimeout(baseUrl, {
    redirect: 'manual',
    headers: commonHeaders('text/html,*/*'),
  });
  cookie = mergeCookies(cookie, response);

  return {
    async postJson<T>(path: string, body: string): Promise<T> {
      const response = await this.post(path, body, 'application/json,text/html,*/*');
      const text = await response.text();
      return JSON.parse(text) as T;
    },
    async postText(path: string, body: string): Promise<string> {
      const response = await this.post(path, body, 'text/html,application/json,*/*');
      return response.text();
    },
    async post(path: string, body: string, accept: string) {
      const response = await fetchWithTimeout(`${baseUrl}/${path}`, {
        method: 'POST',
        headers: {
          ...commonHeaders(accept),
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          cookie,
          'x-requested-with': 'XMLHttpRequest',
        },
        body,
      });
      cookie = mergeCookies(cookie, response);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching NetNutrition ${path}`);
      }
      return response;
    },
  };
}

type NetNutritionSession = Awaited<ReturnType<typeof createNetNutritionSession>>;

function commonHeaders(accept: string) {
  return {
    accept,
    'accept-language': 'en-US,en;q=0.9',
    'user-agent': 'campus-dining-api/0.1 (+https://github.com/endo-ai/campus-dining-api)',
  };
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NET_NUTRITION_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function mergeCookies(existing: string, response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const setCookieHeaders = headers.getSetCookie?.() ?? splitSetCookieHeader(response.headers.get('set-cookie'));
  if (setCookieHeaders.length === 0) return existing;

  const cookies = new Map<string, string>(
    existing
      .split(/;\s*/)
      .filter(Boolean)
      .map((cookie) => {
        const [name, ...rest] = cookie.split('=');
        return [name, `${name}=${rest.join('=')}`] as const;
      })
  );

  for (const setCookie of setCookieHeaders) {
    const cookie = setCookie.split(';')[0];
    const name = cookie?.split('=')[0];
    if (name && cookie) cookies.set(name, cookie);
  }

  return [...cookies.values()].join('; ');
}

function splitSetCookieHeader(value: string | null) {
  if (!value) return [];
  return value.split(/,\s*(?=[^;,]+=)/);
}

function filterLocations(locations: NetNutritionLocation[], locationId?: string) {
  if (!locationId) return locations;
  const needle = slugify(locationId);
  return locations.filter(
    (location) => location.id === needle || String(location.oid) === locationId || slugify(location.name) === needle
  );
}

function panelHtml(response: NetNutritionPanelResponse, panelId: string) {
  return response.panels?.find((panel) => panel.id === panelId)?.html ?? '';
}

function mealMatches(name: string, mealNeedle: string) {
  const value = slugify(name);
  if (value.includes(mealNeedle)) return true;
  return (mealNeedle === 'lunch' || mealNeedle === 'dinner') && value.includes('lunch-and-dinner');
}

function parseDisplayDate(value: string) {
  const parsed = new Date(`${value} 12:00:00 UTC`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

function normalizeNutritionLabel(label: string) {
  const normalized = normalizeWhitespace(label.replace(/\s+/g, ' '));
  if (!normalized) return undefined;
  if (/include\s+.*added sugars/i.test(normalized)) return 'Added Sugars';
  if (/^trans\b/i.test(normalized)) return 'Trans Fat';
  if (/^potas\./i.test(normalized)) return 'Potassium';
  return normalized;
}

function mapNutritionKey(label: string): NutritionKey | undefined {
  const value = label.toLowerCase();
  if (value.includes('calorie')) return 'calories';
  if (value === 'total fat') return 'total_fat';
  if (value === 'saturated fat') return 'saturated_fat';
  if (value === 'trans fat') return 'trans_fat';
  if (value === 'cholesterol') return 'cholesterol';
  if (value === 'sodium') return 'sodium';
  if (value === 'total carbohydrate') return 'total_carbohydrate';
  if (value === 'dietary fiber') return 'dietary_fiber';
  if (value === 'total sugars') return 'total_sugars';
  if (value === 'added sugars') return 'added_sugars';
  if (value === 'protein') return 'protein';
  if (value === 'calcium') return 'calcium';
  if (value === 'iron') return 'iron';
  if (value === 'potassium') return 'potassium';
  return 'other';
}

function parseAmountAndUnit(value: string): { amount?: number; unit?: NutritionUnit } {
  const match = value.match(/<?\s*([0-9]+(?:\.[0-9]+)?)\s*([A-Za-zµ]+)?/);
  if (!match) return {};
  const amount = Number(match[1]);
  return {
    amount: Number.isFinite(amount) ? amount : undefined,
    unit: mapNutritionUnit(match[2]),
  };
}

function parseNumber(value?: string | null) {
  const match = value?.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const amount = Number(match[0]);
  return Number.isFinite(amount) ? amount : undefined;
}

function mapNutritionUnit(unit?: string): NutritionUnit | undefined {
  const value = unit?.toLowerCase();
  if (!value) return undefined;
  if (value === 'g') return 'g';
  if (value === 'mg') return 'mg';
  if (value === 'mcg' || value === 'µg') return 'mcg';
  if (value === 'iu') return 'iu';
  return 'other';
}

function normalizeDietaryTags(labels: string[]): DietaryTag[] {
  const tags = new Set<DietaryTag>();
  for (const label of labels) {
    const value = label.toLowerCase();
    if (value.includes('vegan')) tags.add('vegan');
    else if (value.includes('vegetarian')) tags.add('vegetarian');
    else if (value.includes('halal')) tags.add('halal');
    else if (value.includes('kosher')) tags.add('kosher');
  }
  return [...tags];
}

function normalizeAllergens(labels: string[]): AllergenFact[] {
  return labels
    .filter((label) => !normalizeDietaryTags([label]).length)
    .map((label) => ({
      key: mapAllergenKey(label),
      label,
      status: 'contains' as const,
      sourceText: label,
    }));
}

function mapAllergenKey(label: string): AllergenKey {
  const value = label.toLowerCase();
  if (value.includes('milk') || value.includes('dairy')) return 'milk';
  if (value.includes('egg')) return 'egg';
  if (value.includes('shellfish')) return 'crustacean_shellfish';
  if (value.includes('fish')) return 'fish';
  if (value.includes('tree nut') || value.includes('treenut')) return 'tree_nut';
  if (value.includes('peanut')) return 'peanut';
  if (value.includes('wheat')) return 'wheat';
  if (value.includes('soy')) return 'soy';
  if (value.includes('sesame')) return 'sesame';
  if (value.includes('gluten')) return 'gluten';
  return 'other';
}

function mergeAllergens(allergens: AllergenFact[]) {
  const byKey = new Map<string, AllergenFact>();
  for (const allergen of allergens) {
    byKey.set(`${allergen.key}:${allergen.status}`, allergen);
  }
  return [...byKey.values()];
}

function normalizeIngredientStatement(value?: string) {
  return normalizeWhitespace(value?.replace(/\u00a0/g, ' '));
}

function splitIngredients(statement?: string): IngredientFact[] {
  if (!statement) return [];
  return splitTopLevel(statement, ',')
    .map((name) => normalizeWhitespace(name))
    .filter((name): name is string => Boolean(name))
    .map((name) => ({
      name,
      normalizedName: name.toLowerCase(),
      containsAllergenKeys: allergenKeysInText(name),
      sourceText: name,
    }));
}

function allergenKeysInText(value: string) {
  return allergenKeysInIngredientText(value);
}

function splitCommaList(value: string) {
  return value
    .replace(/\u00a0/g, ' ')
    .split(',')
    .map((entry) => normalizeWhitespace(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function splitTopLevel(value: string, delimiter: string) {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of value) {
    if (char === '(' || char === '[') depth += 1;
    if ((char === ')' || char === ']') && depth > 0) depth -= 1;
    if (char === delimiter && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  if (current) parts.push(current);
  return parts;
}

function normalizeWhitespace(value?: string | null) {
  const normalized = value?.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

function normalizeIconLabel(value?: string | null) {
  return normalizeWhitespace(value?.replace(/\s+image$/i, ''));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function dedupeBy<T>(values: T[], key: (value: T) => string) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const id = key(value);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index] as T, index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}
