import { load } from 'cheerio';
import { fetchJson, fetchText } from '../providers/http.js';
import type { FoodTruckAdapter, FoodTruckFetchResult, FoodTruckServiceWindowInput } from './types.js';
import {
  addDays,
  dateFromMonthDay,
  isTodayUtc,
  isWeekday,
  monthName,
  monthNumber,
  normalizeTimeRange,
  slugify,
  weekdayName,
} from './date-utils.js';

const UC_DAVIS_SOURCE = 'https://housing.ucdavis.edu/dining/food-trucks/';
const STANFORD_SOURCE = 'https://cityflavor.com/locations/group/stanford-university-palo-alto/?header=false';
const MIT_SOURCE = 'https://www.openspace.mit.edu/food-trucks';
const UT_AUSTIN_SOURCE = 'https://universityunions.utexas.edu/eat/food-trucks';
const RUTGERS_SOURCE = 'https://food.rutgers.edu/places-eat';
const ROCHESTER_SOURCE = 'https://rochester.edu/college/wcsa/programs/tasty-tuesdays.html';
const RICE_SOURCE = 'https://dining.rice.edu/true-dog';
const UCLA_SOURCE = 'https://housing.ucla.edu/meal-swipe-exchange';
const BOSTON_GOV_PAGE = 'https://www.boston.gov/departments/small-business-development/food-trucks';
const BOSTON_ARCGIS_SOURCE =
  'https://services.arcgis.com/sFnw0xNflSi8J0uh/arcgis/rest/services/food_truck_schedule/FeatureServer/0/query?where=1%3D1&outFields=*&f=json&resultRecordCount=2000';

const BOSTON_SCHOOL_CENTERS: Record<string, { latitude: number; longitude: number; radiusKm: number }> = {
  'boston-university': { latitude: 42.3505, longitude: -71.1054, radiusKm: 1.2 },
  northeastern: { latitude: 42.3398, longitude: -71.0892, radiusKm: 1.2 },
};

export const FOOD_TRUCK_ADAPTERS: FoodTruckAdapter[] = [
  {
    schoolIds: ['uc-davis'],
    sourceUrl: UC_DAVIS_SOURCE,
    fetch: async (date, schoolId) => ready(schoolId, UC_DAVIS_SOURCE, await fetchUcDavis(date, schoolId)),
  },
  {
    schoolIds: ['stanford'],
    sourceUrl: STANFORD_SOURCE,
    fetch: async (date, schoolId) => ready(schoolId, STANFORD_SOURCE, await fetchStanford(date, schoolId)),
  },
  {
    schoolIds: ['mit'],
    sourceUrl: MIT_SOURCE,
    fetch: async (date, schoolId) => ready(schoolId, MIT_SOURCE, await fetchMit(date, schoolId)),
  },
  {
    schoolIds: ['ut-austin'],
    sourceUrl: UT_AUSTIN_SOURCE,
    fetch: async (date, schoolId) => ready(schoolId, UT_AUSTIN_SOURCE, await fetchUtAustin(date, schoolId)),
  },
  {
    schoolIds: ['rutgers'],
    sourceUrl: RUTGERS_SOURCE,
    fetch: async (date, schoolId) => ready(schoolId, RUTGERS_SOURCE, await fetchRutgers(date, schoolId)),
  },
  {
    schoolIds: ['university-of-rochester'],
    sourceUrl: ROCHESTER_SOURCE,
    fetch: async (date, schoolId) => ready(schoolId, ROCHESTER_SOURCE, await fetchRochester(date, schoolId)),
  },
  {
    schoolIds: ['rice'],
    sourceUrl: RICE_SOURCE,
    fetch: async (date, schoolId) => ready(schoolId, RICE_SOURCE, await fetchRice(date, schoolId)),
  },
  {
    schoolIds: ['ucla'],
    sourceUrl: UCLA_SOURCE,
    fetch: async (date, schoolId) => ready(schoolId, UCLA_SOURCE, await fetchUcla(date, schoolId)),
  },
  {
    schoolIds: ['boston-university', 'northeastern'],
    sourceUrl: BOSTON_GOV_PAGE,
    fetch: async (date, schoolId) => ready(schoolId, BOSTON_GOV_PAGE, await fetchBostonGov(date, schoolId)),
  },
];

export function foodTruckAdapterSchoolIds() {
  return new Set(FOOD_TRUCK_ADAPTERS.flatMap((adapter) => adapter.schoolIds));
}

