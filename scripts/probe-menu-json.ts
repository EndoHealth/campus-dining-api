import { mkdir, writeFile } from 'node:fs/promises';
import { TOP_50_SCHOOLS } from '../src/data/top50-schools.js';
import type { ProviderKind, SchoolCoverage } from '../src/types/dining.js';

type FetchProbe = {
  url: string;
  ok: boolean;
  status?: number;
  contentType?: string | null;
  finalUrl?: string;
  isJson: boolean;
  bytes?: number;
  error?: string;
};

type MenuJsonProbe = {
  url?: string;
  ok: boolean;
  status?: number;
  contentType?: string | null;
  providerDataKind:
    | 'nutrislice_schools'
    | 'nutrislice_week_menu'
    | 'direct_source'
    | 'not_attempted';
  jsonParsed: boolean;
  locationsCount?: number;
  menuTypesCount?: number;
  menuDaysCount?: number;
  menuRowsCount?: number;
  foodItemsCount?: number;
  attemptedMenuCount?: number;
  sampleFields?: {
    hasIngredients: boolean;
    hasNutrition: boolean;
    hasDietaryIcons: boolean;
    hasServingSize: boolean;
    hasPrice: boolean;
  };
  blocker?: string;
  error?: string;
};

type SchoolProbeResult = {
  schoolId: string;
  rank: number;
  name: string;
  providerKind: ProviderKind;
  sourceUrl: string;
  sourceFetch: FetchProbe;
  jsonDiscovery: MenuJsonProbe[];
  verdict:
    | 'menu_json_confirmed'
    | 'source_reachable_adapter_needed'
    | 'blocked_or_unreachable'
    | 'manual_poc_required';
};

type ProbeReport = {
  generatedAt: string;
  date: string;
  scope: 'top50';
  summary: {
    totalSchools: number;
    menuJsonConfirmed: number;
    sourceReachableAdapterNeeded: number;
    manualPocRequired: number;
    blockedOrUnreachable: number;
    providerCounts: Record<string, number>;
    menuJsonConfirmedByProvider: Record<string, number>;
  };
  results: SchoolProbeResult[];
};

const today = new Date();
const probeDate = process.env.PROBE_DATE ?? today.toISOString().slice(0, 10);
const timeoutMs = Number(process.env.PROBE_TIMEOUT_MS ?? 10000);

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { controller, timeout };
}

