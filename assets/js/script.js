/*
  =============================
  PlayPal.ID Final Script
  Versi: 2.0.0
  
  Pembaruan:
  - Mengaktifkan halaman Pre Order (Sheet1, Sheet2)
  - Mengaktifkan halaman Akun Game (Sheet5)
  - Mengaktifkan halaman Carousell (Sheet8)
  - Mengaktifkan halaman Perpustakaan (Sheet_Perpus - *Perlu Konfigurasi*)
  - Menambahkan parser CSV modular, error handling, dan state management
    untuk semua halaman.
  =============================
*/
(function () {
  'use strict';

  // =========================
  // CONFIG & STATE
  // =========================
  const config = {
    sheetId: '1B0XPR4uSvRzy9LfzWDjNjwAyMZVtJs6_Kk_r2fh7dTw',
    sheets: {
      katalog: { name: 'Sheet3' },
      preorder: { name1: 'Sheet1', name2: 'Sheet2' },
      accounts: { name: 'Sheet5' },
      affiliate: { name: 'Sheet8' },
      // TODO: Harap ganti 'Sheet_Perpus' dengan nama sheet Anda yang sebenarnya untuk data perpustakaan
      perpustakaan: { name: 'Sheet_Perpus' } 
    },
    waNumber: '6285877001999',
    waGreeting: '*Detail pesanan:*',
    paymentOptions: [
      { id: 'seabank',     name: 'Seabank',       feeType: 'fixed',      value: 0 },
      { id: 'shopeepay',   name: 'ShopeePay',     feeType: 'fixed',      value: 0 },
      { id: 'gopay',       name: 'Gopay',         feeType: 'fixed',      value: 0 },
      { id: 'dana',        name: 'Dana',          feeType: 'fixed',      value: 125 },
      { id: 'bank_to_dana',name: 'Bank ke Dana',  feeType: 'fixed',      value: 500 },
      { id: 'qris',        name: 'Qris',          feeType: 'percentage', value: 0.007 }
    ]
  };

  const state = {
    home: { activeCategory: '', searchQuery: '' },
    preorder: { 
      initialized: false, 
      allData: [], 
      currentPage: 1, 
      perPage: 15, 
      activeSheet: '0', // '0' untuk name1, '1' untuk name2
      searchQuery: '',
      statusFilter: 'all'
    },
    accounts: { 
      initialized: false, 
      allData: [], 
      activeCategory: 'Semua Kategori' 
    },
    carousell: { 
      initialized: false, 
      allData: [], 
      searchQuery: '' 
    },
    perpustakaan: {
      initialized: false,
      allData: []
    }
  };

  let allCatalogData = [];
  let currentSelectedItem = null;

  let catalogFetchController;
  let preorderFetchController;
  let accountsFetchController;
  let carousellFetchController;
  let perpustakaanFetchController;

  let modalFocusTrap = { listener: null, focusableEls: [], firstEl: null, lastEl: null };
  let elementToFocusOnModalClose = null;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // =========================
  // DOM GETTERS
  // =========================
  function getElement(id) { return document.getElementById(id); }

  const elements = {
    sidebar: {
      nav: getElement('sidebarNav'),
      overlay: getElement('sidebarOverlay'),
      burger: getElement('burgerBtn')
    },
    navLinks: document.querySelectorAll('[data-mode]'),

    // View flags
    viewHome: getElement('viewHome'),
    viewPreorder: getElement('viewPreorder'),
    viewAccounts: getElement('viewAccounts'),
    viewPerpustakaan: getElement('viewPerpustakaan'),
    viewCarousell: getElement('viewCarousell'),

    // Home
    home: {
      listContainer: getElement('homeListContainer'),
      countInfo: getElement('homeCountInfo'),
      errorContainer: getElement('homeErrorContainer'),
      searchInput: getElement('homeSearchInput'),
      customSelect: {
        wrapper: getElement('homeCustomSelectWrapper'),
        btn: getElement('homeCustomSelectBtn'),
        value: getElement('homeCustomSelectValue'),
        options: getElement('homeCustomSelectOptions'),
      },
    },

    headerStatusIndicator: getElement('headerStatusIndicator'),

    // Templates
    itemTemplate: getElement('itemTemplate'),
    skeletonItemTemplate: getElement('skeletonItemTemplate'),
    skeletonCardTemplate: getElement('skeletonCardTemplate'),
    accountCardTemplate: getElement('accountCardTemplate'), // Diperlukan untuk Akun Game

    // Payment modal
    paymentModal: {
      modal: getElement('paymentModal'),
      closeBtn: getElement('closeModalBtn'),
      itemName: getElement('modalItemName'),
      itemPrice: getElement('modalItemPrice'),
      optionsContainer: getElement('paymentOptionsContainer'),
      fee: getElement('modalFee'),
      total: getElement('modalTotal'),
      waBtn: getElement('continueToWaBtn'),
    },

    // Preorder
    preorder: {
      searchInput: getElement('preorderSearchInput'),
      statusSelect: getElement('preorderStatusSelect'), // Fallback, tidak digunakan jika custom select ada
      listContainer: getElement('preorderListContainer'),
      prevBtn: getElement('preorderPrevBtn'),
      nextBtn: getElement('preorderNextBtn'),
      pageInfo: getElement('preorderPageInfo'),
      total: getElement('preorderTotal'),
      customSelect: {
        wrapper: getElement('preorderCustomSelectWrapper'),
        btn: getElement('preorderCustomSelectBtn'),
        value: getElement('preorderCustomSelectValue'),
        options: getElement('preorderCustomSelectOptions'),
      },
      customStatusSelect: {
        wrapper: getElement('preorderStatusCustomSelectWrapper'),
        btn: getElement('preorderStatusCustomSelectBtn'),
        value: getElement('preorderStatusCustomSelectValue'),
        options: getElement('preorderStatusCustomSelectOptions'),
      }
    },

    // Accounts
    accounts: {
      cardGrid: getElement('accountCardGrid'),
      empty: getElement('accountEmpty'),
      error: getElement('accountError'),
      customSelect: {
        wrapper: getElement('accountCustomSelectWrapper'),
        btn: getElement('accountCustomSelectBtn'),
        value: getElement('accountCustomSelectValue'),
        options: getElement('accountCustomSelectOptions'),
      },
    },

    // Carousell
    carousell: {
      gridContainer: getElement('carousellGridContainer'),
      error: getElement('carousellError'),
      searchInput: getElement('carousellSearchInput'),
      total: getElement('carousellTotal'),
    },
    
    // Perpustakaan
    perpustakaan: {
      gridContainer: getElement('libraryGridContainer'),
      error: getElement('libraryError'),
    }
  };

  // =========================
  // HELPERS
  // =========================
  function formatToIdr(value) {
    const numValue = Number(value);
    if (isNaN(numValue) || numValue < 0) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(numValue);
  }

  function sanitizeHTML(str) {
    const div = document.createElement('div');
    div.textContent = String(str ?? '');
    return div.innerHTML;
  }
  
  function debounce(func, delay = 300) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), delay);
    };
  }

  function getSheetUrl(sheetName, format = 'json') {
    const baseUrl = `https://docs.google.com/spreadsheets/d/${config.sheetId}/gviz/tq`;
    const encodedSheetName = encodeURIComponent(sheetName);
    return format === 'csv'
      ? `${baseUrl}?tqx=out:csv&sheet=${encodedSheetName}`
      : `${baseUrl}?sheet=${encodedSheetName}&tqx=out:json`;
  }

  async function fetchSheetCached(sheetName, format = 'json', signal) {
    const url = getSheetUrl(sheetName, format);
    const key = `pp_cache_${sheetName}_${format}`;
    const cached = sessionStorage.getItem(key);
    
    const fetchOptions = { signal };
    if (cached) {
      // background revalidate
      try { 
        fetch(url, fetchOptions)
          .then(r => r.text())
          .then(t => { if (t) sessionStorage.setItem(key, t); })
          .catch(err => { if (err.name !== 'AbortError') console.warn('Cache revalidation failed', err); });
      } catch (e) {}
      return cached;
    }

    try {
      const res = await fetch(url, fetchOptions);
      if (!res.ok) throw new Error(`Network error: ${res.statusText}`);
      const text = await res.text();
      if (text) {
        sessionStorage.setItem(key, text);
      }
      return text;
    } catch (err) {
       if (err.name === 'AbortError') {
        console.log('Fetch aborted');
        return null; // Return null or empty string if aborted
      }
      throw err; // Re-throw other errors
    }
  }

  function showSkeleton(container, template, count = 6) {
    if (!container || !template) return;
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      fragment.appendChild(template.content.cloneNode(true));
    }
    container.appendChild(fragment);
  }

  function toggleCustomSelect(wrapper, forceOpen) {
    if (!wrapper) return;
    const btn = wrapper.querySelector('.custom-select-btn');
    const isOpen = typeof forceOpen === 'boolean' ? forceOpen : !wrapper.classList.contains('open');
    wrapper.classList.toggle('open', isOpen);
    if (btn) btn.setAttribute('aria-expanded', isOpen);
  }

  function enhanceCustomSelectKeyboard(wrapper) {
    if (!wrapper) return;
    const options = wrapper.querySelector('.custom-select-options');
    const btn = wrapper.querySelector('.custom-select-btn');
    if (!options || !btn) return;

    options.setAttribute('role', 'listbox');
    options.addEventListener('keydown', (e) => {
      const items = Array.from(options.querySelectorAll('.custom-select-option'));
      if (!items.length) return;
      let i = items.findIndex(o => o.classList.contains('highlight'));

      const move = (delta) => {
        i = (i === -1 ? items.findIndex(o => o.classList.contains('selected')) : i);
        if (i === -1) i = 0;
        i = (i + delta + items.length) % items.length;
        items.forEach(o => o.classList.remove('highlight'));
        items[i].classList.add('highlight');
        items[i].scrollIntoView({ block: 'nearest' });
      };

      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      if (e.key === 'Home') { e.preventDefault(); move(-9999); }
      if (e.key === 'End') { e.preventDefault(); move(9999); }
      if (e.key === 'Enter') { e.preventDefault(); if (i > -1) items[i].click(); }
      if (e.key === 'Escape') { e.preventDefault(); toggleCustomSelect(wrapper, false); btn.focus(); }
    });
  }

  function robustCsvParser(text) {
    const normalizedText = String(text || '').trim().replace(/\r\n/g, '\n');
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotedField = false;

    for (let i = 0; i < normalizedText.length; i++) {
      const char = normalizedText[i];
      if (inQuotedField) {
        if (char === '"') {
          if (i + 1 < normalizedText.length && normalizedText[i + 1] === '"') { currentField += '"'; i++; }
          else { inQuotedField = false; }
        } else {
          currentField += char;
        }
      } else {
        if (char === '"') { inQuotedField = true; }
        else if (char === ',') { currentRow.push(currentField.trim()); currentField = ''; }
        else if (char === '\n') { currentRow.push(currentField.trim()); rows.push(currentRow); currentRow = []; currentField = ''; }
        else { currentField += char; }
      }
    }
    currentRow.push(currentField.trim());
    rows.push(currentRow);
    return rows;
  }
  
  /**
   * Mengubah data CSV (array dari array) menjadi array objek, menggunakan baris pertama sebagai header.
   */
  function csvToObjects(csvData) {
    if (!csvData || csvData.length < 2) return [];
    const headers = csvData[0].map(h => h.toLowerCase().trim());
    const dataRows = csvData.slice(1);
    
    return dataRows.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] || '';
      });
      return obj;
    });
  }

  // =========================
  // KATALOG PIPELINE (HOME)
  // =========================
  function parseGvizPairs(jsonText) {
    const match = jsonText.match(/\{.*\}/s);
    if (!match) throw new Error('Invalid GViz response.');
    const obj = JSON.parse(match[0]);
    const { rows = [], cols = [] } = obj.table || {};

    // Asumsi pasangan kolom: [Judul, Harga, Judul, Harga, ...]
    const pairs = Array.from({ length: Math.floor(cols.length / 2) }, (_, i) => ({
      iTitle: i * 2,
      iPrice: i * 2 + 1,
      label: cols[i * 2]?.label || '',
    })).filter(p => p.label && cols[p.iPrice]);

    const out = [];
    for (const r of rows) {
      const c = r.c || [];
      for (const p of pairs) {
        const title = String(c[p.iTitle]?.v ?? '').trim();
        const priceRaw = c[p.iPrice]?.v;
        const price = priceRaw != null && priceRaw !== '' ? Number(priceRaw) : NaN;
        if (title && !isNaN(price)) {
          out.push({
            catKey: p.label,
            catLabel: String(p.label || '').trim().replace(/\s+/g, ' '),
            title,
            price,
          });
        }
      }
    }
    return out;
  }

  function renderList(container, countInfoEl, items, emptyText) {
    if (!container) return;
    container.innerHTML = '';
    if (!items.length) {
      container.innerHTML = `<div class="empty"><p>${emptyText}</p></div>`;
      if (countInfoEl) countInfoEl.textContent = '';
      return;
    }

    const frag = document.createDocumentFragment();
    for (const item of items) {
      if (elements.itemTemplate?.content) {
        const clone = elements.itemTemplate.content.cloneNode(true);
        const buttonEl = clone.querySelector('.list-item');
        buttonEl.querySelector('.title').textContent = item.title;
        buttonEl.querySelector('.price').textContent = formatToIdr(item.price);
        buttonEl.addEventListener('click', () => {
          elementToFocusOnModalClose = buttonEl; // Simpan fokus
          openPaymentModal(item);
        });
        frag.appendChild(clone);
      }
    }
    container.appendChild(frag);
    if (countInfoEl) countInfoEl.textContent = `${items.length} item ditemukan`;
  }

  function buildHomeCategorySelect(catalogData) {
    const sel = elements.home.customSelect;
    if (!sel?.options || !sel?.value) return;

    const categoryMap = new Map();
    catalogData.forEach(item => { if (!categoryMap.has(item.catKey)) categoryMap.set(item.catKey, item.catLabel); });
    const categories = [...categoryMap].map(([key, label]) => ({ key, label }));

    sel.options.innerHTML = '';
    const activeKey = state.home.activeCategory || (categories[0]?.key || '');
    const activeCat = categories.find(c => c.key === activeKey) || categories[0];

    if (activeCat) { state.home.activeCategory = activeCat.key; sel.value.textContent = activeCat.label; }
    else { sel.value.textContent = 'Data tidak tersedia'; }

    categories.forEach(cat => {
      const el = document.createElement('div');
      el.className = 'custom-select-option';
      el.textContent = cat.label;
      el.dataset.value = cat.key;
      el.setAttribute('role', 'option');
      if (cat.key === state.home.activeCategory) el.classList.add('selected');
      el.addEventListener('click', () => {
        state.home.activeCategory = cat.key;
        sel.value.textContent = cat.label;
        sel.options.querySelector('.selected')?.classList.remove('selected');
        el.classList.add('selected');
        toggleCustomSelect(sel.wrapper, false);
        renderHomeList();
      });
      sel.options.appendChild(el);
    });
  }

  function renderHomeList() {
    const { activeCategory, searchQuery } = state.home;
    const query = (searchQuery || '').toLowerCase();
    const items = allCatalogData.filter(x =>
      x.catKey === activeCategory &&
      (query === '' || x.title.toLowerCase().includes(query) || String(x.price).includes(query))
    );
    renderList(elements.home.listContainer, elements.home.countInfo, items, 'Tidak ada item ditemukan.');
  }

  async function loadCatalog() {
    if (!elements.home?.listContainer) return;
    if (catalogFetchController) catalogFetchController.abort();
    catalogFetchController = new AbortController();

    try {
      elements.home.errorContainer && (elements.home.errorContainer.style.display = 'none');
      if (elements.skeletonItemTemplate) showSkeleton(elements.home.listContainer, elements.skeletonItemTemplate, 6);

      const text = await fetchSheetCached(config.sheets.katalog.name, 'json', catalogFetchController.signal);
      if (text === null) return; // Fetch dibatalkan
      
      allCatalogData = parseGvizPairs(text);
      if (!allCatalogData.length) throw new Error('Katalog kosong / format tidak sesuai.');

      if (!state.home.activeCategory && allCatalogData[0]) {
        state.home.activeCategory = allCatalogData[0].catKey;
      }

      buildHomeCategorySelect(allCatalogData);
      renderHomeList();
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Failed to load catalog:', err);
      if (elements.home.errorContainer) {
        elements.home.listContainer.innerHTML = '';
        elements.home.errorContainer.style.display = 'block';
        elements.home.errorContainer.textContent = 'Oops, terjadi kesalahan saat memuat katalog.';
      }
    }
  }
  
  // =========================
  // PREORDER PIPELINE
  // =========================
  
  /**
   * ASUMSI STRUKTUR DATA (CSV) 'Sheet1' & 'Sheet2':
   * Kolom 1: Nama (nama)
   * Kolom 2: IDServer (idserver)
   * Kolom 3: Produk (produk)
   * Kolom 4: Tanggal (tanggal)
   * Kolom 5: Status (status) -> Teks harus: "Success", "Progress", "Pending", atau "Failed"
   * Kolom 6: Catatan (catatan) -> Teks untuk detail (opsional)
   */
  function parsePreorderData(csvText) {
    const csvData = robustCsvParser(csvText);
    const objects = csvToObjects(csvData);
    
    return objects.map(item => ({
      name: item.nama || 'N/A',
      id: item.idserver || '',
      product: item.produk || 'N/A',
      date: item.tanggal || '',
      status: (item.status || 'pending').toLowerCase(),
      notes: item.catatan || 'Tidak ada catatan tambahan.'
    })).filter(item => item.name !== 'N/A'); // Filter data yang valid
  }
  
  function renderPreorderList() {
    const { listContainer, prevBtn, nextBtn, pageInfo, total } = elements.preorder;
    if (!listContainer) return;
    
    const { searchQuery, statusFilter } = state.preorder;
    const query = searchQuery.toLowerCase();
    
    // 1. Filter data
    const filteredData = state.preorder.allData.filter(item => {
      const matchesSearch = query === '' ||
        item.name.toLowerCase().includes(query) ||
        item.id.includes(query);
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
    
    total.textContent = `${filteredData.length} pesanan ditemukan`;
    
    // 2. Terapkan paginasi
    const { currentPage, perPage } = state.preorder;
    const totalPages = Math.ceil(filteredData.length / perPage);
    const start = (currentPage - 1) * perPage;
    const end = start + perPage;
    const pageData = filteredData.slice(start, end);
    
    // 3. Render
    listContainer.innerHTML = '';
    if (pageData.length === 0) {
      listContainer.innerHTML = `<div class="empty"><p>Tidak ada pesanan yang cocok dengan kriteria Anda.</p></div>`;
    }
    
    const frag = document.createDocumentFragment();
    pageData.forEach(item => {
      // Membuat card secara dinamis karena tidak ada template khusus di preorder.html
      const card = document.createElement('article');
      card.className = 'card clickable'; // 'clickable' dari style.css
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      
      const statusClass = item.status.match(/^(success|progress|pending|failed)$/) ? item.status : 'pending';
      
      card.innerHTML = `
        <div class="card-header">
          <div>
            <div class="card-name">${sanitizeHTML(item.name)}</div>
            <div class="card-product">${sanitizeHTML(item.product)}</div>
          </div>
          <span class="status-badge ${statusClass}">${sanitizeHTML(item.status)}</span>
        </div>
        <div class="card-date">${sanitizeHTML(item.id ? `ID: ${item.id} • ` : '')}${sanitizeHTML(item.date)}</div>
        <div class="card-details">
          <div class="details-grid">
            <div>
              <div class="detail-label">Catatan</div>
              <div class="detail-value">${sanitizeHTML(item.notes)}</div>
            </div>
          </div>
        </div>
      `;
      setupExpandableCard(card, '.card-header'); // Gunakan helper
      frag.appendChild(card);
    });
    listContainer.appendChild(frag);
    
    // 4. Update UI Paginasi
    pageInfo.textContent = `Hal ${currentPage} / ${totalPages > 0 ? totalPages : 1}`;
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages || totalPages === 0;
  }
  
  async function fetchAndRenderPreorder() {
    if (preorderFetchController) preorderFetchController.abort();
    preorderFetchController = new AbortController();
    
    const { listContainer, total } = elements.preorder;
    
    try {
      listContainer.innerHTML = '';
      total.textContent = 'Memuat data...';
      if (elements.skeletonCardTemplate) {
        showSkeleton(listContainer, elements.skeletonCardTemplate, 5);
      }
      
      const sheetName = state.preorder.activeSheet === '0' ? config.sheets.preorder.name1 : config.sheets.preorder.name2;
      const csvText = await fetchSheetCached(sheetName, 'csv', preorderFetchController.signal);
      
      if (csvText === null) return; // Dibatalkan
      
      state.preorder.allData = parsePreorderData(csvText);
      state.preorder.currentPage = 1; // Reset ke halaman 1
      renderPreorderList();
      
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Failed to load preorder data:', err);
      listContainer.innerHTML = `<div class="err"><p>Gagal memuat data pesanan.</p></div>`;
      total.textContent = 'Gagal memuat';
    }
  }

  function initializePreorder() {
    if (state.preorder.initialized) return;
    state.preorder.initialized = true;
    
    const { customSelect, customStatusSelect, searchInput, prevBtn, nextBtn } = elements.preorder;

    // Listener untuk Tipe Pesanan
    customSelect.options?.addEventListener('click', e => {
      const target = e.target.closest('.custom-select-option');
      if (!target) return;
      
      const value = target.dataset.value;
      if (value === state.preorder.activeSheet) {
        toggleCustomSelect(customSelect.wrapper, false);
        return;
      }
      
      state.preorder.activeSheet = value;
      customSelect.value.textContent = target.textContent;
      customSelect.options.querySelector('.selected')?.classList.remove('selected');
      target.classList.add('selected');
      toggleCustomSelect(customSelect.wrapper, false);
      
      fetchAndRenderPreorder();
    });

    // Listener untuk Status Pesanan
    customStatusSelect.options?.addEventListener('click', e => {
      const target = e.target.closest('.custom-select-option');
      if (!target) return;

      state.preorder.statusFilter = target.dataset.value;
      customStatusSelect.value.textContent = target.textContent;
      customStatusSelect.options.querySelector('.selected')?.classList.remove('selected');
      target.classList.add('selected');
      toggleCustomSelect(customStatusSelect.wrapper, false);
      
      state.preorder.currentPage = 1; // Reset halaman saat ganti filter
      renderPreorderList();
    });
    
    // Listener untuk Pencarian
    searchInput.addEventListener('input', debounce(e => {
      state.preorder.searchQuery = e.target.value.trim();
      state.preorder.currentPage = 1; // Reset halaman saat mencari
      renderPreorderList();
    }, 300));
    
    // Listener Paginasi
    prevBtn.addEventListener('click', () => {
      if (state.preorder.currentPage > 1) {
        state.preorder.currentPage--;
        renderPreorderList();
      }
    });
    nextBtn.addEventListener('click', () => {
      const totalPages = Math.ceil(state.preorder.allData.length / state.preorder.perPage);
      if (state.preorder.currentPage < totalPages) {
        state.preorder.currentPage++;
        renderPreorderList();
      }
    });

    // Load data awal
    fetchAndRenderPreorder();
  }

  // =========================
  // ACCOUNTS PIPELINE
  // =========================
  
  /**
   * ASUMSI STRUKTUR DATA (CSV) 'Sheet5':
   * Kolom 1: ID (id) -> ID unik untuk item
   * Kolom 2: Kategori (kategori) -> Teks kategori (e.g., "Mobile Legends", "Steam")
   * Kolom 3: Harga (harga) -> Angka saja, tanpa "Rp" atau "."
   * Kolom 4: Status (status) -> Teks harus "Tersedia" atau "Terjual"
   * Kolom 5: Images (images) -> Link URL gambar, dipisah koma (",") jika lebih dari satu
   * Kolom 6: Deskripsi (deskripsi) -> Teks deskripsi, gunakan "||" untuk baris baru (sesuai helper formatDescriptionToHTML)
   */
  function parseAccountData(csvText) {
    const csvData = robustCsvParser(csvText);
    const objects = csvToObjects(csvData);
    
    return objects.map(item => ({
      id: item.id || `acc-${Math.random()}`,
      category: item.kategori || 'Lainnya',
      price: Number(item.harga) || 0,
      status: (item.status || 'Tersedia').toLowerCase(),
      images: item.images ? item.images.split(',').map(img => img.trim()) : [],
      description: item.deskripsi || 'Tidak ada deskripsi.',
      name: `Akun ${item.kategori || ''} #${item.id || ''}` // Nama untuk modal pembayaran
    })).filter(item => item.price > 0);
  }
  
  function buildAccountCategorySelect() {
    const sel = elements.accounts.customSelect;
    if (!sel?.options || !sel?.value) return;

    const categories = [...new Set(state.accounts.allData.map(item => item.category))];
    
    sel.options.innerHTML = '';
    
    const allCategories = ['Semua Kategori', ...categories];

    allCategories.forEach(cat => {
      const el = document.createElement('div');
      el.className = 'custom-select-option';
      el.textContent = cat;
      el.dataset.value = cat;
      el.setAttribute('role', 'option');
      
      if (cat === state.accounts.activeCategory) {
        el.classList.add('selected');
        sel.value.textContent = cat;
      }
      
      el.addEventListener('click', () => {
        state.accounts.activeCategory = cat;
        sel.value.textContent = cat;
        sel.options.querySelector('.selected')?.classList.remove('selected');
        el.classList.add('selected');
        toggleCustomSelect(sel.wrapper, false);
        renderAccountCards();
      });
      sel.options.appendChild(el);
    });
  }
  
  function renderAccountCards() {
    const { cardGrid, empty, cardTemplate } = elements.accounts;
    if (!cardGrid || !cardTemplate) return;
    
    const { activeCategory } = state.accounts;
    
    const filteredData = state.accounts.allData.filter(item => 
      activeCategory === 'Semua Kategori' || item.category === activeCategory
    );
    
    cardGrid.innerHTML = '';
    
    if (filteredData.length === 0) {
      empty.style.display = 'flex';
      return;
    }
    empty.style.display = 'none';
    
    const frag = document.createDocumentFragment();
    filteredData.forEach(item => {
      const card = cardTemplate.content.cloneNode(true).firstElementChild;
      
      // 1. Setup Carousel
      const carouselWrapper = card.querySelector('.account-card-carousel-wrapper');
      if (carouselWrapper && item.images.length > 0) {
        const carouselId = `carousel-${item.id}`;
        let trackHTML = '';
        let indicatorsHTML = '';
        
        item.images.forEach((img, index) => {
          trackHTML += `<div class="carousel-slide"><img src="${sanitizeHTML(img)}" alt="Gambar Akun ${index + 1}" loading="lazy"></div>`;
          if (item.images.length > 1) {
            indicatorsHTML += `<button type="button" class="indicator-dot ${index === 0 ? 'active' : ''}" data-index="${index}" aria-label="Slide ${index + 1}"></button>`;
          }
        });
        
        carouselWrapper.innerHTML = `
          <div class="carousel-container" id="${carouselId}">
            <div class="carousel-track" style="transform: translateX(0%);">${trackHTML}</div>
            ${item.images.length > 1 ? `
              <button type="button" class="carousel-btn prev" aria-controls="${carouselId}" disabled>&lt;</button>
              <button type="button" class="carousel-btn next" aria-controls="${carouselId}">&gt;</button>
              <div class="carousel-indicators">${indicatorsHTML}</div>
            ` : ''}
          </div>
        `;
      } else if (carouselWrapper) {
         carouselWrapper.innerHTML = `<div class="carousel-container"><div class="carousel-slide"><img src="/assets/images/placeholder.webp" alt="Placeholder"></div></div>`; // Fallback image
      }
      
      // 2. Setup Info Utama
      card.querySelector('h3').textContent = formatToIdr(item.price);
      const statusBadge = card.querySelector('.account-status-badge');
      if (statusBadge) {
        statusBadge.textContent = item.status;
        statusBadge.className = `account-status-badge ${item.status === 'tersedia' ? 'available' : 'sold'}`;
      }
      
      // 3. Setup Detail (Deskripsi)
      const specsContainer = card.querySelector('.account-card-specs');
      if (specsContainer) {
        specsContainer.innerHTML = formatDescriptionToHTML(item.description);
      }
      
      // 4. Setup Tombol Aksi
      const buyBtn = card.querySelector('.action-btn.buy');
      const offerBtn = card.querySelector('.action-btn.offer');
      
      if (item.status === 'terjual') {
        buyBtn.disabled = true;
        offerBtn.disabled = true;
        buyBtn.textContent = 'Terjual';
      } else {
        buyBtn.addEventListener('click', (e) => {
          elementToFocusOnModalClose = e.currentTarget;
          openPaymentModal(item); // 'item' sudah punya 'name' dan 'price'
        });
        offerBtn.addEventListener('click', () => {
          const msg = encodeURIComponent(`Halo, saya tertarik untuk menawar ${item.name} (Harga: ${formatToIdr(item.price)}).`);
          window.open(`https://wa.me/${config.waNumber}?text=${msg}`, '_blank', 'noopener,noreferrer');
        });
      }
      
      // 5. Inisialisasi UI
      initializeCarousels(card);
      setupExpandableCard(card, '.account-card-main-info');
      
      frag.appendChild(card);
    });
    
    cardGrid.appendChild(frag);
  }

  async function initializeAccounts() {
    if (state.accounts.initialized) return;
    state.accounts.initialized = true;
    
    const { cardGrid, error, empty, customSelect } = elements.accounts;
    
    if (!cardGrid) return;
    
    if (customSelect.btn) {
      customSelect.btn.addEventListener('click', (e) => { e.stopPropagation(); toggleCustomSelect(customSelect.wrapper); });
    }
    
    if (accountsFetchController) accountsFetchController.abort();
    accountsFetchController = new AbortController();
    
    try {
      error.style.display = 'none';
      empty.style.display = 'none';
      if (elements.skeletonCardTemplate) {
        showSkeleton(cardGrid, elements.skeletonCardTemplate, 4);
      }
      
      const csvText = await fetchSheetCached(config.sheets.accounts.name, 'csv', accountsFetchController.signal);
      
      if (csvText === null) return;
      
      state.accounts.allData = parseAccountData(csvText);
      
      if (state.accounts.allData.length === 0) {
        cardGrid.innerHTML = '';
        empty.style.display = 'flex';
        return;
      }
      
      buildAccountCategorySelect();
      renderAccountCards();
      
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Failed to load accounts:', err);
      cardGrid.innerHTML = '';
      error.style.display = 'block';
      error.textContent = 'Oops, terjadi kesalahan saat memuat data akun.';
    }
  }
  
  // =========================
  // PERPUSTAKAAN PIPELINE
  // =========================

  /**
   * ASUMSI STRUKTUR DATA (CSV) 'Sheet_Perpus':
   * Kolom 1: Judul (judul)
   * Kolom 2: Link (link) -> URL tujuan saat di-klik
   * Kolom 3: Cover (cover) -> URL gambar cover
   */
  function parsePerpustakaanData(csvText) {
    const csvData = robustCsvParser(csvText);
    const objects = csvToObjects(csvData);
    
    return objects.map(item => ({
      title: item.judul || 'Tanpa Judul',
      link: item.link || '#',
      cover: item.cover || '/assets/images/placeholder.webp' // Fallback
    })).filter(item => item.title !== 'Tanpa Judul');
  }
  
  function renderPerpustakaanGrid() {
    const { gridContainer, error } = elements.perpustakaan;
    if (!gridContainer) return;
    
    gridContainer.innerHTML = '';
    
    if (state.perpustakaan.allData.length === 0) {
       gridContainer.innerHTML = `<div class="empty" style="grid-column: 1 / -1;"><p>Tidak ada tulisan atau cerita yang ditemukan.</p></div>`;
       return;
    }
    
    const frag = document.createDocumentFragment();
    state.perpustakaan.allData.forEach(item => {
      // Membuat kartu buku secara dinamis sesuai style.css
      const card = document.createElement('a');
      card.href = item.link;
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
      card.className = 'book-card';
      card.setAttribute('aria-label', item.title);
      
      card.innerHTML = `
        <img src="${sanitizeHTML(item.cover)}" alt="${sanitizeHTML(item.title)}" class="cover" loading="lazy">
        <div class="overlay"></div>
        <div class="title">${sanitizeHTML(item.title)}</div>
      `;
      frag.appendChild(card);
    });
    gridContainer.appendChild(frag);
  }
  
  async function initializePerpustakaan() {
    if (state.perpustakaan.initialized) return;
    state.perpustakaan.initialized = true;
    
    const { gridContainer, error } = elements.perpustakaan;
    if (!gridContainer) return;
    
    if (perpustakaanFetchController) perpustakaanFetchController.abort();
    perpustakaanFetchController = new AbortController();
    
    try {
      error.style.display = 'none';
      // Tampilkan skeleton kustom untuk buku
      gridContainer.innerHTML = Array(6).fill('<div class="book-card skeleton"><div class="title"><span class="skeleton-text" style="width: 70%;"></span></div></div>').join('');

      const csvText = await fetchSheetCached(config.sheets.perpustakaan.name, 'csv', perpustakaanFetchController.signal);
      
      if (csvText === null) return;
      
      state.perpustakaan.allData = parsePerpustakaanData(csvText);
      renderPerpustakaanGrid();
      
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Failed to load library:', err);
      gridContainer.innerHTML = '';
      error.style.display = 'block';
      error.textContent = 'Oops, terjadi kesalahan saat memuat data perpustakaan.';
    }
  }

  // =========================
  // CAROUSELL PIPELINE
  // =========================

  /**
   * ASUMSI STRUKTUR DATA (CSV) 'Sheet8':
   * Kolom 1: IDProduk (idproduk) -> Nomor unik produk
   * Kolom 2: Judul (judul)
   * Kolom 3: Platform (platform) -> e.g., "Shopee", "Tokopedia"
   * Kolom 4: Harga (harga) -> Angka saja
   * Kolom 5: Images (images) -> Link URL gambar, dipisah koma (",")
   * Kolom 6: LinkURL (linkurl) -> Link afiliasi
   * Kolom 7: Deskripsi (deskripsi) -> Opsional, pakai "||" untuk baris baru
   */
  function parseCarousellData(csvText) {
    const csvData = robustCsvParser(csvText);
    const objects = csvToObjects(csvData);
    
    return objects.map(item => ({
      id: item.idproduk || `car-${Math.random()}`,
      title: item.judul || 'Produk Pilihan',
      platform: item.platform || '',
      price: Number(item.harga) || 0,
      images: item.images ? item.images.split(',').map(img => img.trim()) : [],
      link: item.linkurl || '#',
      description: item.deskripsi || ''
    })).filter(item => item.price > 0 && item.link !== '#');
  }
  
  function renderCarousellGrid() {
    const { gridContainer, total } = elements.carousell;
    if (!gridContainer) return;
    
    const query = state.carousell.searchQuery.toLowerCase();
    
    const filteredData = state.carousell.allData.filter(item => 
      query === '' || item.id.toLowerCase().includes(query)
    );
    
    gridContainer.innerHTML = '';
    total.textContent = `${filteredData.length} produk ditemukan`;
    
    if (filteredData.length === 0) {
      gridContainer.innerHTML = `<div class="empty" style="grid-column: 1 / -1;"><p>Tidak ada produk yang cocok dengan pencarian Anda.</p></div>`;
      return;
    }
    
    const frag = document.createDocumentFragment();
    filteredData.forEach(item => {
      // Membuat kartu afiliasi secara dinamis (sesuai style.css)
      const card = document.createElement('article');
      card.className = 'affiliate-card';
      
      // 1. Carousel
      let carouselHTML = '';
      if (item.images.length > 0) {
        const carouselId = `carousel-aff-${item.id}`;
        let trackHTML = '';
        let indicatorsHTML = '';
        
        item.images.forEach((img, index) => {
          trackHTML += `<div class="carousel-slide"><img src="${sanitizeHTML(img)}" alt="Gambar Produk ${index + 1}" loading="lazy"></div>`;
          if (item.images.length > 1) {
            indicatorsHTML += `<button type="button" class="indicator-dot ${index === 0 ? 'active' : ''}" data-index="${index}" aria-label="Slide ${index + 1}"></button>`;
          }
        });
        
        carouselHTML = `
          <div class="carousel-container" id="${carouselId}">
            <div class="carousel-track" style="transform: translateX(0%);">${trackHTML}</div>
            ${item.images.length > 1 ? `
              <button type="button" class="carousel-btn prev" aria-controls="${carouselId}" disabled>&lt;</button>
              <button type="button" class="carousel-btn next" aria-controls="${carouselId}">&gt;</button>
              <div class="carousel-indicators">${indicatorsHTML}</div>
            ` : ''}
          </div>
        `;
      } else {
         carouselHTML = `<div class="carousel-container"><div class="carousel-slide"><img src="/assets/images/placeholder.webp" alt="Placeholder"></div></div>`;
      }
      
      // 2. Info Card
      card.innerHTML = `
        ${carouselHTML}
        <div class="affiliate-card-body">
          <div class="affiliate-card-platform">${sanitizeHTML(item.platform)}</div>
          <h3 class="affiliate-card-title">${sanitizeHTML(item.title)}</h3>
          <div class="affiliate-card-price">${formatToIdr(item.price)}</div>
          ${item.description ? `<div class="affiliate-card-desc">${formatDescriptionToHTML(item.description)}</div>` : ''}
          <a href="${sanitizeHTML(item.link)}" target="_blank" rel="noopener noreferrer" class="affiliate-card-button">Beli di ${sanitizeHTML(item.platform) || 'Sini'}</a>
        </div>
        <div class="affiliate-card-number">#${sanitizeHTML(item.id)}</div>
      `;
      
      initializeCarousels(card);
      frag.appendChild(card);
    });
    
    gridContainer.appendChild(frag);
  }
  
  async function initializeCarousell() {
    if (state.carousell.initialized) return;
    state.carousell.initialized = true;
    
    const { gridContainer, error, searchInput, total } = elements.carousell;
    if (!gridContainer) return;
    
    searchInput.addEventListener('input', debounce(e => {
      state.carousell.searchQuery = e.target.value.trim();
      renderCarousellGrid();
    }, 300));
    
    if (carousellFetchController) carousellFetchController.abort();
    carousellFetchController = new AbortController();
    
    try {
      error.style.display = 'none';
      total.textContent = 'Memuat data...';
      // Tampilkan skeleton kustom untuk afiliasi
      gridContainer.innerHTML = Array(3).fill(`
        <div class="affiliate-card skeleton">
          <div class="carousel-container skeleton"></div>
          <div class="affiliate-card-body">
            <span class="skeleton-text" style="width: 30%; height: 12px; margin-bottom: 8px;"></span>
            <span class="skeleton-text" style="width: 90%; height: 16px; margin-bottom: 12px;"></span>
            <span class="skeleton-text" style="width: 50%; height: 24px; margin-bottom: 20px;"></span>
            <span class="skeleton-text" style="width: 100%; height: 44px; border-radius: 8px;"></span>
          </div>
        </div>
      `).join('');
      
      const csvText = await fetchSheetCached(config.sheets.affiliate.name, 'csv', carousellFetchController.signal);
      
      if (csvText === null) return;
      
      state.carousell.allData = parseCarousellData(csvText);
      renderCarousellGrid();
      
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Failed to load carousell data:', err);
      gridContainer.innerHTML = '';
      total.textContent = 'Gagal memuat';
      error.style.display = 'block';
      error.textContent = 'Oops, terjadi kesalahan saat memuat data produk.';
    }
  }

  // =========================
  // PAYMENT MODAL (Tidak Berubah)
  // =========================
  function calculateFee(price, option) {
    const numPrice = Number(price) || 0;
    if (option.feeType === 'fixed') return option.value;
    if (option.feeType === 'percentage') return Math.ceil(numPrice * option.value);
    return 0;
  }

  function updatePriceDetails() {
    const selectedOptionId = document.querySelector('input[name="payment"]:checked')?.value;
    if (!selectedOptionId) return;

    const selectedOption = config.paymentOptions.find(opt => opt.id === selectedOptionId);
    if (!currentSelectedItem || !selectedOption) return;

    const price = Number(currentSelectedItem.price) || 0;
    const fee = calculateFee(price, selectedOption);
    const total = price + fee;

    elements.paymentModal.fee.textContent = formatToIdr(fee);
    elements.paymentModal.total.textContent = formatToIdr(total);
  }

  function openPaymentModal(item) {
    if (!item) return;

    currentSelectedItem = item;

    const { modal, itemName, itemPrice, optionsContainer, waBtn } = elements.paymentModal;
    if (!modal) return;

    itemName && (itemName.textContent = item.title || item.name || '');
    itemPrice && (itemPrice.textContent = formatToIdr(item.price));

    if (optionsContainer) {
      optionsContainer.innerHTML = '';
      config.paymentOptions.forEach((option, index) => {
        const fee = calculateFee(item.price, option);
        optionsContainer.insertAdjacentHTML('beforeend', `
          <div class="payment-option">
            <input type="radio" id="${option.id}" name="payment" value="${option.id}" ${index === 0 ? 'checked' : ''}>
            <label for="${option.id}" tabindex="0">
              ${sanitizeHTML(option.name)}
              <span style="float: right">+ ${formatToIdr(fee)}</span>
            </label>
          </div>
        `);
      });

      optionsContainer.querySelectorAll('input[name="payment"]').forEach(input => {
        input.addEventListener('change', updatePriceDetails);
      });
    }

    updatePriceDetails();

    if (waBtn) {
      waBtn.onclick = () => {
        const selectedOptionId = document.querySelector('input[name="payment"]:checked')?.value;
        const selectedOption = config.paymentOptions.find(opt => opt.id === selectedOptionId);
        if (!selectedOption) return;

        const price = Number(item.price) || 0;
        const fee = calculateFee(price, selectedOption);
        const total = price + fee;

        const message =
          `${config.waGreeting}\n\n` +
          `Produk: ${item.title || item.name}\n` +
          `Harga: ${formatToIdr(price)}\n` +
          `Metode Pembayaran: ${selectedOption.name}\n` +
          `Biaya Admin: ${formatToIdr(fee)}\n` +
          `Total: ${formatToIdr(total)}`;

        const waUrl = `https://wa.me/${config.waNumber}?text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank', 'noopener,noreferrer');
      };
    }

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // Mencegah scroll background
    requestAnimationFrame(() => {
      modal.classList.add('active'); // 'active' bukan 'visible'
      setupModalFocusTrap(modal);
    });
  }

  function closePaymentModal() {
    const { modal } = elements.paymentModal;
    if (!modal) return;

    modal.classList.remove('active');
    document.body.style.overflow = ''; // Kembalikan scroll background

    const finish = () => {
      modal.style.display = 'none';
      teardownModalFocusTrap();
      if (elementToFocusOnModalClose) {
        elementToFocusOnModalClose.focus();
        elementToFocusOnModalClose = null;
      }
    };

    if (!prefersReducedMotion) {
      modal.addEventListener('transitionend', function handler() { finish(); modal.removeEventListener('transitionend', handler); }, { once: true });
    } else {
      finish();
    }
  }

  function setupModalFocusTrap(modal) {
    const focusableEls = modal.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    modalFocusTrap.focusableEls = Array.from(focusableEls);
    modalFocusTrap.firstEl = modalFocusTrap.focusableEls[0];
    modalFocusTrap.lastEl = modalFocusTrap.focusableEls[modalFocusTrap.focusableEls.length - 1];

    modalFocusTrap.listener = (e) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === modalFocusTrap.firstEl) {
          e.preventDefault();
          modalFocusTrap.lastEl?.focus();
        }
      } else {
        if (document.activeElement === modalFocusTrap.lastEl) {
          e.preventDefault();
          modalFocusTrap.firstEl?.focus();
        }
      }
    };

    modal.addEventListener('keydown', modalFocusTrap.listener);
    // Fokus pada elemen pertama yang bisa difokus, biasanya tombol close atau input radio pertama
    const firstFocusable = modalFocusTrap.firstEl;
    firstFocusable?.focus();
  }

  function teardownModalFocusTrap() {
    if (modalFocusTrap.listener) {
      elements.paymentModal.modal.removeEventListener('keydown', modalFocusTrap.listener);
      modalFocusTrap.listener = null;
    }
  }

  // =========================
  // UI UTILITIES (Tidak Berubah)
  // =========================
  function initializeCarousels(container) {
    if (!container) return;
    container.querySelectorAll('.carousel-container').forEach(carouselContainer => {
      const track = carouselContainer.querySelector('.carousel-track');
      const slides = carouselContainer.querySelectorAll('.carousel-slide');
      const imageCount = slides.length;

      if (imageCount > 1) {
        const prevBtn = carouselContainer.querySelector('.prev');
        const nextBtn = carouselContainer.querySelector('.next');
        const indicators = carouselContainer.querySelectorAll('.indicator-dot');
        let currentIndex = 0;

        const update = () => {
          if (!track || !prevBtn || !nextBtn || !indicators) return;
          track.style.transform = `translateX(-${currentIndex * 100}%)`;
          prevBtn.disabled = currentIndex === 0;
          nextBtn.disabled = currentIndex >= imageCount - 1;
          indicators.forEach((dot, i) => dot.classList.toggle('active', i === currentIndex));
        };

        nextBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          if (currentIndex < imageCount - 1) { currentIndex++; update(); }
        });

        prevBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          if (currentIndex > 0) { currentIndex--; update(); }
        });

        indicators.forEach(dot => dot.addEventListener('click', (e) => {
          e.stopPropagation();
          currentIndex = parseInt(e.target.dataset.index, 10);
          update();
        }));

        update();
      }
    });
  }

  function setupExpandableCard(card, triggerSelector) {
    const trigger = card.querySelector(triggerSelector);
    if (trigger) {
      const action = (e) => {
        // Jangan ekspansi jika mengklik link di dalam trigger (jika ada)
        if (e.target.closest('a') || e.target.closest('button')) return; 
        card.classList.toggle('expanded');
      };
      trigger.addEventListener('click', action);
      trigger.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('a')  && !e.target.closest('button')) {
          e.preventDefault();
          action(e);
        }
      });
    }
  }

  function formatDescriptionToHTML(text) {
    if (!text) return '';
    // Menggunakan regex untuk memecah berdasarkan ||
    return text.split(/\|\|/g).map(line => {
      const trimmedLine = line.trim();
      if (trimmedLine === '') return '<br>'; // Hanya satu <br> agar tidak terlalu renggang
      if (trimmedLine.endsWith(':')) return `<strong class="spec-title">${sanitizeHTML(trimmedLine.slice(0, -1))}</strong>`;
      if (trimmedLine.startsWith('\u203A') || trimmedLine.startsWith('>')) return `<p class="spec-item spec-item-arrow">${sanitizeHTML(trimmedLine.substring(1).trim())}</p>`;
      if (trimmedLine.startsWith('-')) return `<p class="spec-item spec-item-dash">${sanitizeHTML(trimmedLine.substring(1).trim())}</p>`;
      if (trimmedLine.startsWith('#')) return `<p class="spec-hashtag">${sanitizeHTML(trimmedLine)}</p>`;
      return `<p class="spec-paragraph">${sanitizeHTML(trimmedLine)}</p>`;
    }).join('');
  }

  function updateHeaderStatus() {
    const now = new Date();
    const options = { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false };
    const hour = parseInt(new Intl.DateTimeFormat('en-US', options).format(now), 10);
    const indicator = elements.headerStatusIndicator;
    if (!indicator) return;
    
    // Buka jam 8 pagi - 12 malam (23:59)
    if (hour >= 8 && hour <= 23) { 
      indicator.textContent = 'BUKA'; 
      indicator.className = 'status-badge open'; // Pakai 'open' dari CSS
    } else { 
      indicator.textContent = 'TUTUP'; 
      indicator.className = 'status-badge closed'; 
    }
  }

  function toggleSidebar(forceOpen) {
    const isOpen = typeof forceOpen === 'boolean' ? forceOpen : !document.body.classList.contains('sidebar-open');
    document.body.classList.toggle('sidebar-open', isOpen);
    elements.sidebar.burger?.classList.toggle('active', isOpen);
    elements.sidebar.burger?.setAttribute('aria-expanded', isOpen);

    const body = document.body;
    if (isOpen) {
      const y = window.scrollY || window.pageYOffset || 0;
      body.dataset.ppLockY = String(y);
      body.style.position = 'fixed';
      body.style.top = `-${y}px`;
      body.style.width = '100%';
      body.style.overflow = 'hidden'; // Mencegah scroll body
      
      // Fokus ke sidebar untuk aksesibilitas
      elements.sidebar.nav?.querySelector('a.nav-item')?.focus();
      
    } else {
      const y = parseInt(body.dataset.ppLockY || '0', 10);
      body.style.position = '';
      body.style.top = '';
      body.style.width = '';
      body.style.overflow = '';
      window.scrollTo(0, y);
      
      // Kembalikan fokus ke tombol burger
      elements.sidebar.burger?.focus();
    }
  }

  // =========================
  // INITIALIZE (UPDATED)
  // =========================
  function initializeApp() {
    // Sidebar
    elements.sidebar.burger?.addEventListener('click', () => toggleSidebar());
    elements.sidebar.overlay?.addEventListener('click', () => toggleSidebar(false));

    // Link donasi
    elements.navLinks.forEach(link => {
      link.addEventListener('click', e => {
        if (link.dataset.mode === 'donasi') {
          e.preventDefault();
          window.open('https://saweria.co/playpal', '_blank', 'noopener');
        }
      });
    });

    // Custom select
    [
      elements.home.customSelect, 
      elements.preorder.customSelect, 
      elements.preorder.customStatusSelect, 
      elements.accounts.customSelect
    ]
      .filter(select => select && select.btn)
      .forEach(select => {
        select.btn.addEventListener('click', (e) => { e.stopPropagation(); toggleCustomSelect(select.wrapper); });
        enhanceCustomSelectKeyboard(select.wrapper);
      });

    // Home search (sudah ada)
    if (elements.home.searchInput) {
      elements.home.searchInput.addEventListener('input', debounce(e => {
        state.home.searchQuery = e.target.value.trim(); 
        renderHomeList(); 
      }, 300));
    }

    // Payment modal
    if (elements.paymentModal.closeBtn && elements.paymentModal.modal) {
      elements.paymentModal.closeBtn.addEventListener('click', closePaymentModal);
      elements.paymentModal.modal.addEventListener('click', e => { if (e.target === elements.paymentModal.modal) closePaymentModal(); });
    }

    // Escape handler
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (elements.paymentModal.modal?.classList.contains('active')) closePaymentModal();
        if (document.body.classList.contains('sidebar-open')) toggleSidebar(false);
        [
          elements.home.customSelect.wrapper, 
          elements.preorder.customSelect.wrapper, 
          elements.preorder.customStatusSelect.wrapper, 
          elements.accounts.customSelect.wrapper
        ]
          .filter(Boolean).forEach(w => toggleCustomSelect(w, false));
      }
    });

    // Click outside to close custom selects
    document.addEventListener('click', (e) => {
      [
        elements.home.customSelect.wrapper, 
        elements.preorder.customSelect.wrapper, 
        elements.preorder.customStatusSelect.wrapper, 
        elements.accounts.customSelect.wrapper
      ]
        .filter(wrapper => wrapper)
        .forEach(wrapper => { if (!wrapper.contains(e.target)) toggleCustomSelect(wrapper, false); });
    });

    // Header status
    if (elements.headerStatusIndicator) {
      elements.headerStatusIndicator.style.display = 'inline-flex';
      updateHeaderStatus();
      setInterval(updateHeaderStatus, 60000);
    }

    // === INIT SEMUA HALAMAN ===
    
    // 1. Init Home (Katalog)
    if (elements.viewHome) {
      loadCatalog();
    }
    
    // 2. Init Pre Order
    if (elements.viewPreorder) {
      initializePreorder();
    }
    
    // 3. Init Akun Game
    if (elements.viewAccounts) {
      initializeAccounts();
    }
    
    // 4. Init Perpustakaan
    if (elements.viewPerpustakaan) {
       initializePerpustakaan();
    }
    
    // 5. Init Carousell
    if (elements.viewCarousell) {
       initializeCarousell();
    }
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
  } else {
    initializeApp();
  }
})();