export function getFoodTruckAdaptersForSchool(schoolId: string) {
  return FOOD_TRUCK_ADAPTERS.filter((adapter) => adapter.schoolIds.includes(schoolId));
}

async function fetchUcDavis(date: string, schoolId: string) {
  const html = await fetchText(UC_DAVIS_SOURCE);
  const $ = load(html);
  const windows: FoodTruckServiceWindowInput[] = [];
  let currentDate: string | undefined;
  let currentLocationName = 'Silo Patio';

  $('.food-trucks-schedule')
    .children()
    .each((_, element) => {
      const tag = element.tagName.toLowerCase();
      const text = $(element).text().replace(/\s+/g, ' ').trim();

      if (tag === 'h3') {
        const parsed = parseLongDate(text);
        currentDate = parsed;
        return;
      }

      if (tag === 'h4' && text) {
        currentLocationName = text;
        return;
      }

      if (tag !== 'p' || currentDate !== date) return;
      if (/no trucks scheduled/i.test(text)) return;

      const vendorName = $(element).find('strong').first().text().replace(/\s+/g, ' ').trim();
      if (!vendorName) return;

      const { startTime, endTime } = normalizeTimeRange(text);
      windows.push(
        serviceWindow({
          schoolId,
          date,
          sourceUrl: UC_DAVIS_SOURCE,
          locationName: currentLocationName || 'UC Davis Food Trucks',
          locationAddress: currentLocationName === 'Silo Patio' ? 'Silo Patio, Davis, CA' : undefined,
          vendorName,
          startTime,
          endTime,
          status: 'planned',
          confidence: 'high',
          metadata: {
            sourceParser: 'uc_davis_food_truck_schedule',
            sourceText: text,
          },
        })
      );
    });

  return windows;
}

async function fetchStanford(date: string, schoolId: string) {
  const html = await fetchText(STANFORD_SOURCE);
  const $ = load(html);
  const windows: FoodTruckServiceWindowInput[] = [];
  const requestedMonth = monthName(date).slice(0, 3).toLowerCase();
  const requestedDay = String(Number(date.slice(8, 10)));
  const requestedYear = Number(date.slice(0, 4));

  $('.location-section').each((_, section) => {
    const locationName =
      $(section).find('.location-name-container h4').text().replace(/\s+/g, ' ').trim() ||
      'Stanford Food Truck Location';

    $(section)
      .find('.days')
      .each((__, dayElement) => {
        const dayText = $(dayElement).find('.date-bar').text().replace(/\s+/g, ' ').trim();
        const parsedDate = parseStanfordDate(dayText, requestedYear);
        if (parsedDate !== date) return;

        $(dayElement)
          .find('.shift')
          .each((___, shiftElement) => {
            const shiftText = $(shiftElement).text().replace(/\s+/g, ' ').trim();
            if (!shiftText || /all shifts completed/i.test(shiftText)) return;

            const timeText = $(shiftElement).find('.shift-header .time').text().replace(/\s+/g, ' ').trim();
            const vendorName = $(shiftElement).find('.vendor-title h4').text().replace(/\s+/g, ' ').trim();
            if (!vendorName) return;

            const dateBarMatchesRequested =
              dayText.toLowerCase().includes(requestedMonth) && dayText.includes(requestedDay);
            if (!dateBarMatchesRequested) return;

            const { startTime, endTime } = normalizeTimeRange(timeText);
            const cuisine = $(shiftElement)
              .find('.vendor-title h5')
              .text()
              .replace(/\s+/g, ' ')
              .trim();

            windows.push(
              serviceWindow({
                schoolId,
                date,
                sourceUrl: STANFORD_SOURCE,
                locationName,
                vendorName,
                startTime,
                endTime,
                status: 'planned',
                confidence: 'high',
                metadata: {
                  sourceParser: 'cityflavor_stanford_group',
                  cuisine: cuisine || undefined,
                  sourceText: shiftText,
                },
              })
            );
          });
      });
  });

  return windows;
}