async function fetchText(url: string): Promise<FetchProbe & { text?: string }> {
  const { controller, timeout } = withTimeout(timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'user-agent':
          'campus-dining-api-probe/0.1 (+https://github.com/endo-ai/campus-dining-api)',
      },
    });

    const text = await response.text();
    const contentType = response.headers.get('content-type');
    const isJson = contentType?.includes('application/json') || looksLikeJson(text);

    return {
      url,
      ok: response.ok,
      status: response.status,
      contentType,
      finalUrl: response.url,
      isJson,
      bytes: Buffer.byteLength(text),
      text,
    };
  } catch (error) {
    return {
      url,
      ok: false,
      isJson: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function looksLikeJson(text: string) {
  const trimmed = text.trim();
  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  );
}

function parseJson(text?: string): unknown | undefined {
  if (!text) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function nutrisliceDistrict(sourceUrl: string) {
  const host = new URL(sourceUrl).hostname;
  if (!host.endsWith('.nutrislice.com')) return undefined;
  return host.split('.')[0];
}

function dateParts(date: string) {
  const [year, month, day] = date.split('-');
  return { year, month, day };
}

function fillTemplate(template: string, date: string) {
  const { year, month, day } = dateParts(date);
  return template
    .replace('{year}', year ?? '')
    .replace('{month}', month ?? '')
    .replace('{day}', day ?? '');
}

function firstFoodItem(menuJson: unknown): Record<string, unknown> | undefined {
  if (!menuJson || typeof menuJson !== 'object') return undefined;
  const days = (menuJson as { days?: unknown }).days;
  if (!Array.isArray(days)) return undefined;

  for (const day of days) {
    if (!day || typeof day !== 'object') continue;
    const rows = (day as { menu_items?: unknown }).menu_items;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (row && typeof row === 'object' && (row as { food?: unknown }).food) {
        return row as Record<string, unknown>;
      }
    }
  }

  return undefined;
}

function countNutrisliceMenuRows(menuJson: unknown) {
  if (!menuJson || typeof menuJson !== 'object') {
    return { days: 0, rows: 0, foodItems: 0 };
  }

  const days = (menuJson as { days?: unknown }).days;
  if (!Array.isArray(days)) {
    return { days: 0, rows: 0, foodItems: 0 };
  }

  let rows = 0;
  let foodItems = 0;

  for (const day of days) {
    if (!day || typeof day !== 'object') continue;
    const menuItems = (day as { menu_items?: unknown }).menu_items;
    if (!Array.isArray(menuItems)) continue;
    rows += menuItems.length;
    foodItems += menuItems.filter((item) => item && typeof item === 'object' && (item as { food?: unknown }).food)
      .length;
  }

  return { days: days.length, rows, foodItems };
}

async function probeNutrislice(school: SchoolCoverage): Promise<MenuJsonProbe[]> {
  const district = nutrisliceDistrict(school.sourceUrl);
  if (!district) {
    return [
      {
        ok: false,
        providerDataKind: 'not_attempted',
        jsonParsed: false,
        blocker: 'Nutrislice district slug was not found in source URL.',
      },
    ];
  }

  const base = `https://${district}.api.nutrislice.com`;
  const schoolsUrl = `${base}/menu/api/schools/`;
  const schoolsResponse = await fetchText(schoolsUrl);
  const schoolsJson = parseJson(schoolsResponse.text);
  const schools = Array.isArray(schoolsJson) ? schoolsJson : [];
  const menuTypes = schools.flatMap((location) => {
    if (!location || typeof location !== 'object') return [];
    const activeMenuTypes = (location as { active_menu_types?: unknown }).active_menu_types;
    return Array.isArray(activeMenuTypes) ? activeMenuTypes : [];
  });

  const discovery: MenuJsonProbe[] = [
    {
      url: schoolsUrl,
      ok: schoolsResponse.ok,
      status: schoolsResponse.status,
      contentType: schoolsResponse.contentType,
      providerDataKind: 'nutrislice_schools',
      jsonParsed: Array.isArray(schoolsJson),
      locationsCount: schools.length,
      menuTypesCount: menuTypes.length,
      error: schoolsResponse.error,
    },
  ];

  const templates = schools.flatMap((location) => {
    if (!location || typeof location !== 'object') return [];
    const activeMenuTypes = (location as { active_menu_types?: unknown }).active_menu_types;
    if (!Array.isArray(activeMenuTypes)) return [];

    return activeMenuTypes
      .map((menuType) => {
        if (!menuType || typeof menuType !== 'object') return undefined;
        return (menuType as { urls?: { full_menu_by_date_api_url_template?: string } }).urls
          ?.full_menu_by_date_api_url_template;
      })
      .filter((template): template is string => Boolean(template));
  });

  if (templates.length === 0) {
    discovery.push({
      ok: false,
      providerDataKind: 'not_attempted',
      jsonParsed: false,
      blocker: 'Nutrislice schools JSON did not expose a full menu URL template.',
    });
    return discovery;
  }

  const maxMenuAttempts = Number(process.env.PROBE_NUTRISLICE_MENU_CANDIDATES ?? 12);
  const menuAttempts = [];

  for (const template of templates.slice(0, maxMenuAttempts)) {
    const menuUrl = `${base}${fillTemplate(template, probeDate)}`;
    const menuResponse = await fetchText(menuUrl);
    const menuJson = parseJson(menuResponse.text);
    const counts = countNutrisliceMenuRows(menuJson);
    menuAttempts.push({ menuUrl, menuResponse, menuJson, counts });

    if (counts.foodItems > 0) {
      break;
    }
  }

  const bestAttempt = menuAttempts.sort((a, b) => b.counts.foodItems - a.counts.foodItems)[0];
  if (!bestAttempt) {
    discovery.push({
      ok: false,
      providerDataKind: 'not_attempted',
      jsonParsed: false,
      blocker: 'Nutrislice menu templates existed, but no menu fetch was attempted.',
    });
    return discovery;
  }

  const { menuUrl, menuResponse, menuJson, counts } = bestAttempt;
  const sample = firstFoodItem(menuJson);
  const food = sample?.food as Record<string, unknown> | undefined;
  const nutrition = food?.rounded_nutrition_info;
  const icons = food?.icons as { food_icons?: unknown } | undefined;

  discovery.push({
    url: menuUrl,
    ok: menuResponse.ok && Boolean(menuJson),
    status: menuResponse.status,
    contentType: menuResponse.contentType,
    providerDataKind: 'nutrislice_week_menu',
    jsonParsed: Boolean(menuJson),
    menuDaysCount: counts.days,
    menuRowsCount: counts.rows,
    foodItemsCount: counts.foodItems,
    attemptedMenuCount: menuAttempts.length,
    sampleFields: {
      hasIngredients: typeof food?.ingredients === 'string' && food.ingredients.length > 0,
      hasNutrition: Boolean(nutrition && typeof nutrition === 'object'),
      hasDietaryIcons: Array.isArray(icons?.food_icons) && icons.food_icons.length > 0,
      hasServingSize: Boolean(food?.serving_size_info),
      hasPrice: food?.price !== undefined && food?.price !== null,
    },
    error: menuResponse.error,
  });

  return discovery;
}

function providerBlocker(school: SchoolCoverage) {
  switch (school.providerKind) {
    case 'vendor_dineoncampus':
      return 'Needs DineOnCampus site id discovery before apiv4 menu JSON can be fetched.';
    case 'vendor_bonappetit':
      return 'Needs Bon Appetit cafe id discovery before menu JSON can be fetched.';
    case 'vendor_netnutrition':
      return 'Needs NetNutrition OID/location discovery and session-safe fetch path.';
    case 'vendor_mydininghub':
      return 'Needs MyDiningHub JavaScript/API discovery.';
    case 'vendor_foodpro':
      return 'Needs FoodPro form/session parser or endpoint discovery.';
    case 'vendor_sodexo':
      return 'Needs SodexoMyWay location/menu API discovery.';
    case 'vendor_campusdish':
      return 'Needs CampusDish API or HTML parser proof.';
    case 'official_api':
      return 'Official API source is cataloged, but school-specific endpoint adapter is not implemented in this probe.';
    case 'official_html':
      return 'Official HTML source is reachable only through page parsing unless a hidden JSON endpoint is discovered.';
    case 'student_api':
      return 'Student API/source exists, but adapter contract must be reviewed before ingestion.';
  }
}

async function probeSchool(school: SchoolCoverage): Promise<SchoolProbeResult> {
  const sourceFetch = await fetchText(school.sourceUrl);
  const directJson = parseJson(sourceFetch.text);
  const jsonDiscovery: MenuJsonProbe[] = [
    {
      url: school.sourceUrl,
      ok: sourceFetch.ok,
      status: sourceFetch.status,
      contentType: sourceFetch.contentType,
      providerDataKind: 'direct_source',
      jsonParsed: Boolean(directJson),
      error: sourceFetch.error,
    },
  ];

  if (school.providerKind === 'vendor_nutrislice') {
    jsonDiscovery.push(...(await probeNutrislice(school)));
  } else {
    jsonDiscovery.push({
      ok: false,
      providerDataKind: 'not_attempted',
      jsonParsed: false,
      blocker: providerBlocker(school),
    });
  }

  const menuJsonConfirmed = jsonDiscovery.some(
    (probe) => probe.providerDataKind !== 'direct_source' && probe.ok && probe.jsonParsed
  );

  const sourceReachable = sourceFetch.ok || Boolean(sourceFetch.status && sourceFetch.status < 500);
  const verdict = menuJsonConfirmed
    ? 'menu_json_confirmed'
    : school.supportStatus === 'needs_poc'
      ? 'manual_poc_required'
      : sourceReachable
        ? 'source_reachable_adapter_needed'
        : 'blocked_or_unreachable';

  return {
    schoolId: school.id,
    rank: school.rank,
    name: school.name,
    providerKind: school.providerKind,
    sourceUrl: school.sourceUrl,
    sourceFetch: stripText(sourceFetch),
    jsonDiscovery,
    verdict,
  };
}

function stripText(probe: FetchProbe & { text?: string }): FetchProbe {
  const { text: _text, ...rest } = probe;
  return rest;
}

function countBy<T extends string>(values: T[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

async function main() {
  const results: SchoolProbeResult[] = [];

  for (const school of TOP_50_SCHOOLS) {
    console.log(`Probing ${school.rank}. ${school.name} (${school.providerKind})`);
    results.push(await probeSchool(school));
  }

  const report: ProbeReport = {
    generatedAt: new Date().toISOString(),
    date: probeDate,
    scope: 'top50',
    summary: {
      totalSchools: results.length,
      menuJsonConfirmed: results.filter((result) => result.verdict === 'menu_json_confirmed').length,
      sourceReachableAdapterNeeded: results.filter(
        (result) => result.verdict === 'source_reachable_adapter_needed'
      ).length,
      manualPocRequired: results.filter((result) => result.verdict === 'manual_poc_required').length,
      blockedOrUnreachable: results.filter((result) => result.verdict === 'blocked_or_unreachable').length,
      providerCounts: countBy(results.map((result) => result.providerKind)),
      menuJsonConfirmedByProvider: countBy(
        results
          .filter((result) => result.verdict === 'menu_json_confirmed')
          .map((result) => result.providerKind)
      ),
    },
    results,
  };

  await mkdir('data/probes', { recursive: true });
  const outputPath = `data/probes/top50-menu-json-probe-${probeDate}.json`;
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
  console.log(JSON.stringify(report.summary, null, 2));
}

await main();
