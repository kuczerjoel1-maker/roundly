// Roundly data layer
// Everything lives in localStorage as JSON. No server, no database.
// Shape:
//   customers: [{ id, name, address, lat, lng, phone, email, notes,
//                 price, frequencyWeeks, status, order, roundId }]
//   rounds:    [{ id, name, order }]
//   visits:    [{ id, customerId, date, priceCharged, paid, notes }]
//   settings:  { lastBackup }

const STORE_KEY = 'roundly_data_v1';

function loadStore() {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) {
    return { customers: [], rounds: [], visits: [], mileage: [], expenses: [], settings: {} };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.rounds) parsed.rounds = [];
    if (!parsed.mileage) parsed.mileage = [];
    if (!parsed.expenses) parsed.expenses = [];
    return parsed;
  } catch (e) {
    console.error('Roundly: corrupt store, starting fresh', e);
    return { customers: [], rounds: [], visits: [], mileage: [], expenses: [], settings: {} };
  }
}

// UK tax year runs 6 April to 5 April. Returns a label like "2026/27".
function taxYearFor(dateStr) {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const boundary = new Date(year, 3, 6); // 6 April, month index 3
  if (d >= boundary) {
    return `${year}/${(year + 1).toString().slice(-2)}`;
  }
  return `${year - 1}/${year.toString().slice(-2)}`;
}

function currentTaxYear() {
  return taxYearFor(new Date().toISOString().slice(0, 10));
}

