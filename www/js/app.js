// Roundly app shell
let currentScreen = 'home'; // home | roundPicker | route | customers | rounds | expenses
let activeRoundId = null;   // null = "all customers" round

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
    { key: 'expenses', label: 'Expenses', desc: 'Coming in v2',
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
    const dueToday = customers.filter(isDueToday);
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
  const customers = Data.getCustomersInRoundOrAll().filter(isDueToday);

  if (!customers.length) {
    wrap.innerHTML = `<div class="empty-state">No stops due today in this round.</div>`;
    return wrap;
  }

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
    item.onclick = () => openRoundModal(r);
    wrap.appendChild(item);
  });
  return wrap;
}

function renderExpensesStub() {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="empty-state">Expenses and mileage tracking is coming in v2.</div>`;
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
      <div class="field"><label>Address</label><input id="f-address" value="${customer ? escapeHtml(customer.address) : ''}"></div>
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
      notes: backdrop.querySelector('#f-notes').value.trim()
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

// --- Weekly local backup ---
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