async function fetchMit(date: string, schoolId: string) {
  const month = monthNumber(date);
  if (weekdayName(date) !== 'Wednesday' || month < 5 || month > 10) return [];

  const html = await fetchText(MIT_SOURCE);
  const $ = load(html);
  const pageText = $('body').text().replace(/\s+/g, ' ').trim();
  if (!/2026 Schedule\s*Wednesdays,\s*May\s*-\s*October\s*11:30am-2pm/i.test(pageText)) {
    return [];
  }

  const vendors = ['Jamaica Mi Hungry', 'Tandoor and Curry', 'Zaaki'];
  return vendors.map((vendorName) =>
    serviceWindow({
      schoolId,
      date,
      sourceUrl: MIT_SOURCE,
      locationName: 'Kendall/MIT Open Space Food Trucks',
      locationAddress: 'Carleton Street, Cambridge, MA',
      vendorName,
      startTime: '11:30',
      endTime: '14:00',
      status: 'planned',
      confidence: 'medium',
      metadata: {
        sourceParser: 'mit_open_space_recurring_schedule',
        recurrence: 'Wednesdays, May-October 2026',
        note: 'MIT source says to view the calendar for weekly lineup; listed page vendors are mapped as recurring candidates.',
      },
    })
  );
}

async function fetchUtAustin(date: string, schoolId: string) {
  if (!isTodayUtc(date)) return [];

  const html = await fetchText(UT_AUSTIN_SOURCE);
  const $ = load(html);
  const windows: FoodTruckServiceWindowInput[] = [];

  $('article')
    .filter((_, element) => /Hours\s+Comment\s+Time slot/i.test($(element).text()))
    .each((_, article) => {
      const text = $(article).text().replace(/\s+/g, ' ').trim();
      const vendorName = text.replace(/\s+Hours\s+Comment[\s\S]*$/i, '').trim();
      if (!vendorName || /^Today/i.test(vendorName)) return;

      const { startTime, endTime } = normalizeTimeRange(text);
      const status = /\bClosed\b/i.test(text) ? 'unavailable' : 'planned';
      windows.push(
        serviceWindow({
          schoolId,
          date,
          sourceUrl: UT_AUSTIN_SOURCE,
          locationName: 'UT Austin Campus Food Trucks',
          vendorName,
          startTime,
          endTime,
          status,
          confidence: 'high',
          metadata: {
            sourceParser: 'ut_austin_today_hours',
            sourceText: text,
          },
        })
      );
    });

  return windows;
}

async function fetchRutgers(date: string, schoolId: string) {
  if (!isWeekday(date)) return [];

  const day = weekdayName(date);
  const windows: FoodTruckServiceWindowInput[] = [];
  const weekdayLocations: Record<string, string> = {
    Monday: 'Busch Campus (across from the ARC)',
    Tuesday: 'College Avenue Campus (by Alexander Library)',
    Wednesday: 'Busch Campus (across from the ARC)',
    Thursday: 'Cook Campus (Biel Road)',
    Friday: 'Livingston Campus (by the Quads)',
  };
  const starbucksLocations: Record<string, string> = {
    Monday: 'College Avenue by Alexander Library',
    Tuesday: 'Livingston by the towers near the student center',
    Wednesday: 'Cook by Biel Road Bus Stop',
    Thursday: 'Busch by Allison Road Classrooms',
    Friday: 'George St by the River Dorms',
  };

  await fetchText(RUTGERS_SOURCE);

  windows.push(
    serviceWindow({
      schoolId,
      date,
      sourceUrl: RUTGERS_SOURCE,
      locationName: starbucksLocations[day] ?? 'Rutgers Campus',
      vendorName: 'Starbucks Truck',
      startTime: '10:00',
      endTime: '16:00',
      status: 'planned',
      confidence: 'high',
      metadata: {
        sourceParser: 'rutgers_weekday_schedule',
        sourceText: 'Hours: Weekdays from 10:00am - 4:00pm',
      },
    })
  );

  windows.push(
    serviceWindow({
      schoolId,
      date,
      sourceUrl: RUTGERS_SOURCE,
      locationName: weekdayLocations[day] ?? 'Rutgers Campus',
      vendorName: 'Knight Wagon / Three Chilies weekly rotation',
      startTime: '12:00',
      endTime: '16:00',
      status: 'planned',
      confidence: 'medium',
      metadata: {
        sourceParser: 'rutgers_weekday_schedule',
        sourceText: 'Knight Wagon and Three Chilies rotate weekly; Rutgers publishes weekday location/time but not exact weekly assignment.',
        rotationVendors: ['Knight Wagon', 'Three Chilies Taco Truck'],
      },
    })
  );

  return windows;
}

