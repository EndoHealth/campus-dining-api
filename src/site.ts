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
  ].map(([name, cafeterias, note]) => ({ name, cafeterias, note })),
  pendingSchools: ['University of Chicago', 'University of Florida', 'Northeastern University'],
};

export function getSiteSnapshot() {
  return snapshot;
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
    const pendingRows = snapshot.pendingSchools.map((name) => ({
      name,
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
        return '<tr>' +
          '<td><strong>' + escapeHtml(row.name) + '</strong><div class="muted">' + escapeHtml(row.locations) + '</div></td>' +
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
