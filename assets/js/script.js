(function () {
  'use strict';
  const config = {
    sheetId: '1B0XPR4uSvRzy9LfzWDjNjwAyMZVtJs6_Kk_r2fh7dTw',
    sheets: {
      katalog: { name: 'Sheet3' },
      preorder: { name1: 'Sheet1', name2: 'Sheet2' },
      accounts: { name: 'Sheet5' },
      affiliate: { name: 'Sheet8' }
    },
    waNumber: '6285877001999',
    waGreeting: '*Detail pesanan:*',
    paymentOptions: [
      { id: 'seabank', name: 'Seabank', feeType: 'fixed', value: 0 },
      { id: 'gopay', name: 'Gopay', feeType: 'fixed', value: 0 },
      { id: 'dana', name: 'Dana', feeType: 'fixed', value: 125 },
      { id: 'bank_to_dana', name: 'Bank ke Dana', feeType: 'fixed', value: 500 },
      { id: 'qris', name: 'Qris', feeType: 'percentage', value: 0.01 },
    ],
  };
  const state = {
    home: { activeCategory: '', searchQuery: '' },
    preorder: {
      initialized: false,
      allData: [],
      currentPage: 1,
      perPage: 15,
      displayMode: 'detailed',
    },
    accounts: {
      initialized: false,
      allData: [],
      activeCategory: 'Semua Kategori',
    },
    carousell: {
      initialized: false,
      allData: [],
      searchQuery: '',
    }
  };
  let allCatalogData = [];
  let currentSelectedItem = null;
  let catalogFetchController;
  let preorderFetchController;
  let accountsFetchController;
  let modalFocusTrap = { listener: null, focusableEls: [], firstEl: null, lastEl: null };
  let elementToFocusOnModalClose = null;
  function getElement(id) {
    return document.getElementById(id);
  }
  const elements = {
    sidebar: {
      nav: getElement('sidebarNav'),
      overlay: getElement('sidebarOverlay'),
      burger: getElement('burgerBtn'),
    },
    navLinks: document.querySelectorAll('[data-mode]'),
    viewHome: getElement('viewHome'),
    viewPreorder: getElement('viewPreorder'),
    viewAccounts: getElement('viewAccounts'),
    viewPerpustakaan: getElement('viewPerpustakaan'),
    viewCarousell: getElement('viewCarousell'),
    home: {
      listContainer: getElement('homeListContainer'),
      countInfo: getElement('homeCountInfo'),
      errorContainer: getElement('homeErrorContainer'),
      customSelect: {
        wrapper: getElement('homeCustomSelectWrapper'),
        btn: getElement('homeCustomSelectBtn'),
        value: getElement('homeCustomSelectValue'),
        options: getElement('homeCustomSelectOptions'),
      },
    },
    headerSearch: {
      container: getElement('headerSearchContainer'),
      btn: getElement('headerSearchBtn'),
      input: getElement('headerSearchInput')
    },
    itemTemplate: getElement('itemTemplate'),
    skeletonItemTemplate: getElement('skeletonItemTemplate'),
    skeletonCardTemplate: getElement('skeletonCardTemplate'),
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
    carousell: {
      gridContainer: getElement('carousellGridContainer'),
      error: getElement('carousellError'),
    }
  };
  function formatToIdr(value) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value); }
  function getSheetUrl(sheetName, format = 'json') { const baseUrl = `https://docs.google.com/spreadsheets/d/${config.sheetId}/gviz/tq`; const encodedSheetName = encodeURIComponent(sheetName); return format === 'csv' ? `${baseUrl}?tqx=out:csv&sheet=${encodedSheetName}` : `${baseUrl}?sheet=${encodedSheetName}&tqx=out:json`; }
  function showSkeleton(container, template, count = 6) { container.innerHTML = ''; const fragment = document.createDocumentFragment(); for (let i = 0; i < count; i++) { fragment.appendChild(template.content.cloneNode(true)); } container.appendChild(fragment); }
  function toggleCustomSelect(wrapper, forceOpen) { const btn = wrapper.querySelector('.custom-select-btn'); const isOpen = typeof forceOpen === 'boolean' ? forceOpen : !wrapper.classList.contains('open'); wrapper.classList.toggle('open', isOpen); btn.setAttribute('aria-expanded', isOpen); }
  function robustCsvParser(text) { const normalizedText = text.trim().replace(/\r\n/g, '\n'); const rows = []; let currentRow = []; let currentField = ''; let inQuotedField = false; for (let i = 0; i < normalizedText.length; i++) { const char = normalizedText[i]; if (inQuotedField) { if (char === '"') { if (i + 1 < normalizedText.length && normalizedText[i + 1] === '"') { currentField += '"'; i++; } else { inQuotedField = false; } } else { currentField += char; } } else { if (char === '"') { inQuotedField = true; } else if (char === ',') { currentRow.push(currentField); currentField = ''; } else if (char === '\n') { currentRow.push(currentField); rows.push(currentRow); currentRow = []; currentField = ''; } else { currentField += char; } } } currentRow.push(currentField); rows.push(currentRow); return rows; }
  function initializeCarousels(container) {
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
        nextBtn.addEventListener('click', (e) => { 
          e.stopPropagation(); 
          if (currentIndex < imageCount - 1) { 
            currentIndex++; 
            update(); 
          } 
        });
        prevBtn.addEventListener('click', (e) => { 
          e.stopPropagation(); 
          if (currentIndex > 0) { 
            currentIndex--; 
            update(); 
          } 
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
        if (trimmedLine === '') {
            return '<br>';
        } else if (trimmedLine.endsWith(':')) {
            return `<p class="spec-title">${trimmedLine.slice(0, -1)}</p>`;
        } else if (trimmedLine.startsWith('›')) {
            return `<p class="spec-item spec-item-arrow">${trimmedLine.substring(1).trim()}</p>`;
        } else if (trimmedLine.startsWith('-')) {
            return `<p class="spec-item spec-item-dash">${trimmedLine.substring(1).trim()}</p>`;
        } else if (trimmedLine.startsWith('#')) {
            return `<p class="spec-hashtag">${trimmedLine}</p>`;
        } else {
            return `<p class="spec-paragraph">${trimmedLine}</p>`;
        }
    }).join('');
  }
  function initializeApp() {
    elements.sidebar.burger?.addEventListener('click', () => toggleSidebar());
    elements.sidebar.overlay?.addEventListener('click', () => toggleSidebar(false));
    elements.navLinks.forEach(link => {
      link.addEventListener('click', e => {
        if (link.dataset.mode) {
          e.preventDefault();
          setMode(link.dataset.mode);
        }
      });
    });
    [elements.home.customSelect, elements.preorder.customSelect, elements.preorder.customStatusSelect, elements.accounts.customSelect]
      .filter(select => select && select.btn)
      .forEach(select => select.btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCustomSelect(select.wrapper);
      }));
    let homeDebounce;
    elements.headerSearch.input.addEventListener('input', e => {
      clearTimeout(homeDebounce);
      homeDebounce = setTimeout(() => { state.home.searchQuery = e.target.value.trim(); renderHomeList(); }, 200);
    });
    elements.headerSearch.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (document.body.classList.contains('sidebar-open')) toggleSidebar(false);
      elements.headerSearch.container.classList.toggle('active');
      if (elements.headerSearch.container.classList.contains('active')) elements.headerSearch.input.focus();
    });
    elements.paymentModal.closeBtn.addEventListener('click', closePaymentModal);
    elements.paymentModal.modal.addEventListener('click', e => { if (e.target === elements.paymentModal.modal) closePaymentModal(); });
    document.addEventListener('click', (e) => {
      [elements.home.customSelect.wrapper, elements.preorder.customSelect.wrapper, elements.preorder.customStatusSelect.wrapper, elements.accounts.customSelect.wrapper]
        .filter(wrapper => wrapper)
        .forEach(wrapper => toggleCustomSelect(wrapper, false));
      if (!elements.headerSearch.container.contains(e.target)) {
        elements.headerSearch.container.classList.remove('active');
      }
    });
    loadCatalog();
    window.addEventListener('popstate', (event) => {
        const mode = (window.location.pathname.substring(1).toLowerCase() || 'home');
        if (event.state || mode) setMode(mode, true);
    });
    const validModes = ['home', 'preorder', 'accounts', 'perpustakaan', 'carousell'];
    const initialMode = window.location.pathname.substring(1).toLowerCase() || 'home';
    setMode(validModes.includes(initialMode) ? initialMode : 'home', true);
  }
  function toggleSidebar(forceOpen) {
    const isOpen = typeof forceOpen === 'boolean' ? forceOpen : !document.body.classList.contains('sidebar-open');
    document.body.classList.toggle('sidebar-open', isOpen);
    elements.sidebar.burger.classList.toggle('active', isOpen);
    document.documentElement.style.overflow = isOpen ? "hidden" : "";
    document.body.style.overflow = isOpen ? "hidden" : "";
  }
  let setMode = function(nextMode, fromPopState = false) {
    if (nextMode === 'donasi') {
      window.open('https://saweria.co/playpal', '_blank', 'noopener');
      return;
    }
    const viewMap = { home: elements.viewHome, preorder: elements.viewPreorder, accounts: elements.viewAccounts, perpustakaan: elements.viewPerpustakaan, carousell: elements.viewCarousell };
    const nextView = viewMap[nextMode];
    if (!nextView) return;
    elements.headerSearch.container.classList.toggle('hidden', nextMode !== 'home');
    if(nextMode !== 'home') elements.headerSearch.container.classList.remove('active');
    const testimonialSection = document.getElementById('testimonialSection');
    if (testimonialSection) {
      testimonialSection.style.display = nextMode === 'home' ? 'block' : 'none';
    }
    const pageName = nextMode.charAt(0).toUpperCase() + nextMode.slice(1);
    if (!fromPopState) {
        const search = window.location.search;
        const path = nextMode === 'home' ? `/${search}` : `/${nextMode}${search}`;
        history.pushState({ mode: nextMode }, `PlayPal.ID - ${pageName}`, path);
    }
    document.title = `PlayPal.ID - ${pageName}`;
    document.querySelector('.view-section.active')?.classList.remove('active');
    nextView.classList.add('active');
    elements.navLinks.forEach(link => {
        const isActive = link.dataset.mode === nextMode;
        link.classList.toggle('active', isActive);
        isActive ? link.setAttribute('aria-current', 'page') : link.removeAttribute('aria-current');
    });
    if (window.innerWidth < 769) toggleSidebar(false);
    window.scrollTo({ top: 0, behavior: fromPopState ? 'auto' : 'smooth' });
    if (nextMode === 'preorder' && !state.preorder.initialized) initializePreorder();
    if (nextMode === 'accounts' && !state.accounts.initialized) initializeAccounts();
    if (nextMode === 'perpustakaan' && !getElement('libraryGridContainer').innerHTML.trim()) initializeLibrary();
    if (nextMode === 'carousell' && !state.carousell.initialized) initializeCarousell();
  }
  function parseGvizPairs(jsonText) { const match = jsonText.match(/\{.*\}/s); if (!match) throw new Error('Invalid GViz response.'); const obj = JSON.parse(match[0]); const { rows = [], cols = [] } = obj.table || {}; const pairs = Array.from({ length: Math.floor(cols.length / 2) }, (_, i) => ({ iTitle: i * 2, iPrice: i * 2 + 1, label: cols[i * 2]?.label || '', })).filter(p => p.label && cols[p.iPrice]); const out = []; for (const r of rows) { const c = r.c || []; for (const p of pairs) { const title = String(c[p.iTitle]?.v || '').trim(); const priceRaw = c[p.iPrice]?.v; const price = priceRaw != null && priceRaw !== '' ? Number(priceRaw) : NaN; if (title && !isNaN(price)) { out.push({ catKey: p.label, catLabel: String(p.label || '').trim().replace(/\s+/g, ' '), title, price, }); } } } return out; }
  function buildHomeCategorySelect(catalogData) {
    const { options, value } = elements.home.customSelect;
    const categoryMap = new Map();
    catalogData.forEach(item => { if (!categoryMap.has(item.catKey)) categoryMap.set(item.catKey, item.catLabel); });
    const categories = [...categoryMap].map(([key, label]) => ({ key, label }));
    options.innerHTML = '';
    const activeCategoryKey = state.home.activeCategory || (categories[0]?.key || '');
    const activeCategory = categories.find(c => c.key === activeCategoryKey) || categories[0];
    if (activeCategory) { state.home.activeCategory = activeCategory.key; value.textContent = activeCategory.label; } 
    else { value.textContent = 'Data tidak tersedia'; }
    categories.forEach(cat => {
      const el = document.createElement('div');
      el.className = 'custom-select-option';
      el.textContent = cat.label;
      el.dataset.value = cat.key;
      el.setAttribute('role', 'option');
      if (cat.key === state.home.activeCategory) el.classList.add('selected');
      el.addEventListener('click', () => {
        state.home.activeCategory = cat.key;
        value.textContent = cat.label;
        options.querySelector('.selected')?.classList.remove('selected');
        el.classList.add('selected');
        toggleCustomSelect(elements.home.customSelect.wrapper, false);
        const url = new URL(window.location);
        url.searchParams.set('kategori', cat.label.toLowerCase().replace(/ /g, '-').replace(/[+&]/g, ''));
        history.pushState({ activeCategory: cat.key }, '', url);
        renderHomeList();
      });
      options.appendChild(el);
    });
  }
  function renderList(container, countInfoEl, items, emptyText) { container.innerHTML = ''; if (items.length === 0) { container.innerHTML = `<div class="empty"><div class="empty-content"><svg xmlns="http://www.w3.org/2000/svg" class="empty-icon" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg><p>${emptyText}</p></div></div>`; countInfoEl.textContent = ''; return; } const fragment = document.createDocumentFragment(); for (const item of items) { const clone = elements.itemTemplate.content.cloneNode(true); const buttonEl = clone.querySelector('.list-item'); buttonEl.querySelector('.title').textContent = item.title; buttonEl.querySelector('.price').textContent = formatToIdr(item.price); buttonEl.addEventListener('click', () => openPaymentModal(item)); fragment.appendChild(clone); } container.appendChild(fragment); countInfoEl.textContent = `${items.length} item ditemukan`; }
  function renderHomeList() { const { activeCategory, searchQuery } = state.home; const query = searchQuery.toLowerCase(); const items = allCatalogData.filter(x => x.catKey === activeCategory && (query === '' || x.title.toLowerCase().includes(query) || String(x.price).includes(query))); renderList(elements.home.listContainer, elements.home.countInfo, items, 'Tidak ada item ditemukan.'); }
  async function loadCatalog() { 
    if (catalogFetchController) catalogFetchController.abort();
    catalogFetchController = new AbortController();
    try { 
      elements.home.errorContainer.style.display = 'none'; 
      showSkeleton(elements.home.listContainer, elements.skeletonItemTemplate, 6); 
      const res = await fetch(getSheetUrl(config.sheets.katalog.name), { signal: catalogFetchController.signal }); 
      if (!res.ok) throw new Error(`Network error: ${res.statusText}`); 
      const text = await res.text(); 
      allCatalogData = parseGvizPairs(text); 
      if (allCatalogData.length === 0) throw new Error('Data is empty or format is incorrect.'); 
      const params = new URLSearchParams(window.location.search);
      const categoryFromUrl = params.get('kategori');
      if (categoryFromUrl && (window.location.pathname === '/' || window.location.pathname.endsWith('/index.html'))) {
          const urlToCatKeyMap = new Map();
          allCatalogData.forEach(item => {
              const urlFriendlyLabel = item.catLabel.toLowerCase().replace(/ /g, '-').replace(/[+&]/g, '');
              if (!urlToCatKeyMap.has(urlFriendlyLabel)) urlToCatKeyMap.set(urlFriendlyLabel, item.catKey);
          });
          const foundKey = urlToCatKeyMap.get(categoryFromUrl);
          if (foundKey) state.home.activeCategory = foundKey;
      }
      buildHomeCategorySelect(allCatalogData); 
      renderHomeList(); 
    } catch (err) { 
      if (err.name === 'AbortError') return;
      console.error('Failed to load catalog:', err); 
      const view = elements.home;
      view.listContainer.innerHTML = ''; 
      view.errorContainer.style.display = 'block'; 
      view.errorContainer.textContent = 'Oops, terjadi kesalahan. Silakan coba lagi nanti.';
    } 
  }
  function calculateFee(price, option) { if (option.feeType === 'fixed') return option.value; if (option.feeType === 'percentage') return Math.ceil(price * option.value); return 0; }
  function updatePriceDetails() { const selectedOptionId = document.querySelector('input[name="payment"]:checked')?.value; if (!selectedOptionId) return; const selectedOption = config.paymentOptions.find(opt => opt.id === selectedOptionId); if (!currentSelectedItem || !selectedOption) return; const price = currentSelectedItem.price; const fee = calculateFee(price, selectedOption); const total = price + fee; elements.paymentModal.fee.textContent = formatToIdr(fee); elements.paymentModal.total.textContent = formatToIdr(total); updateWaLink(selectedOption, fee, total); }
  function updateWaLink(option, fee, total) { const { catLabel = "Produk", title, price } = currentSelectedItem; const text = [ config.waGreeting, `› Tipe: ${catLabel}`, `› Item: ${title}`, `› Pembayaran: ${option.name}`, `› Harga: ${formatToIdr(price)}`, `› Fee: ${formatToIdr(fee)}`, `› Total: ${formatToIdr(total)}`, ].join('\n'); elements.paymentModal.waBtn.href = `https://wa.me/${config.waNumber}?text=${encodeURIComponent(text)}`; }
  function openPaymentModal(item) {
    document.documentElement.style.overflow = "hidden"; document.body.style.overflow = "hidden";
    elementToFocusOnModalClose = document.activeElement;
    currentSelectedItem = item;
    const { modal, itemName, itemPrice, optionsContainer } = elements.paymentModal;
    itemName.textContent = item.title;
    itemPrice.textContent = formatToIdr(item.price);
    optionsContainer.innerHTML = '';
    config.paymentOptions.forEach((option, index) => {
      const fee = calculateFee(item.price, option);
      optionsContainer.insertAdjacentHTML('beforeend', ` <div class="payment-option"> <input type="radio" id="${option.id}" name="payment" value="${option.id}" ${index === 0 ? 'checked' : ''}> <label for="${option.id}"> ${option.name} <span style="float: right;">+ ${formatToIdr(fee)}</span> </label> </div>`);
    });
    optionsContainer.querySelectorAll('input[name="payment"]').forEach(input => input.addEventListener('change', updatePriceDetails));
    updatePriceDetails();
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('visible'), 10);
    const focusableEls = modal.querySelectorAll('a[href]:not([disabled]), button:not([disabled]), input[type="radio"]:not([disabled])');
    modalFocusTrap.focusableEls = Array.from(focusableEls);
    modalFocusTrap.firstEl = modalFocusTrap.focusableEls[0];
    modalFocusTrap.lastEl = modalFocusTrap.focusableEls[modalFocusTrap.focusableEls.length - 1];
    modalFocusTrap.listener = function(e) { if (e.key !== 'Tab') return; if (e.shiftKey) { if (document.activeElement === modalFocusTrap.firstEl) { modalFocusTrap.lastEl.focus(); e.preventDefault(); } } else { if (document.activeElement === modalFocusTrap.lastEl) { modalFocusTrap.firstEl.focus(); e.preventDefault(); } } };
    modal.addEventListener('keydown', modalFocusTrap.listener);
    setTimeout(() => modalFocusTrap.firstEl?.focus(), 100);
  }
  function closePaymentModal() {
    document.documentElement.style.overflow = ""; document.body.style.overflow = "";
    const { modal } = elements.paymentModal;
    modal.classList.remove('visible');
    if (modalFocusTrap.listener) modal.removeEventListener('keydown', modalFocusTrap.listener);
    setTimeout(() => {
      modal.style.display = 'none';
      currentSelectedItem = null;
      elementToFocusOnModalClose?.focus();
    }, 200);
  }
  function normalizeStatus(rawStatus) { const s = String(rawStatus || '').trim().toLowerCase(); if (['success', 'selesai', 'berhasil', 'done'].includes(s)) return 'success'; if (['progress', 'proses', 'diproses', 'processing'].includes(s)) return 'progress'; if (['failed', 'gagal', 'dibatalkan', 'cancel', 'error'].includes(s)) return 'failed'; return 'pending'; }
  function filterPreorderData() { const query = elements.preorder.searchInput.value.trim().toLowerCase(); const statusFilter = elements.preorder.statusSelect.value; const mode = state.preorder.displayMode; return state.preorder.allData.filter(item => { const status = normalizeStatus(item[mode === 'detailed' ? 6 : 2]); if (statusFilter !== 'all' && status !== statusFilter) return false; if (mode === 'detailed') return [item[3], item[5], item[7]].some(val => (val || '').toLowerCase().includes(query)); return [item[0], item[1]].some(val => (val || '').toLowerCase().includes(query)); }); }
  function updatePreorderPagination(currentPage, totalPages) { elements.preorder.prevBtn.disabled = currentPage <= 1; elements.preorder.nextBtn.disabled = currentPage >= totalPages; elements.preorder.pageInfo.textContent = totalPages > 0 ? `Hal ${currentPage} dari ${totalPages}` : ''; }
  function renderPreorderCards() {
    const filtered = filterPreorderData();
    const { perPage } = state.preorder;
    const { listContainer, total } = elements.preorder;
    total.textContent = `${state.preorder.allData.length} total pesanan${filtered.length !== state.preorder.allData.length ? `, ${filtered.length} ditemukan` : ''}`;
    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    state.preorder.currentPage = Math.min(Math.max(1, state.preorder.currentPage), totalPages);
    const start = (state.preorder.currentPage - 1) * perPage;
    const pageData = filtered.slice(start, start + perPage);
    listContainer.innerHTML = '';
    if (pageData.length === 0) { listContainer.innerHTML = `<div class="empty"><div class="empty-content"><svg xmlns="http://www.w3.org/2000/svg" class="empty-icon" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg><p>Tidak Ada Hasil Ditemukan</p></div></div>`; updatePreorderPagination(0, 0); return; }
    const fragment = document.createDocumentFragment();
    pageData.forEach(item => {
      const card = document.createElement('article');
      if (state.preorder.displayMode === 'detailed') {
        const [tglOrder, estPengiriman, , product, bulan, name, statusRaw] = item;
        const status = normalizeStatus(statusRaw);
        const details = [{ label: 'TGL ORDER', value: tglOrder }, { label: 'BULAN', value: bulan }];
        const detailsHtml = details.filter(d => d.value && String(d.value).trim()).map(d => `<div class="detail-item"><div class="detail-label">${d.label}</div><div class="detail-value">${d.value}</div></div>`).join('');
        card.className = `card ${detailsHtml ? 'clickable' : ''}`;
        card.innerHTML = `<div class="card-header"><div><div class="card-name">${name || 'Tanpa Nama'}</div><div class="card-product">${product || 'N/A'}</div></div><div class="status-badge-wrapper"><div class="status-badge ${status}">${(statusRaw || 'Pending').toUpperCase()}</div>${detailsHtml ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="expand-indicator"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" /></svg>` : ''}</div></div>${estPengiriman ? `<div class="card-date">Estimasi Pengiriman: ${estPengiriman} 20:00 WIB</div>` : ''}${detailsHtml ? `<div class="card-details"><div class="details-grid">${detailsHtml}</div></div>` : ''}`;
        if (detailsHtml) card.addEventListener('click', () => card.classList.toggle('expanded'));
      } else {
        const [orderNum, product, statusRaw] = item;
        const status = normalizeStatus(statusRaw);
        card.className = 'card';
        card.innerHTML = `<div class="card-header"><div><div class="card-name">${orderNum || 'Tanpa Nomor'}</div><div class="card-product">${product || 'N/A'}</div></div><div class="status-badge ${status}">${(statusRaw || 'Pending').toUpperCase()}</div></div>`;
      }
      fragment.appendChild(card);
    });
    listContainer.appendChild(fragment);
    updatePreorderPagination(state.preorder.currentPage, totalPages);
  }
  async function fetchPreorderData(sheetName) { 
    if (preorderFetchController) preorderFetchController.abort();
    preorderFetchController = new AbortController();
    elements.preorder.total.textContent = 'Memuat data...'; 
    showSkeleton(elements.preorder.listContainer, elements.skeletonCardTemplate, 5); 
    state.preorder.displayMode = sheetName === config.sheets.preorder.name1 ? 'detailed' : 'simple'; 
    try { 
      const res = await fetch(getSheetUrl(sheetName, 'csv'), { signal: preorderFetchController.signal }); 
      if (!res.ok) throw new Error(`Network error: ${res.statusText}`); 
      const text = await res.text(); 
      let rows = robustCsvParser(text);
      rows.shift();
      const statusOrder = { progress: 1, pending: 2, success: 3, failed: 4 };
      const statusIndex = state.preorder.displayMode === 'detailed' ? 6 : 2;
      state.preorder.allData = rows.filter(row => row && (row[0] || '').trim()).sort((a, b) => statusOrder[normalizeStatus(a[statusIndex])] - statusOrder[normalizeStatus(b[statusIndex])]);
    } catch (e) { 
      if (e.name === 'AbortError') return;
      state.preorder.allData = []; 
      elements.preorder.total.textContent = 'Gagal memuat data.'; 
      console.error('Fetch Pre-Order failed:', e); 
    } finally { 
      state.preorder.currentPage = 1; 
      renderPreorderCards(); 
    } 
  }
  function initializePreorder() {
    if (state.preorder.initialized) return;
    const { searchInput, customSelect, prevBtn, nextBtn, customStatusSelect } = elements.preorder;
    const rebound = () => { state.preorder.currentPage = 1; renderPreorderCards(); };
    searchInput.addEventListener('input', rebound);
    customSelect.options.querySelectorAll('.custom-select-option').forEach(option => {
      option.addEventListener('click', e => {
        customSelect.value.textContent = e.target.textContent;
        customSelect.options.querySelector('.selected')?.classList.remove('selected');
        e.target.classList.add('selected');
        fetchPreorderData(e.target.dataset.value === '0' ? config.sheets.preorder.name1 : config.sheets.preorder.name2);
        toggleCustomSelect(customSelect.wrapper, false);
      });
    });
    customStatusSelect.options.querySelectorAll('.custom-select-option').forEach(option => {
      option.addEventListener('click', e => {
        customStatusSelect.value.textContent = e.target.textContent;
        customStatusSelect.options.querySelector('.selected')?.classList.remove('selected');
        e.target.classList.add('selected');
        elements.preorder.statusSelect.value = e.target.dataset.value;
        toggleCustomSelect(customStatusSelect.wrapper, false);
        rebound();
      });
    });
    prevBtn.addEventListener('click', () => { if (state.preorder.currentPage > 1) { state.preorder.currentPage--; renderPreorderCards(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
    nextBtn.addEventListener('click', () => { state.preorder.currentPage++; renderPreorderCards(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    fetchPreorderData(config.sheets.preorder.name1);
    state.preorder.initialized = true;
  }
  function populateAccountCategorySelect() {
    const { customSelect } = elements.accounts;
    const { options, value } = customSelect;
    const categories = ['Semua Kategori', 'Mobile Legends', 'Free Fire', 'Roblox', 'PUBG Mobile', 'Clash Of Clans', 'Lainnya'];
    options.innerHTML = '';
    value.textContent = state.accounts.activeCategory;
    categories.forEach((cat) => {
      const el = document.createElement('div');
      el.className = 'custom-select-option';
      el.textContent = cat;
      el.dataset.value = cat;
      if (cat === state.accounts.activeCategory) el.classList.add('selected');
      el.addEventListener('click', () => {
        value.textContent = cat;
        document.querySelector('#accountCustomSelectOptions .custom-select-option.selected')?.classList.remove('selected');
        el.classList.add('selected');
        toggleCustomSelect(customSelect.wrapper, false);
        state.accounts.activeCategory = cat;
        renderAccountCards();
      });
      options.appendChild(el);
    });
  }
  async function parseAccountsSheet(text) {
    const rows = robustCsvParser(text);
    rows.shift();
    return rows.filter(row => row && row.length >= 5 && row[0]).map(row => ({
      id: `acc_${Date.now()}_${Math.random()}`,
      title: `${row[0] || 'Akun'} (${formatToIdr(Number(row[1]) || 0)})`,
      category: row[0] || 'Lainnya',
      price: Number(row[1]) || 0,
      status: row[2] || 'Tersedia',
      description: row[3] || 'Tidak ada deskripsi.',
      images: (row[4] || '').split(',').map(url => url.trim()).filter(Boolean),
    }));
  }
  function renderAccountCards() {
    const { cardGrid, cardTemplate, empty } = elements.accounts;
    const filteredAccounts = state.accounts.allData.filter(acc => state.accounts.activeCategory === 'Semua Kategori' || acc.category === state.accounts.activeCategory);
    cardGrid.innerHTML = '';
    empty.style.display = filteredAccounts.length === 0 ? 'flex' : 'none';
    if (filteredAccounts.length === 0) return;
    const fragment = document.createDocumentFragment();
    filteredAccounts.forEach(account => {
      const cardClone = cardTemplate.content.cloneNode(true);
      const cardElement = cardClone.querySelector('.account-card');
      const carouselWrapper = cardElement.querySelector('.account-card-carousel-wrapper');
      if (account.images.length > 0) {
        const carouselContainer = document.createElement('div');
        carouselContainer.className = 'carousel-container';
        const slides = account.images.map(src => `<div class="carousel-slide"><img src="${src}" alt="Gambar detail untuk ${account.category}" loading="lazy"></div>`).join('');
        const indicators = account.images.map((_, i) => `<button class="indicator-dot" data-index="${i}"></button>`).join('');
        carouselContainer.innerHTML = `<div class="carousel-track">${slides}</div>${account.images.length > 1 ? `<button class="carousel-btn prev" type="button" aria-label="Gambar sebelumnya" disabled><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg></button><button class="carousel-btn next" type="button" aria-label="Gambar selanjutnya"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg></button><div class="carousel-indicators">${indicators}</div>` : ''}`;
        carouselWrapper.appendChild(carouselContainer);
      }
      cardElement.querySelector('h3').textContent = formatToIdr(account.price);
      const statusBadge = cardElement.querySelector('.account-status-badge');
      statusBadge.textContent = account.status;
      statusBadge.className = `account-status-badge ${account.status.toLowerCase() === 'tersedia' ? 'available' : 'sold'}`;
      const specsContainer = cardElement.querySelector('.account-card-specs');
      const specsList = document.createElement('ul');
      specsList.className = 'specs-list';
      account.description.split('\n').forEach(spec => {
        const trimmedSpec = spec.trim();
        if (trimmedSpec === '') { specsList.innerHTML += `<li class="spec-divider"></li>`; }
        else { const isTitle = ['Spesifikasi Akun', 'Pengaturan Akun', 'Kontak Penjual'].some(title => trimmedSpec.startsWith(title)); specsList.innerHTML += `<li class="${isTitle ? 'spec-title' : 'spec-item'}">${trimmedSpec}</li>`; }
      });
      specsContainer.appendChild(specsList);
      cardElement.querySelector('.action-btn.buy').addEventListener('click', () => openPaymentModal({ title: account.title, price: account.price, catLabel: 'Akun Game' }));
      cardElement.querySelector('.action-btn.offer').addEventListener('click', () => window.open(`https://wa.me/${config.waNumber}?text=${encodeURIComponent(`Halo, saya tertarik untuk menawar Akun Game: ${account.category} (${formatToIdr(account.price)})`)}`, '_blank', 'noopener'));
      setupExpandableCard(cardElement, '.account-card-main-info');
      fragment.appendChild(cardElement);
    });
    cardGrid.appendChild(fragment);
    initializeCarousels(cardGrid);
  }
  async function initializeAccounts() { 
    if (state.accounts.initialized) return;
    state.accounts.initialized = true;
    const { cardGrid, error, empty } = elements.accounts; 
    error.style.display = 'none'; empty.style.display = 'none';
    cardGrid.innerHTML = '';
    try { 
      const res = await fetch(getSheetUrl(config.sheets.accounts.name, 'csv')); 
      if (!res.ok) throw new Error(`Network error: ${res.statusText}`); 
      state.accounts.allData = await parseAccountsSheet(await res.text()); 
      populateAccountCategorySelect();
      renderAccountCards();
    } catch (err) { 
      if (err.name === 'AbortError') return;
      console.error('Fetch Accounts failed:', err); 
      error.textContent = 'Gagal memuat data akun. Coba lagi nanti.'; 
      error.style.display = 'block'; 
    } 
  }
  async function initializeLibrary() {
    const container = getElement('libraryGridContainer');
    const errorEl = getElement('libraryError');
    container.innerHTML = ''; errorEl.style.display = 'none';
    try {
      const res = await fetch(getSheetUrl('Sheet6', 'csv'));
      if (!res.ok) throw new Error(`Network error: ${res.statusText}`);
      const rows = robustCsvParser(await res.text());
      rows.shift(); 
      const books = rows.filter(r => r && r[0]).map(r => ({ title: r[0], coverUrl: r[1], bookUrl: r[2] }));
      if (!books || books.length === 0) { container.innerHTML = '<div class="empty">Belum ada buku yang ditambahkan.</div>'; return; }
      const fragment = document.createDocumentFragment();
      books.forEach(book => {
        const card = document.createElement('a');
        card.className = 'book-card';
        card.href = book.bookUrl;
        card.target = '_blank';
        card.rel = 'noopener';
        card.innerHTML = `<img src="${book.coverUrl}" alt="${book.title}" class="cover" decoding="async" loading="lazy"><div class="overlay"></div><div class="title">${book.title}</div>`;
        fragment.appendChild(card);
      });
      container.appendChild(fragment);
    } catch (err) {
      console.error('Failed to load library:', err);
      errorEl.textContent = 'Gagal memuat perpustakaan. Coba lagi nanti.';
      errorEl.style.display = 'block';
    }
  }
  async function initializeCarousell() {
    if (state.carousell.initialized) return;
    const { gridContainer, error } = elements.carousell;
    gridContainer.innerHTML = ''; 
    error.style.display = 'none';
    elements.carousell.searchInput = getElement('carousellSearchInput');
    elements.carousell.total = getElement('carousellTotal');
    let searchDebounce;
    elements.carousell.searchInput.addEventListener('input', (e) => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            state.carousell.searchQuery = e.target.value.trim();
            renderCarousellGrid(state.carousell.allData);
        }, 200);
    });
    try {
        const res = await fetch(getSheetUrl(config.sheets.affiliate.name, 'csv'));
        if (!res.ok) throw new Error(`Network error: ${res.statusText}`);
        const rows = robustCsvParser(await res.text());
        rows.shift();
        const products = rows.filter(r => r && r[0] && r[3]).map(r => ({
            name: r[0],
            price: Number(r[1]) || 0,
            images: (r[2] || '').split(',').map(url => url.trim()).filter(Boolean),
            linkUrl: r[3],
            description: r[4] || 'Klik untuk melihat detail produk.',
            platform: r[5] || '',
            productNumber: r[6] || ''
        }));
        state.carousell.allData = products;
        renderCarousellGrid(products);
    } catch (err) {
        console.error('Failed to load Carousell products:', err);
        error.textContent = 'Gagal memuat produk Carousell. Coba lagi nanti.';
        error.style.display = 'block';
    } finally {
        state.carousell.initialized = true;
    }
  }
  function renderCarousellGrid(products) {
      const container = elements.carousell.gridContainer;
      const totalEl = elements.carousell.total;
      const query = state.carousell.searchQuery || '';
      const filteredProducts = query 
          ? products.filter(p => p.productNumber.includes(query))
          : products;
      if (products.length > 0) {
        totalEl.textContent = `${products.length} total produk${query ? `, ${filteredProducts.length} ditemukan` : ''}`;
        totalEl.style.display = 'block';
      } else {
        totalEl.style.display = 'none';
      }
      if (!filteredProducts || filteredProducts.length === 0) { 
          container.innerHTML = '<div class="empty">Belum ada produk di Carousell.</div>'; 
          return; 
      }
      container.innerHTML = '';
      const fragment = document.createDocumentFragment();
      filteredProducts.forEach(product => {
          const card = document.createElement('div');
          card.className = 'affiliate-card';
          let imagesHTML = '';
          if (product.images.length > 0) {
            const slides = product.images.map(src => `<div class="carousel-slide"><img src="${src}" alt="Gambar produk ${product.name}" loading="lazy"></div>`).join('');
            const indicators = product.images.map((_, i) => `<button class="indicator-dot" data-index="${i}"></button>`).join('');
            imagesHTML = `<div class="carousel-container"><div class="carousel-track">${slides}</div>${product.images.length > 1 ? `<button class="carousel-btn prev" type="button" aria-label="Gambar sebelumnya" disabled><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg></button><button class="carousel-btn next" type="button" aria-label="Gambar selanjutnya"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg></button><div class="carousel-indicators">${indicators}</div>` : ''}</div>`;
          } else {
            imagesHTML = `<div class="affiliate-card-img-container"></div>`;
          }
          const platformHTML = product.platform ? `<p class="affiliate-card-platform">${product.platform}</p>` : '';
          const formattedProductNumber = product.productNumber ? String(product.productNumber).padStart(3, '0') : '';
          const productNumberHTML = formattedProductNumber ? `<span class="affiliate-card-number">#${formattedProductNumber}</span>` : '';
          card.innerHTML = `
            ${productNumberHTML}
            ${imagesHTML}
            <div class="affiliate-card-body" role="button" tabindex="0">
                <div class="affiliate-card-main-info">
                  <h3 class="affiliate-card-title">${product.name}</h3>
                  <svg class="expand-indicator" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd"></path></svg>
                </div>
                ${platformHTML}
                <p class="affiliate-card-price">${formatToIdr(product.price)}</p>
                <div class="affiliate-card-details-wrapper">
                  <div class="affiliate-card-desc">${formatDescriptionToHTML(product.description)}</div>
                </div>
                <a href="${product.linkUrl}" target="_blank" rel="noopener" class="affiliate-card-button">Beli Sekarang</a>
            </div>
          `;
          setupExpandableCard(card, '.affiliate-card-body');
          fragment.appendChild(card);
      });
      container.appendChild(fragment);
      initializeCarousels(container);
  }
  function pp_makeNodes(list) {
    const frag = document.createDocumentFragment();
    list.forEach(({ name, url }) => {
      const li = document.createElement('li');
      li.className = 'testi-item';
      li.innerHTML = `<figure class="testi-fig"><img src="${url}" alt="Testimoni ${name.replace(/"/g,'&quot;')}" decoding="async" loading="lazy"></figure><figcaption class="testi-caption">— ${name.replace(/</g,'&lt;')}</figcaption>`;
      frag.appendChild(li);
    });
    return frag;
  }
  async function loadTestimonials() {
    const track = document.getElementById('testiTrack');
    const section = document.getElementById('testimonialSection');
    if (!track || !section) return;
    try {
      const res = await fetch(getSheetUrl('Sheet7', 'csv'));
      if (!res.ok) throw new Error('Network: ' + res.status);
      const csv = await res.text(); const rows = robustCsvParser(csv); if (!rows.length) { section.style.display = 'none'; return; }
      const items = rows.slice(1).filter(r => r && r[0] && r[1]).map(r => ({ name: String(r[0]).trim(), url: String(r[1]).trim() }));
      if (!items.length) { section.style.display = 'none'; return; }
      track.innerHTML = ''; track.appendChild(pp_makeNodes(items)); track.appendChild(pp_makeNodes(items));
    } catch (err) { console.error('Testimonials error:', err); if (section) section.style.display = 'none'; }
  }
  document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    loadTestimonials();
  });
})();
