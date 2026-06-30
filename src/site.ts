import { TOP_50_SCHOOLS } from './data/top50-schools.js';
import type { SchoolCoverage } from './types/dining.js';

const DISPLAY_NAME_TO_SCHOOL_ID: Record<string, string> = {
  Princeton: 'princeton',
  MIT: 'mit',
  Harvard: 'harvard',
  Yale: 'yale',
  Duke: 'duke',
  'Johns Hopkins': 'johns-hopkins',
  UPenn: 'upenn',
  Brown: 'brown',
  Dartmouth: 'dartmouth',
  'UC Berkeley': 'uc-berkeley',
  UCLA: 'ucla',
  Vanderbilt: 'vanderbilt',
  Emory: 'emory',
  Georgetown: 'georgetown',
  'UNC Chapel Hill': 'unc',
  'UC San Diego': 'ucsd',
  'Georgia Tech': 'georgia-tech',
  NYU: 'nyu',
  'UC Irvine': 'uc-irvine',
  'Boston College': 'boston-college',
  Tufts: 'tufts',
  'UW Madison': 'uw-madison',
  'Ohio State': 'ohio-state',
  'Boston University': 'boston-university',
  Rutgers: 'rutgers',
  'University of Washington': 'washington',
  Purdue: 'purdue',
  'University of Georgia': 'georgia',
  Rochester: 'rochester',
  Stanford: 'stanford',
  Cornell: 'cornell',
  Michigan: 'michigan',
  'Notre Dame': 'notre-dame',
  USC: 'usc',
  'UT Austin': 'ut-austin',
  UCSB: 'ucsb',
  'University of Chicago': 'uchicago',
  'University of Florida': 'florida',
  'Northeastern University': 'northeastern',
};

const snapshot = {
  generatedAt: '2026-06-30T03:30:55.545Z',
  mode: 'best_available',
  stats: {
    schools: 50,
    readySchools: 47,
    cafeterias: 168,
    menuItems: 19524,
    nutritionItems: 17810,
    ingredientItems: 17339,
    allergenItems: 12003,
    dietaryItems: 14165,
  },
  richSchools: [
    ['Princeton', 5, 97, 94, 94, 77, 0, 'Yeh & Huo, The Gallery, Chemistry Cafe'],
    ['MIT', 3, 260, 256, 188, 93, 210, 'Forbes Cafe Coffee, Forbes Family Cafe, New Vassar'],
    ['Harvard', 4, 875, 875, 789, 484, 616, 'Adams House, Annenberg Hall, Northwest Cafe'],
    ['Yale', 9, 1286, 1111, 1286, 640, 428, 'Benjamin Franklin, Branford, Davenport, +6'],
    ['Duke', 7, 576, 576, 575, 407, 406, 'Gyotaku, Il Forno, Nasher, Sazon, +3'],
    ['Johns Hopkins', 5, 676, 639, 676, 361, 546, 'Hopkins Cafe, Levering, Nolan\'s, +2'],
    ['UPenn', 2, 684, 652, 663, 279, 611, '1920 Commons, Houston Market'],
    ['Brown', 4, 388, 387, 387, 261, 167, 'Blue Room, Engineering, Sharpe, Verney-Woolley'],
    ['Dartmouth', 3, 1098, 1098, 1072, 654, 812, 'Collis Cafe, Courtyard Cafe, 53 Commons'],
    ['UC Berkeley', 6, 451, 451, 451, 213, 417, 'Clark Kerr, Crossroads, Foothill, +3'],
    ['UCLA', 2, 252, 252, 248, 156, 217, 'Sproul Dining, Covel Dining'],
    ['Vanderbilt', 2, 395, 395, 395, 181, 353, 'Rand, Rothschild'],
    ['Emory', 3, 363, 357, 360, 167, 313, 'Dobbs Common Table, Rollins, Clairmont'],
    ['Georgetown', 2, 271, 271, 271, 138, 253, 'The Table at Leo\'s, Epicurean'],
    ['UNC Chapel Hill', 3, 379, 369, 379, 193, 365, 'Chase, Bandido\'s, The Scoop'],
    ['UC San Diego', 13, 2258, 2241, 2258, 1595, 938, '64 Degrees, Wok, Triton Grill, +10'],
    ['Georgia Tech', 2, 379, 366, 379, 374, 358, 'North Ave, West Village'],
    ['NYU', 3, 282, 282, 282, 181, 226, 'Brooklyn Campus, Downstein, JKC'],
    ['UC Irvine', 3, 360, 164, 105, 198, 287, 'The Anteatery, Brandywine, B+F/TLC'],
    ['Boston College', 3, 141, 141, 141, 115, 108, 'Addies, Eagles Nest, The Market'],
    ['Tufts', 3, 252, 241, 242, 153, 100, 'Carmichael, Hotung, Kindlevan'],
    ['UW Madison', 4, 500, 453, 453, 420, 338, 'Four Lakes, Gordon, Liz\'s, Rheta\'s'],
    ['Ohio State', 12, 1913, 1903, 1906, 1899, 1807, 'Berry Cafe, Carmenton, Juice North, +9'],
    ['Boston University', 2, 149, 130, 130, 81, 122, 'Marciano Commons, West Campus'],
    ['Rutgers', 3, 748, 746, 746, 381, 682, 'Busch, Livingston, Neilson'],
    ['University of Washington', 16, 489, 489, 417, 316, 389, 'Local Point Plate, Deli, Dub Street, +13'],
    ['Purdue', 3, 261, 236, 234, 153, 194, 'Earhart, Wiley, Lawson On-the-GO'],
    ['University of Georgia', 2, 712, 644, 644, 696, 684, 'Bolton, The Village Summit'],
    ['Rochester', 2, 253, 240, 253, 112, 20, 'Douglass Dining Center, The Pit'],
  ].map(([name, cafeterias, items, nutrition, ingredients, allergens, dietary, locations]) => ({
    schoolId: DISPLAY_NAME_TO_SCHOOL_ID[name as string],
    name,
    cafeterias,
    items,
    nutrition,
    ingredients,
    allergens,
    dietary,
    locations,
  })),
  partialSchools: [
    ['Stanford', 4, 'Ingredients, allergens, dietary tags; no nutrition facts from source'],
    ['Cornell', 2, 'Menu names and dietary labels; official API does not expose nutrition details'],
    ['Michigan', 13, 'Fallback date has nutrition and dietary tags; no ingredients/allergens in public snapshot'],
    ['Notre Dame', 1, 'Strong single-location Nutrislice coverage'],
    ['USC', 1, 'Menus, allergens, dietary; no nutrition/ingredients'],
    ['UT Austin', 1, 'Full FoodPro nutrition/ingredients in one location'],
    ['UCSB', 3, 'Menus and dietary labels; official nutrition host currently times out'],
  ].map(([name, cafeterias, note]) => ({
    schoolId: DISPLAY_NAME_TO_SCHOOL_ID[name as string],
    name,
    cafeterias,
    note,
  })),
  pendingSchools: ['University of Chicago', 'University of Florida', 'Northeastern University'].map((name) => ({
    schoolId: DISPLAY_NAME_TO_SCHOOL_ID[name],
    name,
  })),
};

