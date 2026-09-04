// Roundly app shell
let currentScreen = 'home'; // home | roundPicker | route | customers | rounds | roundDetail | expenses | backup
let activeRoundId = null;   // null = "all customers" round
let expensesSubTab = 'mileage'; // mileage | expenses
let selectedTaxYear = null; // set on first render of Expenses screen

window.addEventListener('error', (e) => {
  const app = document.getElementById('app');
  if (!app) return;
  const banner = document.createElement('div');
  banner.style.cssText = 'padding:14px; background:#FBEAE8; border:1px solid #C0392B; border-radius:8px; margin-bottom:14px; font-size:13px; font-family:monospace; white-space:pre-wrap;';
  banner.textContent = 'Error: ' + e.message + ' (line ' + e.lineno + ')';
  app.prepend(banner);
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function lastVisitDate(customerId) {
  const visits = Data.getVisitsForCustomer(customerId);
  if (!visits.length) return null;
  return visits.reduce((latest, v) => (v.date > latest ? v.date : latest), visits[0].date);
}

function isDueToday(customer) {
  const last = lastVisitDate(customer.id);
  if (customer.oneOff) {
    // A one-off job is due until its single visit is logged, then never again.
    return !last;
  }
  if (!last) return true;
  const nextDue = new Date(last);
  nextDue.setDate(nextDue.getDate() + customer.frequencyWeeks * 7);
  return nextDue <= new Date();
}

function visitStatusFor(customer) {
  const visits = Data.getVisitsForCustomer(customer.id).filter(v => v.date === todayISO());
  if (!visits.length) return 'due';
  return visits[visits.length - 1].paid ? 'paid' : 'due';
}

function visitedToday(customer) {
  return Data.getVisitsForCustomer(customer.id).some(v => v.date === todayISO());
}

// A customer belongs on today's round if they're due by frequency,
// OR they've already been visited today — otherwise marking a visit
// makes them vanish from the list mid-round, hiding unpaid stops.
function belongsOnTodaysRound(customer) {
  return isDueToday(customer) || visitedToday(customer);
}

// UK simplified mileage rate: 45p/mile for the first 10,000 business miles
// in a tax year, 25p/mile after that. Trips must be pre-sorted oldest-first
// so the running total accumulates correctly across the tax year.
function computeMileageValues(tripsSortedByDateAsc) {
  const RATE_HIGH = 0.45;
  const RATE_LOW = 0.25;
  const THRESHOLD = 10000;
  let cumMiles = 0;
  let totalValue = 0;
  const entries = tripsSortedByDateAsc.map(trip => {
    const milesBefore = cumMiles;
    const milesAt45 = Math.max(0, Math.min(trip.miles, THRESHOLD - milesBefore));
    const milesAt25 = trip.miles - milesAt45;
    const value = milesAt45 * RATE_HIGH + milesAt25 * RATE_LOW;
    cumMiles += trip.miles;
    totalValue += value;
    return { ...trip, value };
  });
  return { entries, totalMiles: cumMiles, totalValue };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// Small inline line-icons matching the home screen's icon set, used in
// place of emoji (which render inconsistently across Android devices).
const ICON_PATHS = {
  notes: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 17V9a4 4 0 0 1 4-4h4"/>',
  customers: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  expenses: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  map: '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>',
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'
};
function icon(name, size = 14) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; display:inline-block; margin-right:3px; flex-shrink:0;">${ICON_PATHS[name]}</svg>`;
}

// Larger, centred icon + heading + subtext for empty-state screens
function emptyState(iconName, title, subtext) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${icon(iconName, 30)}</div>
      <div class="empty-state-title">${title}</div>
      ${subtext ? `<div class="empty-state-sub">${subtext}</div>` : ''}
    </div>
  `;
}

function openModal(backdrop) {
  document.body.appendChild(backdrop);
  document.body.classList.add('modal-open');
  window.scrollTo(0, 0);
}

function closeModal(backdrop) {
  backdrop.remove();
  document.body.classList.remove('modal-open');
}

// --- Geocoding (OpenStreetMap Nominatim, free, no key) ---
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

async function searchAddress(query) {
  if (!query || query.trim().length < 4) return [];
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=gb&q=' + encodeURIComponent(query);
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return [];
    const results = await res.json();
    return results.map(r => ({ label: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) }));
  } catch (e) {
    console.error('Address search failed', e);
    return [];
  }
}

async function geocodeAddress(address) {
  const results = await searchAddress(address);
  return results.length ? { lat: results[0].lat, lng: results[0].lng } : null;
}

// Gets the device's current GPS position — uses the native Capacitor plugin
// when running as the installed app (handles the Android permission prompt
// automatically), falling back to the plain browser API otherwise.
async function getCurrentCoords() {
  const plugins = window.Capacitor && window.Capacitor.Plugins;
  if (plugins && plugins.Geolocation) {
    const pos = await plugins.Geolocation.getCurrentPosition();
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not available on this device.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => reject(err),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
}

// Turns coordinates back into a readable address (free, same OpenStreetMap service)
async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.display_name || null;
  } catch (e) {
    return null;
  }
}

// --- Distance (straight-line, in km) between two lat/lng points ---
function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Nearest-neighbour ordering starting from the first geocoded customer.
// Customers without coordinates are left in their original relative order, appended at the end.
function optimizeOrder(customers) {
  const withCoords = customers.filter(c => c.lat != null && c.lng != null);
  const withoutCoords = customers.filter(c => c.lat == null || c.lng == null);
  if (withCoords.length < 2) return customers;

  const remaining = [...withCoords];
  const ordered = [remaining.shift()];
  while (remaining.length) {
    const last = ordered[ordered.length - 1];
    let bestIdx = 0;
    let bestDist = Infinity;
    remaining.forEach((c, i) => {
      const d = haversineKm(last, c);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    });
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }
  return [...ordered, ...withoutCoords];
}

let lastRenderedScreen = null;

// Maps whichever detail/sub-screen is showing back to the bottom-nav
// button that should be highlighted (e.g. Route belongs to the Round tab).
function navKeyForScreen(screen) {
  const map = { route: 'roundPicker', roundDetail: 'rounds' };
  return map[screen] || screen;
}

// Persistent bottom icon bar, shown only in landscape (e.g. tablets) via
// CSS. Built once and left in the DOM — unlike #app, it isn't rebuilt on
// every render, just has its active button updated.
function buildBottomNav() {
  const nav = document.createElement('nav');
  nav.id = 'bottom-nav';
  const items = [
    { key: 'home', label: 'Home', iconName: 'home' },
    { key: 'roundPicker', label: 'Round', iconName: 'route' },
    { key: 'customers', label: 'Customers', iconName: 'customers' },
    { key: 'rounds', label: 'Rounds', iconName: 'list' },
    { key: 'expenses', label: 'Expenses', iconName: 'expenses' },
    { key: 'backup', label: 'Backup', iconName: 'cloud' }
  ];
  items.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'bottom-nav-btn';
    btn.dataset.screen = item.key;
    btn.innerHTML = `${icon(item.iconName, 20)}<span>${item.label}</span>`;
    btn.onclick = () => {
      currentScreen = item.key;
      render();
    };
    nav.appendChild(btn);
  });
  document.body.appendChild(nav);
  return nav;
}

function render() {
  try {
    const app = document.getElementById('app');
    const isNavigation = currentScreen !== lastRenderedScreen;
    app.innerHTML = '';

    if (currentScreen === 'home') {
      app.appendChild(renderHome());
    } else {
      app.appendChild(renderBackBar());
      app.appendChild(renderHeader());
      if (currentScreen === 'roundPicker') app.appendChild(renderRoundPicker());
      if (currentScreen === 'route') app.appendChild(renderRoute());
      if (currentScreen === 'customers') app.appendChild(renderCustomers());
      if (currentScreen === 'rounds') app.appendChild(renderRounds());
      if (currentScreen === 'roundDetail') app.appendChild(renderRoundDetail());
      if (currentScreen === 'expenses') app.appendChild(renderExpensesStub());
      if (currentScreen === 'backup') app.appendChild(renderBackupScreen());
    }

    if (currentScreen === 'route' || currentScreen === 'customers') {
      const fab = document.createElement('button');
      fab.className = 'fab';
      fab.textContent = '+';
      fab.setAttribute('aria-label', 'Add customer');
      fab.onclick = () => openCustomerModal();
      app.appendChild(fab);
    }
    if (currentScreen === 'rounds') {
      const fab = document.createElement('button');
      fab.className = 'fab';
      fab.textContent = '+';
      fab.setAttribute('aria-label', 'Add round');
      fab.onclick = () => openRoundModal();
      app.appendChild(fab);
    }
    if (currentScreen === 'expenses') {
      const fab = document.createElement('button');
      fab.className = 'fab';
      fab.textContent = '+';
      fab.setAttribute('aria-label', expensesSubTab === 'mileage' ? 'Add trip' : 'Add expense');
      fab.onclick = () => expensesSubTab === 'mileage' ? openMileageModal() : openExpenseModal();
      app.appendChild(fab);
    }

    if (isNavigation) {
      app.classList.remove('screen-enter');
      void app.offsetWidth; // force reflow so the animation restarts every time
      app.classList.add('screen-enter');
    }
    lastRenderedScreen = currentScreen;

    const activeNavKey = navKeyForScreen(currentScreen);
    document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.screen === activeNavKey);
    });

    maybeRunBackup();
    window.scrollTo(0, 0);
  } catch (err) {
    const app = document.getElementById('app');
    app.innerHTML = `<div style="padding:20px; background:#FBEAE8; border:1px solid #C0392B; border-radius:8px; margin-top:20px;">
      <div style="font-weight:700; color:#C0392B; margin-bottom:8px;">Something went wrong</div>
      <div style="font-size:13px; color:#1C1C1A; white-space:pre-wrap; font-family:monospace;">${escapeHtml(err.message)}\n\n${escapeHtml(err.stack || '')}</div>
    </div>`;
  }
}

function renderBackBar() {
  const bar = document.createElement('button');
  bar.className = 'back-bar';
  bar.textContent = '← Home';
  bar.onclick = () => { currentScreen = 'home'; render(); };
  return bar;
}

function renderHome() {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="home-header">
      <div class="home-logo-wrap"><img src="assets/logo.png" alt="Roundly" class="home-logo"></div>
      <div class="home-title">roundly</div>
      <div class="home-tagline">Your Route. Your Customers. Your Business.</div>
      <div class="home-sub">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
    </div>
  `;
  const grid = document.createElement('div');
  grid.className = 'home-grid';

  const items = [
    { key: 'roundPicker', label: "Today's Round", desc: 'Pick a round & see who\u2019s due',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 17V9a4 4 0 0 1 4-4h4"/></svg>' },
    { key: 'customers', label: 'Customers', desc: 'Add, edit, archive',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' },
    { key: 'rounds', label: 'Rounds', desc: 'Name & manage your rounds',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>' },
    { key: 'expenses', label: 'Expenses', desc: 'Mileage & spending, tax-year ready',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>' },
    { key: 'backup', label: 'Backup', desc: 'Encrypted backup & restore',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><circle cx="12" cy="16" r="1"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' }
  ];
  items.forEach(item => {
    const card = document.createElement('button');
    card.className = 'home-card';
    card.innerHTML = `<div class="home-card-icon">${item.icon}</div><div><div class="home-card-label">${item.label}</div><div class="home-card-desc">${item.desc}</div></div>`;
    card.onclick = () => {
      currentScreen = item.key;
      if (item.key === 'route') activeRoundId = null;
      render();
    };
    grid.appendChild(card);
  });
  wrap.appendChild(grid);

  if (Data.needsShareReminder()) {
    const banner = document.createElement('button');
    banner.className = 'reminder-banner';
    const lastShared = Data.getLastSharedTime();
    banner.innerHTML = `
      <div>
        <div class="reminder-title">${icon('cloud', 15)}Back up to the cloud</div>
        <div class="reminder-sub">${lastShared ? 'Last shared ' + new Date(lastShared).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Never shared yet'} — tap to share a backup</div>
      </div>
    `;
    banner.onclick = () => { currentScreen = 'backup'; render(); };
    wrap.appendChild(banner);
  }

  return wrap;
}

function renderHeader() {
  const header = document.createElement('div');
  header.className = 'header';

  if (currentScreen === 'route') {
    const roundName = activeRoundId
      ? (Data.getRounds().find(r => r.id === activeRoundId)?.name || 'Round')
      : 'All customers';
    const customers = Data.getCustomersInRoundOrAll();
    const dueToday = customers.filter(belongsOnTodaysRound);
    const owed = dueToday.filter(c => visitStatusFor(c) === 'due').reduce((sum, c) => sum + c.price, 0);
    header.innerHTML = `
      <div>
        <div class="date">${roundName}</div>
        <div class="title">Today's round</div>
      </div>
      <div style="display:flex; gap:8px;">
        <div class="stat-pill"><div class="num">${dueToday.length}</div><div class="label">stops</div></div>
        <div class="stat-pill"><div class="num" style="color:var(--rd-amber-text)">£${owed}</div><div class="label">due today</div></div>
      </div>
    `;
  } else if (currentScreen === 'roundDetail') {
    const round = Data.getRounds().find(r => r.id === activeRoundId);
    const stats = round ? Data.getRoundStats(round.id) : { timesWorked: 0, owing: [] };
    const totalOwed = stats.owing.reduce((sum, x) => sum + x.owed, 0);
    header.innerHTML = `
      <div>
        <div class="title">${escapeHtml(round ? round.name : 'Round')}</div>
      </div>
      <div style="display:flex; gap:8px;">
        <div class="stat-pill"><div class="num">${stats.timesWorked}</div><div class="label">times worked</div></div>
        <div class="stat-pill"><div class="num" style="color:var(--rd-amber-text)">£${totalOwed}</div><div class="label">owed</div></div>
      </div>
    `;
  } else {
    const titles = {
      roundPicker: 'Choose a round',
      customers: 'Customers',
      rounds: 'Manage rounds',
      expenses: 'Expenses',
      backup: 'Backup & restore'
    };
    header.innerHTML = `<div><div class="title">${titles[currentScreen] || ''}</div></div>`;
  }
  return header;
}

// Helper: customers in the active round, or all if none selected
Data.getCustomersInRoundOrAll = function() {
  return activeRoundId ? this.getCustomersInRound(activeRoundId) : this.getCustomers();
};

function renderRoundPicker() {
  const wrap = document.createElement('div');
  const rounds = Data.getRounds();

  const allBtn = document.createElement('div');
  allBtn.className = 'list-item';
  allBtn.innerHTML = `<div><div class="stop-name">All customers</div><div class="stop-addr">Every active customer, no round filter</div></div>`;
  allBtn.onclick = () => { activeRoundId = null; currentScreen = 'route'; render(); };
  wrap.appendChild(allBtn);

  if (!rounds.length) {
    const hint = document.createElement('div');
    hint.innerHTML = emptyState('list', 'No named rounds yet', 'Set one up under Rounds on the home screen.');
    wrap.appendChild(hint);
    return wrap;
  }

  rounds.forEach(r => {
    const count = Data.countCustomersInRound(r.id);
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `<div><div class="stop-name">${escapeHtml(r.name)}</div><div class="stop-addr">${count} customer${count === 1 ? '' : 's'}</div></div>`;
    item.onclick = () => { activeRoundId = r.id; currentScreen = 'route'; render(); };
    wrap.appendChild(item);
  });
  return wrap;
}

function renderRoute() {
  const wrap = document.createElement('div');
  const customers = Data.getCustomersInRoundOrAll().filter(belongsOnTodaysRound);

  if (!customers.length) {
    wrap.innerHTML = emptyState('route', 'No stops due today', 'Nobody in this round is due — enjoy the day off.');
    return wrap;
  }

  const actions = document.createElement('div');
  actions.className = 'route-actions';
  actions.innerHTML = `
    <button class="secondary" id="route-map-btn">Map</button>
    <button class="secondary" id="route-optimize-btn">Optimize order</button>
  `;
  wrap.appendChild(actions);
  actions.querySelector('#route-map-btn').onclick = () => showMapModal(customers);
  actions.querySelector('#route-optimize-btn').onclick = () => {
    const ordered = optimizeOrder(customers);
    Data.reorderCustomers(ordered.map(c => c.id));
    render();
  };

  // Build the set of date columns: each shown customer's own recent visit
  // history, plus today, capped to the most recent few so the grid stays
  // a reasonable width. Different customers may have blank cells on dates
  // that weren't theirs — that's expected, same as a paper round book.
  const today = todayISO();
  const allDates = new Set([today]);
  customers.forEach(c => {
    Data.getVisitsForCustomer(c.id).forEach(v => allDates.add(v.date));
  });
  const sortedDates = [...allDates].sort();
  const dateCols = sortedDates.slice(-5); // most recent 5 columns, today included

  const legend = document.createElement('div');
  legend.className = 'ledger-legend';
  legend.textContent = 'Each column: top box = done, bottom box = paid';
  wrap.appendChild(legend);

  const ledgerWrap = document.createElement('div');
  ledgerWrap.className = 'ledger-wrap';
  const grid = document.createElement('div');
  grid.className = 'ledger-grid';
  grid.style.gridTemplateColumns = `170px repeat(${dateCols.length}, 52px) 56px`;
  ledgerWrap.appendChild(grid);
  wrap.appendChild(ledgerWrap);

  // --- Header row ---
  const headerInfo = document.createElement('div');
  headerInfo.className = 'ledger-cell ledger-cell-info ledger-header';
  headerInfo.textContent = 'Customer';
  grid.appendChild(headerInfo);

  dateCols.forEach(d => {
    const cell = document.createElement('div');
    cell.className = 'ledger-cell ledger-header ledger-cell-date-header';
    cell.textContent = d === today
      ? 'Today'
      : new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    grid.appendChild(cell);
  });

  const headerOwing = document.createElement('div');
  headerOwing.className = 'ledger-cell ledger-cell-owing ledger-header';
  headerOwing.textContent = 'Owing';
  grid.appendChild(headerOwing);

  // --- Customer rows ---
  customers.forEach((c, i) => {
    const owed = Data.getAmountOwedByCustomer(c.id);

    const infoCell = document.createElement('div');
    infoCell.className = 'ledger-cell ledger-cell-info';
    infoCell.innerHTML = `
      <div class="ledger-info-main">
        <div class="rt-badge">${i + 1}</div>
        <div class="ledger-info-text">
          <div class="stop-name">${escapeHtml(c.name)}</div>
          <div class="stop-addr">${escapeHtml(c.address)}</div>
          ${c.status === 'paused' ? '<span class="paused-tag">Paused</span>' : ''}
          ${c.notes ? `<div class="stop-notes">${icon('notes', 12)}${escapeHtml(c.notes)}</div>` : ''}
        </div>
      </div>
      <div class="stop-reorder">
        <button class="reorder-btn" data-dir="up" ${i === 0 ? 'disabled' : ''} aria-label="Move up">▲</button>
        <button class="reorder-btn" data-dir="down" ${i === customers.length - 1 ? 'disabled' : ''} aria-label="Move down">▼</button>
      </div>
    `;
    infoCell.querySelector('.ledger-info-text').onclick = () => openVisitModal(c);
    infoCell.querySelectorAll('.reorder-btn').forEach(btn => {
      btn.onclick = () => {
        const dir = btn.dataset.dir;
        const neighbor = dir === 'up' ? customers[i - 1] : customers[i + 1];
        if (neighbor) {
          Data.swapOrder(c.id, neighbor.id);
          render();
        }
      };
    });
    grid.appendChild(infoCell);

    dateCols.forEach(d => {
      const visit = Data.getVisitsForCustomer(c.id).find(v => v.date === d);
      const isDone = Boolean(visit);
      const isPaid = Boolean(visit && visit.paid);

      const cell = document.createElement('div');
      cell.className = 'ledger-cell ledger-cell-check';
      cell.innerHTML = `
        <input type="checkbox" class="ledger-done" ${isDone ? 'checked' : ''}>
        <input type="checkbox" class="ledger-paid" ${isPaid ? 'checked' : ''} ${!isDone ? 'disabled' : ''}>
      `;
      const doneBox = cell.querySelector('.ledger-done');
      const paidBox = cell.querySelector('.ledger-paid');

      doneBox.onchange = () => {
        if (doneBox.checked) {
          Data.addVisit({ customerId: c.id, date: d, priceCharged: c.price, paid: false });
        } else {
          Data.deleteVisitsForCustomerOnDate(c.id, d);
        }
        render();
      };

      paidBox.onchange = () => {
        const v = Data.getVisitsForCustomer(c.id).find(v2 => v2.date === d);
        if (v) Data.updateVisit(v.id, { paid: paidBox.checked });
        render();
      };

      grid.appendChild(cell);
    });

    const owingCell = document.createElement('div');
    owingCell.className = 'ledger-cell ledger-cell-owing';
    owingCell.textContent = owed > 0 ? '£' + owed : '';
    grid.appendChild(owingCell);
  });

  return wrap;
}

function renderCustomers() {
  const wrap = document.createElement('div');
  const allCustomers = Data.getCustomers(true);

  if (!allCustomers.length) {
    wrap.innerHTML = emptyState('customers', 'No customers yet', 'Tap + to add your first one.');
    return wrap;
  }

  const searchField = document.createElement('div');
  searchField.className = 'field';
  searchField.innerHTML = `<input id="customer-search" placeholder="Search by name or address…" autocomplete="off">`;
  wrap.appendChild(searchField);

  const listContainer = document.createElement('div');
  wrap.appendChild(listContainer);

  const rounds = Data.getRounds();

  function updateList() {
    const query = searchField.querySelector('#customer-search').value.trim().toLowerCase();
    const customers = query
      ? allCustomers.filter(c => c.name.toLowerCase().includes(query) || c.address.toLowerCase().includes(query))
      : allCustomers;

    listContainer.innerHTML = '';
    if (!customers.length) {
      listContainer.innerHTML = emptyState('search', 'No matches', `Nothing found for "${escapeHtml(query)}".`);
      return;
    }
    customers.forEach(c => {
      const roundName = c.roundId ? (rounds.find(r => r.id === c.roundId)?.name) : null;
      const freqLabel = c.oneOff
        ? (Data.getVisitsForCustomer(c.id).length ? 'One-off · done' : 'One-off · not yet done')
        : `every ${c.frequencyWeeks}wk`;
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <div>
          <div class="stop-name">${escapeHtml(c.name)}</div>
          <div class="stop-addr">${escapeHtml(c.address)} &middot; ${freqLabel} &middot; £${c.price}${roundName ? ' &middot; ' + escapeHtml(roundName) : ''}</div>
        </div>
        <div class="status-pill status-${c.status === 'archived' ? 'paused' : c.status === 'paused' ? 'paused' : 'paid'}">${c.status}</div>
      `;
      item.onclick = () => openCustomerModal(c);
      listContainer.appendChild(item);
    });
  }

  searchField.querySelector('#customer-search').addEventListener('input', updateList);
  updateList();
  return wrap;
}

function renderRounds() {
  const wrap = document.createElement('div');
  const rounds = Data.getRounds();

  if (!rounds.length) {
    wrap.innerHTML = emptyState('list', 'No rounds yet', 'Tap + to create one (e.g. "Northside").');
    return wrap;
  }

  rounds.forEach(r => {
    const count = Data.countCustomersInRound(r.id);
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `<div><div class="stop-name">${escapeHtml(r.name)}</div><div class="stop-addr">${count} customer${count === 1 ? '' : 's'}</div></div>`;
    item.onclick = () => { activeRoundId = r.id; currentScreen = 'roundDetail'; render(); };
    wrap.appendChild(item);
  });
  return wrap;
}

function renderRoundDetail() {
  const wrap = document.createElement('div');
  const round = Data.getRounds().find(r => r.id === activeRoundId);
  if (!round) {
    wrap.innerHTML = emptyState('alert', 'Round not found', 'It may have been deleted.');
    return wrap;
  }

  const editBtn = document.createElement('button');
  editBtn.className = 'secondary';
  editBtn.style.cssText = 'width:100%; margin-bottom:16px;';
  editBtn.textContent = 'Rename or delete this round';
  editBtn.onclick = () => openRoundModal(round);
  wrap.appendChild(editBtn);

  const stats = Data.getRoundStats(round.id);

  const owingHeading = document.createElement('div');
  owingHeading.className = 'section-heading';
  owingHeading.textContent = 'Currently owing';
  wrap.appendChild(owingHeading);

  if (!stats.owing.length) {
    const none = document.createElement('div');
    none.className = 'empty-state';
    none.style.padding = '1.5rem';
    none.innerHTML = icon('check', 14) + 'Nobody in this round owes anything.';
    wrap.appendChild(none);
  } else {
    stats.owing.forEach(({ customer, owed }) => {
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <div><div class="stop-name">${escapeHtml(customer.name)}</div><div class="stop-addr">${escapeHtml(customer.address)}</div></div>
        <div class="stop-price" style="color:var(--rd-amber-text)">£${owed}</div>
      `;
      item.onclick = () => openCustomerModal(customer);
      wrap.appendChild(item);
    });
  }

  const datesHeading = document.createElement('div');
  datesHeading.className = 'section-heading';
  datesHeading.textContent = `Dates worked (${stats.timesWorked})`;
  wrap.appendChild(datesHeading);

  if (!stats.dates.length) {
    const none = document.createElement('div');
    none.className = 'empty-state';
    none.style.padding = '1.5rem';
    none.innerHTML = icon('route', 14) + 'This round hasn\u2019t been worked yet.';
    wrap.appendChild(none);
  } else {
    stats.dates.forEach(({ date, count }) => {
      const item = document.createElement('div');
      item.className = 'list-item';
      const formatted = new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      item.innerHTML = `<div class="stop-name">${formatted}</div><div class="stop-addr">${count} stop${count === 1 ? '' : 's'}</div>`;
      wrap.appendChild(item);
    });
  }

  return wrap;
}

function renderExpensesStub() {
  if (!selectedTaxYear) selectedTaxYear = currentTaxYear();
  const wrap = document.createElement('div');

  const taxYears = Data.getAvailableTaxYears();
  const yearRow = document.createElement('div');
  yearRow.className = 'field';
  yearRow.innerHTML = `
    <label>Tax year</label>
    <select id="exp-tax-year">
      ${taxYears.map(y => `<option value="${y}" ${y === selectedTaxYear ? 'selected' : ''}>${y}</option>`).join('')}
    </select>
  `;
  wrap.appendChild(yearRow);
  yearRow.querySelector('#exp-tax-year').onchange = (e) => {
    selectedTaxYear = e.target.value;
    render();
  };

  const subtabs = document.createElement('div');
  subtabs.className = 'subtabs';
  subtabs.innerHTML = `
    <button class="subtab ${expensesSubTab === 'mileage' ? 'active' : ''}" id="subtab-mileage">Mileage</button>
    <button class="subtab ${expensesSubTab === 'expenses' ? 'active' : ''}" id="subtab-expenses">Expenses</button>
  `;
  wrap.appendChild(subtabs);
  subtabs.querySelector('#subtab-mileage').onclick = () => { expensesSubTab = 'mileage'; render(); };
  subtabs.querySelector('#subtab-expenses').onclick = () => { expensesSubTab = 'expenses'; render(); };

  const exportBtn = document.createElement('button');
  exportBtn.className = 'primary';
  exportBtn.style.cssText = 'width:100%; margin:14px 0;';
  exportBtn.textContent = `Export ${selectedTaxYear} to Excel`;
  exportBtn.onclick = () => exportTaxYearExcel(selectedTaxYear);
  wrap.appendChild(exportBtn);

  if (expensesSubTab === 'mileage') {
    wrap.appendChild(renderMileageSection());
  } else {
    wrap.appendChild(renderExpensesSection());
  }

  return wrap;
}

function renderMileageSection() {
  const wrap = document.createElement('div');
  const trips = Data.getMileageTripsForTaxYear(selectedTaxYear);
  const { entries, totalMiles, totalValue } = computeMileageValues(trips);

  const summary = document.createElement('div');
  summary.style.cssText = 'display:flex; gap:8px; margin-bottom:16px;';
  summary.innerHTML = `
    <div class="stat-pill" style="flex:1;"><div class="num">${totalMiles}</div><div class="label">miles</div></div>
    <div class="stat-pill" style="flex:1;"><div class="num" style="color:var(--rd-green-text)">£${totalValue.toFixed(2)}</div><div class="label">claimable</div></div>
  `;
  wrap.appendChild(summary);

  if (!entries.length) {
    wrap.innerHTML += emptyState('route', 'No mileage logged', `Nothing recorded for ${selectedTaxYear} yet — tap + to add a trip.`);
    return wrap;
  }

  entries.slice().reverse().forEach(trip => {
    const item = document.createElement('div');
    item.className = 'list-item';
    const formatted = new Date(trip.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    item.innerHTML = `
      <div>
        <div class="stop-name">${trip.stops.map(escapeHtml).join(' → ')}</div>
        <div class="stop-addr">${formatted} &middot; ${escapeHtml(trip.purpose)} &middot; ${trip.miles}mi</div>
      </div>
      <div class="stop-price">£${trip.value.toFixed(2)}</div>
    `;
    item.onclick = () => openMileageModal(trip);
    wrap.appendChild(item);
  });
  return wrap;
}

function renderExpensesSection() {
  const wrap = document.createElement('div');
  const expenses = Data.getExpensesForTaxYear(selectedTaxYear);
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  const summary = document.createElement('div');
  summary.style.cssText = 'margin-bottom:16px;';
  summary.innerHTML = `<div class="stat-pill" style="width:100%;"><div class="num">£${total.toFixed(2)}</div><div class="label">total expenses</div></div>`;
  wrap.appendChild(summary);

  if (!expenses.length) {
    wrap.innerHTML += emptyState('expenses', 'No expenses logged', `Nothing recorded for ${selectedTaxYear} yet — tap + to add one.`);
    return wrap;
  }

  expenses.forEach(exp => {
    const item = document.createElement('div');
    item.className = 'list-item';
    const formatted = new Date(exp.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    item.innerHTML = `
      <div>
        <div class="stop-name">${escapeHtml(exp.description || exp.category)}</div>
        <div class="stop-addr">${formatted} &middot; ${escapeHtml(exp.category)}</div>
      </div>
      <div class="stop-price">£${exp.amount.toFixed(2)}</div>
    `;
    item.onclick = () => openExpenseModal(exp);
    wrap.appendChild(item);
  });
  return wrap;
}

function renderBackupScreen() {
  const wrap = document.createElement('div');
  const hasPassword = Boolean(Data.getBackupPassword());
  const lastBackup = Data.getLastBackupTime();

  const statusCard = document.createElement('div');
  statusCard.className = 'list-item';
  statusCard.style.cssText = 'cursor:default;';
  statusCard.innerHTML = `
    <div>
      <div class="stop-name">${hasPassword ? icon('lock', 15) + 'Backup password is set' : icon('alert', 15) + 'No backup password set'}</div>
      <div class="stop-addr">${lastBackup ? 'Last backup: ' + new Date(lastBackup).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No backup taken yet'}</div>
    </div>
  `;
  wrap.appendChild(statusCard);

  const passHeading = document.createElement('div');
  passHeading.className = 'section-heading';
  passHeading.textContent = hasPassword ? 'Change backup password' : 'Set a backup password';
  wrap.appendChild(passHeading);

  const passField = document.createElement('div');
  passField.innerHTML = `
    <div class="field"><label>New password</label><input id="bk-pass1" type="password"></div>
    <div class="field"><label>Confirm password</label><input id="bk-pass2" type="password"></div>
    <button class="primary" id="bk-save-pass" style="width:100%; margin-bottom:20px;">Save password</button>
  `;
  wrap.appendChild(passField);
  passField.querySelector('#bk-save-pass').onclick = () => {
    const p1 = passField.querySelector('#bk-pass1').value;
    const p2 = passField.querySelector('#bk-pass2').value;
    if (!p1 || p1.length < 6) {
      alert('Use a password of at least 6 characters.');
      return;
    }
    if (p1 !== p2) {
      alert('Passwords don\u2019t match.');
      return;
    }
    Data.setBackupPassword(p1);
    alert('Backup password saved. Weekly backups will now be encrypted with it automatically.');
    render();
  };

  const actionsHeading = document.createElement('div');
  actionsHeading.className = 'section-heading';
  actionsHeading.textContent = 'Manual actions';
  wrap.appendChild(actionsHeading);

  const shareBtn = document.createElement('button');
  shareBtn.className = 'primary';
  shareBtn.style.cssText = 'width:100%; margin-bottom:10px;';
  shareBtn.textContent = 'Share backup (Drive, OneDrive, etc.)';
  shareBtn.onclick = async () => {
    const password = Data.getBackupPassword();
    if (!password) {
      alert('Set a backup password above first.');
      return;
    }
    shareBtn.textContent = 'Preparing…';
    shareBtn.disabled = true;
    await shareEncryptedBackup(password);
    Data.markBackupDone();
    Data.markShared();
    shareBtn.textContent = 'Share backup (Drive, OneDrive, etc.)';
    shareBtn.disabled = false;
    render();
  };
  wrap.appendChild(shareBtn);

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'secondary';
  downloadBtn.style.cssText = 'width:100%; margin-bottom:10px;';
  downloadBtn.textContent = 'Download backup to this device';
  downloadBtn.onclick = async () => {
    const password = Data.getBackupPassword();
    if (!password) {
      alert('Set a backup password above first.');
      return;
    }
    downloadBtn.textContent = 'Encrypting…';
    downloadBtn.disabled = true;
    await downloadEncryptedBackup(password, `roundly-backup-${todayISO()}.json`);
    Data.markBackupDone();
    downloadBtn.textContent = 'Download backup now';
    downloadBtn.disabled = false;
    render();
  };
  wrap.appendChild(downloadBtn);

  const restoreBtn = document.createElement('button');
  restoreBtn.className = 'secondary';
  restoreBtn.style.cssText = 'width:100%;';
  restoreBtn.textContent = 'Restore from backup file';
  wrap.appendChild(restoreBtn);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json';
  fileInput.style.display = 'none';
  wrap.appendChild(fileInput);

  restoreBtn.onclick = () => fileInput.click();
  fileInput.onchange = () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => openRestoreModal(reader.result);
    reader.readAsText(file);
    fileInput.value = '';
  };

  return wrap;
}

function openRestoreModal(encryptedContent) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div style="font-weight:700; margin-bottom:6px;">Restore backup</div>
      <div style="font-size:13px; color:var(--text-secondary); margin-bottom:14px;">This will replace everything currently in the app with what's in this backup file. This can't be undone.</div>
      <div class="field"><label>Backup password</label><input id="rs-pass" type="password"></div>
      <div class="modal-actions">
        <button class="secondary" id="rs-cancel">Cancel</button>
        <button class="primary" id="rs-confirm">Restore</button>
      </div>
    </div>
  `;
  openModal(backdrop);
  backdrop.querySelector('#rs-cancel').onclick = () => closeModal(backdrop);
  backdrop.querySelector('#rs-confirm').onclick = async () => {
    const password = backdrop.querySelector('#rs-pass').value;
    if (!password) {
      alert('Enter the backup password.');
      return;
    }
    const confirmBtn = backdrop.querySelector('#rs-confirm');
    confirmBtn.textContent = 'Restoring…';
    confirmBtn.disabled = true;
    try {
      const json = await decryptText(encryptedContent, password);
      Data.importBackup(json);
      closeModal(backdrop);
      alert('Backup restored successfully.');
      currentScreen = 'home';
      render();
    } catch (e) {
      alert(e.message || 'Could not restore this backup.');
      confirmBtn.textContent = 'Restore';
      confirmBtn.disabled = false;
    }
  };
}

// --- Customer modal (add / edit) ---
function openCustomerModal(customer) {
  const isEdit = Boolean(customer);
  const rounds = Data.getRounds();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="field"><label>Name</label><input id="f-name" value="${customer ? escapeHtml(customer.name) : ''}"></div>
      <div class="field" style="position:relative;">
        <label>Address</label>
        <input id="f-address" value="${customer ? escapeHtml(customer.address) : ''}" autocomplete="off" placeholder="Start typing to search…">
        <div id="f-address-suggestions" class="address-suggestions"></div>
        <div id="f-address-status" class="address-status">${customer && customer.lat != null ? icon('pin', 12) + 'Location saved' : ''}</div>
      </div>
      <div class="field"><label>Phone</label><input id="f-phone" value="${customer ? escapeHtml(customer.phone) : ''}"></div>
      <div class="field"><label>Price (£)</label><input id="f-price" type="number" value="${customer ? customer.price : ''}"></div>
      <div class="field">
        <label><input id="f-oneoff" type="checkbox" ${customer && customer.oneOff ? 'checked' : ''} style="width:auto; margin-right:6px;">One-off job (not recurring)</label>
      </div>
      <div class="field" id="f-freq-field" style="${customer && customer.oneOff ? 'display:none;' : ''}">
        <label>Frequency (weeks)</label><input id="f-freq" type="number" value="${customer ? customer.frequencyWeeks : 4}">
      </div>
      <div class="field"><label>Round</label>
        <select id="f-round">
          <option value="">Unassigned</option>
          ${rounds.map(r => `<option value="${r.id}" ${customer && customer.roundId === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Notes</label><textarea id="f-notes">${customer ? escapeHtml(customer.notes) : ''}</textarea></div>
      ${isEdit ? `
      <div class="field"><label>Status</label>
        <select id="f-status">
          <option value="active" ${customer.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="paused" ${customer.status === 'paused' ? 'selected' : ''}>Paused</option>
          <option value="archived" ${customer.status === 'archived' ? 'selected' : ''}>Archived</option>
        </select>
      </div>` : ''}
      <div class="modal-actions">
        <button class="secondary" id="f-cancel">Cancel</button>
        <button class="primary" id="f-save">${isEdit ? 'Save changes' : 'Add customer'}</button>
      </div>
      ${isEdit ? `<button class="secondary" id="f-delete" style="width:100%; margin-top:8px; color:var(--rd-danger-text); border-color:var(--rd-danger-border);">Delete customer</button>` : ''}
    </div>
  `;
  openModal(backdrop);

  // Tracks the coordinates for whichever address is currently confirmed.
  // Starts as the customer's existing coords (if editing); cleared whenever
  // the address text is edited, and set again when a suggestion is picked.
  let selectedCoords = (customer && customer.lat != null && customer.lng != null)
    ? { lat: customer.lat, lng: customer.lng }
    : null;
  let lastConfirmedAddress = customer ? customer.address : null;

  const addressInput = backdrop.querySelector('#f-address');
  const suggestionsBox = backdrop.querySelector('#f-address-suggestions');
  const statusBox = backdrop.querySelector('#f-address-status');

  const runSearch = debounce(async () => {
    const query = addressInput.value.trim();
    if (query.length < 4) {
      suggestionsBox.innerHTML = '';
      return;
    }
    const results = await searchAddress(query);
    if (!results.length) {
      suggestionsBox.innerHTML = `<div class="address-suggestion-empty">No matches found</div>`;
      return;
    }
    suggestionsBox.innerHTML = results.map((r, i) =>
      `<div class="address-suggestion" data-idx="${i}">${escapeHtml(r.label)}</div>`
    ).join('');
    suggestionsBox.querySelectorAll('.address-suggestion').forEach((el, i) => {
      el.onclick = () => {
        addressInput.value = results[i].label;
        selectedCoords = { lat: results[i].lat, lng: results[i].lng };
        lastConfirmedAddress = results[i].label;
        suggestionsBox.innerHTML = '';
        statusBox.innerHTML = icon('pin', 12) + 'Location saved';
      };
    });
  }, 400);

  addressInput.addEventListener('input', () => {
    if (addressInput.value.trim() !== lastConfirmedAddress) {
      selectedCoords = null;
      statusBox.textContent = '';
    }
    runSearch();
  });

  if (isEdit) {
    backdrop.querySelector('#f-delete').onclick = () => {
      if (confirm(`Delete ${customer.name}? This can't be undone.`)) {
        Data.deleteCustomer(customer.id);
        closeModal(backdrop);
        render();
      }
    };
  }

  backdrop.querySelector('#f-oneoff').onchange = (e) => {
    backdrop.querySelector('#f-freq-field').style.display = e.target.checked ? 'none' : 'block';
  };

  backdrop.querySelector('#f-cancel').onclick = () => closeModal(backdrop);
  backdrop.querySelector('#f-save').onclick = () => {
    const name = backdrop.querySelector('#f-name').value.trim();
    const address = backdrop.querySelector('#f-address').value.trim();
    if (!name || !address) {
      alert('Enter a name and address first.');
      return;
    }
    const oneOff = backdrop.querySelector('#f-oneoff').checked;
    const payload = {
      name,
      address,
      phone: backdrop.querySelector('#f-phone').value.trim(),
      price: backdrop.querySelector('#f-price').value,
      oneOff,
      frequencyWeeks: oneOff ? 0 : backdrop.querySelector('#f-freq').value,
      roundId: backdrop.querySelector('#f-round').value || null,
      notes: backdrop.querySelector('#f-notes').value.trim(),
      lat: selectedCoords ? selectedCoords.lat : null,
      lng: selectedCoords ? selectedCoords.lng : null
    };
    if (isEdit) {
      payload.status = backdrop.querySelector('#f-status').value;
      Data.updateCustomer(customer.id, payload);
    } else {
      Data.addCustomer(payload);
    }
    closeModal(backdrop);
    render();
  };
}

// --- Round modal (add / edit / delete) ---
function openRoundModal(round) {
  const isEdit = Boolean(round);
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="field"><label>Round name</label><input id="r-name" value="${round ? escapeHtml(round.name) : ''}" placeholder="e.g. Northside"></div>
      <div class="modal-actions">
        <button class="secondary" id="r-cancel">Cancel</button>
        <button class="primary" id="r-save">${isEdit ? 'Save changes' : 'Add round'}</button>
      </div>
      ${isEdit ? `<button class="secondary" id="r-delete" style="width:100%; margin-top:8px; color:var(--rd-danger-text); border-color:var(--rd-danger-border);">Delete round</button>` : ''}
    </div>
  `;
  openModal(backdrop);

  if (isEdit) {
    backdrop.querySelector('#r-delete').onclick = () => {
      if (confirm(`Delete "${round.name}"? Customers in it become unassigned, they won't be removed.`)) {
        Data.deleteRound(round.id);
        closeModal(backdrop);
        render();
      }
    };
  }

  backdrop.querySelector('#r-cancel').onclick = () => closeModal(backdrop);
  backdrop.querySelector('#r-save').onclick = () => {
    const name = backdrop.querySelector('#r-name').value.trim();
    if (!name) {
      alert('Give the round a name first.');
      return;
    }
    if (isEdit) {
      Data.updateRound(round.id, { name });
    } else {
      Data.addRound(name);
    }
    closeModal(backdrop);
    render();
  };
}

// --- Visit modal (mark done / paid) ---
function openVisitModal(customer) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div style="font-weight:600; margin-bottom:12px;">${escapeHtml(customer.name)}</div>
      <div class="field"><label>Price charged (£)</label><input id="v-price" type="number" value="${customer.price}"></div>
      <div class="field"><label><input id="v-paid" type="checkbox" checked style="width:auto; margin-right:6px;">Paid today</label></div>
      <div class="modal-actions">
        <button class="secondary" id="v-cancel">Cancel</button>
        <button class="primary" id="v-save">Mark visited</button>
      </div>
    </div>
  `;
  openModal(backdrop);
  backdrop.querySelector('#v-cancel').onclick = () => closeModal(backdrop);
  backdrop.querySelector('#v-save').onclick = () => {
    Data.addVisit({
      customerId: customer.id,
      date: todayISO(),
      priceCharged: backdrop.querySelector('#v-price').value,
      paid: backdrop.querySelector('#v-paid').checked
    });
    closeModal(backdrop);
    render();
  };
}

// --- Map modal (Leaflet) ---
function showMapModal(customers) {
  const withCoords = customers.filter(c => c.lat != null && c.lng != null);

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop map-modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-sheet map-sheet">
      <div class="map-header">
        <div style="font-weight:700; font-size:16px;">Route map</div>
        <button class="secondary" id="map-close">Close</button>
      </div>
      ${withCoords.length ? '<div id="map-container"></div>' :
        emptyState('map', 'No located addresses yet', 'Save or edit these customers once online to place them on the map.')}
      ${withCoords.length < customers.length ? `<div class="map-note">${customers.length - withCoords.length} stop${customers.length - withCoords.length === 1 ? '' : 's'} not shown (address not yet located)</div>` : ''}
    </div>
  `;
  openModal(backdrop);
  backdrop.querySelector('#map-close').onclick = () => closeModal(backdrop);

  if (withCoords.length) {
    // Slight delay so the container has its final size before Leaflet measures it
    setTimeout(() => {
      const map = L.map('map-container');
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map);

      const bounds = [];
      withCoords.forEach((c, i) => {
        const marker = L.marker([c.lat, c.lng]).addTo(map);
        marker.bindPopup(`<strong>${i + 1}. ${escapeHtml(c.name)}</strong><br>${escapeHtml(c.address)}`);
        bounds.push([c.lat, c.lng]);
      });

      if (withCoords.length > 1) {
        L.polyline(bounds, { color: '#185FA5', weight: 3, opacity: 0.6 }).addTo(map);
        map.fitBounds(bounds, { padding: [30, 30] });
      } else {
        map.setView(bounds[0], 15);
      }
    }, 50);
  }
}