function saveStore(store) {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const Data = {
  getCustomers(includeArchived = false) {
    const store = loadStore();
    return store.customers
      .filter(c => includeArchived || c.status !== 'archived')
      .map(c => ({ ...c, price: Number(c.price) || 0, frequencyWeeks: Number(c.frequencyWeeks) || 0 }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },

  getCustomersInRound(roundId, includeArchived = false) {
    return this.getCustomers(includeArchived).filter(c => c.roundId === roundId);
  },

  addCustomer(customer) {
    const store = loadStore();
    const record = {
      id: uid(),
      name: customer.name || '',
      address: customer.address || '',
      lat: customer.lat ?? null,
      lng: customer.lng ?? null,
      phone: customer.phone || '',
      email: customer.email || '',
      notes: customer.notes || '',
      price: Number(customer.price) || 0,
      frequencyWeeks: customer.frequencyWeeks !== undefined && customer.frequencyWeeks !== '' ? Number(customer.frequencyWeeks) : 4,
      oneOff: Boolean(customer.oneOff),
      status: 'active',
      order: store.customers.length,
      roundId: customer.roundId || null
    };
    store.customers.push(record);
    saveStore(store);
    return record;
  },

  updateCustomer(id, updates) {
    const store = loadStore();
    const idx = store.customers.findIndex(c => c.id === id);
    if (idx === -1) return null;
    const clean = { ...updates };
    if ('price' in clean) clean.price = Number(clean.price) || 0;
    if ('frequencyWeeks' in clean) clean.frequencyWeeks = Number(clean.frequencyWeeks) || 0;
    store.customers[idx] = { ...store.customers[idx], ...clean };
    saveStore(store);
    return store.customers[idx];
  },

  setCustomerStatus(id, status) {
    return this.updateCustomer(id, { status });
  },

  reorderCustomers(orderedIds) {
    const store = loadStore();
    orderedIds.forEach((id, i) => {
      const c = store.customers.find(x => x.id === id);
      if (c) c.order = i;
    });
    saveStore(store);
  },

  // Swaps two customers' order values directly — used for manual
  // up/down nudges within a filtered route list, without disturbing
  // the order of everyone else not currently shown.
  swapOrder(idA, idB) {
    const store = loadStore();
    const a = store.customers.find(c => c.id === idA);
    const b = store.customers.find(c => c.id === idB);
    if (!a || !b) return;
    const tmp = a.order;
    a.order = b.order;
    b.order = tmp;
    saveStore(store);
  },

  deleteCustomer(id) {
    const store = loadStore();
    store.customers = store.customers.filter(c => c.id !== id);
    store.visits = store.visits.filter(v => v.customerId !== id);
    saveStore(store);
  },

  // --- Rounds ---
  getRounds() {
    const store = loadStore();
    return store.rounds.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },

  addRound(name) {
    const store = loadStore();
    const record = { id: uid(), name: name.trim(), order: store.rounds.length };
    store.rounds.push(record);
    saveStore(store);
    return record;
  },

  updateRound(id, updates) {
    const store = loadStore();
    const idx = store.rounds.findIndex(r => r.id === id);
    if (idx === -1) return null;
    store.rounds[idx] = { ...store.rounds[idx], ...updates };
    saveStore(store);
    return store.rounds[idx];
  },

  deleteRound(id) {
    const store = loadStore();
    store.rounds = store.rounds.filter(r => r.id !== id);
    // Unassign customers rather than deleting them
    store.customers.forEach(c => { if (c.roundId === id) c.roundId = null; });
    saveStore(store);
  },

  countCustomersInRound(id) {
    const store = loadStore();
    return store.customers.filter(c => c.roundId === id && c.status !== 'archived').length;
  },

  // All visits made by any customer (including archived) currently assigned to this round
  getVisitsForRound(roundId) {
    const store = loadStore();
    const customerIds = store.customers.filter(c => c.roundId === roundId).map(c => c.id);
    return store.visits.filter(v => customerIds.includes(v.customerId));
  },

  // Work history + who owes money, for the Round detail screen
  getRoundStats(roundId) {
    const store = loadStore();
    const visits = this.getVisitsForRound(roundId);
    const dateCounts = {};
    visits.forEach(v => { dateCounts[v.date] = (dateCounts[v.date] || 0) + 1; });
    const dates = Object.keys(dateCounts).sort((a, b) => b.localeCompare(a))
      .map(date => ({ date, count: dateCounts[date] }));

    const customers = store.customers.filter(c => c.roundId === roundId);
    const owing = customers.map(c => {
      const owed = store.visits
        .filter(v => v.customerId === c.id && !v.paid)
        .reduce((sum, v) => sum + v.priceCharged, 0);
      return { customer: c, owed };
    }).filter(x => x.owed > 0).sort((a, b) => b.owed - a.owed);

    return { timesWorked: dates.length, dates, owing };
  },

  // --- Visits ---
  addVisit(visit) {
    const store = loadStore();
    const record = {
      id: uid(),
      customerId: visit.customerId,
      date: visit.date || new Date().toISOString().slice(0, 10),
      priceCharged: Number(visit.priceCharged) || 0,
      paid: Boolean(visit.paid),
      notes: visit.notes || ''
    };
    store.visits.push(record);
    saveStore(store);
    return record;
  },

  getVisitsForCustomer(customerId) {
    const store = loadStore();
    return store.visits.filter(v => v.customerId === customerId);
  },

  updateVisit(id, updates) {
    const store = loadStore();
    const idx = store.visits.findIndex(v => v.id === id);
    if (idx === -1) return null;
    store.visits[idx] = { ...store.visits[idx], ...updates };
    saveStore(store);
    return store.visits[idx];
  },

  // Removes any visit(s) for this customer on this date — used when
  // unchecking "Done" on the round screen to fully undo today's entry.
  deleteVisitsForCustomerOnDate(customerId, date) {
    const store = loadStore();
    store.visits = store.visits.filter(v => !(v.customerId === customerId && v.date === date));
    saveStore(store);
  },

  // Total unpaid amount across every visit this customer has ever had —
  // used for the "Owing" column on the round screen.
  getAmountOwedByCustomer(customerId) {
    const store = loadStore();
    return store.visits
      .filter(v => v.customerId === customerId && !v.paid)
      .reduce((sum, v) => sum + v.priceCharged, 0);
  },

  // Returns the whole store as a plain JSON string, for the caller to encrypt.
  getBackupJSON() {
    const store = loadStore();
    return JSON.stringify(store, null, 2);
  },

  markBackupDone() {
    const store = loadStore();
    store.settings.lastBackup = new Date().toISOString();
    saveStore(store);
  },

  needsBackup() {
    const store = loadStore();
    if (!store.settings.lastBackup) return true;
    const last = new Date(store.settings.lastBackup);
    const days = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
    return days >= 7;
  },

  getBackupPassword() {
    const store = loadStore();
    return store.settings.backupPassword || null;
  },

  setBackupPassword(password) {
    const store = loadStore();
    store.settings.backupPassword = password;
    saveStore(store);
  },

  getLastBackupTime() {
    const store = loadStore();
    return store.settings.lastBackup || null;
  },

  markShared() {
    const store = loadStore();
    store.settings.lastShared = new Date().toISOString();
    saveStore(store);
  },

  getLastSharedTime() {
    const store = loadStore();
    return store.settings.lastShared || null;
  },

  // True if never shared, or it's been 14+ days — used for a gentle home-screen nudge
  needsShareReminder() {
    const store = loadStore();
    if (!store.settings.backupPassword) return false; // don't nag before they've even set one up
    if (!store.settings.lastShared) return true;
    const last = new Date(store.settings.lastShared);
    const days = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
    return days >= 14;
  },

  importBackup(json) {
    const parsed = JSON.parse(json);
    saveStore(parsed);
  },

  // --- Mileage (UK simplified mileage rate log) ---
  // Each trip has an ordered list of stops (e.g. ["Home", "14 Larch Grove", "22 Larch Grove", "Home"]).
  // Older entries recorded with just {from, to} are migrated to a 2-stop list on read.
  getMileageTrips() {
    const store = loadStore();
    return store.mileage
      .map(m => m.stops ? m : { ...m, stops: [m.from || '', m.to || ''] })
      .sort((a, b) => a.date.localeCompare(b.date));
  },

  addMileageTrip(trip) {
    const store = loadStore();
    const record = {
      id: uid(),
      date: trip.date || new Date().toISOString().slice(0, 10),
      stops: (trip.stops || []).filter(s => s && s.trim()),
      purpose: trip.purpose || '',
      miles: Number(trip.miles) || 0,
      roundId: trip.roundId || null
    };
    store.mileage.push(record);
    saveStore(store);
    return record;
  },

  deleteMileageTrip(id) {
    const store = loadStore();
    store.mileage = store.mileage.filter(m => m.id !== id);
    saveStore(store);
  },

  updateMileageTrip(id, updates) {
    const store = loadStore();
    const idx = store.mileage.findIndex(m => m.id === id);
    if (idx === -1) return null;
    store.mileage[idx] = { ...store.mileage[idx], ...updates };
    saveStore(store);
    return store.mileage[idx];
  },

  // --- Expenses ---
  getExpenses() {
    const store = loadStore();
    return store.expenses.slice().sort((a, b) => b.date.localeCompare(a.date));
  },

  addExpense(expense) {
    const store = loadStore();
    const record = {
      id: uid(),
      date: expense.date || new Date().toISOString().slice(0, 10),
      category: expense.category || 'Other',
      description: expense.description || '',
      amount: Number(expense.amount) || 0
    };
    store.expenses.push(record);
    saveStore(store);
    return record;
  },

  deleteExpense(id) {
    const store = loadStore();
    store.expenses = store.expenses.filter(e => e.id !== id);
    saveStore(store);
  },

  updateExpense(id, updates) {
    const store = loadStore();
    const idx = store.expenses.findIndex(e => e.id === id);
    if (idx === -1) return null;
    store.expenses[idx] = { ...store.expenses[idx], ...updates };
    saveStore(store);
    return store.expenses[idx];
  },

  // Every tax year that has any mileage or expense entry, plus the current one, newest first
  getAvailableTaxYears() {
    const store = loadStore();
    const years = new Set([currentTaxYear()]);
    store.mileage.forEach(m => years.add(taxYearFor(m.date)));
    store.expenses.forEach(e => years.add(taxYearFor(e.date)));
    return [...years].sort().reverse();
  },

  getMileageTripsForTaxYear(taxYear) {
    return this.getMileageTrips().filter(m => taxYearFor(m.date) === taxYear);
  },

  getExpensesForTaxYear(taxYear) {
    return this.getExpenses().filter(e => taxYearFor(e.date) === taxYear);
  }
};
