(function () {
  'use strict';

  // =========================
  // CONFIG & STATE
  // =========================
  const config = {
    sheetId: '1B0XPR4uSvRzy9LfzWDjNjwAyMZVtJs6_Kk_r2fh7dTw',
    sheets: {
      katalog: { name: 'Sheet3' },
      preorder: { name1: 'Sheet1', name2: 'Sheet2' },   // disiapkan, tidak diinit di versi ini
      accounts: { name: 'Sheet5' },                      // disiapkan, tidak diinit di versi ini
      affiliate: { name: 'Sheet8' }                      // disiapkan, tidak diinit di versi ini
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
    preorder: { initialized: false, allData: [], currentPage: 1, perPage: 15, displayMode: 'detailed' },
    accounts: { initialized: false, allData: [], activeCategory: 'Semua Kategori' },
    carousell: { initialized: false, allData: [], searchQuery: '' }
  };

  let allCatalogData = [];
  let currentSelectedItem = null;

  let catalogFetchController;
  let preorderFetchController;   // reserved
  let accountsFetchController;   // reserved

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

    // Preorder (reserved)
    preorder: {
      searchInput: getElement('preorderSearchInput'),
      statusSelect: getElement('preorderStatusSelect'),
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

    // Accounts (reserved)
    accounts: {
      cardGrid: getElement('accountCardGrid'),
      cardTemplate: getElement('accountCardTemplate'),
      empty: getElement('accountEmpty'),
      error: getElement('accountError'),
      customSelect: {
        wrapper: getElement('accountCustomSelectWrapper'),
        btn: getElement('accountCustomSelectBtn'),
        value: getElement('accountCustomSelectValue'),
        options: getElement('accountCustomSelectOptions'),
      },
    },

    // Carousell (reserved)
    carousell: {
      gridContainer: getElement('carousellGridContainer'),
      error: getElement('carousellError'),
      searchInput: getElement('carousellSearchInput'),
      total: getElement('carousellTotal'),
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

  function getSheetUrl(sheetName, format = 'json') {
    const baseUrl = `https://docs.google.com/spreadsheets/d/${config.sheetId}/gviz/tq`;
    const encodedSheetName = encodeURIComponent(sheetName);
    return format === 'csv'
      ? `${baseUrl}?tqx=out:csv&sheet=${encodedSheetName}`
      : `${baseUrl}?sheet=${encodedSheetName}&tqx=out:json`;
  }

  async function fetchSheetCached(sheetName, format = 'json') {
    const url = getSheetUrl(sheetName, format === 'csv' ? 'csv' : 'json');
    const key = `pp_cache_${sheetName}_${format}`;
    const cached = sessionStorage.getItem(key);

    if (cached) {
      // background revalidate
      try { fetch(url).then(r => r.text()).then(t => sessionStorage.setItem(key, t)); } catch (e) {}
      return cached;
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Network error: ${res.statusText}`);
    const text = await res.text();
    sessionStorage.setItem(key, text);
    return text;
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
        else if (char === ',') { currentRow.push(currentField); currentField = ''; }
        else if (char === '\n') { currentRow.push(currentField); rows.push(currentRow); currentRow = []; currentField = ''; }
        else { currentField += char; }
      }
    }
    currentRow.push(currentField);
    rows.push(currentRow);
    return rows;
  }

  // =========================
  // KATALOG PIPELINE
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
      // Pakai template kalau ada; kalau tidak, fallback
      if (elements.itemTemplate?.content) {
        const clone = elements.itemTemplate.content.cloneNode(true);
        const buttonEl = clone.querySelector('.list-item');
        buttonEl.querySelector('.title').textContent = item.title;
        buttonEl.querySelector('.price').textContent = formatToIdr(item.price);
        buttonEl.addEventListener('click', () => openPaymentModal(item));
        frag.appendChild(clone);
      } else {
        const btn = document.createElement('button');
        btn.className = 'list-item';
        btn.innerHTML = `<span class="title">${sanitizeHTML(item.title)}</span>
                         <span class="price">${formatToIdr(item.price)}</span>`;
        btn.addEventListener('click', () => openPaymentModal(item));
        frag.appendChild(btn);
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
    if (!elements.home?.listContainer) return; // kalau view home tidak ada, skip
    if (catalogFetchController) catalogFetchController.abort();
    catalogFetchController = new AbortController();

    try {
      elements.home.errorContainer && (elements.home.errorContainer.style.display = 'none');
      if (elements.skeletonItemTemplate) showSkeleton(elements.home.listContainer, elements.skeletonItemTemplate, 6);

      const text = await fetchSheetCached(config.sheets.katalog.name, 'json');
      allCatalogData = parseGvizPairs(text);
      if (!allCatalogData.length) throw new Error('Katalog kosong / format tidak sesuai.');

      // Set kategori default
      if (!state.home.activeCategory && allCatalogData[0]) {
        state.home.activeCategory = allCatalogData[0].catKey;
      }

      buildHomeCategorySelect(allCatalogData);
      renderHomeList();
    } catch (err) {
      console.error('Failed to load catalog:', err);
      if (elements.home.errorContainer) {
        elements.home.listContainer.innerHTML = '';
        elements.home.errorContainer.style.display = 'block';
        elements.home.errorContainer.textContent = 'Oops, terjadi kesalahan saat memuat katalog.';
      }
    }
  }

  // =========================
  // PAYMENT MODAL
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
        // Penting: tidak ada 'D' nyasar di sini
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
    requestAnimationFrame(() => {
      modal.classList.add('active');
      setupModalFocusTrap(modal);
    });
  }

  function closePaymentModal() {
    const { modal } = elements.paymentModal;
    if (!modal) return;

    modal.classList.remove('active');

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
    modalFocusTrap.firstEl?.focus();
  }

  function teardownModalFocusTrap() {
    if (modalFocusTrap.listener) {
      elements.paymentModal.modal.removeEventListener('keydown', modalFocusTrap.listener);
      modalFocusTrap.listener = null;
    }
  }

  // =========================
  // UI UTILITIES
  // =========================
  function initializeCarousels(container) {
    if (!container) return;
    container.querySelectorAll('.carousel-container').forEach(carouselContainer => {
      const track = carouselContainer.querySelector('.carousel-track');
      const slides = carouselContainer.querySelectorAll('.carousel-slide'); // FIXED: querySelectorAll
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
        if (e.target.closest('a')) return;
        card.classList.toggle('expanded');
      };
      trigger.addEventListener('click', action);
      trigger.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('a')) {
          e.preventDefault();
          action(e);
        }
      });
    }
  }

  function formatDescriptionToHTML(text) {
    if (!text) return '';
    return text.split('||').map(line => {
      const trimmedLine = line.trim();
      if (trimmedLine === '') return '<br><br>';
      if (trimmedLine.endsWith(':')) return `<br><br><strong>${sanitizeHTML(trimmedLine.slice(0, -1))}</strong>`;
      if (trimmedLine.startsWith('\u203A')) return `<br><br>&nbsp;&nbsp;› ${sanitizeHTML(trimmedLine.substring(1).trim())}`;
      if (trimmedLine.startsWith('-')) return `<br><br>&nbsp;&nbsp;• ${sanitizeHTML(trimmedLine.substring(1).trim())}`;
      if (trimmedLine.startsWith('#')) return `<br><br><em>${sanitizeHTML(trimmedLine)}</em>`;
      return `<br>${sanitizeHTML(trimmedLine)}`;
    }).join('');
  }

  function updateHeaderStatus() {
    const now = new Date();
    const options = { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false };
    const hour = parseInt(new Intl.DateTimeFormat('en-US', options).format(now), 10);
    const indicator = elements.headerStatusIndicator;
    if (!indicator) return;
    if (hour >= 8) { indicator.textContent = 'BUKA'; indicator.className = 'status-badge success'; }
    else { indicator.textContent = 'TUTUP'; indicator.className = 'status-badge closed'; }
  }

  function toggleSidebar(forceOpen) {
    const isOpen = typeof forceOpen === 'boolean' ? forceOpen : !document.body.classList.contains('sidebar-open');
    document.body.classList.toggle('sidebar-open', isOpen);
    elements.sidebar.burger?.classList.toggle('active', isOpen);

    const body = document.body;
    if (isOpen) {
      const y = window.scrollY || window.pageYOffset || 0;
      body.dataset.ppLockY = String(y);
      body.style.position = 'fixed';
      body.style.top = `-${y}px`;  // keep visual position
      body.style.width = '100%';
      body.style.overflow = 'hidden';
    } else {
      const y = parseInt(body.dataset.ppLockY || '0', 10);
      body.style.position = '';
      body.style.top = '';
      body.style.width = '';
      body.style.overflow = '';
      window.scrollTo(0, y);
    }
  }

  // =========================
  // INITIALIZE
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
    [elements.home.customSelect, elements.preorder.customSelect, elements.preorder.customStatusSelect, elements.accounts.customSelect]
      .filter(select => select && select.btn)
      .forEach(select => {
        select.btn.addEventListener('click', (e) => { e.stopPropagation(); toggleCustomSelect(select.wrapper); });
        enhanceCustomSelectKeyboard(select.wrapper);
      });

    // Home search
    if (elements.home.searchInput) {
      let homeDebounce;
      elements.home.searchInput.addEventListener('input', e => {
        clearTimeout(homeDebounce);
        homeDebounce = setTimeout(() => { state.home.searchQuery = e.target.value.trim(); renderHomeList(); }, 200);
      });
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
        [elements.home.customSelect.wrapper, elements.preorder.customSelect.wrapper, elements.preorder.customStatusSelect.wrapper, elements.accounts.customSelect.wrapper]
          .filter(Boolean).forEach(w => toggleCustomSelect(w, false));
      }
    });

    // Click outside to close custom selects
    document.addEventListener('click', (e) => {
      [elements.home.customSelect.wrapper, elements.preorder.customSelect.wrapper, elements.preorder.customStatusSelect.wrapper, elements.accounts.customSelect.wrapper]
        .filter(wrapper => wrapper)
        .forEach(wrapper => { if (!wrapper.contains(e.target)) toggleCustomSelect(wrapper, false); });
    });

    // Header status
    if (elements.headerStatusIndicator) {
      elements.headerStatusIndicator.style.display = 'inline-flex';
      updateHeaderStatus();
      setInterval(updateHeaderStatus, 60000);
    }

    // === INIT HOME (KATALOG) ===
    if (elements.viewHome) {
      loadCatalog();
    }

    // Catatan:
    // - Inisialisasi preorder/accounts/carousell tidak diaktifkan di versi ini.
    //   Tambah fungsi masing-masing bila dibutuhkan, lalu panggil di sini:
    //   if (elements.viewPreorder) initializePreorder();
    //   if (elements.viewAccounts) initializeAccounts();
    //   if (elements.viewCarousell) initializeCarousell();
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
  } else {
    initializeApp();
  }
})();
