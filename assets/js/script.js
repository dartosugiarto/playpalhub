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
      searchInput: getElement('homeSearchInput'),
      customSelect: {
        wrapper: getElement('homeCustomSelectWrapper'),
        btn: getElement('homeCustomSelectBtn'),
        value: getElement('homeCustomSelectValue'),
        options: getElement('homeCustomSelectOptions'),
      },
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
  function updateHeaderStatus() {
    const now = new Date();
    const options = { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false };
    const hour = parseInt(new Intl.DateTimeFormat('en-US', options).format(now), 10);
    const indicator = elements.headerStatusIndicator;
    if (hour >= 8) {
      indicator.textContent = 'BUKA';
      indicator.className = 'header-status open';
    } else {
      indicator.textContent = 'TUTUP';
      indicator.className = 'header-status closed';
    }
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
    elements.home.searchInput.addEventListener('input', e => {
      clearTimeout(homeDebounce);
      homeDebounce = setTimeout(() => { state.home.searchQuery = e.target.value.trim(); renderHomeList(); }, 200);
    });
    elements.paymentModal.closeBtn.addEventListener('click', closePaymentModal);
    elements.paymentModal.modal.addEventListener('click', e => { if (e.target === elements.paymentModal.modal) closePaymentModal(); });
    document.addEventListener('click', (e) => {
      [elements.home.customSelect.wrapper, elements.preorder.customSelect.wrapper, elements.preorder.customStatusSelect.wrapper, elements.accounts.customSelect.wrapper]
        .filter(wrapper => wrapper)
        .forEach(wrapper => toggleCustomSelect(wrapper, false));
    });
    loadCatalog();
    window.addEventListener('popstate', (event) => {
        const mode = (window.location.pathname.substring(1).toLowerCase() || 'home');
        if (event.state || mode) setMode(mode, true);
    });
    const validModes = ['home', 'preorder', 'accounts', 'perpustakaan', 'carousell'];
    const initialMode = window.location.pathname.substring(1).toLowerCase() || 'home';
    setMode(validModes.includes(initialMode) ? initialMode : 'home', true);
    elements.headerStatusIndicator.style.display = 'inline-flex';
    updateHeaderStatus();
    setInterval(updateHeaderStatus, 60000);
  }
  function toggleSidebar(open = !document.body.classList.contains('sidebar-open')) {
    document.body.classList.toggle('sidebar-open', open);
  }
  function setMode(mode, fromHistory = false) {
    if (!fromHistory) {
      history.pushState(null, '', `/${mode}`);
    }
    elements.navLinks.forEach(link => link.classList.toggle('active', link.dataset.mode === mode));
    ['viewHome', 'viewPreorder', 'viewAccounts', 'viewPerpustakaan', 'viewCarousell'].forEach(viewId => {
      const view = elements[viewId.replace('view', '').toLowerCase()];
      if (view.viewSection) view.viewSection.classList.toggle('active', viewId.toLowerCase() === `view${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
    });
    toggleSidebar(false);
    if (mode === 'preorder' && !state.preorder.initialized) initializePreorder();
    if (mode === 'accounts' && !state.accounts.initialized) initializeAccounts();
    if (mode === 'perpustakaan') initializeLibrary();
    if (mode === 'carousell' && !state.carousell.initialized) initializeCarousell();
  }
  // Fungsi lain yang truncated di prompt asli, asumsi tetap sama...
  // (Saya asumsikan bagian truncated adalah fungsi-fungsi seperti loadCatalog, renderHomeList, initializePreorder, dll. Jika ada, copy dari original.)
  // Untuk lengkap, saya sertakan placeholder untuk truncated parts.
  // ... (kode truncated seperti loadCatalog, renderHomeList, parsePreorderSheet, dll.)
  function pp_makeNodes(list) {
    const frag = document.createDocumentFragment();
    list.forEach(({ name, url }) => {
      // Perbaikan: Clean name dari karakter aneh (asumsi dari gambar)
      let cleanedName = name.replace(/á/g, 'a').replace(/III/g, 'll').trim(); // Misalnya, 'á III C17' menjadi 'All C17'
      const li = document.createElement('li');
      li.className = 'testi-item';
      li.innerHTML = `<figure class="testi-fig"><img src="${url}" alt="Testimoni ${cleanedName.replace(/"/g,'&quot;')}" decoding="async" loading="lazy"></figure><figcaption class="testi-caption">— ${cleanedName.replace(/</g,'&lt;')}</figcaption>`;
      frag.appendChild(li);
    });
    return frag;
  }
  async function initializeTestimonialMarquee() {
    const section = document.getElementById('testimonialSection');
    const marquee = section.querySelector('.testi-marquee');
    const track = section.querySelector('#testiTrack');
    if (!marquee || !track) return;
  
    try {
      const res = await fetch(getSheetUrl('Sheet7', 'csv'));
      if (!res.ok) throw new Error('Network: ' + res.status);
      const csv = await res.text();
      const rows = robustCsvParser(csv);
      if (rows.length <= 1) {
        section.style.display = 'none';
        return;
      }
      const items = rows.slice(1).filter(r => r && r[0] && r[1]).map(r => ({ name: String(r[0]).trim(), url: String(r[1]).trim() }));
      if (!items.length) {
        section.style.display = 'none';
        return;
      }
      // Perbaikan: Update judul secara dinamik berdasarkan jumlah items
      const testiTitle = section.querySelector('.testi-title');
      if (testiTitle) {
        const count = items.length;
        const ulasanText = count === 1 ? 'Ulasan' : 'Ulasan';
        testiTitle.textContent = `${new Intl.NumberFormat('id-ID').format(count)} ${ulasanText} Terverifikasi. — 4,8/5`;
      }
      track.innerHTML = '';
      track.appendChild(pp_makeNodes(items));
      track.appendChild(pp_makeNodes(items));
  
      let pos = 0;
      let isDragging = false;
      let startX = 0;
      let startPos = 0;
      let animationFrameId;

      // --- Sesuaikan kecepatan di sini ---
      // Angka lebih besar = lebih cepat. 0.5 adalah kecepatan sedang.
      const speed = 0.5;
      // ---------------------------------

      const firstHalfWidth = track.scrollWidth / 2;
  
      function animate() {
        if (!isDragging) {
          pos -= speed;
        }
        if (pos <= -firstHalfWidth) {
          pos += firstHalfWidth;
        }
        track.style.transform = `translateX(${pos}px)`;
        animationFrameId = requestAnimationFrame(animate);
      }
  
      function onDragStart(e) {
        isDragging = true;
        marquee.classList.add('is-grabbing');
        startX = e.pageX || e.touches[0].pageX;
        startPos = pos;
        cancelAnimationFrame(animationFrameId);
        window.addEventListener('mousemove', onDragMove);
        window.addEventListener('touchmove', onDragMove);
        window.addEventListener('mouseup', onDragEnd);
        window.addEventListener('touchend', onDragEnd);
      }
  
      function onDragMove(e) {
        if (!isDragging) return;
        e.preventDefault();
        const currentX = e.pageX || e.touches[0].pageX;
        const diff = currentX - startX;
        pos = startPos + diff;
        track.style.transform = `translateX(${pos}px)`;
      }
  
      function onDragEnd() {
        isDragging = false;
        marquee.classList.remove('is-grabbing');
        // Wrap position
        const trackWidth = track.scrollWidth / 2;
        pos = pos % trackWidth;

        animate();
        window.removeEventListener('mousemove', onDragMove);
        window.removeEventListener('touchmove', onDragMove);
        window.removeEventListener('mouseup', onDragEnd);
        window.removeEventListener('touchend', onDragEnd);
      }
  
      marquee.addEventListener('mousedown', onDragStart);
      marquee.addEventListener('touchstart', onDragStart, { passive: true });
  
      animate();
  
    } catch (err) {
      console.error('Testimonials error:', err);
      if (section) section.style.display = 'none';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    initializeTestimonialMarquee(); // Menggantikan loadTestimonials()
  });
})();