export function getSiteSnapshot() {
  return snapshot;
}

function escapeHtml(value: unknown) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const replacements: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return replacements[char] ?? char;
  });
}

export function renderHomePage() {
  const snapshotJson = JSON.stringify(snapshot).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Campus Dining Index</title>
  <meta name="description" content="A live-normalized map of U.S. campus dining menus, nutrition, ingredients, allergens, and dietary tags." />
  <style>
    :root {
      color-scheme: dark;
      --bg: #080a0f;
      --ink: #f7f8f4;
      --muted: #a9b1c7;
      --line: rgba(255,255,255,.14);
      --panel: rgba(9,13,22,.76);
      --blue: #43d7ff;
      --pink: #ff4fac;
      --lime: #d8ff64;
      --orange: #ff9f43;
      --green: #54e18a;
      --radius-sm: 8px;
      --radius-md: 12px;
      --radius-lg: 20px;
      --radius-xl: 28px;
      --shadow-border: 0 0 0 1px rgba(255,255,255,.10);
      --shadow-border-hover: 0 0 0 1px rgba(255,255,255,.18);
      --shadow-panel:
        0 0 0 1px rgba(255,255,255,.10),
        0 24px 70px rgba(0,0,0,.42),
        0 8px 20px rgba(0,0,0,.25);
    }
    * { box-sizing: border-box; }
    html {
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--ink);
      font-variant-numeric: tabular-nums;
    }
    h1, h2, h3 { text-wrap: balance; }
    p, span, td, th, input, button, a { text-wrap: pretty; }
    .shell {
      position: relative;
      min-height: 100vh;
      overflow: hidden;
      isolation: isolate;
      background: var(--bg);
    }
    .shell::before,
    .shell::after {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: -2;
    }
    .shell::before {
      background: url("https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1800&q=82") center/cover no-repeat;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.10);
      filter: saturate(1.08) contrast(1.02);
    }
    .shell::after {
      z-index: -1;
      background:
        linear-gradient(90deg, rgba(8,10,15,.98) 0%, rgba(8,10,15,.75) 48%, rgba(8,10,15,.9) 100%),
        linear-gradient(180deg, rgba(8,10,15,.35) 0%, rgba(8,10,15,.64) 58%, #080a0f 100%);
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      max-width: 1220px;
      margin: 0 auto;
      padding: 24px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 780;
      min-height: 44px;
    }
    .mark {
      width: 34px;
      height: 34px;
      border-radius: var(--radius-sm);
      background: conic-gradient(from 120deg, var(--blue), var(--lime), var(--orange), var(--pink), var(--blue));
      box-shadow:
        0 0 0 1px rgba(255,255,255,.16),
        0 0 30px rgba(67,215,255,.45);
    }
    nav {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    nav a, button {
      appearance: none;
      border: 0;
      background: rgba(255,255,255,.08);
      color: var(--ink);
      border-radius: var(--radius-md);
      padding: 10px 13px;
      min-height: 42px;
      font: inherit;
      cursor: pointer;
      text-decoration: none;
      box-shadow: var(--shadow-border);
      transition-property: background-color, box-shadow, scale;
      transition-duration: 150ms;
      transition-timing-function: cubic-bezier(.2,0,0,1);
    }
    nav a:hover, button:hover { background: rgba(255,255,255,.13); box-shadow: var(--shadow-border-hover); }
    nav a:active, button:active { scale: .96; }
    nav a:focus-visible, button:focus-visible, input:focus-visible {
      outline: 2px solid rgba(67,215,255,.86);
      outline-offset: 3px;
    }
    main {
      max-width: 1220px;
      margin: 0 auto;
      padding: 18px 24px 48px;
    }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.02fr) minmax(320px, .98fr);
      gap: 22px;
      align-items: stretch;
      min-height: calc(100vh - 128px);
    }
    .lead {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-width: 0;
      padding: 20px 0 42px;
    }
    .stagger {
      opacity: 0;
      transform: translateY(12px);
      filter: blur(4px);
      animation: enterUp 420ms cubic-bezier(.2,0,0,1) forwards;
    }
    .stagger:nth-child(1) { animation-delay: 0ms; }
    .stagger:nth-child(2) { animation-delay: 90ms; }
    .stagger:nth-child(3) { animation-delay: 180ms; }
    .stagger:nth-child(4) { animation-delay: 270ms; }
    .eyebrow {
      color: var(--lime);
      font-weight: 760;
      text-transform: uppercase;
      font-size: 13px;
    }
    h1 {
      margin: 14px 0;
      max-width: 760px;
      font-size: clamp(48px, 7vw, 92px);
      line-height: .92;
      letter-spacing: 0;
    }
    .sub {
      max-width: 690px;
      color: #d9deea;
      font-size: clamp(18px, 2vw, 23px);
      line-height: 1.38;
    }
    .ticker {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin: 24px 0 0;
    }
    .pill {
      border: 0;
      background: rgba(0,0,0,.35);
      border-radius: var(--radius-md);
      padding: 10px 12px;
      color: #eff4ff;
      box-shadow: var(--shadow-border);
    }
    .panel {
      align-self: center;
      background: var(--panel);
      backdrop-filter: blur(18px);
      border-radius: var(--radius-lg);
      overflow: hidden;
      box-shadow: var(--shadow-panel);
      min-width: 0;
    }
    .panelHead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 16px;
      border-bottom: 1px solid var(--line);
    }
    .panelHead h2 {
      margin: 0;
      font-size: 18px;
    }
    .score {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1px;
      background: var(--line);
    }
    .metric {
      background: rgba(8,10,15,.92);
      padding: 18px;
    }
    .metric b {
      display: block;
      font-size: clamp(28px, 4vw, 43px);
      line-height: 1;
    }
    .metric span {
      display: block;
      margin-top: 8px;
      color: var(--muted);
      font-size: 13px;
    }
    .metric:nth-child(1) b { color: var(--blue); }
    .metric:nth-child(2) b { color: var(--lime); }
    .metric:nth-child(3) b { color: var(--orange); }
    .metric:nth-child(4) b { color: var(--pink); }
    .board {
      margin-top: 22px;
      background: rgba(8,10,15,.9);
      border-radius: var(--radius-lg);
      overflow: hidden;
      box-shadow: var(--shadow-panel);
    }
    .toolbar {
      display: grid;
      grid-template-columns: minmax(180px, 1fr) auto auto;
      gap: 10px;
      padding: 14px;
      border-bottom: 1px solid var(--line);
    }
    input {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      background: rgba(255,255,255,.08);
      color: var(--ink);
      padding: 11px 12px;
      min-height: 42px;
      font: inherit;
      transition-property: background-color, border-color, box-shadow;
      transition-duration: 150ms;
      transition-timing-function: cubic-bezier(.2,0,0,1);
    }
    input:focus {
      border-color: rgba(67,215,255,.5);
      background: rgba(255,255,255,.11);
      box-shadow: 0 0 0 4px rgba(67,215,255,.10);
    }
    .tableWrap { overflow-x: auto; }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 820px;
    }
    th, td {
      padding: 12px 14px;
      border-bottom: 1px solid rgba(255,255,255,.08);
      text-align: left;
      vertical-align: top;
      font-size: 14px;
    }
    th {
      color: #d8ff64;
      font-size: 12px;
      text-transform: uppercase;
    }
    .schoolLink {
      color: var(--ink);
      text-decoration: none;
      transition-property: color;
      transition-duration: 150ms;
      transition-timing-function: cubic-bezier(.2,0,0,1);
    }
    .schoolLink:hover { color: var(--lime); }
    td.num {
      color: #ffffff;
      white-space: nowrap;
    }
    tr {
      transition-property: background-color;
      transition-duration: 150ms;
      transition-timing-function: cubic-bezier(.2,0,0,1);
    }
    tbody tr:hover { background: rgba(255,255,255,.035); }
    .muted { color: var(--muted); }
    .bar {
      height: 7px;
      margin-top: 8px;
      border-radius: 999px;
      background: rgba(255,255,255,.11);
      overflow: hidden;
    }
    .bar i {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, var(--blue), var(--lime));
      transition-property: width;
      transition-duration: 220ms;
      transition-timing-function: cubic-bezier(.2,0,0,1);
    }
    .bands {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 1px;
      margin: 18px;
      background: var(--line);
      border-radius: var(--radius-md);
      overflow: hidden;
    }
    .band {
      background: rgba(8,10,15,.74);
      padding: 16px;
    }
    .band h3 { margin: 0 0 8px; font-size: 16px; }
    .band p { margin: 0; color: var(--muted); line-height: 1.45; }
    button[aria-pressed="true"] {
      background: rgba(216,255,100,.14);
      color: var(--lime);
      box-shadow:
        0 0 0 1px rgba(216,255,100,.34),
        0 0 24px rgba(216,255,100,.08);
    }
    .state {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      border-radius: 999px;
      padding: 4px 8px;
      color: #080a0f;
      background: var(--lime);
      font-size: 12px;
      font-weight: 760;
      text-transform: uppercase;
      letter-spacing: .02em;
    }
    .state.partial { color: #090b10; background: var(--orange); }
    .state.pending { color: #fff; background: var(--pink); }
    footer {
      max-width: 1220px;
      margin: 0 auto;
      padding: 0 24px 34px;
      color: var(--muted);
      font-size: 13px;
    }
    @keyframes enterUp {
      to {
        opacity: 1;
        transform: translateY(0);
        filter: blur(0);
      }
    }
    @media (max-width: 860px) {
      header { align-items: flex-start; }
      .hero { grid-template-columns: 1fr; min-height: auto; }
      .lead { padding-top: 20px; }
      .toolbar { grid-template-columns: 1fr; }
      .bands { grid-template-columns: 1fr; }
      .panel { border-radius: var(--radius-lg); }
      nav { display: none; }
    }
    @media (max-width: 620px) {
      header, main, footer { padding-left: 14px; padding-right: 14px; }
      h1 { font-size: clamp(44px, 12vw, 54px); }
      .panelHead { align-items: flex-start; }
      .score { grid-template-columns: 1fr 1fr; }
      .metric { padding: 16px 14px; }
      table { min-width: 0; }
      thead { display: none; }
      tbody, tr, td { display: block; }
      tr {
        padding: 14px;
        border-bottom: 1px solid rgba(255,255,255,.08);
      }
      td {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        border-bottom: 0;
        padding: 5px 0;
      }
      td:first-child {
        display: block;
        padding-bottom: 9px;
      }
      td:first-child::before { display: none; }
      td::before {
        content: attr(data-label);
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
      }
      td.num { white-space: normal; }
      .bar { width: 88px; margin-left: auto; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 1ms !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
        transition-duration: 1ms !important;
      }
      .stagger {
        opacity: 1;
        transform: none;
        filter: none;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div class="brand"><div class="mark"></div><span>Campus Dining Index</span></div>
      <nav>
        <a href="/v1/coverage">Coverage API</a>
        <a href="/v1/demo-summary">Snapshot JSON</a>
        <a href="/health">Health</a>
      </nav>
    </header>
    <main>
      <section class="hero">
        <div class="lead">
          <div class="eyebrow stagger">Top 50 campus menus, normalized</div>
          <h1 class="stagger">The dining hall data layer colleges forgot to ship.</h1>
          <p class="sub stagger">Menus, cafeterias, nutrition facts, ingredients, allergens, and dietary labels pulled into one clean API surface. Built from public university dining sources.</p>
          <div class="ticker stagger">
            <span class="pill">47 schools live</span>
            <span class="pill">168 cafeterias</span>
            <span class="pill">19,524 menu items</span>
            <span class="pill">17,810 with nutrition</span>
          </div>
        </div>
        <aside class="panel">
          <div class="panelHead">
            <h2>Today&apos;s Normalized Snapshot</h2>
            <span class="muted">best available</span>
          </div>
          <div class="score">
            <div class="metric"><b>91%</b><span>menu items with nutrition facts</span></div>
            <div class="metric"><b>89%</b><span>menu items with ingredients</span></div>
            <div class="metric"><b>61%</b><span>menu items with allergens</span></div>
            <div class="metric"><b>73%</b><span>menu items with dietary tags</span></div>
          </div>
          <div class="bands">
            <div class="band"><h3>Rich schools</h3><p>29 schools have multi-cafeteria or deep menu coverage with nutrition, ingredients, and allergen fields.</p></div>
            <div class="band"><h3>Fallback aware</h3><p>Michigan uses the nearest non-empty public snapshot while preserving the requested date.</p></div>
            <div class="band"><h3>Blocked vendors</h3><p>UChicago, Florida, and Northeastern remain blocked by DineOnCampus Cloudflare 403s.</p></div>
          </div>
        </aside>
      </section>
      <section class="board" id="board">
        <div class="toolbar">
          <input id="search" placeholder="Search schools, cafeterias, or providers" />
          <button data-filter="rich" aria-pressed="true">Rich</button>
          <button data-filter="all" aria-pressed="false">All</button>
        </div>
        <div class="tableWrap">
          <table>
            <thead>
              <tr>
                <th>School</th>
                <th>Cafeterias</th>
                <th>Items</th>
                <th>Nutrition</th>
                <th>Ingredients</th>
                <th>Allergens</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="rows"></tbody>
          </table>
        </div>
      </section>
    </main>
    <footer>Near-real-time public menu polling. No login-gated data. No POS inventory claims.</footer>
  </div>
  <script>
    const snapshot = ${snapshotJson};
    const richRows = snapshot.richSchools.map((row) => ({ ...row, state: 'rich', note: row.locations }));
    const partialRows = snapshot.partialSchools.map((row) => ({
      schoolId: row.schoolId,
      name: row.name,
      cafeterias: row.cafeterias,
      items: 0,
      nutrition: 0,
      ingredients: 0,
      allergens: 0,
      dietary: 0,
      locations: row.note,
      state: 'partial',
      note: row.note,
    }));
    const pendingRows = snapshot.pendingSchools.map((school) => ({
      schoolId: school.schoolId,
      name: school.name,
      cafeterias: 0,
      items: 0,
      nutrition: 0,
      ingredients: 0,
      allergens: 0,
      dietary: 0,
      locations: 'DineOnCampus direct fetch blocked by Cloudflare 403',
      state: 'pending',
      note: 'Adapter pending',
    }));
    const allRows = [...richRows, ...partialRows, ...pendingRows];
    const tbody = document.querySelector('#rows');
    const search = document.querySelector('#search');
    let activeFilter = 'rich';

    function pct(value, total) {
      return total ? Math.round((value / total) * 100) : 0;
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char]);
    }

    function formatCount(value) {
      return value ? value.toLocaleString() : '<span class="muted">source-limited</span>';
    }

    function render() {
      const query = search.value.trim().toLowerCase();
      const sourceRows = activeFilter === 'rich' ? richRows : allRows;
      const visible = sourceRows.filter((row) => {
        const text = [row.name, row.locations, row.note, row.state].join(' ').toLowerCase();
        return !query || text.includes(query);
      });
      tbody.innerHTML = visible.map((row) => {
        const coverage = pct(row.nutrition, row.items);
        const stateLabel = row.state === 'rich' ? 'rich' : row.state === 'partial' ? 'partial' : 'pending';
        const nutritionCell = row.items
          ? row.nutrition.toLocaleString() + '<div class="bar"><i style="width:' + coverage + '%"></i></div>'
          : '<span class="muted">not published</span>';
        const href = '/schools/' + encodeURIComponent(row.schoolId);
        return '<tr>' +
          '<td><a class="schoolLink" href="' + href + '"><strong>' + escapeHtml(row.name) + '</strong></a><div class="muted">' + escapeHtml(row.locations) + '</div></td>' +
          '<td class="num" data-label="Cafeterias">' + formatCount(row.cafeterias) + '</td>' +
          '<td class="num" data-label="Items">' + formatCount(row.items) + '</td>' +
          '<td class="num" data-label="Nutrition">' + nutritionCell + '</td>' +
          '<td class="num" data-label="Ingredients">' + formatCount(row.ingredients) + '</td>' +
          '<td class="num" data-label="Allergens">' + formatCount(row.allergens) + '</td>' +
          '<td data-label="Status"><span class="state ' + stateLabel + '">' + stateLabel + '</span></td>' +
        '</tr>';
      }).join('');
    }

    search.addEventListener('input', render);
    document.querySelectorAll('[data-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        activeFilter = button.dataset.filter;
        document.querySelectorAll('[data-filter]').forEach((item) => {
          item.setAttribute('aria-pressed', String(item === button));
        });
        render();
      });
    });
    render();
  </script>