async function fetchRochester(date: string, schoolId: string) {
  const html = await fetchText(ROCHESTER_SOURCE);
  const $ = load(html);
  const windows: FoodTruckServiceWindowInput[] = [];
  const requestedYear = Number(date.slice(0, 4));

  $('table tr').each((_, row) => {
    const cells = $(row)
      .find('td')
      .map((__, cell) => $(cell).text().replace(/\s+/g, ' ').trim())
      .get();
    if (cells.length < 3) return;

    const rowDate = dateFromMonthDay(cells[0], requestedYear);
    if (rowDate !== date) return;

    const { startTime, endTime } = normalizeTimeRange(cells[1]);
    for (const vendorName of splitVendorList(cells[2])) {
      windows.push(
        serviceWindow({
          schoolId,
          date,
          sourceUrl: ROCHESTER_SOURCE,
          locationName: 'Wilson Quad',
          locationAddress: 'Wilson Quad, University of Rochester',
          vendorName,
          startTime,
          endTime,
          status: 'planned',
          confidence: 'high',
          metadata: {
            sourceParser: 'rochester_tasty_tuesdays_table',
            sourceText: cells.join(' | '),
          },
        })
      );
    }
  });

  return windows;
}

async function fetchRice(date: string, schoolId: string) {
  const day = weekdayName(date);
  const windows: FoodTruckServiceWindowInput[] = [];

  await fetchText(RICE_SOURCE);

  if (day === 'Wednesday') {
    windows.push(
      serviceWindow({
        schoolId,
        date,
        sourceUrl: RICE_SOURCE,
        locationName: 'True Dog behind Valhalla Pub',
        vendorName: 'True Dog',
        startTime: '16:00',
        endTime: '21:00',
        status: 'planned',
        confidence: 'high',
        metadata: {
          sourceParser: 'rice_true_dog_recurring_hours',
          sourceText: 'Retail Hours Wednesday | 4 PM - 9 PM',
        },
      })
    );
  }

  if (day === 'Thursday' || day === 'Friday') {
    windows.push(
      serviceWindow({
        schoolId,
        date,
        sourceUrl: RICE_SOURCE,
        locationName: 'True Dog behind Valhalla Pub',
        vendorName: 'True Dog',
        startTime: '20:00',
        endTime: '02:00',
        status: 'planned',
        confidence: 'high',
        metadata: {
          sourceParser: 'rice_true_dog_recurring_hours',
          sourceText: 'Retail Hours Thursday and Friday | 8 PM - 2 AM',
          crossesMidnight: true,
        },
      })
    );
  }

  return windows;
}

async function fetchUcla(date: string, schoolId: string) {
  if (!isWeekday(date)) return [];

  await fetchText(UCLA_SOURCE);

  return [
    serviceWindow({
      schoolId,
      date,
      sourceUrl: UCLA_SOURCE,
      locationName: 'Food Trucks on the Hill',
      locationAddress: 'Sproul Court and Rieber Court, UCLA',
      startTime: '11:00',
      endTime: '16:00',
      status: 'planned',
      confidence: 'low',
      metadata: {
        sourceParser: 'ucla_meal_swipe_exchange_food_trucks',
        sourceText:
          'UCLA Housing says food trucks are located on the Hill and meal swipe exchanges are available during lunch, 11:00 a.m. to 4:00 p.m. Monday through Friday; vendor rotation is not published in this source.',
      },
    }),
  ];
}

type BostonArcgisFeature = {
  attributes: {
    Day?: string;
    Time?: string;
    Truck?: string;
    Location?: string;
    Pinpoint?: string;
    Hours?: string;
    Management?: string;
    Notes?: string | null;
    Link?: string | null;
    x?: number;
    y?: number;
    ObjectId?: number;
  };
};

type BostonArcgisResponse = {
  features?: BostonArcgisFeature[];
};