// --- Mileage trip modal ---
function openMileageModal(trip) {
  const isEdit = Boolean(trip);
  const rounds = Data.getRounds();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="field"><label>Date</label><input id="m-date" type="date" value="${isEdit ? trip.date : todayISO()}"></div>
      <div class="field"><label>Round (optional)</label>
        <select id="m-round">
          <option value="">None</option>
          ${rounds.map(r => `<option value="${r.id}" ${isEdit && trip.roundId === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
        </select>
      </div>
      <button type="button" class="secondary" id="m-fill-round" style="width:100%; margin-bottom:14px; display:none;">Fill stops from this round's order</button>
      <div class="field">
        <label>Stops (in order visited)</label>
        <div id="m-stops"></div>
        <button type="button" class="secondary" id="m-add-stop" style="width:100%; margin-top:6px;">+ Add stop</button>
      </div>
      <div class="field"><label>Purpose</label><input id="m-purpose" value="${isEdit ? escapeHtml(trip.purpose) : ''}" placeholder="e.g. Northside round"></div>
      <div class="field">
        <label>Miles (whole trip)</label>
        <input id="m-miles" type="number" step="0.1" value="${isEdit ? trip.miles : ''}">
        <button type="button" class="secondary" id="m-calc-miles" style="width:100%; margin-top:8px;">Calculate miles from stops</button>
        <div id="m-calc-status" class="address-status"></div>
      </div>
      <div class="modal-actions">
        <button class="secondary" id="m-cancel">Cancel</button>
        <button class="primary" id="m-save">${isEdit ? 'Save changes' : 'Add trip'}</button>
      </div>
      ${isEdit ? `<button class="secondary" id="m-delete" style="width:100%; margin-top:8px; color:var(--rd-danger-text); border-color:var(--rd-danger-border);">Delete trip</button>` : ''}
    </div>
  `;
  openModal(backdrop);

  const stopsContainer = backdrop.querySelector('#m-stops');
  function addStopRow(value) {
    const row = document.createElement('div');
    row.className = 'stop-input-row';
    row.innerHTML = `
      <input class="m-stop-input" value="${value ? escapeHtml(value) : ''}" placeholder="Postcode or address">
      <button type="button" class="stop-locate" aria-label="Use my location">${icon('pin', 16)}</button>
      <button type="button" class="stop-remove" aria-label="Remove stop">×</button>
    `;
    const stopInput = row.querySelector('.m-stop-input');
    const locateBtn = row.querySelector('.stop-locate');
    locateBtn.onclick = async () => {
      locateBtn.disabled = true;
      locateBtn.textContent = '…';
      try {
        const coords = await getCurrentCoords();
        const label = await reverseGeocode(coords.lat, coords.lng);
        stopInput.value = label || `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
      } catch (e) {
        alert('Couldn\u2019t get your location — check location permission is allowed for this app.');
      }
      locateBtn.disabled = false;
      locateBtn.innerHTML = icon('pin', 16);
    };
    row.querySelector('.stop-remove').onclick = () => {
      if (stopsContainer.children.length > 2) row.remove();
    };
    stopsContainer.appendChild(row);
  }
  if (isEdit && trip.stops.length) {
    trip.stops.forEach(s => addStopRow(s));
  } else {
    addStopRow(); // start with two blank stops (e.g. Home → first job)
    addStopRow();
  }

  backdrop.querySelector('#m-add-stop').onclick = () => addStopRow();

  const roundSelect = backdrop.querySelector('#m-round');
  const fillBtn = backdrop.querySelector('#m-fill-round');
  if (isEdit && trip.roundId) fillBtn.style.display = 'block';
  roundSelect.onchange = () => {
    const round = rounds.find(r => r.id === roundSelect.value);
    const purposeField = backdrop.querySelector('#m-purpose');
    if (round) {
      fillBtn.style.display = 'block';
      if (!purposeField.value.trim()) purposeField.value = `${round.name} round`;
    } else {
      fillBtn.style.display = 'none';
    }
  };
  fillBtn.onclick = () => {
    const round = rounds.find(r => r.id === roundSelect.value);
    if (!round) return;
    const customers = Data.getCustomersInRound(round.id);
    if (!customers.length) {
      alert('No customers assigned to this round yet.');
      return;
    }
    stopsContainer.innerHTML = '';
    customers.forEach(c => addStopRow(c.address));
  };

  const calcBtn = backdrop.querySelector('#m-calc-miles');
  const calcStatus = backdrop.querySelector('#m-calc-status');
  calcBtn.onclick = async () => {
    const stops = [...stopsContainer.querySelectorAll('.m-stop-input')]
      .map(input => input.value.trim())
      .filter(Boolean);
    if (stops.length < 2) {
      alert('Enter at least a start and end stop first.');
      return;
    }
    calcBtn.disabled = true;
    calcBtn.textContent = 'Locating stops…';
    calcStatus.textContent = '';

    const coords = [];
    for (let i = 0; i < stops.length; i++) {
      calcBtn.textContent = `Locating stop ${i + 1} of ${stops.length}…`;
      const result = await geocodeAddress(stops[i]);
      if (!result) {
        alert(`Couldn't locate "${stops[i]}" — try a fuller address, or enter miles manually.`);
        calcBtn.disabled = false;
        calcBtn.textContent = 'Calculate miles from stops';
        return;
      }
      coords.push(result);
      // Stay within the free routing service's 1-request-per-second limit
      if (i < stops.length - 1) await new Promise(r => setTimeout(r, 1100));
    }

    calcBtn.textContent = 'Calculating route…';
    try {
      const coordStr = coords.map(c => `${c.lng},${c.lat}`).join(';');
      const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=false`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.routes || !data.routes.length) throw new Error('No route found');
      const miles = data.routes[0].distance / 1609.34;
      backdrop.querySelector('#m-miles').value = miles.toFixed(1);
      calcStatus.innerHTML = icon('check', 12) + `Calculated from ${stops.length} stops`;
    } catch (e) {
      alert('Couldn\u2019t calculate a driving route — check your connection, or enter miles manually.');
    }
    calcBtn.disabled = false;
    calcBtn.textContent = 'Calculate miles from stops';
  };

  if (isEdit) {
    backdrop.querySelector('#m-delete').onclick = () => {
      if (confirm('Delete this mileage entry?')) {
        Data.deleteMileageTrip(trip.id);
        closeModal(backdrop);
        render();
      }
    };
  }

  backdrop.querySelector('#m-cancel').onclick = () => closeModal(backdrop);
  backdrop.querySelector('#m-save').onclick = () => {
    const miles = parseFloat(backdrop.querySelector('#m-miles').value);
    if (!miles || miles <= 0) {
      alert('Enter the number of miles first.');
      return;
    }
    const stops = [...stopsContainer.querySelectorAll('.m-stop-input')]
      .map(input => input.value.trim())
      .filter(Boolean);
    if (stops.length < 2) {
      alert('Enter at least a start and end stop.');
      return;
    }
    const payload = {
      date: backdrop.querySelector('#m-date').value || todayISO(),
      stops,
      purpose: backdrop.querySelector('#m-purpose').value.trim(),
      miles,
      roundId: roundSelect.value || null
    };
    if (isEdit) {
      Data.updateMileageTrip(trip.id, payload);
    } else {
      Data.addMileageTrip(payload);
    }
    closeModal(backdrop);
    render();
  };
}

// --- Expense modal ---
function openExpenseModal(expense) {
  const isEdit = Boolean(expense);
  const categories = ['Fuel', 'Equipment', 'Insurance', 'Phone', 'Other'];
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="field"><label>Date</label><input id="e-date" type="date" value="${isEdit ? expense.date : todayISO()}"></div>
      <div class="field"><label>Category</label>
        <select id="e-category">
          ${categories.map(c => `<option value="${c}" ${isEdit && expense.category === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Description</label><input id="e-description" value="${isEdit ? escapeHtml(expense.description) : ''}" placeholder="e.g. new squeegee"></div>
      <div class="field"><label>Amount (£)</label><input id="e-amount" type="number" step="0.01" value="${isEdit ? expense.amount : ''}"></div>
      <div class="modal-actions">
        <button class="secondary" id="e-cancel">Cancel</button>
        <button class="primary" id="e-save">${isEdit ? 'Save changes' : 'Add expense'}</button>
      </div>
      ${isEdit ? `<button class="secondary" id="e-delete" style="width:100%; margin-top:8px; color:var(--rd-danger-text); border-color:var(--rd-danger-border);">Delete expense</button>` : ''}
    </div>
  `;
  openModal(backdrop);

  if (isEdit) {
    backdrop.querySelector('#e-delete').onclick = () => {
      if (confirm('Delete this expense?')) {
        Data.deleteExpense(expense.id);
        closeModal(backdrop);
        render();
      }
    };
  }

  backdrop.querySelector('#e-cancel').onclick = () => closeModal(backdrop);
  backdrop.querySelector('#e-save').onclick = () => {
    const amount = parseFloat(backdrop.querySelector('#e-amount').value);
    if (!amount || amount <= 0) {
      alert('Enter an amount first.');
      return;
    }
    const payload = {
      date: backdrop.querySelector('#e-date').value || todayISO(),
      category: backdrop.querySelector('#e-category').value,
      description: backdrop.querySelector('#e-description').value.trim(),
      amount
    };
    if (isEdit) {
      Data.updateExpense(expense.id, payload);
    } else {
      Data.addExpense(payload);
    }
    closeModal(backdrop);
    render();
  };
}

// --- Excel export for a tax year (mileage + expenses, two sheets) ---
function exportTaxYearExcel(taxYear) {
  const trips = Data.getMileageTripsForTaxYear(taxYear);
  const { entries, totalMiles, totalValue } = computeMileageValues(trips);
  const expenses = Data.getExpensesForTaxYear(taxYear);
  const expenseTotal = expenses.reduce((sum, e) => sum + e.amount, 0);

  const mileageRows = [
    ['Date', 'Route', 'Purpose', 'Miles', 'Value (£)'],
    ...entries.map(t => [t.date, t.stops.join(' \u2192 '), t.purpose, t.miles, Number(t.value.toFixed(2))]),
    [],
    ['', 'Total', '', totalMiles, Number(totalValue.toFixed(2))]
  ];

  const expenseRows = [
    ['Date', 'Category', 'Description', 'Amount (£)'],
    ...expenses.map(e => [e.date, e.category, e.description, Number(e.amount.toFixed(2))]),
    [],
    ['', '', 'Total', Number(expenseTotal.toFixed(2))]
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mileageRows), 'Mileage');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expenseRows), 'Expenses');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `roundly-${taxYear.replace('/', '-')}-tax-year.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function maybeRunBackup() {
  if (!Data.needsBackup()) return;
  const password = Data.getBackupPassword();
  if (!password) return; // no password set yet — user needs to set one on the Backup screen first
  downloadEncryptedBackup(password, 'roundly-backup.json').then(() => {
    Data.markBackupDone();
  });
}

// --- Backup encryption (Web Crypto: AES-GCM, key derived via PBKDF2) ---
function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function base64ToBuf(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
}

async function deriveKey(password, saltBytes) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: 150000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptText(plaintext, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  return JSON.stringify({
    roundlyEncrypted: true,
    salt: bufToBase64(salt),
    iv: bufToBase64(iv),
    data: bufToBase64(ciphertext)
  });
}

async function decryptText(envelopeJson, password) {
  let envelope;
  try {
    envelope = JSON.parse(envelopeJson);
  } catch (e) {
    throw new Error('That file isn\u2019t a valid Roundly backup.');
  }
  if (!envelope.roundlyEncrypted) throw new Error('That file isn\u2019t an encrypted Roundly backup.');
  const salt = new Uint8Array(base64ToBuf(envelope.salt));
  const iv = new Uint8Array(base64ToBuf(envelope.iv));
  const key = await deriveKey(password, salt);
  try {
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, base64ToBuf(envelope.data));
    return new TextDecoder().decode(plainBuf);
  } catch (e) {
    throw new Error('Wrong password, or the file is corrupted.');
  }
}

async function downloadEncryptedBackup(password, filename) {
  const json = Data.getBackupJSON();
  const encrypted = await encryptText(json, password);
  const blob = new Blob([encrypted], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Prepares the encrypted backup and hands it to Android's native share sheet,
// so the person can save it straight into Drive, OneDrive, email, etc.
// Falls back to a plain download if the share plugins aren't available
// (e.g. testing in a regular browser rather than the installed app).
async function shareEncryptedBackup(password) {
  const json = Data.getBackupJSON();
  const encrypted = await encryptText(json, password);
  const filename = `roundly-backup-${todayISO()}.json`;

  const plugins = window.Capacitor && window.Capacitor.Plugins;
  if (plugins && plugins.Filesystem && plugins.Share) {
    try {
      await plugins.Filesystem.writeFile({
        path: filename,
        data: encrypted,
        directory: 'CACHE',
        encoding: 'utf8'
      });
      const uriResult = await plugins.Filesystem.getUri({ path: filename, directory: 'CACHE' });
      await plugins.Share.share({
        title: 'Roundly backup',
        url: uriResult.uri,
        dialogTitle: 'Save your backup to Drive, OneDrive, or anywhere else'
      });
      return;
    } catch (e) {
      console.error('Share failed, falling back to download', e);
    }
  }
  await downloadEncryptedBackup(password, filename);
}

buildBottomNav();
render();
