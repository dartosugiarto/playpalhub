(function () {
  'use strict';

  // --- TAMBAHAN: LOGIKA DARK MODE ---
  const THEME_KEY = 'pp_theme';
  const docHtml = document.documentElement;
  
  function getPreferredTheme() {
    const storedTheme = localStorage.getItem(THEME_KEY);
    if (storedTheme) return storedTheme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  
  function setTheme(theme) {
    if (theme === 'dark') {
      docHtml.setAttribute('data-theme', 'dark');
    } else {
      docHtml.setAttribute('data-theme', 'light');
    }
    localStorage.setItem(THEME_KEY, theme);
  }
  
  function toggleTheme() {
    const currentTheme = docHtml.getAttribute('data-theme') || getPreferredTheme();
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  }
  
  // Terapkan tema sesegera mungkin untuk mencegah FOUC
  setTheme(getPreferredTheme());
  // --- AKHIR TAMBAHAN DARK MODE ---

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
      { id: 'shopeepay', name: 'ShopeePay', feeType: 'fixed', value: 0 },
      { id: 'gopay', name: 'Gopay', feeType: 'fixed', value: 0 },
      { id: 'dana', name: 'Dana', feeType: 'fixed', value: 125 },
      { id: 'bank_to_dana', name: 'Bank ke Dana', feeType: 'fixed', value: 500 },
      { id: 'qris', name: 'Qris', feeType: 'percentage', value: 0.01 },
    ],
  };
  
  const HOME_ITEM_LIMIT = 10; // Batas item per halaman

  const state = {
    home: { activeCategory: '', searchQuery: '', itemsToShow: HOME_ITEM_LIMIT }, // MODIFIKASI
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
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function getElement(id) {
    return document.getElementById(id);
  }
  const elements = {
    sidebar: {
      nav: getElement('sidebarNav'),
      overlay: getElement('sidebarOverlay'),
      burger: getElement('burgerBtn'),
    },
    themeToggle: getElement('themeToggleBtn'),
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
      searchInput: getElement('homeSearchInput'),
      customSelect: {
        wrapper: getElement('homeCustomSelectWrapper'),
        btn: getElement('homeCustomSelectBtn'),
        value: getElement('homeCustomSelectValue'),
        options: getElement('homeCustomSelectOptions'),
      },
      showMoreContainer: getElement('homeShowMoreContainer'), // BARU
      showMoreBtn: getElement('homeShowMoreBtn') // BARU
    },
    headerStatusIndicator: getElement('headerStatusIndicator'),
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

async function fetchSheetCached(sheetName, format = 'json'){
  const url = getSheetUrl(sheetName, format === 'csv' ? 'csv' : 'json');
  const key = `pp_cache_${sheetName}_${format}`;
  const cached = sessionStorage.getItem(key);
  if (cached) {
    // kick off background revalidate
    try { fetch(url).then(r => r.text()).then(t => sessionStorage.setItem(key, t)); } catch(e) {}
    return cached;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Network error: ${res.statusText}`);
  const text = await res.text();
  sessionStorage.setItem(key, text);
  return text;
}

  function showSkeleton(container, template, count = 6) { if (!container || !template) return; container.innerHTML = ''; const fragment = document.createDocumentFragment(); for (let i = 0; i < count; i++) { fragment.appendChild(template.content.cloneNode(true)); } container.appendChild(fragment); }
  function toggleCustomSelect(wrapper, forceOpen) { const btn = wrapper.querySelector('.custom-select-btn'); const isOpen = typeof forceOpen === 'boolean' ? forceOpen : !wrapper.classList.contains('open'); wrapper.classList.toggle('open', isOpen); btn.setAttribute('aria-expanded', isOpen); }

function enhanceCustomSelectKeyboard(wrapper){
  if (!wrapper) return;
  const options = wrapper.querySelector('.custom-select-options');
  const btn = wrapper.querySelector('.custom-select-btn');
  if (!options || !btn) return;
  options.setAttribute('role','listbox');
  options.addEventListener('keydown', (e)=>{
    const items = Array.from(options.querySelectorAll('.custom-select-option'));
    if (!items.length) return;
    let i = items.findIndex(o => o.classList.contains('highlight'));

    const move = (delta)=>{
      i = (i === -1 ? items.findIndex(o=>o.classList.contains('selected')) : i);
      if (i === -1) i = 0;
      i = (i + delta + items.length) % items.length;
      items.forEach(o=>o.classList.remove('highlight'));
      items[i].classList.add('highlight');
      items[i].scrollIntoView({ block: 'nearest' });
    };

    if (e.key === 'ArrowDown'){ e.preventDefault(); move(1); }
    if (e.key === 'ArrowUp'){ e.preventDefault(); move(-1); }
    if (e.key === 'Home'){ e.preventDefault(); move(-9999); }
    if (e.key === 'End'){ e.preventDefault(); move(9999); }
    if (e.key === 'Enter'){ e.preventDefault(); if (i>-1) items[i].click(); }
    if (e.key === 'Escape'){ e.preventDefault(); toggleCustomSelect(wrapper, false); btn.focus(); }
  });
}

  function robustCsvParser(text) { const normalizedText = text.trim().replace(/\r\n/g, '\n'); const rows = []; let currentRow = []; let currentField = ''; let inQuotedField = false; for (let i = 0; i < normalizedText.length; i++) { const char = normalizedText[i]; if (inQuotedField) { if (char === '"') { if (i + 1 < normalizedText.length && normalizedText[i + 1] === '"') { currentField += '"'; i++; } else { inQuotedField = false; } } else { currentField += char; } } else { if (char === '"') { inQuotedField = true; } else if (char === ',') { currentRow.push(currentField); currentField = ''; } else if (char === '\n') { currentRow.push(currentField); rows.push(currentRow); currentRow = []; currentField = ''; } else { currentField += char; } } } currentRow.push(currentField); rows.push(currentRow); return rows; }
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
        } else if (trimmedLine.startsWith('\u203A')) { // Menggunakan Unicode Escape
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
  function updateHeaderStatus() {
    const now = new Date();
    const options = { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false };
    const hour = parseInt(new Intl.DateTimeFormat('en-US', options).format(now), 10);
    const indicator = elements.headerStatusIndicator;
    if (indicator) {
      if (hour >= 8) {
        indicator.textContent = 'BUKA';
        indicator.className = 'status-badge success';
      } else {
        indicator.textContent = 'TUTUP';
        indicator.className = 'status-badge closed';
      }
    }
  }
  function initializeApp() {
    elements.sidebar.burger?.addEventListener('click', () => toggleSidebar());
    elements.sidebar.overlay?.addEventListener('click', () => toggleSidebar(false));
    elements.themeToggle?.addEventListener('click', toggleTheme);

    elements.navLinks.forEach(link => {
      link.addEventListener('click', e => {
        if (link.dataset.mode === 'donasi') {
          e.preventDefault();
          window.open('https://saweria.co/playpal', '_blank', 'noopener');
        }
      });
    });

    [elements.home.customSelect, elements.preorder.customSelect, elements.preorder.customStatusSelect, elements.accounts.customSelect]
      .filter(select => select && select.btn)
      .forEach(select => {
        select.btn.addEventListener('click', (e) => { e.stopPropagation(); toggleCustomSelect(select.wrapper); });
        enhanceCustomSelectKeyboard(select.wrapper);
      });
    
    if (elements.home.searchInput) {
      let homeDebounce;
      elements.home.searchInput.addEventListener('input', e => {
        clearTimeout(homeDebounce);
        homeDebounce = setTimeout(() => { 
          state.home.searchQuery = e.target.value.trim(); 
          state.home.itemsToShow = HOME_ITEM_LIMIT; // RESET saat mencari
          renderHomeList(); 
        }, 200);
      });
    }

    elements.paymentModal.closeBtn?.addEventListener('click', closePaymentModal);
    elements.paymentModal.modal?.addEventListener('click', e => { if (e.target === elements.paymentModal.modal) closePaymentModal(); });
    document.addEventListener('keydown', (e)=>{ if (e.key==='Escape'){ [elements.home.customSelect.wrapper, elements.preorder.customSelect.wrapper, elements.preorder.customStatusSelect.wrapper, elements.accounts.customSelect.wrapper].filter(Boolean).forEach(w=>toggleCustomSelect(w,false)); } });
    document.addEventListener('click', (e) => {
      [elements.home.customSelect.wrapper, elements.preorder.customSelect.wrapper, elements.preorder.customStatusSelect.wrapper, elements.accounts.customSelect.wrapper]
        .filter(wrapper => wrapper)
        .forEach(wrapper => toggleCustomSelect(wrapper, false));
    });

    // Inisialisasi berdasarkan halaman saat ini
    if (elements.viewHome) {
      loadCatalog();
      if (elements.home.showMoreBtn) { // Listener BARU untuk tombol
        elements.home.showMoreBtn.addEventListener('click', () => {
          state.home.itemsToShow += HOME_ITEM_LIMIT; // Tambah 10 item lagi
          renderHomeList(); // Render ulang
        });
      }
    }
    if (elements.viewPreorder) {
      initializePreorder();
    }
    if (elements.viewAccounts) {
      initializeAccounts();
    }
    if (elements.viewPerpustakaan) {
      if (getElement('libraryGridContainer') && !getElement('libraryGridContainer').innerHTML.trim()) {
        initializeLibrary();
      }
    }
    if (elements.viewCarousell) {
      initializeCarousell();
    }
    
    if (elements.headerStatusIndicator) {
      elements.headerStatusIndicator.style.display = 'inline-flex';
      updateHeaderStatus();
      setInterval(updateHeaderStatus, 60000);
    }
    const heroImg = document.querySelector('.home-banner-img');
    if (heroImg){ heroImg.setAttribute('decoding','async'); try{ heroImg.setAttribute('fetchpriority','high'); }catch(e){} }
  }
  function toggleSidebar(forceOpen) {
  const isOpen = typeof forceOpen === 'boolean' ? forceOpen : !document.body.classList.contains('sidebar-open');
  document.body.classList.toggle('sidebar-open', isOpen);
  elements.sidebar.burger.classList.toggle('active', isOpen);

  const body = document.body;
  if (isOpen) {
    const y = window.scrollY || window.pageYOffset || 0;
    body.dataset.ppLockY = String(y);
    body.style.position = 'fixed';
    body.style.top = `-${y}px`;
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
  function parseGvizPairs(jsonText) { const match = jsonText.match(/\{.*\}/s); if (!match) throw new Error('Invalid GViz response.'); const obj = JSON.parse(match[0]); const { rows = [], cols = [] } = obj.table || {}; const pairs = Array.from({ length: Math.floor(cols.length / 2) }, (_, i) => ({ iTitle: i * 2, iPrice: i * 2 + 1, label: cols[i * 2]?.label || '', })).filter(p => p.label && cols[p.iPrice]); const out = []; for (const r of rows) { const c = r.c || []; for (const p of pairs) { const title = String(c[p.iTitle]?.v || '').trim(); const priceRaw = c[p.iPrice]?.v; const price = priceRaw != null && priceRaw !== '' ? Number(priceRaw) : NaN; if (title && !isNaN(price)) { out.push({ catKey: p.label, catLabel: String(p.label || '').trim().replace(/\s+/g, ' '), title, price, }); } } } return out; }
  
  function buildHomeCategorySelect(catalogData) {
    if (!elements.home.customSelect.options) return;
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
        
        state.home.itemsToShow = HOME_ITEM_LIMIT; // RESET saat ganti kategori
        renderHomeList();
      });
      options.appendChild(el);
    });
  }

  // === FUNGSI renderHomeList() DI-UPDATE TOTAL ===
  function renderHomeList() { 
    if (!elements.home.listContainer) return; // Guard clause
    const { listContainer, countInfo, showMoreContainer, errorContainer } = elements.home;
    
    // Sembunyikan error & tombol "lihat lagi" sebelum render
    if(errorContainer) errorContainer.style.display = 'none';
    if (showMoreContainer) showMoreContainer.style.display = 'none';

    const { activeCategory, searchQuery, itemsToShow } = state.home;
    const query = searchQuery.toLowerCase();
    
    // 1. Ambil SEMUA item yang terfilter
    const allFilteredItems = allCatalogData.filter(x => 
      x.catKey === activeCategory && 
      (query === '' || x.title.toLowerCase().includes(query) || String(x.price).includes(query))
    );

    // 2. Ambil HANYA item yang perlu ditampilkan (sesuai batas)
    const itemsToDisplay = allFilteredItems.slice(0, itemsToShow);
    
    listContainer.innerHTML = ''; // Selalu bersihkan list sebelum render

    if (allFilteredItems.length === 0) {
      // Tampilkan pesan kosong
      listContainer.innerHTML = `<div class="empty"><div class="empty-content"><svg xmlns="http://www.w3.org/2000/svg" class="empty-icon" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg><p>Tidak ada item ditemukan.</p></div></div>`;
      if(countInfo) countInfo.textContent = '';
      return;
    }

    // 3. Render item yang perlu ditampilkan
    const fragment = document.createDocumentFragment();
    for (const item of itemsToDisplay) {
      const clone = elements.itemTemplate.content.cloneNode(true);
      const buttonEl = clone.querySelector('.list-item');
      buttonEl.querySelector('.title').textContent = item.title;
      buttonEl.querySelector('.price').textContent = formatToIdr(item.price);
      buttonEl.addEventListener('click', () => openPaymentModal(item));
      fragment.appendChild(clone);
    }
    listContainer.appendChild(fragment);

    // 4. Update info jumlah
    if(countInfo) countInfo.textContent = `${allFilteredItems.length} item ditemukan`;

    // 5. Tampilkan/sembunyikan tombol "Lihat Lebih Banyak"
    if (showMoreContainer) {
      if (allFilteredItems.length > itemsToDisplay.length) {
        // Jika item total > item yang ditampilkan, tunjukkan tombol
        showMoreContainer.style.display = 'block';
      } else {
        // Jika semua item sudah tampil, sembunyikan tombol
        showMoreContainer.style.display = 'none';
      }
    }
  }

  async function loadCatalog() {
    if (!elements.viewHome) return; // Guard clause
    if (catalogFetchController) catalogFetchController.abort();
    catalogFetchController = new AbortController();
    try {
      elements.home.errorContainer.style.display = 'none';
      showSkeleton(elements.home.listContainer, elements.skeletonItemTemplate, 6);
      const text = await fetchSheetCached(config.sheets.katalog.name, 'json');
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
      
      buildHomeCategorySelect(allCatalogData); // Ini akan memanggil renderHomeList() secara internal
      
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Failed to load catalog:', err);
      const view = elements.home;
      view.listContainer.innerHTML = '';
      if(view.errorContainer) {
        view.errorContainer.style.display = 'block';
        view.errorContainer.textContent = 'Oops, terjadi kesalahan. Silakan coba lagi nanti.';
      }
    }
  }
  
  function calculateFee(price, option) { if (option.feeType === 'fixed') return option.value; if (option.feeType === 'percentage') return Math.ceil(price * option.value); return 0; }

  function updatePriceDetails() {
    if (!elements.paymentModal.optionsContainer) return;
    const selectedOptionId = elements.paymentModal.optionsContainer
      .querySelector('input[name="payment"]:checked')?.value;
    if (!selectedOptionId) return;

    const selectedOption = config.paymentOptions.find(opt => opt.id === selectedOptionId);
    if (!currentSelectedItem || !selectedOption) return;

    const price = currentSelectedItem.price;
    const fee = calculateFee(price, selectedOption);
    const total = price + fee;

    elements.paymentModal.fee.textContent = formatToIdr(fee);
    elements.paymentModal.total.textContent = formatToIdr(total);

    updateWaLink(selectedOption, fee, total);
  }

  function updateWaLink(option, fee, total) {
    const { catLabel = "Produk", title, price } = currentSelectedItem;
    const text = [
      config.waGreeting,
      `\u203A Tipe: ${catLabel}`,
      `\u203A Item: ${title}`,
      `\u203A Pembayaran: ${option.name}`,
      `\u203A Harga: ${formatToIdr(price)}`,
      `\u203A Fee: ${formatToIdr(fee)}`,
      `\u203A Total: ${formatToIdr(total)}`,
    ].join('\n');
    elements.paymentModal.waBtn.href = `https://wa.me/${config.waNumber}?text=${encodeURIComponent(text)}`;
  }

  function removeStrayDs(root) {
    if (!root) return;
    root.querySelectorAll('.payment-option').forEach(opt => {
      Array.from(opt.childNodes).forEach(n => {
        if (n.nodeType === Node.TEXT_NODE && n.textContent.trim() === 'D') n.remove();
      });
    });
  }

  function openPaymentModal(item) {
    const pageContainer = document.getElementById('pageContainer');
    const modalContentEl = document.querySelector('#paymentModal .modal-content');
    if (modalContentEl){ modalContentEl.setAttribute('role','dialog'); modalContentEl.setAttribute('aria-modal','true'); modalContentEl.setAttribute('aria-labelledby','paymentModalTitle'); }
    const modalTitle = document.querySelector('#paymentModal .modal-header h2');
    if (modalTitle){ modalTitle.id = 'paymentModalTitle'; }
    if (pageContainer){ pageContainer.setAttribute('inert',''); }
    document.documentElement.style.overflow = "hidden"; document.body.style.overflow = "hidden";
    elementToFocusOnModalClose = document.activeElement;
    currentSelectedItem = item;
    const { modal, itemName, itemPrice, optionsContainer } = elements.paymentModal;
    itemName.textContent = item.title;
    itemPrice.textContent = formatToIdr(item.price);

    optionsContainer.innerHTML = '';
    config.paymentOptions.forEach((option, index) => {
      const fee = calculateFee(item.price, option);
      optionsContainer.insertAdjacentHTML(
        'beforeend',
        `
        <div class="payment-option">
          <input type="radio" id="${option.id}" name="payment" value="${option.id}" ${index === 0 ? 'checked' : ''}>
          <label for="${option.id}" tabindex="0">
            ${option.name}
            <span style="float: right;">+ ${formatToIdr(fee)}</span>
          </label>
        </div>
        `
      );
    });

    removeStrayDs(optionsContainer);

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
    const pageContainer = document.getElementById('pageContainer');
    if (pageContainer){ pageContainer.removeAttribute('inert'); }
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
      const text = await fetchSheetCached(sheetName, 'csv');
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
    if (state.preorder.initialized || !elements.viewPreorder) return;
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
    prevBtn.addEventListener('click', () => { if (state.preorder.currentPage > 1) { state.preorder.currentPage--; renderPreorderCards(); window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' }); } });
    nextBtn.addEventListener('click', () => { state.preorder.currentPage++; renderPreorderCards(); window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' }); });
    fetchPreorderData(config.sheets.preorder.name1);
    state.preorder.initialized = true;
  }
  function populateAccountCategorySelect() {
    if (!elements.accounts.customSelect.options) return;
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
    if (!elements.accounts.cardGrid) return;
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
    if (state.accounts.initialized || !elements.viewAccounts) return;
    state.accounts.initialized = true;
    const { cardGrid, error, empty } = elements.accounts;
    error.style.display = 'none'; empty.style.display = 'none';
    cardGrid.innerHTML = '';
    try {
      const accText = await fetchSheetCached(config.sheets.accounts.name, 'csv');
      state.accounts.allData = await parseAccountsSheet(accText);
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
    if (!container || !errorEl) return;
    container.innerHTML = ''; errorEl.style.display = 'none';
    try {
      const libText = await fetchSheetCached('Sheet6', 'csv');
      const rows = robustCsvParser(libText);
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
    if (state.carousell.initialized || !elements.viewCarousell) return;
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
        const carText = await fetchSheetCached(config.sheets.affiliate.name, 'csv');
        const rows = robustCsvParser(carText);
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
      if (!elements.carousell.gridContainer) return;
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
          const platformHTML = product.platform ? `<p class="affiliate-card-platform">${product.platform}</p>` : ''
          const formattedProductNumber = product.productNumber ? String(product.productNumber).padStart(3, '0') : '';
          const productNumberHTML = formattedProductNumber ? `<span class="affiliate-card-number">#${formattedProductNumber}</span>` : '';
          card.innerHTML = `
            ${productNumberHTML}
            ${imagesHTML}
            <div class="affiliate-card-body" role="button" tabindex="0">
                <div class="affiliate-card-main-info">
                  <h3 class="affiliate-card-title">${product.name}</h3>
                  <svg class="expand-indicator" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" /></svg>
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
  
  // Fungsi testimoni lama sudah tidak dipakai/dihapus
  // function pp_makeNodes(list) { ... }
  // async function initializeTestimonialMarquee() { ... }

  document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    
    // (Tidak ada pemanggilan testimoni di sini lagi)
  });
})();
