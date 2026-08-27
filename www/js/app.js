// Roundly app shell
let currentTab = 'route';

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

function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';
  app.appendChild(renderHeader());
  app.appendChild(renderTabs());

  if (currentTab === 'route') app.appendChild(renderRoute());
  if (currentTab === 'customers') app.appendChild(renderCustomers());
  if (currentTab === 'expenses') app.appendChild(renderExpensesStub());

  const fab = document.createElement('button');
  fab.className = 'fab';
  fab.textContent = '+';
  fab.setAttribute('aria-label', 'Add customer');
  fab.onclick = () => openCustomerModal();
  app.appendChild(fab);

  maybeRunBackup();
}

function renderHeader() {
  const customers = Data.getCustomers();
  const dueToday = customers.filter(isDueToday);
  const owed = dueToday
    .filter(c => visitStatusFor(c) === 'due')
    .reduce((sum, c) => sum + c.price, 0);

  const header = document.createElement('div');
  header.className = 'header';
  header.innerHTML = `
    <div>
      <div class="date">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <div class="title">Today's round</div>
    </div>
    <div style="display:flex; gap:8px;">
      <div class="stat-pill"><div class="num">${dueToday.length}</div><div class="label">stops</div></div>
      <div class="stat-pill"><div class="num" style="color:var(--rd-amber-text)">£${owed}</div><div class="label">due today</div></div>
    </div>
  `;
  return header;
}

function renderTabs() {
  const tabs = document.createElement('div');
  tabs.className = 'tabs';
  [['route', 'Route'], ['customers', 'Customers'], ['expenses', 'Expenses']].forEach(([key, label]) => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (currentTab === key ? ' active' : '');
    btn.textContent = label;
    btn.onclick = () => { currentTab = key; render(); };
    tabs.appendChild(btn);
  });
  return tabs;
}

function renderRoute() {
  const wrap = document.createElement('div');
  const customers = Data.getCustomers().filter(isDueToday);

  if (!customers.length) {
    wrap.innerHTML = `<div class="empty-state">No stops due today.<br>Add a customer to get started.</div>`;
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

  customers.forEach(c => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div>
        <div class="stop-name">${escapeHtml(c.name)}</div>
        <div class="stop-addr">${escapeHtml(c.address)} &middot; every ${c.frequencyWeeks}wk &middot; £${c.price}</div>
      </div>
      <div class="status-pill status-${c.status === 'archived' ? 'paused' : c.status === 'paused' ? 'paused' : 'paid'}">${c.status}</div>
    `;
    item.onclick = () => openCustomerModal(c);
    wrap.appendChild(item);
  });
  return wrap;
}

function renderExpensesStub() {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="empty-state">Expenses and mileage tracking is coming in v2.</div>`;
  return wrap;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Customer modal (add / edit) ---
function openCustomerModal(customer) {
  const isEdit = Boolean(customer);
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="field"><label>Name</label><input id="f-name" value="${customer ? escapeHtml(customer.name) : ''}"></div>
      <div class="field"><label>Address</label><input id="f-address" value="${customer ? escapeHtml(customer.address) : ''}"></div>
      <div class="field"><label>Phone</label><input id="f-phone" value="${customer ? escapeHtml(customer.phone) : ''}"></div>
      <div class="field"><label>Price (£)</label><input id="f-price" type="number" value="${customer ? customer.price : ''}"></div>
      <div class="field"><label>Frequency (weeks)</label><input id="f-freq" type="number" value="${customer ? customer.frequencyWeeks : 4}"></div>
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
    </div>
  `;
  document.body.appendChild(backdrop);

  backdrop.querySelector('#f-cancel').onclick = () => backdrop.remove();
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
      notes: backdrop.querySelector('#f-notes').value.trim()
    };
    if (isEdit) {
      payload.status = backdrop.querySelector('#f-status').value;
      Data.updateCustomer(customer.id, payload);
    } else {
      Data.addCustomer(payload);
    }
    backdrop.remove();
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
  document.body.appendChild(backdrop);
  backdrop.querySelector('#v-cancel').onclick = () => backdrop.remove();
  backdrop.querySelector('#v-save').onclick = () => {
    Data.addVisit({
      customerId: customer.id,
      date: todayISO(),
      priceCharged: backdrop.querySelector('#v-price').value,
      paid: backdrop.querySelector('#v-paid').checked
    });
    backdrop.remove();
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
