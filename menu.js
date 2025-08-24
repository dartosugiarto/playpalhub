// menu.js
(function (global) {
  // Menu: Film gratis + Donasi (Saweria)
  const MENU_ITEMS = [
    { id:'toKatalog',  label:'Katalog',         type:'route', value:'katalog' },
    { id:'toPreorder', label:'Lacak Pre‑Order', type:'route', value:'preorder' },
    { divider:true },
    { id:'film',    label:'Tonton Film (Gratis)',  type:'route', value:'film' },
    { id:'donasi',  label:'Donasi (Saweria)',      type:'link',  href:'https://saweria.co/playpal' },
    { id:'ebook',   label:'E‑book',        type:'link', href:'#' },
    { id:'assets',  label:'Asset Editing', type:'link', href:'#' }
  ];

  function renderMenu(container, items, onRoute, closeAll) {
    if (!container) return;
    container.innerHTML = '';
    items.forEach(item => {
      if (item.divider) {
        const d = document.createElement('div');
        d.className = 'menu-divider';
        container.appendChild(d);
        return;
      }
      const btn = document.createElement('button');
      btn.className = 'menu-btn';
      btn.type = 'button';
      btn.textContent = item.label;
      if (item.type === 'route') {
        btn.addEventListener('click', () => { onRoute?.(item.value); closeAll(); });
      } else {
        btn.addEventListener('click', () => { window.open(item.href, '_blank', 'noopener'); closeAll(); });
      }
      container.appendChild(btn);
    });
  }

  function init({ burgerCat, burgerPO, burgerFilm, menuCat, menuPO, menuFilm, onRoute }) {
    const closeAll = () => {
      [burgerCat, burgerPO, burgerFilm].forEach(b => b && b.classList.remove('active'));
      [menuCat, menuPO, menuFilm].forEach(m => m && m.classList.remove('open'));
    };
    const toggle = (btn, menu) => {
      const open = menu?.classList.contains('open');
      closeAll();
      if (!open) { btn?.classList.add('active'); menu?.classList.add('open'); }
    };

    [menuCat, menuPO, menuFilm].forEach(m => renderMenu(m, MENU_ITEMS, onRoute, closeAll));
    burgerCat ?.addEventListener('click', () => toggle(burgerCat, menuCat),  { passive:true });
    burgerPO  ?.addEventListener('click', () => toggle(burgerPO , menuPO ),  { passive:true });
    burgerFilm?.addEventListener('click', () => toggle(burgerFilm, menuFilm), { passive:true });

    document.addEventListener('click', (e) => {
      const inside =
        menuCat?.contains(e.target)  || burgerCat?.contains(e.target) ||
        menuPO ?.contains(e.target)  || burgerPO ?.contains(e.target) ||
        menuFilm?.contains(e.target) || burgerFilm?.contains(e.target);
      if (!inside) closeAll();
    }, { passive:true });

    return {
      closeAll,
      get items(){ return [...MENU_ITEMS]; },
      set(items){
        MENU_ITEMS.splice(0, MENU_ITEMS.length, ...items);
        [menuCat, menuPO, menuFilm].forEach(m => renderMenu(m, MENU_ITEMS, onRoute, closeAll));
      },
      add(item){
        MENU_ITEMS.push(item);
        [menuCat, menuPO, menuFilm].forEach(m => renderMenu(m, MENU_ITEMS, onRoute, closeAll));
      },
      insertAt(i,item){
        MENU_ITEMS.splice(i,0,item);
        [menuCat, menuPO, menuFilm].forEach(m => renderMenu(m, MENU_ITEMS, onRoute, closeAll));
      }
    };
  }

  global.MenuModule = { init };
})(window);
