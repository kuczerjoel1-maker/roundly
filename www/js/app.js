// Roundly app shell
let currentScreen = 'home'; // home | roundPicker | route | customers | rounds | roundDetail | expenses
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

function render() {
  try {
    const app = document.getElementById('app');
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
      <div class="home-title">roundly</div>
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
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>' }
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
      expenses: 'Expenses'
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
    hint.className = 'empty-state';
    hint.innerHTML = `No named rounds yet.<br>Set one up under Rounds on the home screen.`;
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
    wrap.innerHTML = `<div class="empty-state">No stops due today in this round.</div>`;
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

  const list = document.createElement('div');
  list.className = 'route-list';
  const line = document.createElement('div');
  line.className = 'route-line';
  list.appendChild(line);

  customers.forEach((c, i) => {
    const status = c.status === 'paused' ? 'paused' : visitStatusFor(c);
    const row = document.createElement('div');
    row.className = 'stop-row';
    row.innerHTML = `
      <div class="stop-badge">${i + 1}</div>
      <div class="stop-card">
        <div>
          <div class="stop-name">${escapeHtml(c.name)}</div>
          <div class="stop-addr">${escapeHtml(c.address)}</div>
        </div>
        <div>
          <div class="stop-price">£${c.price}</div>
          <div class="status-pill status-${status}">${status.charAt(0).toUpperCase() + status.slice(1)}</div>
        </div>
      </div>
    `;
    row.querySelector('.stop-card').onclick = () => openVisitModal(c);
    list.appendChild(row);
  });
  wrap.appendChild(list);
  return wrap;
}

function renderCustomers() {
  const wrap = document.createElement('div');
  const customers = Data.getCustomers(true);

  if (!customers.length) {
    wrap.innerHTML = `<div class="empty-state">No customers yet.<br>Tap + to add your first one.</div>`;
    return wrap;
  }

  const rounds = Data.getRounds();
  customers.forEach(c => {
    const roundName = c.roundId ? (rounds.find(r => r.id === c.roundId)?.name) : null;
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div>
        <div class="stop-name">${escapeHtml(c.name)}</div>
        <div class="stop-addr">${escapeHtml(c.address)} &middot; every ${c.frequencyWeeks}wk &middot; £${c.price}${roundName ? ' &middot; ' + escapeHtml(roundName) : ''}</div>
      </div>
      <div class="status-pill status-${c.status === 'archived' ? 'paused' : c.status === 'paused' ? 'paused' : 'paid'}">${c.status}</div>
    `;
    item.onclick = () => openCustomerModal(c);
    wrap.appendChild(item);
  });
  return wrap;
}

function renderRounds() {
  const wrap = document.createElement('div');
  const rounds = Data.getRounds();

  if (!rounds.length) {
    wrap.innerHTML = `<div class="empty-state">No rounds yet.<br>Tap + to create one (e.g. "Northside").</div>`;
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
    wrap.innerHTML = `<div class="empty-state">Round not found.</div>`;
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
    none.textContent = 'Nobody in this round owes anything.';
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
    none.textContent = 'This round hasn\u2019t been worked yet.';
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
    wrap.innerHTML += `<div class="empty-state">No mileage logged for ${selectedTaxYear} yet.<br>Tap + to add a trip.</div>`;
    return wrap;
  }

  entries.slice().reverse().forEach(trip => {
    const item = document.createElement('div');
    item.className = 'list-item';
    const formatted = new Date(trip.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    item.innerHTML = `
      <div>
        <div class="stop-name">${escapeHtml(trip.from)} → ${escapeHtml(trip.to)}</div>
        <div class="stop-addr">${formatted} &middot; ${escapeHtml(trip.purpose)} &middot; ${trip.miles}mi</div>
      </div>
      <div class="stop-price">£${trip.value.toFixed(2)}</div>
    `;
    item.onclick = () => {
      if (confirm('Delete this mileage entry?')) {
        Data.deleteMileageTrip(trip.id);
        render();
      }
    };
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
    wrap.innerHTML += `<div class="empty-state">No expenses logged for ${selectedTaxYear} yet.<br>Tap + to add one.</div>`;
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
    item.onclick = () => {
      if (confirm('Delete this expense?')) {
        Data.deleteExpense(exp.id);
        render();
      }
    };
    wrap.appendChild(item);
  });
  return wrap;
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
        <div id="f-address-status" class="address-status">${customer && customer.lat != null ? '📍 Location saved' : ''}</div>
      </div>
      <div class="field"><label>Phone</label><input id="f-phone" value="${customer ? escapeHtml(customer.phone) : ''}"></div>
      <div class="field"><label>Price (£)</label><input id="f-price" type="number" value="${customer ? customer.price : ''}"></div>
      <div class="field"><label>Frequency (weeks)</label><input id="f-freq" type="number" value="${customer ? customer.frequencyWeeks : 4}"></div>
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
      ${isEdit ? `<button class="secondary" id="f-delete" style="width:100%; margin-top:8px; color:#A32D2D; border-color:#F09595;">Delete customer</button>` : ''}
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
        statusBox.textContent = '📍 Location saved';
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

  backdrop.querySelector('#f-cancel').onclick = () => closeModal(backdrop);
  backdrop.querySelector('#f-save').onclick = () => {
    const name = backdrop.querySelector('#f-name').value.trim();
    const address = backdrop.querySelector('#f-address').value.trim();
    if (!name || !address) {
      alert('Enter a name and address first.');
      return;
    }
    const payload = {
      name,
      address,
      phone: backdrop.querySelector('#f-phone').value.trim(),
      price: backdrop.querySelector('#f-price').value,
      frequencyWeeks: backdrop.querySelector('#f-freq').value,
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
      ${isEdit ? `<button class="secondary" id="r-delete" style="width:100%; margin-top:8px; color:#A32D2D; border-color:#F09595;">Delete round</button>` : ''}
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
        '<div class="empty-state">None of these customers have a located address yet.<br>Save/edit them once online to place them on the map.</div>'}
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
function openMileageModal() {
  const rounds = Data.getRounds();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="field"><label>Date</label><input id="m-date" type="date" value="${todayISO()}"></div>
      <div class="field"><label>From</label><input id="m-from" placeholder="e.g. home postcode"></div>
      <div class="field"><label>To</label><input id="m-to" placeholder="e.g. destination postcode"></div>
      <div class="field"><label>Round (optional)</label>
        <select id="m-round">
          <option value="">None</option>
          ${rounds.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Purpose</label><input id="m-purpose" placeholder="e.g. Northside round"></div>
      <div class="field"><label>Miles</label><input id="m-miles" type="number" step="0.1"></div>
      <div class="modal-actions">
        <button class="secondary" id="m-cancel">Cancel</button>
        <button class="primary" id="m-save">Add trip</button>
      </div>
    </div>
  `;
  openModal(backdrop);

  backdrop.querySelector('#m-round').onchange = (e) => {
    const round = rounds.find(r => r.id === e.target.value);
    const purposeField = backdrop.querySelector('#m-purpose');
    if (round && !purposeField.value.trim()) {
      purposeField.value = `${round.name} round`;
    }
  };

  backdrop.querySelector('#m-cancel').onclick = () => closeModal(backdrop);
  backdrop.querySelector('#m-save').onclick = () => {
    const miles = parseFloat(backdrop.querySelector('#m-miles').value);
    if (!miles || miles <= 0) {
      alert('Enter the number of miles first.');
      return;
    }
    Data.addMileageTrip({
      date: backdrop.querySelector('#m-date').value || todayISO(),
      from: backdrop.querySelector('#m-from').value.trim(),
      to: backdrop.querySelector('#m-to').value.trim(),
      purpose: backdrop.querySelector('#m-purpose').value.trim(),
      miles,
      roundId: backdrop.querySelector('#m-round').value || null
    });
    closeModal(backdrop);
    render();
  };
}

// --- Expense modal ---
function openExpenseModal() {
  const categories = ['Fuel', 'Equipment', 'Insurance', 'Phone', 'Other'];
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="field"><label>Date</label><input id="e-date" type="date" value="${todayISO()}"></div>
      <div class="field"><label>Category</label>
        <select id="e-category">
          ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Description</label><input id="e-description" placeholder="e.g. new squeegee"></div>
      <div class="field"><label>Amount (£)</label><input id="e-amount" type="number" step="0.01"></div>
      <div class="modal-actions">
        <button class="secondary" id="e-cancel">Cancel</button>
        <button class="primary" id="e-save">Add expense</button>
      </div>
    </div>
  `;
  openModal(backdrop);
  backdrop.querySelector('#e-cancel').onclick = () => closeModal(backdrop);
  backdrop.querySelector('#e-save').onclick = () => {
    const amount = parseFloat(backdrop.querySelector('#e-amount').value);
    if (!amount || amount <= 0) {
      alert('Enter an amount first.');
      return;
    }
    Data.addExpense({
      date: backdrop.querySelector('#e-date').value || todayISO(),
      category: backdrop.querySelector('#e-category').value,
      description: backdrop.querySelector('#e-description').value.trim(),
      amount
    });
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
    ['Date', 'From', 'To', 'Purpose', 'Miles', 'Value (£)'],
    ...entries.map(t => [t.date, t.from, t.to, t.purpose, t.miles, Number(t.value.toFixed(2))]),
    [],
    ['', '', '', 'Total', totalMiles, Number(totalValue.toFixed(2))]
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
  const blob = Data.exportBackup();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'roundly-backup.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

render();