async function fetchBostonGov(date: string, schoolId: string) {
  const center = BOSTON_SCHOOL_CENTERS[schoolId];
  if (!center) return [];

  const data = await fetchJson<BostonArcgisResponse>(BOSTON_ARCGIS_SOURCE);
  const day = weekdayName(date);
  const windows: FoodTruckServiceWindowInput[] = [];

  for (const feature of data.features ?? []) {
    const attributes = feature.attributes;
    if (attributes.Day !== day || !attributes.Truck || !attributes.Hours) continue;
    if (typeof attributes.x !== 'number' || typeof attributes.y !== 'number') continue;

    const km = distanceKm(center.latitude, center.longitude, attributes.y, attributes.x);
    const campusMatch =
      schoolId === 'boston-university'
        ? /Boston University/i.test(attributes.Location ?? '')
        : /Northeastern University/i.test(attributes.Location ?? '');
    if (!campusMatch) continue;

    const { startTime, endTime } = normalizeTimeRange(attributes.Hours);
    windows.push(
      serviceWindow({
        schoolId,
        date,
        sourceUrl: BOSTON_GOV_PAGE,
        locationName: attributes.Location ?? `${schoolId} nearby food truck stop`,
        vendorName: attributes.Truck,
        vendorWebsiteUrl: attributes.Link ?? undefined,
        startTime,
        endTime,
        meal: attributes.Time,
        status: 'planned',
        confidence: 'high',
        latitude: attributes.y,
        longitude: attributes.x,
        metadata: {
          sourceParser: 'boston_arcgis_food_truck_schedule',
          sourceApiUrl: BOSTON_ARCGIS_SOURCE,
          sourceScope: 'city_near_campus',
          distanceKm: Number(km.toFixed(3)),
          pinpoint: attributes.Pinpoint,
          management: attributes.Management,
          notes: attributes.Notes,
          objectId: attributes.ObjectId,
        },
      })
    );
  }

  return windows;
}

function ready(
  schoolId: string,
  sourceUrl: string,
  serviceWindows: FoodTruckServiceWindowInput[]
): FoodTruckFetchResult {
  return {
    state: 'adapter_ready',
    schoolId,
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    serviceWindows,
  };
}

function serviceWindow(input: {
  schoolId: string;
  date: string;
  sourceUrl: string;
  locationName: string;
  locationAddress?: string;
  latitude?: number;
  longitude?: number;
  vendorName?: string;
  vendorWebsiteUrl?: string;
  meal?: string;
  startTime?: string;
  endTime?: string;
  status: FoodTruckServiceWindowInput['status'];
  confidence: FoodTruckServiceWindowInput['confidence'];
  metadata?: Record<string, unknown>;
}): FoodTruckServiceWindowInput {
  const locationId = slugify(input.locationName) || 'food-truck-location';
  const vendorId = input.vendorName ? slugify(input.vendorName) : undefined;
  return {
    id: [
      input.schoolId,
      input.date,
      locationId,
      vendorId ?? 'no-vendor',
      input.startTime ?? 'unknown-start',
      input.endTime ?? 'unknown-end',
    ].join(':'),
    schoolId: input.schoolId,
    date: input.date,
    meal: input.meal,
    startTime: input.startTime,
    endTime: input.endTime,
    status: input.status,
    location: {
      id: locationId,
      name: input.locationName,
      type: 'food_truck',
      address: input.locationAddress,
      latitude: input.latitude,
      longitude: input.longitude,
      sourceUrl: input.sourceUrl,
    },
    vendor: input.vendorName
      ? {
          id: vendorId ?? 'food-truck-vendor',
          name: input.vendorName,
          websiteUrl: input.vendorWebsiteUrl,
          sourceUrl: input.sourceUrl,
        }
      : undefined,
    sourceUrl: input.sourceUrl,
    confidence: input.confidence,
    isEstimated: false,
    metadata: input.metadata,
  };
}

function parseLongDate(value: string) {
  const normalized = value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const parsed = new Date(`${normalized} 00:00:00 UTC`);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed.toISOString().slice(0, 10);
}

function parseStanfordDate(value: string, year: number) {
  const normalized = value.replace(/^Today\s*\((.+)\)$/i, '$1').replace(/\s+/g, ' ').trim();
  const match = normalized.match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+([A-Za-z]{3})\s+(\d{1,2})/i);
  if (!match) return undefined;
  return parseShortMonthDate(match[1], match[2], year);
}

function parseShortMonthDate(month: string, day: string, year: number) {
  const parsed = new Date(`${month} ${day}, ${year} 00:00:00 UTC`);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed.toISOString().slice(0, 10);
}

function splitVendorList(value: string) {
  return value
    .replace(/\s*&\s*/g, ', ')
    .split(',')
    .map((vendor) => vendor.trim())
    .filter(Boolean);
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radiusKm = 6371;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * radiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
