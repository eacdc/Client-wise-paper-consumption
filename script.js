(function () {
  'use strict';

  const isLocalHost =
    typeof window !== 'undefined' && /localhost|127\.0\.0\.1/i.test(window.location.hostname);
  const API_BASE = isLocalHost ? 'http://localhost:3001/api' : 'https://cdcapi.onrender.com/api';

  /** @type {{ ledgerId: number, ledgerName: string }[]} */
  let clientsCache = [];
  let latestLeftTable = { columns: [], rows: [] };
  let latestRightTable = { columns: [], rows: [] };

  const els = {
    tabOrder: document.getElementById('tab-order'),
    tabDelivery: document.getElementById('tab-delivery'),
    database: document.getElementById('database'),
    clientDropdownTrigger: document.getElementById('client-dropdown-trigger'),
    clientDropdownPanel: document.getElementById('client-dropdown-panel'),
    clientDropdownLabel: document.getElementById('client-dropdown-label'),
    clientFilter: document.getElementById('client-filter'),
    clientCheckboxList: document.getElementById('client-checkbox-list'),
    clientSelectAll: document.getElementById('client-select-all'),
    clientClearAll: document.getElementById('client-clear-all'),
    topFilter: document.getElementById('top-filter'),
    btnSearch: document.getElementById('btn-search'),
    btnAnalyzeAi: document.getElementById('btn-analyze-ai'),
    status: document.getElementById('status'),
    analysisContent: document.getElementById('analysis-content'),
    tableLeft: document.getElementById('table-left'),
    tableRight: document.getElementById('table-right'),
  };

  let currentBasis = 'O';
  let dropdownOpen = false;
  let clientsLoading = false;

  function setStatus(text, isError) {
    if (!els.status) return;
    els.status.textContent = text || '';
    els.status.classList.toggle('error', Boolean(isError));
  }

  function getBasis() {
    return currentBasis;
  }

  function resetTablesToPlaceholder() {
    latestLeftTable = { columns: [], rows: [] };
    latestRightTable = { columns: [], rows: [] };
    const placeholder =
      '<thead><tr><th class="empty-cell">Run search to load data.</th></tr></thead><tbody></tbody>';
    if (els.tableLeft) els.tableLeft.innerHTML = placeholder;
    if (els.tableRight) els.tableRight.innerHTML = placeholder;
  }

  /** Clear tables, client checkboxes, and analysis when Order ↔ Delivery changes. */
  function clearOnBasisSwitch() {
    resetTablesToPlaceholder();
    els.clientCheckboxList?.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.checked = false;
    });
    updateDropdownLabel();
    setAnalysis(
      'Run search, then click “Analyze with AI” to get future stock consumption projection and key highlights.'
    );
    setStatus('Basis changed. Select clients and run Search again.', false);
  }

  function setPrimaryTab(which) {
    const isOrder = which === 'order';
    const newBasis = isOrder ? 'O' : 'D';
    if (newBasis !== currentBasis) {
      clearOnBasisSwitch();
    }
    currentBasis = newBasis;
    if (els.tabOrder) {
      els.tabOrder.classList.toggle('active', isOrder);
      els.tabOrder.setAttribute('aria-selected', isOrder ? 'true' : 'false');
    }
    if (els.tabDelivery) {
      els.tabDelivery.classList.toggle('active', !isOrder);
      els.tabDelivery.setAttribute('aria-selected', !isOrder ? 'true' : 'false');
    }
  }

  function setDropdownOpen(open) {
    dropdownOpen = open;
    if (els.clientDropdownPanel) {
      els.clientDropdownPanel.classList.toggle('hidden', !open);
    }
    if (els.clientDropdownTrigger) {
      els.clientDropdownTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (open && els.clientFilter) {
      els.clientFilter.focus();
    }
  }

  function updateDropdownLabel() {
    if (!els.clientDropdownLabel) return;
    const n = selectedLedgerIds().length;
    if (n === 0) {
      els.clientDropdownLabel.textContent = 'Select clients…';
      return;
    }
    if (n === 1) {
      const id = selectedLedgerIds()[0];
      const c = clientsCache.find((x) => x.ledgerId === id);
      els.clientDropdownLabel.textContent = c ? `${c.ledgerName} (${id})` : `1 client selected`;
      return;
    }
    els.clientDropdownLabel.textContent = `${n} clients selected`;
  }

  function getFilterText() {
    return (els.clientFilter?.value || '').trim().toLowerCase();
  }

  function applyClientFilter() {
    const q = getFilterText();
    const items = els.clientCheckboxList?.querySelectorAll('.client-option') || [];
    items.forEach((el) => {
      const id = (el.dataset.ledgerId || '').toLowerCase();
      const name = (el.dataset.ledgerName || '').toLowerCase();
      const match = !q || id.includes(q) || name.includes(q);
      el.classList.toggle('hidden-by-filter', !match);
    });
  }

  function renderClientCheckboxes() {
    if (!els.clientCheckboxList) return;
    const existing = new Set(selectedLedgerIds());
    els.clientCheckboxList.innerHTML = '';
    for (const c of clientsCache) {
      const id = c.ledgerId;
      const label = document.createElement('label');
      label.className = 'client-option';
      label.dataset.ledgerId = String(id);
      label.dataset.ledgerName = c.ledgerName || '';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = String(id);
      cb.dataset.ledgerId = String(id);
      cb.checked = existing.has(id);
      const span = document.createElement('span');
      span.textContent = `${c.ledgerName} (${id})`;
      label.appendChild(span);
      label.appendChild(cb);
      els.clientCheckboxList.appendChild(label);
    }
    applyClientFilter();
    updateDropdownLabel();
  }

  async function loadClients() {
    if (clientsLoading) return;
    clientsLoading = true;
    const db = els.database?.value || 'KOL';
    setStatus('Loading clients...', false);
    try {
      const url = new URL(`${API_BASE}/inventory-summary/client-names`);
      url.searchParams.set('database', db);
      const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.status) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      const clients = json.clients || [];
      clientsCache = clients
        .map((c) => ({
          ledgerId: Number(c.ledgerId ?? c.ledgerid),
          ledgerName: String(c.ledgerName ?? c.ledgername ?? ''),
        }))
        .filter((c) => Number.isInteger(c.ledgerId) && c.ledgerId > 0);

      if (els.clientFilter) els.clientFilter.value = '';
      renderClientCheckboxes();
      setStatus(`Loaded ${clientsCache.length} clients.`, false);
    } catch (e) {
      console.error(e);
      clientsCache = [];
      if (els.clientCheckboxList) els.clientCheckboxList.innerHTML = '';
      setStatus(e.message || 'Failed to load clients', true);
      updateDropdownLabel();
    } finally {
      clientsLoading = false;
    }
  }

  function selectedLedgerIds() {
    if (!els.clientCheckboxList) return [];
    const boxes = els.clientCheckboxList.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(boxes)
      .map((input) => parseInt(input.value, 10))
      .filter((n) => Number.isInteger(n) && n > 0);
  }

  function formatCell(val) {
    if (val == null) return '';
    if (val instanceof Date) return val.toISOString();
    if (typeof val === 'object') {
      try {
        return JSON.stringify(val);
      } catch {
        return String(val);
      }
    }
    return String(val);
  }

  function setAnalysis(text) {
    if (!els.analysisContent) return;
    els.analysisContent.textContent = text || '';
  }

  function renderTable(tableEl, spec) {
    if (!tableEl) return;
    const thead = tableEl.querySelector('thead');
    const tbody = tableEl.querySelector('tbody');
    if (!thead || !tbody) return;

    const columns = spec?.columns || [];
    const rows = spec?.rows || [];
    const displayNames = spec?.columnDisplayNames || null;

    thead.innerHTML = '';
    tbody.innerHTML = '';

    if (!columns.length && !rows.length) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.className = 'empty-cell';
      th.colSpan = 1;
      th.textContent = 'No rows.';
      tr.appendChild(th);
      thead.appendChild(tr);
      return;
    }

    function headerForColumn(col) {
      if (displayNames && typeof displayNames === 'object') {
        const dn = displayNames[col];
        if (dn != null && String(dn).trim() !== '') return String(dn);
        const lower = String(col).toLowerCase();
        const key = Object.keys(displayNames).find((k) => k.toLowerCase() === lower);
        if (key != null && displayNames[key] != null && String(displayNames[key]).trim() !== '') {
          return String(displayNames[key]);
        }
      }
      return col;
    }

    const hr = document.createElement('tr');
    for (const col of columns) {
      const th = document.createElement('th');
      th.textContent = headerForColumn(col);
      hr.appendChild(th);
    }
    thead.appendChild(hr);

    for (const row of rows) {
      const tr = document.createElement('tr');
      for (const col of columns) {
        const td = document.createElement('td');
        td.textContent = formatCell(row[col]);
        td.title = td.textContent;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  async function runSearch() {
    const db = els.database?.value || 'KOL';
    const ledgerIds = selectedLedgerIds();
    if (!ledgerIds.length) {
      setStatus('Select at least one client.', true);
      return;
    }

    const topFilter = els.topFilter?.value || 'top50';
    const basis = getBasis();

    setStatus('Searching…');
    els.btnSearch && (els.btnSearch.disabled = true);

    try {
      const res = await fetch(`${API_BASE}/previousitemsbyclient/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          database: db,
          ledgerIds,
          basis,
          topFilter,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.status === false) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      const data = json.data || {};
      latestLeftTable = {
        columns: Array.isArray(data.leftTable?.columns) ? data.leftTable.columns : [],
        rows: Array.isArray(data.leftTable?.rows) ? data.leftTable.rows : [],
        ...(data.leftTable?.columnDisplayNames &&
        typeof data.leftTable.columnDisplayNames === 'object'
          ? { columnDisplayNames: data.leftTable.columnDisplayNames }
          : {}),
      };
      latestRightTable = {
        columns: Array.isArray(data.rightTable?.columns) ? data.rightTable.columns : [],
        rows: Array.isArray(data.rightTable?.rows) ? data.rightTable.rows : [],
      };
      renderTable(els.tableLeft, latestLeftTable);
      renderTable(els.tableRight, latestRightTable);
      const lr = (data.leftTable?.rows || []).length;
      const rr = (data.rightTable?.rows || []).length;
      setAnalysis('Click “Analyze with AI” for projection and highlights.');
      setStatus(`Done. Left table: ${lr} row(s), right table: ${rr} row(s).`);
    } catch (e) {
      console.error(e);
      setStatus(e.message || 'Search failed', true);
    } finally {
      els.btnSearch && (els.btnSearch.disabled = false);
    }
  }

  async function analyzeWithAi() {
    const db = els.database?.value || 'KOL';
    const ledgerIds = selectedLedgerIds();
    if (!ledgerIds.length) {
      setStatus('Select at least one client before AI analysis.', true);
      return;
    }
    if (!latestLeftTable.rows.length || !latestRightTable.rows.length) {
      setStatus('Run Search first so both tables have data.', true);
      return;
    }

    const topFilter = els.topFilter?.value || 'top50';
    const basis = getBasis();
    const clientNames = clientsCache
      .filter((c) => ledgerIds.includes(c.ledgerId))
      .map((c) => c.ledgerName);

    setStatus('Running AI analysis...', false);
    setAnalysis('Analyzing both tables with AI. Please wait...');
    if (els.btnAnalyzeAi) els.btnAnalyzeAi.disabled = true;

    try {
      const res = await fetch(`${API_BASE}/previousitemsbyclient/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          database: db,
          basis,
          topFilter,
          ledgerIds,
          clientNames,
          leftTable: latestLeftTable,
          rightTable: latestRightTable,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.status === false) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setAnalysis(json.analysis || 'No analysis returned.');
      setStatus('AI analysis complete.', false);
    } catch (e) {
      console.error(e);
      setAnalysis(`AI analysis failed: ${e.message || 'Unknown error'}`);
      setStatus(e.message || 'AI analysis failed', true);
    } finally {
      if (els.btnAnalyzeAi) els.btnAnalyzeAi.disabled = false;
    }
  }

  // Dropdown: toggle
  els.clientDropdownTrigger?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const nextOpen = !dropdownOpen;
    setDropdownOpen(nextOpen);
    if (nextOpen) {
      await loadClients();
    }
  });

  els.clientDropdownPanel?.addEventListener('click', (e) => e.stopPropagation());

  document.addEventListener('click', () => {
    if (dropdownOpen) setDropdownOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dropdownOpen) {
      setDropdownOpen(false);
    }
  });

  els.clientFilter?.addEventListener('input', () => applyClientFilter());

  els.clientCheckboxList?.addEventListener('change', () => updateDropdownLabel());

  els.clientSelectAll?.addEventListener('click', () => {
    const visible = els.clientCheckboxList?.querySelectorAll('.client-option:not(.hidden-by-filter) input[type="checkbox"]');
    visible?.forEach((input) => {
      input.checked = true;
    });
    updateDropdownLabel();
  });

  els.clientClearAll?.addEventListener('click', () => {
    els.clientCheckboxList?.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.checked = false;
    });
    updateDropdownLabel();
  });

  // Events
  els.tabOrder?.addEventListener('click', () => setPrimaryTab('order'));
  els.tabDelivery?.addEventListener('click', () => setPrimaryTab('delivery'));

  els.database?.addEventListener('change', () => {
    clientsCache = [];
    if (els.clientCheckboxList) els.clientCheckboxList.innerHTML = '';
    updateDropdownLabel();
  });

  els.btnSearch?.addEventListener('click', () => runSearch());
  els.btnAnalyzeAi?.addEventListener('click', () => analyzeWithAi());
  els.topFilter?.addEventListener('change', () => {
    if (selectedLedgerIds().length) {
      runSearch();
    }
  });

  setPrimaryTab('order');
  if (els.topFilter) els.topFilter.value = 'top50';
  setAnalysis('Run search, then click “Analyze with AI” to get future stock consumption projection and key highlights.');
})();
