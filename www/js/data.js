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
    return { customers: [], rounds: [], visits: [], settings: {} };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.rounds) parsed.rounds = [];
    return parsed;
  } catch (e) {
    console.error('Roundly: corrupt store, starting fresh', e);
    return { customers: [], rounds: [], visits: [], settings: {} };
  }
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
      frequencyWeeks: Number(customer.frequencyWeeks) || 4,
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
    store.customers[idx] = { ...store.customers[idx], ...updates };
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

  // Weekly local backup: exports the whole store as a JSON blob.
  // Called on app open if more than 7 days have passed since last backup.
  // Overwrites the single backup file each time rather than accumulating.
  exportBackup() {
    const store = loadStore();
    store.settings.lastBackup = new Date().toISOString();
    saveStore(store);
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
    return blob;
  },

  needsBackup() {
    const store = loadStore();
    if (!store.settings.lastBackup) return true;
    const last = new Date(store.settings.lastBackup);
    const days = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
    return days >= 7;
  },

  importBackup(json) {
    const parsed = JSON.parse(json);
    saveStore(parsed);
  }
};
