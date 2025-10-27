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
        { id: 'shopeepay', name: 'ShopeePay', feeType: 'fixed', value: 0 },
        { id: 'gopay', name: 'Gopay', feeType: 'fixed', value: 0 },
        { id: 'dana', name: 'Dana', feeType: 'fixed', value: 125 },
        { id: 'bank_to_dana', name: 'Bank ke Dana', feeType: 'fixed', value: 500 },
        { id: 'qris', name: 'Qris', feeType: 'percentage', value: 0.007 }
    ]
};

const state = {
    home: { activeCategory: '', searchQuery: '' },
    preorder: {
        initialized: false,
        allData: [],
        currentPage: 1,
        perPage: 15,
        displayMode: 'detailed'
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
        burger: getElement('burgerBtn')
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
            options: getElement('homeCustomSelectOptions')
        }
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
        waBtn: getElement('continueToWaBtn')
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
            options: getElement('preorderCustomSelectOptions')
        },
        customStatusSelect: {
            wrapper: getElement('preorderStatusCustomSelectWrapper'),
            btn: getElement('preorderStatusCustomSelectBtn'),
            value: getElement('preorderStatusCustomSelectValue'),
            options: getElement('preorderStatusCustomSelectOptions')
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
            options: getElement('accountCustomSelectOptions')
        }
    },
    carousell: {
        gridContainer: getElement('carousellGridContainer'),
        error: getElement('carousellError')
    }
};

// FIXED: Added validation for NaN and negative numbers
function formatToIdr(value) {
    const numValue = Number(value);
    if (isNaN(numValue) || numValue < 0) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0
    }).format(numValue);
}

// FIXED: Added HTML sanitization
function sanitizeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
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
        try { 
            fetch(url).then(r => r.text()).then(t => sessionStorage.setItem(key, t)); 
        } catch(e) {}
        return cached;
    }
    
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Network error: ${res.statusText}`);
    const text = await res.text();
    sessionStorage.setItem(key, text);
    return text;
}

function showSkeleton(container, template, count = 6) {
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
        fragment.appendChild(template.content.cloneNode(true));
    }
    container.appendChild(fragment);
}

function toggleCustomSelect(wrapper, forceOpen) {
    const btn = wrapper.querySelector('.custom-select-btn');
    const isOpen = typeof forceOpen === 'boolean' ? forceOpen : !wrapper.classList.contains('open');
    wrapper.classList.toggle('open', isOpen);
    btn.setAttribute('aria-expanded', isOpen);
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
    const normalizedText = text.trim().replace(/\r\n/g, '\n');
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotedField = false;
    
    for (let i = 0; i < normalizedText.length; i++) {
        const char = normalizedText[i];
        if (inQuotedField) {
            if (char === '"') {
                if (i + 1 < normalizedText.length && normalizedText[i + 1] === '"') {
                    currentField += '"';
                    i++;
                } else {
                    inQuotedField = false;
                }
            } else {
                currentField += char;
            }
        } else {
            if (char === '"') {
                inQuotedField = true;
            } else if (char === ',') {
                currentRow.push(currentField);
                currentField = '';
            } else if (char === '\n') {
                currentRow.push(currentField);
                rows.push(currentRow);
                currentRow = [];
                currentField = '';
            } else {
                currentField += char;
            }
        }
    }
    
    currentRow.push(currentField);
    rows.push(currentRow);
    return rows;
}

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
            return '<br><br>';
        } else if (trimmedLine.endsWith(':')) {
            return `<br><br><strong>${trimmedLine.slice(0, -1)}</strong>`;
        } else if (trimmedLine.startsWith('\u203A')) {
            return `<br><br>&nbsp;&nbsp;› ${trimmedLine.substring(1).trim()}`;
        } else if (trimmedLine.startsWith('-')) {
            return `<br><br>&nbsp;&nbsp;• ${trimmedLine.substring(1).trim()}`;
        } else if (trimmedLine.startsWith('#')) {
            return `<br><br><em>${trimmedLine}</em>`;
        } else {
            return `<br>${trimmedLine}`;
        }
    }).join('');
}

// FIXED: Added proper validation for price
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
    
    // FIXED: Set currentSelectedItem FIRST before rendering options
    currentSelectedItem = item;
    
    const { modal, itemName, itemPrice, optionsContainer, waBtn } = elements.paymentModal;
    
    itemName.textContent = item.title || item.name || '';
    itemPrice.textContent = formatToIdr(item.price);
    
    optionsContainer.innerHTML = '';
    
    config.paymentOptions.forEach((option, index) => {
        const fee = calculateFee(item.price, option);
        // FIXED: Removed the 'D' character and added HTML sanitization
        optionsContainer.insertAdjacentHTML('beforeend', `
            <div class="payment-option">
                <input type="radio" id="${option.id}" name="payment" value="${option.id}" ${index === 0 ? 'checked' : ''}>
                <label for="${option.id}" tabindex="0">
                    ${sanitizeHTML(option.name)}
                    <span style="float: right">${formatToIdr(fee)}</span>
                </label>
            </div>
        `);
    });
    
    optionsContainer.querySelectorAll('input[name="payment"]').forEach(input => {
        input.addEventListener('change', updatePriceDetails);
    });
    
    updatePriceDetails();
    
    waBtn.onclick = () => {
        const selectedOptionId = document.querySelector('input[name="payment"]:checked')?.value;
        const selectedOption = config.paymentOptions.find(opt => opt.id === selectedOptionId);
        if (!selectedOption) return;
        
        const price = Number(item.price) || 0;
        const fee = calculateFee(price, selectedOption);
        const total = price + fee;
        
        const message = `${config.waGreeting}\n\n` +
            `Produk: ${item.title || item.name}\n` +
            `Harga: ${formatToIdr(price)}\n` +
            `Metode Pembayaran: ${selectedOption.name}\n` +
            `Biaya Admin: ${formatToIdr(fee)}\n` +
            `Total: ${formatToIdr(total)}`;
        
        const waUrl = `https://wa.me/${config.waNumber}?text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank', 'noopener,noreferrer');
    };
    
    modal.style.display = 'flex';
    requestAnimationFrame(() => {
        modal.classList.add('active');
        setupModalFocusTrap(modal);
    });
}

function closePaymentModal() {
    const { modal } = elements.paymentModal;
    modal.classList.remove('active');
    
    if (!prefersReducedMotion) {
        modal.addEventListener('transitionend', function handler() {
            modal.style.display = 'none';
            modal.removeEventListener('transitionend', handler