</body>
</html>`;
}

export function renderSchoolCalendarPage(school: SchoolCoverage) {
  const schoolJson = JSON.stringify({
    id: school.id,
    rank: school.rank,
    name: school.name,
    city: school.city,
    state: school.state,
    providerKind: school.providerKind,
    integrationStatus: school.integrationStatus,
    sourceUrl: school.sourceUrl,
  }).replace(/</g, '\\u003c');
  const schoolsJson = JSON.stringify(
    TOP_50_SCHOOLS.map((item) => ({
      id: item.id,
      rank: item.rank,
      name: item.name,
      integrationStatus: item.integrationStatus,
      providerKind: item.providerKind,
    }))
  ).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(school.name)} Dining Calendar</title>
  <meta name="description" content="Calendar view for ${escapeHtml(school.name)} dining menus." />
  <style>
    :root {
      color-scheme: dark;
      --bg: #080a0f;
      --ink: #f7f8f4;
      --muted: #a9b1c7;
      --line: rgba(255,255,255,.14);
      --blue: #43d7ff;
      --pink: #ff4fac;
      --lime: #d8ff64;
      --orange: #ff9f43;
      --panel: rgba(9,13,22,.82);
      --radius-sm: 8px;
      --radius-md: 12px;
      --radius-lg: 20px;
      --shadow-border: 0 0 0 1px rgba(255,255,255,.10);
      --shadow-border-hover: 0 0 0 1px rgba(255,255,255,.18);
      --shadow-panel:
        0 0 0 1px rgba(255,255,255,.10),
        0 24px 70px rgba(0,0,0,.42),
        0 8px 20px rgba(0,0,0,.25);
    }
    * { box-sizing: border-box; }
    html {
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--ink);
      font-variant-numeric: tabular-nums;
    }
    h1, h2, h3 { text-wrap: balance; }
    p, span, li, button, select { text-wrap: pretty; }
    .shell {
      position: relative;
      min-height: 100vh;
      isolation: isolate;
      overflow: hidden;
      background: var(--bg);
    }
    .shell::before,
    .shell::after {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: -2;
    }
    .shell::before {
      background: url("https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1800&q=82") center/cover no-repeat;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.10);
      filter: saturate(1.05) contrast(1.04);
    }
    .shell::after {
      z-index: -1;
      background:
        linear-gradient(90deg, rgba(8,10,15,.98) 0%, rgba(8,10,15,.82) 50%, rgba(8,10,15,.94) 100%),
        linear-gradient(180deg, rgba(8,10,15,.28) 0%, rgba(8,10,15,.72) 58%, #080a0f 100%);
    }
    header, main, footer {
      max-width: 1220px;
      margin: 0 auto;
      padding-left: 24px;
      padding-right: 24px;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding-top: 24px;
      padding-bottom: 18px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 44px;
      color: var(--ink);
      font-weight: 780;
      text-decoration: none;
    }
    .mark {
      width: 34px;
      height: 34px;
      border-radius: var(--radius-sm);
      background: conic-gradient(from 120deg, var(--blue), var(--lime), var(--orange), var(--pink), var(--blue));
      box-shadow:
        0 0 0 1px rgba(255,255,255,.16),
        0 0 30px rgba(67,215,255,.45);
    }
    nav {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    a.button, button, select {
      appearance: none;
      border: 0;
      min-height: 42px;
      border-radius: var(--radius-md);
      background: rgba(255,255,255,.08);
      color: var(--ink);
      box-shadow: var(--shadow-border);
      font: inherit;
      text-decoration: none;
      transition-property: background-color, box-shadow, scale;
      transition-duration: 150ms;
      transition-timing-function: cubic-bezier(.2,0,0,1);
    }
    a.button, button { display: inline-flex; align-items: center; justify-content: center; padding: 10px 13px; cursor: pointer; }
    select { padding: 10px 34px 10px 13px; cursor: pointer; }
    a.button:hover, button:hover, select:hover { background: rgba(255,255,255,.13); box-shadow: var(--shadow-border-hover); }
    a.button:active, button:active { scale: .96; }
    a.button:focus-visible, button:focus-visible, select:focus-visible {
      outline: 2px solid rgba(67,215,255,.86);
      outline-offset: 3px;
    }
    main { padding-top: 26px; padding-bottom: 42px; }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, .95fr) minmax(340px, 1.05fr);
      gap: 22px;
      align-items: end;
      margin-bottom: 22px;
    }
    .eyebrow {
      color: var(--lime);
      font-weight: 760;
      text-transform: uppercase;
      font-size: 13px;
    }
    h1 {
      max-width: 760px;
      margin: 12px 0;
      font-size: clamp(44px, 6.2vw, 82px);
      line-height: .94;
      letter-spacing: 0;
    }
    .sub {
      max-width: 720px;
      color: #d9deea;
      font-size: clamp(17px, 1.8vw, 21px);
      line-height: 1.42;
    }
    .controls {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) auto auto auto;
      gap: 10px;
      align-items: center;
      padding: 12px;
      border-radius: var(--radius-lg);
      background: rgba(8,10,15,.76);
      box-shadow: var(--shadow-panel);
      backdrop-filter: blur(18px);
    }
    .viewSwitch {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
      min-height: 46px;
      padding: 4px;
      border-radius: var(--radius-md);
      background: rgba(255,255,255,.06);
      box-shadow: var(--shadow-border);
    }
    .viewButton {
      min-height: 38px;
      border-radius: var(--radius-sm);
      box-shadow: none;
      background: transparent;
      color: var(--muted);
      transition-property: background-color, color, box-shadow, scale;
    }
    .viewButton[aria-selected="true"] {
      color: var(--lime);
      background: rgba(216,255,100,.13);
      box-shadow:
        0 0 0 1px rgba(216,255,100,.24),
        0 0 20px rgba(216,255,100,.08);
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(300px, 380px) minmax(0, 1fr);
      gap: 22px;
      align-items: start;
    }
    .panel {
      border-radius: var(--radius-lg);
      background: var(--panel);
      box-shadow: var(--shadow-panel);
      overflow: hidden;
      backdrop-filter: blur(18px);
    }
    .panelHead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 16px;
      border-bottom: 1px solid var(--line);
    }
    .panelHead h2 { margin: 0; font-size: 18px; }
    .month {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 14px;
      border-bottom: 1px solid var(--line);
    }
    .month strong { font-size: 17px; }
    .iconButton {
      width: 42px;
      padding: 0;
      font-size: 22px;
    }
    .weekdays, .days {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 1px;
      background: rgba(255,255,255,.08);
    }
    .weekdays span {
      padding: 10px 0;
      background: rgba(8,10,15,.94);
      color: var(--muted);
      text-align: center;
      font-size: 12px;
      text-transform: uppercase;
    }
    .day {
      min-height: 54px;
      border-radius: 0;
      background: rgba(8,10,15,.9);
      box-shadow: none;
      color: var(--ink);
    }
    .day:hover { background: rgba(255,255,255,.08); box-shadow: none; }
    .day.isOutside { color: rgba(255,255,255,.34); }
    .day.isToday { color: var(--blue); }
    .day.isSelected {
      background: rgba(216,255,100,.16);
      color: var(--lime);
      box-shadow: inset 0 0 0 1px rgba(216,255,100,.38);
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 1px;
      background: var(--line);
    }
    .summary div {
      background: rgba(8,10,15,.9);
      padding: 14px;
    }
    .summary b {
      display: block;
      color: var(--lime);
      font-size: 24px;
    }
    .summary span {
      color: var(--muted);
      font-size: 12px;
    }
    .state {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      border-radius: 999px;
      padding: 4px 8px;
      color: #080a0f;
      background: var(--lime);
      font-size: 12px;
      font-weight: 760;
      text-transform: uppercase;
      letter-spacing: .02em;
    }
    .state.pending { color: #fff; background: var(--pink); }
    .cacheHint {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
    }
    .locationTabs {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding: 12px 16px;
      border-bottom: 1px solid var(--line);
      scrollbar-width: thin;
    }
    .locationTabs:empty { display: none; }
    .tabButton {
      flex: 0 0 auto;
      min-height: 40px;
      padding: 9px 12px;
      white-space: nowrap;
    }
    .tabButton[aria-selected="true"] {
      background: rgba(216,255,100,.14);
      color: var(--lime);
      box-shadow:
        0 0 0 1px rgba(216,255,100,.34),
        0 0 24px rgba(216,255,100,.08);
    }
    .menuBody { padding: 16px; }
    .message {
      margin: 0;
      color: var(--muted);
      line-height: 1.5;
    }
    .location {
      border-radius: var(--radius-md);
      background: rgba(255,255,255,.045);
      box-shadow: var(--shadow-border);
      overflow: hidden;
    }
    .location + .location { margin-top: 14px; }
    .locationHead {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 14px;
      border-bottom: 1px solid rgba(255,255,255,.08);
    }
    .locationHead h3 { margin: 0; font-size: 17px; }
    .period { padding: 14px; }
    .period + .period { border-top: 1px solid rgba(255,255,255,.08); }
    .period h4 {
      margin: 0 0 10px;
      color: var(--blue);
      font-size: 14px;
      text-transform: uppercase;
    }
    .station {
      padding: 12px;
      border-radius: var(--radius-sm);
      background: rgba(8,10,15,.58);
    }
    .station + .station { margin-top: 10px; }
    .stationTitle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      color: var(--muted);
      font-size: 13px;
      margin-bottom: 8px;
    }
    .item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      padding: 10px 0;
      border-top: 1px solid rgba(255,255,255,.07);
    }
    .item:first-of-type { border-top: 0; }
    .itemName { font-weight: 760; }
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 7px;
    }
    .tag {
      border-radius: 999px;
      padding: 3px 7px;
      color: #d9deea;
      background: rgba(255,255,255,.08);
      font-size: 12px;
    }
    .itemMeta {
      color: var(--muted);
      font-size: 12px;
      text-align: right;
      white-space: nowrap;
    }
    .serviceList {
      display: grid;
      gap: 12px;
    }
    .serviceWindow {
      display: grid;
      grid-template-columns: minmax(88px, 120px) minmax(0, 1fr);
      gap: 14px;
      padding: 14px;
      border-radius: var(--radius-md);
      background: rgba(255,255,255,.045);
      box-shadow: var(--shadow-border);
    }
    .serviceTime {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-height: 64px;
      border-radius: var(--radius-sm);
      background: rgba(8,10,15,.58);
      color: var(--lime);
      text-align: center;
      font-weight: 780;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.08);
    }
    .serviceTime span {
      color: var(--muted);
      font-size: 12px;
      font-weight: 640;
      text-transform: uppercase;
    }
    .serviceWindow h3 {
      margin: 0;
      font-size: 18px;
    }
    .serviceMeta {
      margin-top: 5px;
      color: var(--muted);
      line-height: 1.35;
    }
    .sourceLink {
      display: inline-flex;
      align-items: center;
      min-height: 40px;
      margin-top: 10px;
      color: var(--blue);
      text-decoration: none;
    }
    .sourceLink:hover { color: var(--lime); }
    .emptyState {
      padding: 18px;
      border-radius: var(--radius-md);
      background: rgba(255,255,255,.045);
      box-shadow: var(--shadow-border);
    }
    .emptyState h3 {
      margin: 0 0 8px;
      font-size: 18px;
    }
    .stagger {
      opacity: 0;
      transform: translateY(12px);
      filter: blur(4px);
      animation: enterUp 420ms cubic-bezier(.2,0,0,1) forwards;
    }
    .stagger:nth-child(1) { animation-delay: 0ms; }
    .stagger:nth-child(2) { animation-delay: 90ms; }
    .stagger:nth-child(3) { animation-delay: 180ms; }
    @keyframes enterUp {
      to {
        opacity: 1;
        transform: translateY(0);
        filter: blur(0);
      }
    }
    footer {
      padding-top: 0;
      padding-bottom: 34px;
      color: var(--muted);
      font-size: 13px;
    }
    @media (max-width: 900px) {
      .hero, .layout { grid-template-columns: 1fr; }
      .controls { grid-template-columns: 1fr 1fr 1fr; }
      .controls select { grid-column: 1 / -1; }
    }
    @media (max-width: 620px) {
      header, main, footer { padding-left: 14px; padding-right: 14px; }
      nav { display: none; }
      h1 { font-size: clamp(42px, 12vw, 54px); }
      .controls { grid-template-columns: 1fr; }
      .summary { grid-template-columns: 1fr 1fr; }
      .day { min-height: 48px; }
      .locationTabs { padding: 10px 12px; }
      .tabButton { min-height: 42px; }
      .item { grid-template-columns: 1fr; }
      .itemMeta { text-align: left; white-space: normal; }
      .serviceWindow { grid-template-columns: 1fr; }
      .serviceTime { align-items: flex-start; padding: 12px; text-align: left; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 1ms !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
        transition-duration: 1ms !important;
      }
      .stagger {
        opacity: 1;
        transform: none;
        filter: none;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <a class="brand" href="/"><div class="mark"></div><span>Campus Dining Index</span></a>
      <nav>
        <a class="button" href="/">Dashboard</a>
        <a class="button" href="/v1/schools/${encodeURIComponent(school.id)}">School JSON</a>
        <a class="button" href="/health">Health</a>
      </nav>
    </header>
    <main>
      <section class="hero">
        <div>
          <div class="eyebrow stagger">Dining calendar</div>
          <h1 class="stagger">${escapeHtml(school.name)}</h1>
          <p class="sub stagger">${escapeHtml(school.city)}, ${escapeHtml(school.state)} menus by date, pulled from the normalized public dining API.</p>
        </div>
        <div class="controls">
          <select id="schoolSelect" aria-label="Choose school"></select>
          <button id="prevDay">Previous day</button>
          <button id="today">Today</button>
          <button id="nextDay">Next day</button>
          <div class="viewSwitch" role="tablist" aria-label="Dining data type">
            <button class="viewButton" data-view="dining" role="tab" aria-selected="true">Dining halls</button>
            <button class="viewButton" data-view="food-trucks" role="tab" aria-selected="false">Food trucks</button>
          </div>
        </div>
      </section>
      <section class="layout">
        <aside class="panel">
          <div class="panelHead">
            <h2 id="monthLabel">Calendar</h2>
            <span class="state ${school.integrationStatus === 'adapter_ready' ? '' : 'pending'}">${escapeHtml(school.integrationStatus.replace('_', ' '))}</span>
          </div>
          <div class="month">
            <button class="iconButton" id="prevMonth" aria-label="Previous month">‹</button>
            <strong id="selectedLabel"></strong>
            <button class="iconButton" id="nextMonth" aria-label="Next month">›</button>
          </div>
          <div class="weekdays">
            <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
          </div>
          <div class="days" id="days"></div>
        </aside>
        <section class="panel">
          <div class="panelHead">
            <h2 id="menuTitle">Selected date</h2>
            <div>
              <span class="state" id="menuState">loading</span>
              <span class="cacheHint" id="cacheHint"></span>
            </div>
          </div>
          <div class="summary" id="summary"></div>
          <div class="locationTabs" id="locationTabs" role="tablist" aria-label="Cafeterias"></div>
          <div class="menuBody" id="menuBody"><p class="message">Loading menu...</p></div>
        </section>
      </section>
    </main>
    <footer>Calendar data is near-real-time public menu polling. No login-gated data. No POS inventory claims.</footer>
  </div>
  <script>
    const school = ${schoolJson};
    const schools = ${schoolsJson};
    const select = document.querySelector('#schoolSelect');
    const daysEl = document.querySelector('#days');
    const monthLabel = document.querySelector('#monthLabel');
    const selectedLabel = document.querySelector('#selectedLabel');
    const menuTitle = document.querySelector('#menuTitle');
    const menuState = document.querySelector('#menuState');
    const cacheHint = document.querySelector('#cacheHint');
    const summary = document.querySelector('#summary');
    const locationTabs = document.querySelector('#locationTabs');
    const menuBody = document.querySelector('#menuBody');
    const viewButtons = Array.from(document.querySelectorAll('[data-view]'));
    const browserMenuCache = new Map();
    let locationOptions = [];
    let activeLocationId = '';
    let activeView = new URLSearchParams(window.location.search).get('view') === 'food-trucks' ? 'food-trucks' : 'dining';
    let latestMenu = null;
    let requestSeq = 0;
    let selectedDate = new Date();
    let visibleMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);

    function isoDate(date) {
      const copy = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
      return copy.toISOString().slice(0, 10);
    }

    function displayDate(date) {
      return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char]);
    }

    function countItems(menu) {
      return menu.locations.flatMap((location) =>
        location.periods.flatMap((period) => period.stations.flatMap((station) => station.items))
      );
    }

    function formatProvider(value) {
      return value.replace(/^vendor_/, '').replace(/_/g, ' ');
    }

    function renderSchoolOptions() {
      select.innerHTML = schools
        .map((item) => '<option value="' + item.id + '"' + (item.id === school.id ? ' selected' : '') + '>#' + item.rank + ' ' + escapeHtml(item.name) + '</option>')
        .join('');
    }

    function syncViewButtons() {
      viewButtons.forEach((button) => {
        button.setAttribute('aria-selected', String(button.dataset.view === activeView));
      });
    }

    function updateViewUrl() {
      const url = new URL(window.location.href);
      if (activeView === 'food-trucks') {
        url.searchParams.set('view', 'food-trucks');
      } else {
        url.searchParams.delete('view');
      }
      window.history.replaceState({}, '', url);
    }

    function setActiveView(view) {
      if (activeView === view) return;
      activeView = view;
      requestSeq += 1;
      syncViewButtons();
      updateViewUrl();
      if (activeView === 'food-trucks') {
        locationTabs.innerHTML = '';
      } else {
        renderKnownTabs();
      }
      fetchCurrentView();
    }

    function renderCalendar() {
      monthLabel.textContent = visibleMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      selectedLabel.textContent = displayDate(selectedDate);
      const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
      const start = new Date(first);
      start.setDate(first.getDate() - first.getDay());
      const selectedIso = isoDate(selectedDate);
      const todayIso = isoDate(new Date());
      const cells = [];
      for (let index = 0; index < 42; index += 1) {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        const dateIso = isoDate(date);
        const classes = [
          'day',
          date.getMonth() === visibleMonth.getMonth() ? '' : 'isOutside',
          dateIso === selectedIso ? 'isSelected' : '',
          dateIso === todayIso ? 'isToday' : '',
        ].filter(Boolean).join(' ');
        cells.push('<button class="' + classes + '" data-date="' + dateIso + '">' + date.getDate() + '</button>');
      }
      daysEl.innerHTML = cells.join('');
    }

    function setSelectedDate(date) {
      selectedDate = date;
      visibleMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      renderCalendar();
      fetchCurrentView();
    }

    function fetchCurrentView() {
      if (activeView === 'food-trucks') {
        fetchFoodTruckSchedule();
        return;
      }
      fetchMenu();
    }

    function renderSummary(values) {
      summary.innerHTML = [
        ['Locations', values.locations],
        ['Periods', values.periods],
        ['Items', values.items],
        ['With nutrition', values.nutrition],
      ]
        .map(([label, value]) => '<div><b>' + value.toLocaleString() + '</b><span>' + label + '</span></div>')
        .join('');
    }

    function renderFoodTruckSummary(values) {
      summary.innerHTML = [
        ['Vendors', values.vendors],
        ['Stops', values.serviceWindows],
        ['Menu items', values.items],
        ['Estimated', values.estimated],
      ]
        .map(([label, value]) => '<div><b>' + value.toLocaleString() + '</b><span>' + label + '</span></div>')
        .join('');
    }

    function renderMessage(label, body, stateClass = 'pending') {
      menuState.className = 'state ' + stateClass;
      menuState.textContent = label;
      cacheHint.textContent = '';
      summary.innerHTML = '';
      if (!locationOptions.length) locationTabs.innerHTML = '';
      menuBody.innerHTML = '<p class="message">' + escapeHtml(body) + '</p>';
    }

    function itemMeta(item) {
      const calories = item.nutrition.find((fact) => fact.key === 'calories');
      const protein = item.nutrition.find((fact) => fact.key === 'protein');
      const parts = [];
      if (calories?.amount) parts.push(Math.round(calories.amount) + ' kcal');
      if (protein?.amount) parts.push(protein.amount + (protein.unit ? protein.unit : 'g') + ' protein');
      if (item.ingredients.length) parts.push(item.ingredients.length + ' ingredients');
      if (item.allergens.length) parts.push(item.allergens.length + ' allergens');
      return parts.join(' · ');
    }

    function locationItemCount(menu, locationId) {
      const location = menu?.locations?.find((candidate) => candidate.id === locationId);
      if (!location) return undefined;
      return location.periods.flatMap((period) => period.stations.flatMap((station) => station.items)).length;
    }

    function renderKnownTabs(menu = latestMenu) {
      const source = locationOptions.length
        ? locationOptions
        : (menu?.locations ?? []).map((location) => ({ id: location.id, name: location.name }));
      locationTabs.innerHTML = source.map((location) => {
        const itemCount = locationItemCount(menu, location.id);
        const suffix = typeof itemCount === 'number' ? ' · ' + itemCount.toLocaleString() : '';
        return '<button class="tabButton" role="tab" aria-selected="' + String(location.id === activeLocationId) + '" data-location-id="' + escapeHtml(location.id) + '">' +
          escapeHtml(location.name) + suffix +
        '</button>';
      }).join('');
    }

    function renderSelectedLocation(menu) {
      const location = menu.locations.find((candidate) => candidate.id === activeLocationId) ?? menu.locations[0];
      if (!location) {
        menuBody.innerHTML = '<p class="message">No cafeterias were published by this source for the selected date.</p>';
        return;
      }
      activeLocationId = location.id;
      renderKnownTabs(menu);
      const locationItems = location.periods.flatMap((period) => period.stations.flatMap((station) => station.items));
      menuBody.innerHTML = '<article class="location">' +
        '<div class="locationHead"><h3>' + escapeHtml(location.name) + '</h3><span class="muted">' + locationItems.length.toLocaleString() + ' items</span></div>' +
        location.periods.map((period) => (
          '<section class="period"><h4>' + escapeHtml(period.name) + '</h4>' +
          period.stations.map((station) => {
            const stationItems = station.items.slice(0, 36);
            const hidden = station.items.length - stationItems.length;
            return '<div class="station">' +
              '<div class="stationTitle"><strong>' + escapeHtml(station.name) + '</strong><span>' + station.items.length.toLocaleString() + ' items</span></div>' +
              stationItems.map((item) => {
                const tags = [...item.dietaryTags.slice(0, 4), ...item.allergens.slice(0, 3).map((allergen) => allergen.label)];
                const meta = itemMeta(item);
                return '<div class="item">' +
                  '<div><div class="itemName">' + escapeHtml(item.name) + '</div>' +
                  (tags.length ? '<div class="tags">' + tags.map((tag) => '<span class="tag">' + escapeHtml(tag) + '</span>').join('') + '</div>' : '') +
                  '</div>' +
                  '<div class="itemMeta">' + escapeHtml(meta || item.availability.status) + '</div>' +
                '</div>';
              }).join('') +
              (hidden > 0 ? '<p class="message">+' + hidden.toLocaleString() + ' more items in this station.</p>' : '') +
            '</div>';
          }).join('') +
          '</section>'
        )).join('') +
      '</article>';
    }

    function renderMenu(menu, cacheLabel = '') {
      latestMenu = menu;
      const items = countItems(menu);
      const periods = menu.locations.reduce((total, location) => total + location.periods.length, 0);
      renderSummary({
        locations: menu.locations.length,
        periods,
        items: items.length,
        nutrition: items.filter((item) => item.nutrition.length).length,
      });
      menuState.className = 'state';
      menuState.textContent = 'ready';
      cacheHint.textContent = cacheLabel;
      if (!items.length) {
        renderKnownTabs(menu);
        menuBody.innerHTML = '<p class="message">No menu items were published by this source for the selected date.</p>';
        return;
      }
      if (!activeLocationId || !menu.locations.some((location) => location.id === activeLocationId)) {
        activeLocationId = menu.locations[0].id;
      }
      renderSelectedLocation(menu);
    }

    function formatTimeWindow(window) {
      if (window.startTime && window.endTime) return window.startTime + '–' + window.endTime;
      if (window.startTime) return window.startTime;
      if (window.endTime) return 'Until ' + window.endTime;
      return 'Time TBA';
    }

    function renderFoodTruckSchedule(serviceWindows, result) {
      const summaryValues = result.summary ?? {
        serviceWindows: serviceWindows.length,
        vendors: new Set(serviceWindows.map((window) => window.vendor?.id).filter(Boolean)).size,
        locations: new Set(serviceWindows.map((window) => window.location.id)).size,
        estimated: serviceWindows.filter((window) => window.isEstimated).length,
        items: serviceWindows.reduce((total, window) => total + window.itemCount, 0),
      };
      renderFoodTruckSummary(summaryValues);
      locationTabs.innerHTML = '';
      menuState.className = serviceWindows.length ? 'state' : 'state pending';
      menuState.textContent = serviceWindows.length ? 'ready' : 'source limited';
      cacheHint.textContent = result.source === 'database' ? 'database' : '';

      if (!serviceWindows.length) {
        menuBody.innerHTML =
          '<div class="emptyState">' +
            '<h3>No food truck schedule stored for this date</h3>' +
            '<p class="message">This view only shows public food truck service windows that have been collected into Postgres. Cafeteria menus may still be available for this date.</p>' +
          '</div>';
        return;
      }

      menuBody.innerHTML = '<div class="serviceList">' + serviceWindows.map((window) => {
        const vendorName = window.vendor?.name ?? 'Campus food vendor';
        const locationParts = [window.location.name, window.location.address].filter(Boolean).join(' · ');
        const tags = [
          window.itemCount ? window.itemCount.toLocaleString() + ' menu items' : 'Schedule only',
          window.isEstimated ? 'Estimated' : 'Public source',
          window.confidence + ' confidence',
        ];
        return '<article class="serviceWindow">' +
          '<div class="serviceTime">' + escapeHtml(formatTimeWindow(window)) + '<span>' + escapeHtml(window.status) + '</span></div>' +
          '<div>' +
            '<h3>' + escapeHtml(vendorName) + '</h3>' +
            '<div class="serviceMeta">' + escapeHtml(locationParts || window.location.type.replace('_', ' ')) + '</div>' +
            '<div class="tags">' + tags.map((tag) => '<span class="tag">' + escapeHtml(tag) + '</span>').join('') + '</div>' +
            '<a class="sourceLink" href="' + escapeHtml(window.sourceUrl) + '" target="_blank" rel="noreferrer">Source</a>' +
          '</div>' +
        '</article>';
      }).join('') + '</div>';
    }

    async function fetchFoodTruckSchedule() {
      const date = isoDate(selectedDate);
      const requestId = ++requestSeq;
      menuTitle.textContent = displayDate(selectedDate);
      renderMessage('loading', 'Fetching food truck service windows for ' + date + '...', '');
      locationTabs.innerHTML = '';

      try {
        const response = await fetch('/v1/schools/' + encodeURIComponent(school.id) + '/service-windows?date=' + date + '&type=food_truck');
        const body = await response.json();
        if (requestId !== requestSeq) return;
        if (!response.ok || body.result?.state !== 'adapter_ready') {
          const reason = body.result?.reason || body.result?.error || body.error || 'Food truck schedule data is not available.';
          renderMessage('blocked', reason, 'pending');
          return;
        }
        renderFoodTruckSchedule(body.result.serviceWindows ?? [], body.result);
      } catch (error) {
        if (requestId !== requestSeq) return;
        renderMessage('error', error instanceof Error ? error.message : 'Food truck schedule fetch failed.', 'pending');
      }
    }

    async function fetchMenu() {
      if (activeView === 'food-trucks') {
        fetchFoodTruckSchedule();
        return;
      }
      const date = isoDate(selectedDate);
      if (!activeLocationId && locationOptions.length) {
        activeLocationId = locationOptions[0].id;
      }
      const locationQuery = activeLocationId && locationOptions.length ? '&locationId=' + encodeURIComponent(activeLocationId) : '';
      const cacheKey = school.id + ':' + date + ':' + (activeLocationId || 'all');
      menuTitle.textContent = displayDate(selectedDate);
      const cached = browserMenuCache.get(cacheKey);
      if (cached) {
        renderMenu(cached, 'browser cache');
        return;
      }

      const requestId = ++requestSeq;
      renderMessage('loading', 'Fetching ' + school.name + ' menus for ' + date + '...', '');
      renderKnownTabs();
      try {
        const response = await fetch('/v1/schools/' + encodeURIComponent(school.id) + '/menus?date=' + date + locationQuery);
        const body = await response.json();
        if (requestId !== requestSeq) return;
        if (!response.ok || body.result?.state !== 'adapter_ready') {
          const reason = body.result?.reason || body.result?.error || body.error || 'Menu adapter is not ready for this school/date.';
          renderMessage('blocked', reason, 'pending');
          return;
        }
        browserMenuCache.set(cacheKey, body.result.data);
        const serverCache = response.headers.get('X-Campus-Cache');
        const age = response.headers.get('X-Campus-Cache-Age');
        const cacheLabel = serverCache ? serverCache.toLowerCase() + (age && age !== '0' ? ' · ' + age + 's' : '') : '';
        renderMenu(body.result.data, cacheLabel);
      } catch (error) {
        if (requestId !== requestSeq) return;
        renderMessage('error', error instanceof Error ? error.message : 'Menu fetch failed.', 'pending');
      }
    }

    async function fetchLocationOptions() {
      try {
        const response = await fetch('/v1/schools/' + encodeURIComponent(school.id) + '/locations');
        if (!response.ok) return;
        const body = await response.json();
        const locations = body.result?.locations ?? [];
        if (!locations.length) return;
        locationOptions = locations.map((location) => ({
          id: String(location.id),
          name: location.name,
        }));
        activeLocationId = locationOptions[0].id;
        renderKnownTabs();
      } catch {
        locationOptions = [];
      }
    }

    renderSchoolOptions();
    renderCalendar();
    syncViewButtons();
    if (activeView === 'food-trucks') {
      fetchFoodTruckSchedule();
    } else {
      fetchLocationOptions().finally(fetchMenu);
    }

    select.addEventListener('change', () => {
      window.location.href = '/schools/' + encodeURIComponent(select.value);
    });
    daysEl.addEventListener('click', (event) => {
      const button = event.target.closest('[data-date]');
      if (!button) return;
      const [year, month, day] = button.dataset.date.split('-').map(Number);
      setSelectedDate(new Date(year, month - 1, day));
    });
    locationTabs.addEventListener('click', (event) => {
      if (activeView === 'food-trucks') return;
      const button = event.target.closest('[data-location-id]');
      if (!button) return;
      activeLocationId = button.dataset.locationId;
      if (locationOptions.length) {
        fetchMenu();
        return;
      }
      if (latestMenu) renderSelectedLocation(latestMenu);
    });
    viewButtons.forEach((button) => {
      button.addEventListener('click', () => setActiveView(button.dataset.view));
    });
    document.querySelector('#prevMonth').addEventListener('click', () => {
      visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
      renderCalendar();
    });
    document.querySelector('#nextMonth').addEventListener('click', () => {
      visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
      renderCalendar();
    });
    document.querySelector('#prevDay').addEventListener('click', () => {
      const next = new Date(selectedDate);
      next.setDate(selectedDate.getDate() - 1);
      setSelectedDate(next);
    });
    document.querySelector('#nextDay').addEventListener('click', () => {
      const next = new Date(selectedDate);
      next.setDate(selectedDate.getDate() + 1);
      setSelectedDate(next);
    });
    document.querySelector('#today').addEventListener('click', () => setSelectedDate(new Date()));
  </script>
</body>
</html>`;
}
