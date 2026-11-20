// FEYORA Launcher - Obsidian Kinetic Engine
// Full Gamepad & Keyboard Spatial Navigation, Marquee Horizontal Text Scroller,
// Dual-Layer Cinematic Backdrop with Opacity Crossfade,
// WinRT Spotify Media Sync, PC Telemetry.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CATS = [
  ['all', 'tab.games', 'sports_esports'],
  ['fav', 'tab.fav', 'favorite'],
  ['custom', 'tab.apps', 'widgets'],
  ['recent', 'tab.recent', 'history'],
  ['store', 'tab.store', 'shopping_bag']
];

let allGames = [];
let currentCat = 'all';
let selectedIndex = 0;
let modalOpen = null;          // null | 'cover' | 'details' | 'settings' | 'launch'
let focusEl = null;            // Element with current controller focus
let prevFocus = null;          // Focus restoration element upon modal close
let toastTimer = null;
let launchTimers = [];
let totalHours = 0;
let settings = { sfx: true, rumble: true, nick: 'Giocatore 1', platforms: { steam: true, epic: true }, theme: 'nexus', sgdb_enabled: false };

// Dual-layer backdrop crossfade tracker
let currentBackdropUrl = '';
let activeBackdropLayer = 'a';

// Track last focus positions inside zones for seamless return
let lastActionBtn = 'btn-play';
let lastWidgetBtn = 'sp-play';


// ---------------------------------------------------------------- Marquee Scroller Engine
function setMarqueeText(containerEl, text, shouldScroll = true) {
  if (!containerEl) return;
  containerEl.classList.add('marquee-box');

  let inner = containerEl.querySelector('.marquee-content');
  if (!inner) {
    inner = document.createElement('span');
    inner.className = 'marquee-content';
    containerEl.innerHTML = '';
    containerEl.appendChild(inner);
  } else {
    inner.classList.remove('scrolling');
    inner.style.removeProperty('--mq-distance');
    inner.style.removeProperty('--mq-duration');
  }

  inner.textContent = text || '';
  inner.title = text || '';

  requestAnimationFrame(() => {
    const cWidth = containerEl.clientWidth;
    const sWidth = inner.scrollWidth;
    const diff = sWidth - cWidth;

    if (diff > 8 && shouldScroll) {
      containerEl.classList.add('is-masked');
      const dist = diff + 20;
      const duration = Math.min(16, Math.max(5, Math.round(dist / 32) + 3));
      inner.style.setProperty('--mq-distance', `-${dist}px`);
      inner.style.setProperty('--mq-duration', `${duration}s`);
      inner.classList.add('scrolling');
    } else {
      containerEl.classList.remove('is-masked');
      inner.classList.remove('scrolling');
    }
  });
}

// ---------------------------------------------------------------- Dual-Layer Backdrop Crossfade
let backdropToken = 0;

// Sfondo del gioco: hero orizzontale se c'è; altrimenti il poster sfocato; altrimenti niente
function backdropFor(g) {
  if (!g) return { url: null };
  if (g.banner_url) return { url: g.banner_url };
  if (g.poster_url) return { url: g.poster_url, blur: true };
  return { url: null };
}

function applyBackdrop(g) {
  const b = backdropFor(g);
  setBackdrop(b.url, { blur: !!b.blur });
}

function setBackdrop(url, opts = {}) {
  const key = url ? `${url}${opts.blur ? '|blur' : ''}` : '';
  if (key === currentBackdropUrl) return;
  currentBackdropUrl = key;

  const layerA = $('backdrop-layer-a');
  const layerB = $('backdrop-layer-b');
  if (!layerA || !layerB) return;
  const token = ++backdropToken;

  if (!url) {
    layerA.classList.remove('active');
    layerB.classList.remove('active');
    return;
  }

  const targetLayer = activeBackdropLayer === 'a' ? layerB : layerA;
  const oldLayer = activeBackdropLayer === 'a' ? layerA : layerB;

  const img = new Image();
  img.onload = () => {
    if (token !== backdropToken) return;   // nel frattempo hai cambiato gioco
    targetLayer.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`;
    targetLayer.classList.toggle('poster', !!opts.blur);
    targetLayer.classList.add('active');
    oldLayer.classList.remove('active');
    activeBackdropLayer = activeBackdropLayer === 'a' ? 'b' : 'a';
  };
  img.onerror = () => {
    if (token !== backdropToken) return;
    // immagine non disponibile: meglio nessuno sfondo che quello del gioco precedente
    layerA.classList.remove('active');
    layerB.classList.remove('active');
  };
  img.src = url;
}

// ---------------------------------------------------------------- Utilities
const fmtSize = (b) => (!b ? t('hero.na') : `${(b / 1073741824).toFixed(1)} GB`);
const fmtHours = (h) => (!h ? t('time.new') : `${Number.isInteger(h) ? h : h.toFixed(1)}h`);
const fmtMMSS = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function fmtLast(ts) {
  if (!ts) return t('time.never_launched');
  const d = Math.floor((Date.now() / 1000 - ts) / 86400);
  if (d <= 0) return t('time.today');
  if (d === 1) return t('time.yesterday');
  if (d < 30) return t('time.days_ago', { n: d });
  return t('time.months_ago', { n: Math.floor(d / 30) });
}

const sfx = (name) => { try { window.SFX && SFX[name] && SFX[name](); } catch (e) { /* audio off */ } };
const rumble = (kind) => { try { GamepadManager && GamepadManager[kind] && GamepadManager[kind](); } catch (e) { /* no gamepad */ } };
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

function openOnScreenKeyboard() {
  try {
    if (window.pywebview && window.pywebview.api && window.pywebview.api.open_keyboard) {
      window.pywebview.api.open_keyboard();
    } else if (navigator.virtualKeyboard && navigator.virtualKeyboard.show) {
      navigator.virtualKeyboard.show();
    }
  } catch (e) { /* tastiera non disponibile fuori dall'app nativa */ }
}

function focusTextInput(input) {
  if (!input) return;
  input.focus();
  openOnScreenKeyboard();
}

function showToast(msg, icon = 'info') {
  const t = $('toast');
  if (!t) return;
  t.innerHTML = `<span class="material-symbols-outlined text-[18px] text-primary-container">${icon}</span><span>${esc(msg)}</span>`;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2500);
}

// ---------------------------------------------------------------- Artwork Loader
const artUrl = (g) => (g.is_custom_cover ? g.poster_url : (g.poster_url || g.banner_url));
const procArt = (g) => generateProceduralArt(g.art_style || 'waves', g.palette);

function setArt(el, g, url) {
  if (!el) return;
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  let h = el.querySelector(':scope > .art-holder');
  if (!h) {
    h = document.createElement('div');
    h.className = 'art-holder';
    h.style.cssText = 'position:absolute;inset:0';
    el.insertBefore(h, el.firstChild);
  }
  h.innerHTML = '';
  if (!url) { h.innerHTML = procArt(g); return; }
  const img = new Image();
  img.alt = '';
  img.style.objectPosition = 'center 25%';
  img.onerror = () => { h.innerHTML = procArt(g); };
  img.src = url;
  h.appendChild(img);
}

// ---------------------------------------------------------------- Filters & Carousel
const srcName = (g) => (g.source === 'Custom' ? t('hero.app') : g.source);
const hasAddTile = () => currentCat === 'all' || currentCat === 'custom';

// Ordine: ultimo aperto per primo (mai alfabetico). A parita': aggiunti/installati piu' di recente, poi ordine di scansione.
function sortGames(list) {
  const mode = settings.sort || 'recent';
  const order = new Map(allGames.map((g, i) => [g.id, i]));
  const keyOf = (g) => (mode === 'hours' ? (g.hours || 0) : mode === 'added' ? (g.added_at || 0) : (g.last_played || 0));
  return list.slice().sort((a, b) => {
    let d = keyOf(b) - keyOf(a);
    if (d) return d;
    d = (b.added_at || 0) - (a.added_at || 0);
    if (d) return d;
    return order.get(a.id) - order.get(b.id);
  });
}

function getFilteredGames() {
  if (currentCat === 'store') return [];
  return sortGames(allGames.filter((g) => {
    if (g.source === 'Steam' && settings.platforms.steam === false) return false;
    if (g.source === 'Epic Games' && settings.platforms.epic === false) return false;
    if (currentCat === 'fav') return g.is_fav;
    if (currentCat === 'custom') return g.source === 'Custom' || g.source === 'Launcher';
    if (currentCat === 'recent') return g.last_played > 0;
    return true;
  }));
}
const curGame = () => getFilteredGames()[selectedIndex] || null;

function renderCategories() {
  const nav = $('cats-nav');
  if (!nav) return;
  nav.innerHTML = '';
  CATS.forEach(([id, label, icon]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.cat = id;
    const on = id === currentCat;
    b.className = 'tab px-space-lg py-space-xs rounded-full font-headline-sm text-headline-sm flex items-center gap-1.5 transition-all cursor-pointer ' +
      (on ? 'bg-primary-container text-on-primary-container shadow-[0_0_24px_rgb(var(--c-primary-container)/0.4)]' : 'text-on-surface-variant hover:text-on-surface');
    b.title = t(label);
    b.innerHTML = `<span class="material-symbols-outlined text-[18px]">${icon}</span><span class="${on ? '' : 'hidden min-[1500px]:inline'}">${t(label)}</span>`;
    b.onclick = () => setCategory(id);
    nav.appendChild(b);
  });
}

function setCategory(id) {
  if (id === currentCat) return;
  const wasStore = currentCat === 'store';
  currentCat = id;
  selectedIndex = 0;
  renderCategories();
  sfx('playTab');
  rumble('rumbleSoft');
  if (id === 'store') {
    showStorePage(true);
    setFocus(document.querySelector('#cats-nav .tab[data-cat="store"]'));   // "giù" per entrare nella pagina
    return;
  }
  if (wasStore) showStorePage(false);
  renderCarousel();
  focusCard();
}

function cycleCategory(delta) {
  const i = CATS.findIndex((c) => c[0] === currentCat);
  setCategory(CATS[(i + delta + CATS.length) % CATS.length][0]);
}

function renderCarousel() {
  const games = getFilteredGames();
  const rail = $('carousel-rail');
  if (!rail) return;
  rail.innerHTML = '';

  const isEmpty = games.length === 0;
  $('carousel-empty').classList.toggle('hidden', !isEmpty);
  $('carousel-count-badge').textContent = t(games.length === 1 ? 'lib.count_one' : 'lib.count_many', { n: games.length });
  $('sort-label').textContent = t('sort.' + (settings.sort || 'recent'));
  $('header-games-count').textContent = `${allGames.length}`;
  $('lib-count-pill').textContent = `${allGames.length} ${t('lib.games')}`.toUpperCase();

  const lastIdx = games.length - (hasAddTile() ? 0 : 1);
  if (selectedIndex > lastIdx) selectedIndex = Math.max(0, lastIdx);

  games.forEach((g, idx) => {
    const c = document.createElement('div');
    c.className = 'game-card group rounded-lg';
    c.setAttribute('role', 'option');
    c.dataset.index = idx;
    c.innerHTML = `
      <div class="art">
        ${g.is_fav ? '<span class="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-surface-container-lowest/80 flex items-center justify-center text-error"><span class="material-symbols-outlined fill text-[16px]">favorite</span></span>' : ''}
      </div>
      <div class="p-space-md flex items-center justify-center flex-1 overflow-hidden">
        <div class="card-title-box marquee-box w-full">
          <h3 class="ttl marquee-content font-headline-sm text-headline-sm font-bold text-on-surface whitespace-nowrap">${esc(g.name)}</h3>
        </div>
      </div>`;
    setArt(c.querySelector('.art'), g, artUrl(g));

    // Mouse click and hover integration
    c.onclick = () => {
      if (idx === selectedIndex) openLaunch();
      else { selectGame(idx); setFocus(c); }
    };
    c.onmouseenter = () => {
      if (idx !== selectedIndex) {
        selectGame(idx, false);
      }
    };

    rail.appendChild(c);
  });

  if (hasAddTile()) rail.appendChild(buildAddTile());

  selectGame(selectedIndex, false);
}

function selectGame(idx, announce = true) {
  const games = getFilteredGames();
  const maxIdx = games.length - (hasAddTile() ? 0 : 1);
  if (maxIdx < 0) {
    updateHero(null);
    return;
  }
  selectedIndex = Math.max(0, Math.min(maxIdx, idx));
  const g = games[selectedIndex] || null;   // null = tile "+" (aggiungi)

  const cards = document.querySelectorAll('.game-card');
  cards.forEach((el, i) => {
    const isSel = i === selectedIndex;
    el.classList.toggle('sel', isSel);
    const ttlBox = el.querySelector('.card-title-box');
    if (ttlBox && games[i]) {
      // Marquee auto-scroll active ONLY for the selected card
      setMarqueeText(ttlBox, games[i].name, isSel);
    }
  });

  const card = cards[selectedIndex];
  if (card) {
    card.scrollIntoView({ behavior: announce ? 'smooth' : 'auto', inline: 'center', block: 'nearest' });
    if (focusEl && focusEl.classList.contains('game-card')) {
      setFocus(card);
    }
  }

  if (announce) {
    sfx('playMove');
    rumble('rumbleSoft');
  }

  updateHero(g, !g);
}

function updateHero(g, addMode = false) {
  const none = !g;

  // Horizontal scrolling marquee for Hero Title and Subtitle
  const titleBox = $('hero-title-box');
  const titleText = addMode ? t('hero.add_title').toUpperCase() : (none ? t('hero.none').toUpperCase() : g.name);
  setMarqueeText(titleBox, titleText, true);

  const subBox = $('hero-subtitle-box');
  const subText = addMode ? t('hero.add_sub').toUpperCase() : (none ? t('hero.none_sub').toUpperCase() : `${srcName(g)}${g.is_fav ? ' · ' + t('hero.favorite').toUpperCase() : ''}`);
  setMarqueeText(subBox, subText, true);

  $('hero-category-label').textContent = (addMode ? t('hero.add') : (none ? t('hero.empty') : (g.is_fav ? t('hero.favorite') : t('hero.installed')))).toUpperCase();
  $('hero-status-text').textContent = (addMode ? t('hero.new') : (none ? t('hero.na') : t('hero.ready'))).toUpperCase();
  $('hero-platform-text').textContent = addMode ? t('hero.app').toUpperCase() : (none ? '--' : srcName(g).toUpperCase());
  $('hero-custom-art-badge').classList.toggle('hidden', none || !g.is_custom_cover);
  $('hero-size-pill').lastElementChild.textContent = none ? '--' : fmtSize(g.size_bytes);
  $('hero-hours-pill').lastElementChild.textContent = none ? '--' : (g.hours ? t('time.played', { h: fmtHours(g.hours) }) : t('time.never_played'));
  $('hero-last-pill').lastElementChild.textContent = none ? '--' : fmtLast(g.last_played);
  $('card-playtime').textContent = none ? '0h' : (g.hours ? fmtHours(g.hours) : '0h');

  const pct = !none && totalHours > 0 ? Math.min(100, Math.round((g.hours || 0) / totalHours * 100)) : 0;
  $('card-trophies-pct').textContent = `${pct}%`;
  $('card-trophies-bar').style.width = `${pct}%`;
  $('card-last-played').lastChild.textContent = ' ' + t('stats.last', { x: none ? '--' : fmtLast(g.last_played) });
  $('card-path-text').textContent = none ? '--' : (g.install_path || t('stats.managed'));
  $('fav-icon').textContent = g && g.is_fav ? 'favorite' : 'favorite_border';
  $('fav-label').textContent = g && g.is_fav ? t('btn.unfav') : t('btn.fav');

  // Sfondo a tutto schermo che cambia col gioco (crossfade) + alone colorato dalla palette
  ['btn-cover', 'btn-fav', 'btn-details'].forEach((id) => $(id).classList.toggle('hidden', addMode));
  // Mantieni il riepilogo nel flusso anche sul tile "+": evita che la barra
  // della libreria salga quando il riepilogo non è disponibile.
  $('hero-stats').classList.toggle('is-add-placeholder', addMode);
  $('btn-play-label').textContent = addMode ? t('btn.add_app').toUpperCase() : (g && g.launcher_missing ? 'DOWNLOAD' : t('btn.play').toUpperCase());
  applyBackdrop(g);
  const glow = $('ambient-glow');
  if (glow) glow.style.backgroundColor = (g && g.palette && g.palette[2]) ? `${g.palette[2]}38` : '';
}

// ---------------------------------------------------------------- Favorites & Rescan
async function toggleFavorite() {
  const g = curGame();
  if (!g) return;
  g.is_fav = !g.is_fav;
  try {
    const r = await post('/api/favorite', { id: g.id, favorite: g.is_fav });
    if (!r.ok) throw new Error();
    sfx(g.is_fav ? 'playFavorite' : 'playBack');
    if (g.is_fav) rumble('rumbleSoft');
    showToast(t(g.is_fav ? 'toast.fav_on' : 'toast.fav_off', { name: g.name }), 'favorite');
    const keepId = g.id;
    renderCarousel();
    const i = getFilteredGames().findIndex((x) => x.id === keepId);
    if (i >= 0) selectGame(i, false);
  } catch (e) {
    g.is_fav = !g.is_fav;
    showToast(t('toast.fav_err'), 'error');
  }
}

async function rescanLibrary() {
  showToast(t('toast.scan'), 'refresh');
  sfx('playMove');
  try {
    const r = await post('/api/rescan');
    const d = await r.json();
    if (r.ok) {
      allGames = d.games || [];
      renderCarousel();
      showToast(t('toast.scan_done', { n: allGames.length }), 'check_circle');
      sfx('playSelect');
      rumble('rumbleHeavy');
    }
  } catch (e) {
    showToast(t('toast.scan_err'), 'error');
  }
}

// ---------------------------------------------------------------- Modals
const MODALS = {
  cover: 'm-cover', details: 'm-details', settings: 'm-settings', launch: 'launch'
};

function openModal(name) {
  if (name === 'settings') renderSettings();
  prevFocus = focusEl;
  modalOpen = name;
  $(MODALS[name]).classList.add('on');
  const focusables = modalFocusables();
  setFocus(focusables[0] || null);
}

function closeModal() {
  if (!modalOpen) return;
  $(MODALS[modalOpen]).classList.remove('on');
  if (modalOpen === 'launch') {
    launchTimers.forEach(clearTimeout);
    launchTimers = [];
  }
  const closed = modalOpen;
  modalOpen = null;
  sfx('playBack');
  rumble('rumbleSoft');

  if (prevFocus && document.body.contains(prevFocus) && prevFocus.offsetParent !== null) {
    setFocus(prevFocus);
  } else {
    focusCard();
  }
}

function modalFocusables() {
  if (!modalOpen) return [];
  if (modalOpen === 'settings') {
    const cats = Array.from($('set-cats').children);
    const act = cats.find((b) => b.classList.contains('active')) || cats[0];
    return [act, ...cats.filter((b) => b !== act), ...setPrims()].filter(Boolean);
  }
  if (modalOpen === 'details') {
    return [
      $('md-play'), $('md-cover-btn'), $('md-remove'), $('md-close'), $('md-close-top')
    ].filter((e) => e && e.offsetParent !== null);
  }
  if (modalOpen === 'cover') {
    return [
      $('cp-browse-btn'), $('cp-reset-btn'),
      ...document.querySelectorAll('#cp-suggestions .cover-opt'),
      $('cp-url-in'), $('cp-apply-url-btn'), $('cp-close-btn')
    ].filter((e) => e && e.offsetParent !== null);
  }
  if (modalOpen === 'launch') {
    const d = $('ldone');
    const c = $('lcancel');
    return [d.classList.contains('hidden') ? null : d, c.classList.contains('hidden') ? null : c].filter(Boolean);
  }
  return [];
}

// ---- Details Modal
function openDetails() {
  const g = curGame();
  if (!g) return;
  $('md-src').textContent = srcName(g).toUpperCase();
  setMarqueeText($('md-title-box'), g.name, true);
  $('md-id').textContent = g.id;
  $('md-size').textContent = fmtSize(g.size_bytes);
  $('md-last').textContent = fmtLast(g.last_played);
  $('md-hours').textContent = g.hours ? fmtHours(g.hours) : t('time.never_played');
  $('md-path').textContent = g.install_path || g.launch_cmd || '-';
  $('md-remove').classList.toggle('hidden', g.source !== 'Custom');
  openModal('details');
  sfx('playSelect');
}

// ---- Cover Modal
async function openCoverModal() {
  const g = curGame();
  if (!g) return;
  setMarqueeText($('cp-title-box'), `${t('btn.cover')}: ${g.name}`, true);
  $('cp-status').textContent = t(g.is_custom_cover ? 'cover.st_custom' : 'cover.st_default').toUpperCase();
  $('cp-badge').textContent = srcName(g).toUpperCase();
  $('cp-label').textContent = g.name;
  $('cp-url-in').value = '';
  setArt($('cp-art'), g, g.poster_url);

  const grid = $('cp-suggestions');
  grid.innerHTML = '<div class="col-span-full p-3 text-on-surface-variant font-body-sm">' + esc(t('cover.loading')) + '</div>';
  openModal('cover');
  sfx('playSelect');

  try {
    const r = await fetch(`/api/game/covers?id=${encodeURIComponent(g.id)}`);
    const d = await r.json();
    grid.innerHTML = '';
    const list = d.suggestions || [];
    if (!list.length) {
      grid.innerHTML = '<div class="col-span-full p-3 text-on-surface-variant font-body-sm">' + esc(t('cover.none')) + '</div>';
    } else {
      list.forEach((s) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cover-opt';
        b.title = s.title || '';
        b.innerHTML = `<img src="${esc(s.url)}" alt="" loading="lazy" onerror="this.parentElement.remove()">`;
        b.onclick = () => applyCover(g.id, s.url);
        grid.appendChild(b);
      });
    }
  } catch (e) {
    grid.innerHTML = '<div class="col-span-full p-3 text-error font-body-sm">' + esc(t('cover.error')) + '</div>';
  }
}

async function applyCover(id, url) {
  if (!url) return;
  try {
    const r = await post('/api/game/cover', { id, cover_url: url });
    if (!r.ok) throw new Error();
    const g = allGames.find((x) => x.id === id);
    if (g) {
      g.poster_url = url;
      g.is_custom_cover = true;
      setArt($('cp-art'), g, url);
    }
    $('cp-status').textContent = t('cover.st_custom').toUpperCase();
    refreshKeepSelection();
    showToast(t('toast.cover_ok'), 'check_circle');
    sfx('playSelect');
  } catch (e) {
    showToast(t('toast.cover_err'), 'error');
  }
}

async function browseCover() {
  const g = curGame();
  if (!g) return;
  showToast(t('toast.file_open'), 'folder_open');
  try {
    const r = await post('/api/game/cover/browse', { id: g.id });
    const d = await r.json();
    if (r.ok && d.status === 'ok' && d.cover_url) {
      g.poster_url = d.cover_url;
      g.is_custom_cover = true;
      setArt($('cp-art'), g, d.cover_url);
      $('cp-status').textContent = t('cover.st_custom').toUpperCase();
      refreshKeepSelection();
      showToast(t('toast.file_ok'), 'check_circle');
      sfx('playSelect');
    }
  } catch (e) {
    showToast(t('toast.file_err'), 'error');
  }
}

async function resetCover() {
  const g = curGame();
  if (!g) return;
  try {
    const r = await post('/api/game/cover/reset', { id: g.id });
    const d = await r.json();
    if (!r.ok) throw new Error();
    g.is_custom_cover = false;
    g.poster_url = d.default_cover || (g.appid ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${g.appid}/library_600x900.jpg` : null);
    setArt($('cp-art'), g, g.poster_url);
    $('cp-status').textContent = t('cover.st_default').toUpperCase();
    refreshKeepSelection();
    showToast(t('toast.cover_reset'), 'refresh');
    sfx('playSelect');
  } catch (e) {
    showToast(t('toast.cover_reset_err'), 'error');
  }
}

function refreshKeepSelection() {
  const cur = curGame();
  const id = cur ? cur.id : null;
  const keepFocus = focusEl;
  renderCarousel();
  const i = getFilteredGames().findIndex((x) => x.id === id);
  if (i >= 0) selectGame(i, false);
  if (keepFocus && document.body.contains(keepFocus)) setFocus(keepFocus);
}

// ---- Launch Game Modal
async function openLaunch() {
  if (currentCat !== 'store' && hasAddTile() && selectedIndex === getFilteredGames().length) { addCustomApp(); return; }
  const g = curGame();
  if (!g || modalOpen === 'launch') return;
  if (modalOpen) {
    $(MODALS[modalOpen]).classList.remove('on');
    focusEl = prevFocus;
    modalOpen = null;
  }
  setArt($('lcover'), g, g.poster_url || artUrl(g));
  $('ltitle').textContent = g.name;
  $('lbar').style.width = '0%';
  $('ldone').classList.add('hidden');
  $('lcancel').classList.remove('hidden');
  $('lstatus').textContent = t('launch.check');
  openModal('launch');
  sfx('playLaunch');
  rumble('rumbleHeavy');

  launchTimers.forEach(clearTimeout);
  launchTimers = [
    setTimeout(() => {
      $('lbar').style.width = '35%';
      $('lstatus').textContent = g.launcher_missing ? 'Apertura del download ufficiale…' : (g.source === 'Steam' ? t('launch.steam') : (g.source === 'Custom' ? t('launch.prep') : t('launch.epic')));
    }, 350),
    setTimeout(() => {
      $('lbar').style.width = '75%';
      $('lstatus').textContent = t('launch.starting', { name: g.name });
    }, 1000),
    setTimeout(async () => {
      $('lbar').style.width = '100%';
      try {
        const r = g.launcher_missing
          ? await post('/api/launcher/install', { launcher: g.launcher_key })
          : await post('/api/launch', { id: g.id });
        const d = await r.json();
        $('lstatus').textContent = r.ok
          ? (g.launcher_missing ? 'Download ufficiale aperto.' : t('launch.running', { name: g.name }))
          : t('launch.err', { e: d.detail || t('launch.fail') });
        if (r.ok) {
          showToast(g.launcher_missing ? 'Download ufficiale aperto' : t('toast.launched', { name: g.name }), g.launcher_missing ? 'download' : 'play_arrow');
          rumble('rumbleSoft');
        }
      } catch (e) {
        $('lstatus').textContent = t('launch.conn', { e: e.message });
      }
      $('ldone').classList.remove('hidden');
      $('lcancel').classList.add('hidden');
      setFocus($('ldone'));
    }, 1800)
  ];
}

// ---- Settings
async function quitApp() {
  try { await post('/api/quit'); } catch (e) { /* server closing */ }
  try { await window.pywebview.api.close(); } catch (e) { window.close(); }
}

async function toggleFullscreen() {
  try { await window.pywebview.api.toggle_fullscreen(); }
  catch (e) {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  }
}

// ---------------------------------------------------------------- Focus & Spatial Navigation
function setFocus(el) {
  if (!el) return;
  document.querySelectorAll('.focused').forEach((e) => e.classList.remove('focused'));
  focusEl = el;
  el.classList.add('focused');
  el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });

  if (el.classList.contains('store-card')) {
    const t = storeState.tiles[Number(el.dataset.i)];
    if (t && t !== storeSpot) setStoreSpotlight(t);
  }

  // Update last tracked positions
  if (['btn-play', 'btn-cover', 'btn-fav', 'btn-details'].includes(el.id)) {
    lastActionBtn = el.id;
  }
  if (['sp-prev', 'sp-play', 'sp-next', 'sp-open', 'dc-open', 'br-open'].includes(el.id)) {
    lastWidgetBtn = el.id;
  }
}

function focusCard() {
  if (currentCat === 'store') {
    const f = $('store-q');
    setFocus(f);
    return f;
  }
  const sel = document.querySelector('.game-card.sel') || $('empty-rescan-btn') || $('btn-play');
  setFocus(sel);
  return sel;
}

// Identify current home zone
function getHomeZone() {
  if (!focusEl) return 'carousel';
  if (focusEl.closest && focusEl.closest('#store-page')) return 'store';
  if (focusEl.id === 'avbtn' || focusEl.classList.contains('tab') || focusEl.id === 'fsbtn' || focusEl.id === 'setbtn') {
    return 'header';
  }
  if (['btn-play', 'btn-cover', 'btn-fav', 'btn-details'].includes(focusEl.id)) {
    return 'actions';
  }
  if (focusEl.classList.contains('game-card') || focusEl.id === 'empty-rescan-btn') {
    return 'carousel';
  }
  if (['sp-prev', 'sp-play', 'sp-next', 'sp-open', 'dc-open', 'br-open'].includes(focusEl.id)) {
    return 'widgets';
  }
  return 'carousel';
}

function getHeaderElements() {
  const tabs = Array.from(document.querySelectorAll('#cats-nav .tab'));
  return [$('avbtn'), ...tabs, $('fsbtn'), $('setbtn')].filter((e) => e && e.offsetParent !== null);
}

function getActionElements() {
  return [$('btn-play'), $('btn-cover'), $('btn-fav'), $('btn-details')].filter((e) => e && e.offsetParent !== null);
}

function getWidgetElements() {
  const spButtons = [$('sp-prev'), $('sp-play'), $('sp-next'), $('sp-open')];
  return [...spButtons, $('dc-open'), $('br-open')].filter((e) => e && e.offsetParent !== null);
}

// Deterministic Zone Navigation Engine for Home Screen
function navigateHome(dir) {
  const zone = getHomeZone();

  if (zone === 'header') {
    const list = getHeaderElements();
    const idx = list.indexOf(focusEl);
    if (dir === 'left') {
      const next = idx > 0 ? list[idx - 1] : list[list.length - 1];
      setFocus(next);
      sfx('playMove');
    } else if (dir === 'right') {
      const next = idx < list.length - 1 ? list[idx + 1] : list[0];
      setFocus(next);
      sfx('playMove');
    } else if (dir === 'down') {
      if (currentCat === 'store') { focusCard(); sfx('playMove'); return; }
      // Down from Header lands on Action Zone
      const target = $(lastActionBtn) || $('btn-play');
      setFocus(target);
      sfx('playMove');
    }
    return;
  }

  if (zone === 'store') {
    navigateStore(dir);
    return;
  }
  if (zone === 'actions') {
    const list = getActionElements();
    const idx = list.indexOf(focusEl);
    if (dir === 'left') {
      if (idx > 0) { setFocus(list[idx - 1]); sfx('playMove'); }
    } else if (dir === 'right') {
      if (idx < list.length - 1) { setFocus(list[idx + 1]); sfx('playMove'); }
    } else if (dir === 'up') {
      // Up from Action Zone lands on Header Zone (active category tab)
      const curTab = document.querySelector(`#cats-nav .tab[data-cat="${currentCat}"]`) || $('cats-nav').firstElementChild || $('avbtn');
      setFocus(curTab);
      sfx('playMove');
    } else if (dir === 'down') {
      // Down from Action Zone lands on Carousel
      focusCard();
      sfx('playMove');
    }
    return;
  }

  if (zone === 'carousel') {
    if (dir === 'left') {
      selectGame(Math.max(0, selectedIndex - 1));
    } else if (dir === 'right') {
      selectGame(selectedIndex + 1);
    } else if (dir === 'up') {
      // Up from Carousel lands on Action Zone
      const target = $(lastActionBtn) || $('btn-play');
      setFocus(target);
      sfx('playMove');
    } else if (dir === 'down') {
      // Down from Carousel lands on Widgets Zone
      const target = $(lastWidgetBtn) || $('sp-play');
      setFocus(target);
      sfx('playMove');
    }
    return;
  }

  if (zone === 'widgets') {
    const list = getWidgetElements();
    const idx = list.indexOf(focusEl);
    if (dir === 'left') {
      if (idx > 0) { setFocus(list[idx - 1]); sfx('playMove'); }
    } else if (dir === 'right') {
      if (idx < list.length - 1) { setFocus(list[idx + 1]); sfx('playMove'); }
    } else if (dir === 'up') {
      // Up from Widgets lands back on Carousel
      focusCard();
      sfx('playMove');
    }
    return;
  }
}

// Modal Focus Navigation
function navigateModal(dir) {
  const list = modalFocusables();
  if (!list.length) return;
  const idx = list.indexOf(focusEl);

  if (modalOpen === 'settings') {
    navigateSettings(dir);
    return;
  }

  if (modalOpen === 'details') {
    if (dir === 'left') {
      const next = idx > 0 ? list[idx - 1] : list[list.length - 1];
      setFocus(next); sfx('playMove');
    } else if (dir === 'right') {
      const next = idx < list.length - 1 ? list[idx + 1] : list[0];
      setFocus(next); sfx('playMove');
    } else if (dir === 'up') {
      setFocus($('md-close-top')); sfx('playMove');
    } else if (dir === 'down') {
      setFocus($('md-play')); sfx('playMove');
    }
    return;
  }

  if (modalOpen === 'cover') {
    const isBrowse = focusEl.id === 'cp-browse-btn';
    const isReset = focusEl.id === 'cp-reset-btn';
    const isUrlIn = focusEl.id === 'cp-url-in';
    const isUrlBtn = focusEl.id === 'cp-apply-url-btn';
    const isClose = focusEl.id === 'cp-close-btn';
    const suggestions = Array.from(document.querySelectorAll('#cp-suggestions .cover-opt'));
    const isGrid = focusEl.classList.contains('cover-opt');

    if (isBrowse || isReset) {
      if (dir === 'left') { setFocus($('cp-browse-btn')); sfx('playMove'); }
      else if (dir === 'right') { setFocus($('cp-reset-btn')); sfx('playMove'); }
      else if (dir === 'down') {
        const target = suggestions[0] || $('cp-url-in');
        setFocus(target); sfx('playMove');
      }
      return;
    }

    if (isGrid) {
      const gIdx = suggestions.indexOf(focusEl);
      const cols = window.innerWidth >= 768 ? 4 : (window.innerWidth >= 640 ? 3 : 2);
      if (dir === 'left') {
        if (gIdx > 0) { setFocus(suggestions[gIdx - 1]); sfx('playMove'); }
      } else if (dir === 'right') {
        if (gIdx < suggestions.length - 1) { setFocus(suggestions[gIdx + 1]); sfx('playMove'); }
      } else if (dir === 'up') {
        if (gIdx - cols >= 0) { setFocus(suggestions[gIdx - cols]); sfx('playMove'); }
        else { setFocus($('cp-browse-btn')); sfx('playMove'); }
      } else if (dir === 'down') {
        if (gIdx + cols < suggestions.length) { setFocus(suggestions[gIdx + cols]); sfx('playMove'); }
        else { setFocus($('cp-url-in')); sfx('playMove'); }
      }
      return;
    }

    if (isUrlIn || isUrlBtn) {
      if (dir === 'left') { setFocus($('cp-url-in')); sfx('playMove'); }
      else if (dir === 'right') { setFocus($('cp-apply-url-btn')); sfx('playMove'); }
      else if (dir === 'up') {
        const target = suggestions.length ? suggestions[suggestions.length - 1] : $('cp-browse-btn');
        setFocus(target); sfx('playMove');
      } else if (dir === 'down') {
        setFocus($('cp-close-btn')); sfx('playMove');
      }
      return;
    }

    if (isClose) {
      if (dir === 'up') { setFocus($('cp-apply-url-btn')); sfx('playMove'); }
      return;
    }
  }

  // Generic fallback for any other modal
  if (dir === 'left' || dir === 'up') {
    const next = idx > 0 ? list[idx - 1] : list[list.length - 1];
    setFocus(next); sfx('playMove');
  } else if (dir === 'right' || dir === 'down') {
    const next = idx < list.length - 1 ? list[idx + 1] : list[0];
    setFocus(next); sfx('playMove');
  }
}

function activate() {
  const el = focusEl;
  if (!el) return;
  if (el.tagName === 'INPUT') { focusTextInput(el); return; }
  if (el.id === 'add-tile') { addCustomApp(); return; }
  if (el.classList.contains('set-cat')) { navigateSettings('right'); return; }
  if (el.classList.contains('game-card')) { openLaunch(); return; }
  el.click();
}

// ---------------------------------------------------------------- Gamepad & Input Listener
GamepadManager.on('action', ({ action }) => {
  if (modalOpen === 'settings' && (action === 'lb' || action === 'rb')) { switchSetCat(action === 'lb' ? -1 : 1, true); return; }
  if (action === 'f11') return toggleFullscreen();

  if (modalOpen) {
    if (action === 'b') return closeModal();
    if (modalOpen === 'launch') {
      if (action === 'a') return activate();
      return;
    }
    if (['left', 'right', 'up', 'down'].includes(action)) {
      return navigateModal(action);
    }
    if (action === 'a') return activate();
    if (modalOpen === 'cover' && action === 'y') return resetCover();
    if (modalOpen === 'details' && action === 'y') return toggleFavorite();
    if (modalOpen === 'details' && action === 'x') { closeModal(); return openCoverModal(); }
    if (action === 'start' && modalOpen === 'settings') return closeModal();
    return;
  }

  // Home Screen
  switch (action) {
    case 'left': case 'right': case 'up': case 'down':
      return navigateHome(action);
    case 'a':
      return activate();
    case 'b':
      if (getHomeZone() === 'store') {
        const tab = document.querySelector('#cats-nav .tab[data-cat="store"]');
        if (tab) { setFocus(tab); sfx('playBack'); }
      } else if (getHomeZone() !== 'carousel') {
        focusCard();
        sfx('playBack');
      }
      return;
    case 'x':
      if (currentCat === 'store') return loadStore(true);
      return openCoverModal();
    case 'y':
      if (currentCat === 'store') {
        focusTextInput($('store-q'));
        sfx('playMove');
        return;
      }
      return toggleFavorite();
    case 'start':
      openModal('settings');
      sfx('playSelect');
      return;
    case 'select': case 'info':
      return openDetails();
    case 'l3':
      if (currentCat === 'store') {
        const tile = focusEl && focusEl.classList.contains('store-card') ? storeState.tiles[Number(focusEl.dataset.i)] : null;
        if (tile) return toggleStoreFavorite(tile);
        return;
      }
      return rescanLibrary();
    case 'lb':
      return cycleCategory(-1);
    case 'rb':
      return cycleCategory(1);
    case 'lt':
      return selectGame(Math.max(0, selectedIndex - 5));
    case 'rt':
      return selectGame(selectedIndex + 5);
  }
});

let padState = { connected: false, id: '' };
function renderPadLabel() {
  const name = padState.connected ? (padState.id || t('tip.pad')).replace(/\(.*$/, '').trim().slice(0, 28) : t('w.no_pad');
  $('gp-name').textContent = padState.connected ? t('tip.pad') : 'Gamepad';
  $('dock-gamepad-label').textContent = name;
  $('gp-pill').classList.toggle('text-tertiary-fixed', padState.connected);
}
GamepadManager.on('connectionChange', ({ connected, id }) => {
  padState = { connected, id };
  renderPadLabel();
  renderStoreFavoriteHint();
  if (connected) {
    showToast(t('w.pad_on'), 'sports_esports');
    rumble('rumbleHeavy');
  }
});


// ---------------------------------------------------------------- Spotify Media Sync (WinRT)
let media = { active: false, playing: false, position: 0, duration: 0, key: '', stamp: 0 };

async function pollMedia() {
  try {
    const res = await fetch('/api/media');
    if (!res.ok) return;
    const m = await res.json();
    if (!m.available || !m.active) {
      media = { active: false, playing: false, position: 0, duration: 0, key: '', stamp: 0 };
      $('sp-title').textContent = m.available === false ? t('w.unavailable') : t('w.no_track');
      $('sp-artist').textContent = m.available === false ? t('w.media_off') : t('w.open_to_start');
      $('sp-art').style.backgroundImage = 'none';
      $('sp-art').innerHTML = '<span class="material-symbols-outlined text-[26px]">music_note</span>';
    } else {
      media = { active: true, playing: m.playing, position: m.position, duration: m.duration, key: m.key, stamp: Date.now() };
      $('sp-title').textContent = m.title || t('w.unknown');
      $('sp-artist').textContent = [m.artist, m.album].filter(Boolean).join(' • ');
      if (m.has_thumb) {
        $('sp-art').innerHTML = '';
        $('sp-art').style.backgroundImage = `url("/api/media/thumb?k=${encodeURIComponent(m.key)}")`;
      } else {
        $('sp-art').style.backgroundImage = 'none';
        $('sp-art').innerHTML = '<span class="material-symbols-outlined text-[26px]">music_note</span>';
      }
    }
  } catch (e) { /* offline / launching */ }
  renderMedia();
}

function renderMedia() {
  const pos = media.playing ? media.position + (Date.now() - media.stamp) / 1000 : media.position;
  const p = media.duration > 0 ? Math.min(100, pos / media.duration * 100) : 0;
  $('sp-bar').style.width = `${p}%`;
  $('sp-time').lastChild.textContent = ` ${fmtMMSS(pos)} / ${fmtMMSS(media.duration)}`;
  $('sp-play-ic').textContent = media.playing ? 'pause' : 'play_arrow';
  $('sp-eq').classList.toggle('live', media.playing);
}

async function mediaCmd(cmd) {
  try { await post('/api/media/control', { cmd }); } catch (e) { /* noop */ }
  if (cmd === 'toggle') {
    media.position += media.playing ? (Date.now() - media.stamp) / 1000 : 0;
    media.playing = !media.playing;
    media.stamp = Date.now();
    renderMedia();
  }
  setTimeout(pollMedia, 300);
}

async function openApp(target) {
  try {
    const r = await (await post('/api/open', { target })).json();
    if (!r.ok) showToast(t('toast.app_err', { x: ({ spotify: 'Spotify', discord: 'Discord', browser: t('w.the_browser') })[target] || target }), 'error');
  } catch (e) {
    showToast(t('toast.app_err2'), 'error');
  }
}

// ---------------------------------------------------------------- Temi (solo colori)
const THEMES = [['nexus', 'Nexus'], ['obsidian', 'Obsidian'], ['xbox', 'Xbox Mode'], ['ps5', 'PS5'], ['white', 'Bianco totale']];

// ---------------------------------------------------------------- SteamGridDB
// ================================================================ IMPOSTAZIONI
const COUNTRY_CODES = ['IT', 'DE', 'FR', 'ES', 'PT', 'GB', 'IE', 'NL', 'BE', 'AT', 'CH', 'PL', 'SE', 'NO', 'DK', 'FI', 'TR', 'US', 'CA', 'MX', 'BR', 'AR', 'CL', 'AU', 'JP', 'KR'];
const PCT = (arr) => arr.map((v) => [v, `${v}%`]);
const GLYPHS = { xbox: { A: 'A', B: 'B', X: 'X', Y: 'Y' }, ps: { A: '✕', B: '○', X: '□', Y: '△' } };
let setCatId = 'general';
let resetArmed = null;
let sysInfo = null;
let autostartState = { supported: false, enabled: false, checked: false };

const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function setPath(o, p, v) {
  const ks = p.split('.');
  let c = o;
  ks.slice(0, -1).forEach((k) => { if (typeof c[k] !== 'object' || c[k] === null) c[k] = {}; c = c[k]; });
  c[ks[ks.length - 1]] = v;
}

function glyphify(str) {
  const g = GLYPHS[settings.glyphs] || GLYPHS.xbox;
  return str.replace(/\[([ABXY])\]/g, (m, k) => `[${g[k]}]`);
}

function applyGlyphs() {
  const g = GLYPHS[settings.glyphs] || GLYPHS.xbox;
  ['A', 'B', 'X', 'Y'].forEach((k) => document.querySelectorAll('.kb-' + k.toLowerCase()).forEach((el) => { el.textContent = g[k]; }));
}

function applyTheme(id) {
  if (!THEMES.some((x) => x[0] === id)) id = 'nexus';
  settings.theme = id;
  document.documentElement.dataset.theme = id;
}

function applyWidgets() {
  const map = [['w-spotify', 'spotify', 4], ['w-links', 'links', 3], ['w-telemetry', 'telemetry', 5]];
  const w = settings.widgets || {};
  const vis = map.filter(([, k]) => w[k] !== false);
  map.forEach(([id, k]) => $(id).classList.toggle('hidden', w[k] === false));
  const sum = vis.reduce((a, m) => a + m[2], 0) || 12;
  const wide = window.matchMedia('(min-width: 768px)').matches;
  let used = 0;
  vis.forEach(([id, , n], i) => {
    const span = i === vis.length - 1 ? 12 - used : Math.round(n * 12 / sum);
    used += span;
    $(id).style.gridColumn = wide ? `span ${span} / span ${span}` : '';
  });
  map.filter(([, k]) => w[k] === false).forEach(([id]) => { $(id).style.gridColumn = ''; });
}

function applySettings() {
  applyTheme(settings.theme);
  const root = document.documentElement;
  root.style.fontSize = `${16 * (settings.ui_scale || 100) / 100}px`;
  root.classList.toggle('reduce-motion', !!settings.reduce_motion);
  root.style.setProperty('--bd-mult', settings.show_backdrop === false ? '0' : String((settings.backdrop_strength || 100) / 100));
  applyWidgets();
  applyGlyphs();
  if (window.SFX) { SFX.enabled = settings.sfx !== false; SFX.volume = (settings.sfx_volume == null ? 70 : settings.sfx_volume) / 100; }
  try {
    GamepadManager.rumbleEnabled = settings.rumble !== false;
    GamepadManager.rumbleScale = (settings.rumble_strength == null ? 100 : settings.rumble_strength) / 100;
  } catch (e) { /* noop */ }
  $('user-nickname').textContent = (settings.nick || 'Giocatore 1').toUpperCase();
}

function refreshI18n() {
  I18N.apply(document);
  applyGlyphs();
  renderPadLabel();
  renderCategories();
  renderCarousel();
  updateClock();
  if (!$('store-page').classList.contains('hidden')) { storeState.tiles = []; loadStore(); }
  if (modalOpen === 'settings') renderSettings();
}

function changeLang(code) {
  settings.lang = code;
  settings.lang_user = true;
  I18N.setLang(code);
  refreshI18n();
  post('/api/settings', { lang: code, lang_user: true }).catch(() => {});
}

function initSettingsAndLanguage() {
  if (!settings.lang_user) {
    const nav = String(navigator.language || 'it').slice(0, 2).toLowerCase();
    if (I18N.langs.some(([c]) => c === nav)) settings.lang = nav;
  }
  I18N.post = glyphify;
  I18N.setLang(settings.lang || 'it');
  applySettings();
  renderPadLabel();
}

async function setSetting(path, value) {
  setPath(settings, path, value);
  applySettings();
  if (path === 'platforms.steam' || path === 'platforms.epic' || path === 'sort') { selectedIndex = 0; renderCarousel(); }
  try { const body = {}; setPath(body, path, value); await post('/api/settings', body); } catch (e) { /* offline */ }
}

function countryName(code) {
  try { return new Intl.DisplayNames([I18N.localeTag()], { type: 'region' }).of(code) || code; } catch (e) { return code; }
}

function setCats() {
  const tg = (path, label, desc, dflt = true) => ({ type: 'toggle', id: path, label, desc, get: () => { const v = getPath(settings, path); return v === undefined ? dflt : !!v; }, set: (v) => setSetting(path, v) });
  const sel = (path, label, desc, opts, dflt, conv) => ({ type: 'select', id: path, label, desc, opts, get: () => { const v = getPath(settings, path); return v === undefined ? dflt : v; }, set: (v) => setSetting(path, conv ? conv(v) : v) });
  return [
    { id: 'general', label: 'set.cat.general', icon: 'tune', rows: [
      { type: 'select', id: 'lang', label: 'set.lang', desc: 'set.lang_d', opts: () => I18N.langs.map(([c, n]) => [c, n]), get: () => settings.lang || 'it', set: (v) => changeLang(v) },
      { type: 'text', id: 'nick', label: 'set.nick', desc: 'set.nick_d', ph: 'set.nick_ph', get: () => settings.nick || '', set: (v) => setSetting('nick', v.trim() || 'Giocatore 1') },
      { type: 'autostart', id: 'autostart', label: 'set.autostart', desc: 'set.autostart_d' },
      tg('start_fullscreen', 'set.fullscreen', 'set.fullscreen_d'),
    ] },
    { id: 'look', label: 'set.cat.look', icon: 'palette', rows: [
      sel('theme', 'set.theme', 'set.theme_d', () => THEMES.map(([id]) => [id, t('theme.' + id)]), 'nexus'),
      sel('ui_scale', 'set.scale', 'set.scale_d', () => PCT([90, 100, 110, 125, 140]), 100, Number),
      tg('show_backdrop', 'set.backdrop', 'set.backdrop_d'),
      sel('backdrop_strength', 'set.backdrop_str', null, () => PCT([50, 75, 100, 125, 150]), 100, Number),
      tg('reduce_motion', 'set.motion', 'set.motion_d', false),
      tg('widgets.spotify', 'set.w_spotify', 'set.show_d'),
      tg('widgets.links', 'set.w_links', 'set.show_d'),
      tg('widgets.telemetry', 'set.w_tele', 'set.show_d'),
    ] },
    { id: 'library', label: 'set.cat.library', icon: 'video_library', rows: [
      tg('platforms.steam', 'set.steam', 'set.steam_d'),
      tg('platforms.epic', 'set.epic', 'set.epic_d'),
      sel('sort', 'set.sort', 'set.sort_d', () => ['recent', 'hours', 'added'].map((k) => [k, t('sort.' + k)]), 'recent'),
      { type: 'keyrow', id: 'sgdb', label: 'set.sgdb', desc: 'set.sgdb_d', endpoint: '/api/sgdb/key', flag: 'sgdb_enabled',
        after: (on) => { showToast(t(on ? 'set.sgdb_on_toast' : 'set.sgdb_off_toast'), 'image'); if (on) { allGames.forEach((g) => { g.sgdb_done = false; }); fillSgdbArt(); } } },
      { type: 'button', id: 'rescan', label: 'set.rescan', desc: 'set.rescan_d', icon: 'refresh', run: () => { closeModal(); rescanLibrary(); } },
      { type: 'button', id: 'clearcache', label: 'set.clear_cache', desc: 'set.clear_cache_d', icon: 'cleaning_services',
        run: async () => { try { await post('/api/system/clear-cache', {}); allGames.forEach((g) => { g.sgdb_done = false; }); storeState.tiles = []; showToast(t('set.cleared'), 'check_circle'); } catch (e) { showToast(t('set.net_err'), 'error'); } } },
    ] },
    { id: 'input', label: 'set.cat.input', icon: 'sports_esports', rows: [
      sel('glyphs', 'set.glyphs', 'set.glyphs_d', () => [['xbox', t('glyph.xbox')], ['ps', t('glyph.ps')]], 'xbox'),
      tg('rumble', 'set.rumble', 'set.rumble_d'),
      sel('rumble_strength', 'set.rumble_str', null, () => PCT([25, 50, 75, 100]), 100, Number),
      tg('sfx', 'set.sfx', 'set.sfx_d'),
      sel('sfx_volume', 'set.sfx_vol', null, () => PCT([0, 25, 50, 75, 100]), 70, Number),
    ] },
    { id: 'store', label: 'set.cat.store', icon: 'shopping_bag', rows: [
      sel('store_country', 'set.country', 'set.country_d', () => COUNTRY_CODES.map((c) => [c, `${countryName(c)} (${c})`]), 'IT', (v) => { storeState.tiles = []; return v; }),
      tg('store_enabled.steam', 'Steam', 'set.store_on_d'),
      tg('store_enabled.epic', 'Epic Games', 'set.store_on_d'),
      tg('store_enabled.xbox', 'Xbox / Microsoft Store', 'set.store_on_d'),
      { type: 'keyrow', id: 'itad', label: 'set.itad', desc: 'set.itad_d', endpoint: '/api/itad/key', flag: 'itad_enabled',
        after: (on) => { storeState.tiles = []; showToast(t(on ? 'set.itad_on_toast' : 'set.itad_off_toast'), 'savings'); } },
      { type: 'button', id: 'storetest', label: 'set.test', desc: 'set.test_d', icon: 'network_check', run: () => runStoreTest(), out: true },
    ] },
    { id: 'system', label: 'set.cat.system', icon: 'settings', rows: [
      { type: 'info', id: 'ver', label: 'set.version', value: () => (sysInfo ? sysInfo.version : '…') },
      { type: 'info', id: 'dir', label: 'set.data_dir', value: () => (sysInfo ? sysInfo.data_dir : '…') },
      { type: 'info', id: 'gn', label: 'set.games_n', value: () => String(allGames.length) },
      { type: 'button', id: 'opendata', label: 'set.open_data', desc: 'set.open_data_d', icon: 'folder_open', run: () => post('/api/system/open-data-folder', {}).catch(() => {}) },
      { type: 'button', id: 'reset', label: 'set.reset', desc: 'set.reset_d', icon: 'restart_alt', confirm: true,
        run: async () => {
          try {
            const d = await (await post('/api/system/reset-settings', {})).json();
            Object.assign(settings, d.settings);
            delete settings.lang_user;
            I18N.setLang(settings.lang); applySettings(); refreshI18n();
            showToast(t('set.reset_done'), 'restart_alt');
          } catch (e) { showToast(t('set.net_err'), 'error'); }
        } },
      { type: 'button', id: 'quit', label: 'set.quit', icon: 'power_settings_new', run: () => quitApp() },
    ] },
  ];
}

function setPrims() {
  return Array.from(document.querySelectorAll('#set-rows [data-prim]')).filter((e) => e.offsetParent !== null);
}

function rowDef(el) {
  const row = el.closest('[data-row]');
  if (!row) return null;
  const cat = setCats().find((c) => c.id === setCatId);
  return cat ? cat.rows.find((r) => String(r.id) === row.dataset.row) : null;
}

function renderSettings(focusRow) {
  const cats = setCats();
  const nav = $('set-cats');
  nav.innerHTML = '';
  cats.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'set-cat' + (c.id === setCatId ? ' active' : '');
    b.dataset.cat = c.id;
    b.innerHTML = `<span class="material-symbols-outlined text-[22px]">${c.icon}</span><span>${esc(t(c.label))}</span>`;
    b.onclick = () => { switchSetCat(c.id); setFocus(b); };
    nav.appendChild(b);
  });
  const cat = cats.find((c) => c.id === setCatId) || cats[0];
  $('set-panel-title').textContent = t(cat.label);
  const host = $('set-rows');
  host.innerHTML = '';
  cat.rows.forEach((def) => host.appendChild(buildSetRow(def)));
  if (!focusRow) $('set-panel').scrollTop = 0;
  if (cat.id === 'general' && !autostartState.checked) fetchAutostart();
  if (cat.id === 'system' && !sysInfo) fetchSysInfo();
  if (focusRow) {
    const el = host.querySelector(`[data-row="${focusRow}"] [data-prim], [data-row="${focusRow}"][data-prim]`);
    if (el) setFocus(el);
  }
}

async function fetchAutostart() {
  autostartState.checked = true;
  try { Object.assign(autostartState, await (await fetch('/api/system/autostart')).json()); } catch (e) { /* noop */ }
  if (modalOpen === 'settings' && setCatId === 'general') renderSettingsKeepFocus();
}

async function fetchSysInfo() {
  try { sysInfo = await (await fetch('/api/system/info')).json(); } catch (e) { sysInfo = { version: '?', data_dir: '?' }; }
  if (modalOpen === 'settings' && setCatId === 'system') renderSettingsKeepFocus();
}

function renderSettingsKeepFocus() {
  const cur = focusEl && focusEl.closest ? focusEl.closest('[data-row]') : null;
  renderSettings(cur ? cur.dataset.row : null);
}

function buildSetRow(def) {
  const row = document.createElement('div');
  row.className = 'srow' + (def.type === 'keyrow' ? ' srow-col' : '');
  row.dataset.row = def.id;
  const lbl = def.label.startsWith('set.') ? t(def.label) : def.label;
  const desc = def.desc ? (def.desc.startsWith('set.') ? t(def.desc) : def.desc) : '';
  const left = `<div class="min-w-0"><div class="font-headline-sm text-headline-sm text-on-surface font-semibold">${esc(lbl)}</div>${desc ? `<div class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">${esc(desc)}</div>` : ''}</div>`;
  const prim = (el) => { el.setAttribute('data-prim', ''); el.classList.add('sf'); };

  if (def.type === 'toggle' || def.type === 'autostart') {
    const isAuto = def.type === 'autostart';
    const on = isAuto ? !!autostartState.enabled : def.get();
    const disabled = isAuto && !autostartState.supported;
    row.innerHTML = left + `<span class="tg ${on ? 'on' : ''}"><span></span></span>`;
    if (disabled) { row.classList.add('srow-off'); const d = row.querySelector('.font-body-sm'); if (d) d.textContent = t('set.autostart_na'); }
    prim(row);
    row.onclick = async () => {
      if (disabled) return;
      sfx('playTab'); rumble('rumbleSoft');
      if (isAuto) {
        try { const d = await (await post('/api/system/autostart', { enabled: !autostartState.enabled })).json(); autostartState.enabled = !!d.enabled; } catch (e) { showToast(t('set.net_err'), 'error'); }
        renderSettingsKeepFocus();
      } else {
        await def.set(!def.get());
        renderSettingsKeepFocus();
      }
    };
  } else if (def.type === 'select') {
    const opts = def.opts();
    const cur = opts.find(([v]) => String(v) === String(def.get())) || opts[0];
    row.innerHTML = left + `<span class="sel-ctl"><span class="material-symbols-outlined">chevron_left</span><span class="sel-val">${esc(cur[1])}</span><span class="material-symbols-outlined">chevron_right</span></span>`;
    prim(row);
    row.onclick = () => cycleSelect(def, 1);
  } else if (def.type === 'button') {
    row.innerHTML = left + `<span class="material-symbols-outlined text-primary text-[26px]">${def.icon || 'chevron_right'}</span>`;
    prim(row);
    row.onclick = () => {
      if (def.confirm) {
        if (resetArmed !== def.id) {
          resetArmed = def.id;
          const d = row.querySelector('.font-body-sm');
          if (d) d.textContent = t('set.reset_confirm');
          row.classList.add('srow-warn');
          setTimeout(() => { if (resetArmed === def.id) { resetArmed = null; if (modalOpen === 'settings') renderSettingsKeepFocus(); } }, 4000);
          return;
        }
        resetArmed = null;
      }
      sfx('playSelect');
      def.run();
    };
    if (def.out) { const out = document.createElement('div'); out.id = 'set-test-out'; out.className = 'set-test-out'; row.appendChild(out); }
  } else if (def.type === 'info') {
    row.innerHTML = left + `<span class="font-label-lg text-label-lg text-on-surface-variant text-right break-all max-w-[22rem]">${esc(def.value())}</span>`;
  } else if (def.type === 'text') {
    row.innerHTML = left + `<input type="text" autocomplete="off" spellcheck="false" maxlength="24" class="srow-in" value="${esc(def.get())}" placeholder="${esc(t(def.ph || ''))}">`;
    const inp = row.querySelector('input');
    prim(inp);
    inp.addEventListener('change', () => def.set(inp.value));
    inp.addEventListener('blur', () => def.set(inp.value));
  } else if (def.type === 'keyrow') {
    row.innerHTML = left + `<div class="flex items-center gap-space-sm w-full mt-space-sm"><input type="text" autocomplete="off" spellcheck="false" class="srow-in flex-1 min-w-0" placeholder="${esc(t('set.key_ph'))}"><button type="button" class="srow-btn">${esc(t('set.save'))}</button></div><div class="font-body-sm text-body-sm text-on-surface-variant mt-1 key-status"></div>`;
    const inp = row.querySelector('input'); const btn = row.querySelector('button'); const st = row.querySelector('.key-status');
    prim(inp); btn.classList.add('sf'); btn.setAttribute('data-sec', '');
    st.textContent = settings[def.flag] ? t('set.key_on') : t('set.key_none');
    const save = async () => {
      const key = inp.value.trim();
      st.textContent = t(key ? 'set.key_checking' : 'set.key_removing');
      try {
        const d = await (await post(def.endpoint, { key })).json();
        if (!d.ok) { st.textContent = d.error || t('set.key_invalid'); sfx('playBack'); return; }
        settings[def.flag] = !!d.enabled; inp.value = ''; st.textContent = settings[def.flag] ? t('set.key_on') : t('set.key_none');
        sfx('playSelect'); def.after(!!d.enabled);
      } catch (e) { st.textContent = t('set.net_err'); }
    };
    btn.onclick = save;
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  }
  return row;
}

function cycleSelect(def, delta) {
  const opts = def.opts();
  const i = Math.max(0, opts.findIndex(([v]) => String(v) === String(def.get())));
  const next = opts[(i + delta + opts.length) % opts.length][0];
  sfx('playTab'); rumble('rumbleSoft');
  Promise.resolve(def.set(next)).then(() => renderSettingsKeepFocus());
}

function switchSetCat(idOrDelta, focusSidebar) {
  const cats = setCats();
  let i = cats.findIndex((c) => c.id === setCatId);
  i = typeof idOrDelta === 'number' ? (i + idOrDelta + cats.length) % cats.length : cats.findIndex((c) => c.id === idOrDelta);
  if (i < 0) return;
  setCatId = cats[i].id;
  renderSettings();
  if (focusSidebar) setFocus($('set-cats').children[i]);
  sfx('playTab');
}

function navigateSettings(dir) {
  const catBtns = Array.from($('set-cats').children);
  if (focusEl && catBtns.includes(focusEl)) {
    const i = catBtns.indexOf(focusEl);
    if (dir === 'up' || dir === 'down') {
      const n = dir === 'up' ? i - 1 : i + 1;
      if (n >= 0 && n < catBtns.length) { switchSetCat(catBtns[n].dataset.cat, false); setFocus($('set-cats').children[n]); }
    } else if (dir === 'right') {
      const p = setPrims()[0];
      if (p) { setFocus(p); sfx('playMove'); }
    }
    return;
  }
  const prims = setPrims();
  const isSec = !!(focusEl && focusEl.hasAttribute && focusEl.hasAttribute('data-sec'));
  const prim = isSec ? focusEl.closest('[data-row]').querySelector('[data-prim]') : focusEl;
  const i = prims.indexOf(prim);
  if (dir === 'up') {
    if (i > 0) setFocus(prims[i - 1]); else setFocus($('set-cats').querySelector('.active') || catBtns[0]);
    sfx('playMove');
  } else if (dir === 'down') {
    if (i < prims.length - 1) { setFocus(prims[i + 1]); sfx('playMove'); }
  } else if (dir === 'left' || dir === 'right') {
    const def = rowDef(focusEl);
    if (def && def.type === 'select') { cycleSelect(def, dir === 'left' ? -1 : 1); return; }
    if (def && def.type === 'keyrow') {
      const btn = focusEl.closest('[data-row]').querySelector('[data-sec]');
      if (dir === 'right' && !isSec) { setFocus(btn); sfx('playMove'); return; }
      if (dir === 'left' && isSec) { setFocus(prim); sfx('playMove'); return; }
    }
    if (dir === 'left') { setFocus($('set-cats').querySelector('.active') || catBtns[0]); sfx('playMove'); }
  }
}

async function runStoreTest() {
  const out = $('set-test-out');
  if (!out) return;
  out.innerHTML = `<div class="set-test-line">${esc(t('test.running'))}</div>`;
  try {
    const d = await (await fetch('/api/store/diagnose')).json();
    const names = { steam: 'Steam', epic: 'Epic Games', epic_free: t('test.epic_free'), xbox: 'Xbox / Microsoft', itad: 'IsThereAnyDeal' };
    let blocked = false;
    out.innerHTML = Object.keys(names).filter((k) => d[k]).map((k) => {
      const r = d[k];
      let msg;
      if (r.ok) msg = t('test.ok', { n: r.count, ms: r.ms });
      else if (r.detail === 'nessun risultato') msg = t('test.empty');
      else { msg = t('test.fail', { e: r.detail }); if (k === 'epic' && /anti-bot|403/.test(r.detail)) blocked = true; }
      return `<div class="set-test-line ${r.ok ? 'ok' : 'ko'}"><span class="material-symbols-outlined text-[18px]">${r.ok ? 'check_circle' : 'error'}</span><b>${esc(names[k])}</b><span>${esc(msg)}</span></div>`;
    }).join('') + (blocked && !(d._info && d._info.itad_key) ? `<div class="set-test-hint">${esc(t('test.hint_blocked'))}</div>` : '');
  } catch (e) {
    out.innerHTML = `<div class="set-test-line ko">${esc(t('set.net_err'))}</div>`;
  }
}

let sgdbRunning = false;
async function fillSgdbArt() {
  if (sgdbRunning || !settings.sgdb_enabled) return;
  sgdbRunning = true;
  try {
    for (const g of allGames.slice()) {
      if (g.sgdb_done) continue;
      let d;
      try { d = await (await fetch(`/api/sgdb/art?id=${encodeURIComponent(g.id)}`)).json(); } catch (e) { break; }
      if (!d.enabled) break;
      if (d.error) { if (d.error === 'offline' || /chiave/i.test(d.error)) break; continue; }
      g.sgdb_done = true;
      if (d.hero) g.banner_url = d.hero;
      if (d.poster && !g.is_custom_cover) g.poster_url = d.poster;
      if (d.poster || d.hero) updateCardArt(g);
    }
  } finally {
    sgdbRunning = false;
  }
}

function updateCardArt(g) {
  const games = getFilteredGames();
  const i = games.findIndex((x) => x.id === g.id);
  if (i < 0) return;
  const card = document.querySelectorAll('.game-card')[i];
  if (card) setArt(card.querySelector('.art'), g, artUrl(g));
  if (i === selectedIndex) applyBackdrop(g);
}

// ---------------------------------------------------------------- App / giochi personalizzati
function buildAddTile() {
  const c = document.createElement('div');
  c.className = 'game-card add-tile';
  c.id = 'add-tile';
  c.setAttribute('role', 'button');
  c.innerHTML = `
    <div class="flex flex-col items-center justify-center gap-2 w-full text-on-surface-variant py-8">
      <span class="material-symbols-outlined text-[56px] text-primary">add_circle</span>
      <span class="font-headline-sm font-bold text-on-surface">${esc(t('addtile.title'))}</span>
      <span class="font-body-sm">${esc(t('addtile.sub'))}</span>
    </div>`;
  const tileIdx = () => getFilteredGames().length;
  c.onclick = () => {
    if (selectedIndex === tileIdx()) addCustomApp();
    else { selectGame(tileIdx()); setFocus(c); }
  };
  c.onmouseenter = () => { if (selectedIndex !== tileIdx()) selectGame(tileIdx(), false); };
  return c;
}

async function addCustomApp() {
  showToast(t('toast.pick_app'), 'folder_open');
  try {
    const r = await post('/api/custom/add', {});
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || 'error');
    if (d.status === 'cancelled') return;
    if (d.status === 'exists') showToast(t('toast.exists'), 'info');
    else { showToast(t('toast.added', { name: d.name }), 'add_circle'); sfx('playSelect'); rumble('rumbleSoft'); }
    const gd = await (await fetch('/api/games')).json();
    allGames = gd.games || [];
    renderCarousel();
    const i = getFilteredGames().findIndex((x) => x.id === d.id);
    if (i >= 0) selectGame(i, false);
    focusCard();
    if (settings.sgdb_enabled) fillSgdbArt();
  } catch (e) {
    showToast(t('toast.add_err', { e: e.message }), 'error');
  }
}

async function removeCustom() {
  const g = curGame();
  if (!g || g.source !== 'Custom') return;
  try {
    const r = await post('/api/custom/remove', { id: g.id });
    if (!r.ok) throw new Error();
    allGames = allGames.filter((x) => x.id !== g.id);
    closeModal();
    selectedIndex = Math.max(0, selectedIndex - 1);
    renderCarousel();
    focusCard();
    showToast(t('toast.removed', { name: g.name }), 'delete');
  } catch (e) {
    showToast(t('toast.remove_err'), 'error');
  }
}

// ---------------------------------------------------------------- Store / comparatore prezzi
const STORES = [['steam', 'Steam'], ['epic', 'Epic'], ['xbox', 'Xbox']];
const storeState = { tiles: [], errors: {}, mode: 'home', loading: false, token: 0, q: '' };

function storeKey(tile) {
  return String(tile && tile.title || '').trim().toLocaleLowerCase();
}

function isStoreFavorite(tile) {
  return Array.isArray(settings.store_favorites) && settings.store_favorites.includes(storeKey(tile));
}

async function toggleStoreFavorite(tile) {
  const key = storeKey(tile);
  if (!key) return;
  const favs = new Set(Array.isArray(settings.store_favorites) ? settings.store_favorites : []);
  if (favs.has(key)) favs.delete(key); else favs.add(key);
  settings.store_favorites = [...favs];
  tile.is_fav = favs.has(key);
  renderStore();
  try { await post('/api/settings', { store_favorites: settings.store_favorites }); }
  catch (e) { /* il preferito resta attivo nella sessione */ }
}

function fmtMoney(v, cur) {
  try { return new Intl.NumberFormat(I18N.localeTag(), { style: 'currency', currency: cur || 'EUR' }).format(v); }
  catch (e) { return `${Number(v).toFixed(2)} ${cur || ''}`.trim(); }
}

function showStorePage(on) {
  window.scrollTo(0, 0);
  $('home-content').classList.toggle('hidden', on);
  $('store-page').classList.toggle('hidden', !on);
  if (on) {
    setBackdrop(null);
    const glow = $('ambient-glow');
    if (glow) glow.style.backgroundColor = '';
    if (!storeState.tiles.length && !storeState.loading) loadStore();
  }
}

async function loadStore(refresh = false) {
  const q = $('store-q').value.trim();
  const search = q.length >= 2;
  const my = ++storeState.token;
  storeState.loading = true;
  storeState.q = q;
  renderStore();
  try {
    const url = search ? `/api/store/search?q=${encodeURIComponent(q)}` : `/api/store/home${refresh === true ? '?refresh=true' : ''}`;
    const d = await (await fetch(url)).json();
    if (my !== storeState.token) return;
    storeState.tiles = d.tiles || [];
    storeState.errors = d.errors || {};
    storeState.updated = d.updated || 0;
  } catch (e) {
    if (my !== storeState.token) return;
    storeState.tiles = [];
    storeState.errors = { rete: 'connessione assente' };
  }
  storeState.mode = search ? 'search' : 'home';
  storeState.loading = false;
  renderStore();
}

async function openUrl(url) {
  try {
    const r = await (await post('/api/open', { url })).json();
    if (r.ok) { showToast(t('toast.open_page'), 'open_in_new'); sfx('playSelect'); }
    else showToast(t('toast.open_page_err'), 'error');
  } catch (e) {
    showToast(t('toast.open_err'), 'error');
  }
}

const STORE_ICONS = { steam: 'desktop_windows', epic: 'storefront', xbox: 'sports_esports' };
const STORE_LABEL = { steam: 'Steam', epic: 'Epic Games', xbox: 'Xbox Store' };
let storeSpot = null;

function offerText(o) {
  return o.free ? t('store.free') : (o.price == null ? '—' : fmtMoney(o.price, o.currency));
}

// "In evidenza" + pannello di confronto: segue il riquadro selezionato
function setStoreSpotlight(t) {
  storeSpot = t || null;
  const hero = $('store-hero');
  hero.classList.toggle('hidden', !t);
  if (!t) return;

  const best = t.best && t.offers[t.best];
  const priced = Object.entries(t.offers).filter(([, o]) => o.price != null).sort((x, y) => x[1].price - y[1].price);

  const tags = [`<span class="sh-tag sh-tag-hl">${esc(I18N.t('store.featured').toUpperCase())}${best && best.discount > 0 ? ' • ' + esc(I18N.t('store.top_discount').toUpperCase()) : ''}</span>`];
  if (best) tags.push(`<span class="sh-tag">${esc(I18N.t('store.best_in', { store: STORE_LABEL[t.best] }).toUpperCase())}</span>`);
  if (best && best.discount > 0) tags.push(`<span class="sh-tag" style="background:rgb(var(--c-tertiary-container));color:rgb(var(--c-on-tertiary-container))">-${best.discount}%</span>`);
  $('sh-tags').innerHTML = tags.join('');
  $('sh-title').textContent = t.title;
  $('sh-title').title = t.title;
  $('sh-sub').textContent = best ? I18N.t('store.price_on', { price: offerText(best), store: STORE_LABEL[t.best] }) : I18N.t('store.no_price');

  let note = '';
  if (priced.length >= 2) {
    const worst = priced[priced.length - 1];
    const diff = worst[1].price - priced[0][1].price;
    note = diff > 0.005 ? I18N.t('store.save', { x: fmtMoney(diff, priced[0][1].currency), store: STORE_LABEL[worst[0]] }) : I18N.t('store.same');
  } else if (priced.length === 1) {
    note = I18N.t('store.only', { store: STORE_LABEL[priced[0][0]] });
  }
  $('sh-note').textContent = note;

  const order = [...priced.map(([id]) => id), ...STORES.map(([id]) => id).filter((id) => !priced.some(([p]) => p === id))];
  const bestPrice = priced.length ? priced[0][1].price : null;
  $('sh-rows').innerHTML = order.map((id) => {
    const o = t.offers[id];
    if (!o) {
      return `<div class="sh-row na"><div class="flex items-center gap-space-md"><div class="sh-ico"><span class="material-symbols-outlined">${STORE_ICONS[id]}</span></div>
        <div class="flex flex-col"><span class="sh-name">${STORE_LABEL[id]}</span><span class="sh-sub">${esc(I18N.t('store.na'))}</span></div></div></div>`;
    }
    const isBest = id === t.best;
    const old = o.discount > 0 && o.original ? `<span class="sh-old">${esc(fmtMoney(o.original, o.currency))}</span>` : '';
    const off = o.discount > 0 ? `<span class="sh-off">${esc(I18N.t('store.off', { n: o.discount }).toUpperCase())}</span>` : '';
    const sub = isBest ? I18N.t('store.lowest') : (bestPrice != null && o.price != null ? I18N.t('store.vs_best', { x: fmtMoney(o.price - bestPrice, o.currency) }) : '');
    return `<div class="sh-row${isBest ? ' best' : ''}" data-url="${esc(o.url || '')}">
      <div class="flex items-center gap-space-md min-w-0"><div class="sh-ico"><span class="material-symbols-outlined">${STORE_ICONS[id]}</span></div>
        <div class="flex flex-col min-w-0"><span class="sh-name">${STORE_LABEL[id]}${isBest ? '<span class="sh-badge">' + esc(I18N.t('store.best_tag').toUpperCase()) + '</span>' : ''}</span><span class="sh-sub">${esc(sub)}</span></div></div>
      <div class="sh-price">${old}${esc(offerText(o))}${off}</div></div>`;
  }).join('');
  $('sh-rows').querySelectorAll('.sh-row[data-url]').forEach((r) => {
    r.onclick = () => { if (r.dataset.url) openUrl(r.dataset.url); };
  });

  $('sh-open-label').textContent = best ? I18N.t('store.open_on', { store: STORE_LABEL[t.best], price: offerText(best) }) : I18N.t('store.open');
  $('sh-open').dataset.url = best ? (best.url || '') : '';
  $('sh-updated').innerHTML = storeState.updated
    ? `<span class="material-symbols-outlined text-[14px]">sync</span>${esc(I18N.t('store.synced', { t: new Date(storeState.updated * 1000).toLocaleTimeString(I18N.localeTag(), { hour: '2-digit', minute: '2-digit' }) }))}` : '';

  const art = t.hero || t.image || t.poster;
  $('sh-bg').style.backgroundImage = art ? `url("${String(art).replace(/"/g, '%22')}")` : 'none';
}

function buildStoreTile(t, idx) {
  const el = document.createElement('div');
  el.className = 'store-card group';
  el.dataset.i = idx;
  el.dataset.key = storeKey(t);
  el.setAttribute('role', 'button');
  const best = t.best && t.offers[t.best];
  const badge = best ? `<span class="sc-badge">${esc(I18N.t('store.badge', { store: STORE_LABEL[t.best].replace(' Store', '').replace(' Games', '') }))}</span>` : '';
  const disc = best && best.discount > 0 ? `<span class="sc-disc">-${best.discount}%</span>` : '';
  const rows = STORES.map(([id]) => {
    const o = t.offers[id];
    if (!o) return `<div class="sc-row na"><span>${STORE_LABEL[id].replace(' Store', '').replace(' Games', '')}</span><span>${esc(I18N.t('store.nd'))}</span></div>`;
    const off = o.discount > 0 ? `<span class="sc-off">(-${o.discount}%)</span>` : '';
    return `<div class="sc-row${t.best === id ? ' best' : ''}" data-store="${id}"><span>${STORE_LABEL[id].replace(' Store', '').replace(' Games', '')}</span><span>${esc(offerText(o))}${off}</span></div>`;
  }).join('');
  const fav = isStoreFavorite(t);
  t.is_fav = fav;
  el.innerHTML = `<div class="sc-art"><span class="sc-fallback material-symbols-outlined">sports_esports</span>${t.image ? `<img alt="" loading="lazy" src="${esc(t.image)}">` : ''}${badge}${disc}<button type="button" class="store-fav${fav ? ' on' : ''}" title="${esc(I18N.t(fav ? 'store.remove_favorite' : 'store.add_favorite'))}"><span class="material-symbols-outlined">${fav ? 'favorite' : 'favorite_border'}</span></button></div>
    <h3 class="font-headline-sm text-headline-sm text-primary font-bold truncate px-1" title="${esc(t.title)}">${esc(t.title)}</h3>
    <div class="sc-prices">${rows}</div>
    <div class="sc-cta"><span>${esc(I18N.t('store.view_offer'))}</span><span class="material-symbols-outlined text-[16px]">arrow_forward</span></div>`;
  const img = el.querySelector('img');
  if (img) {
    const chain = [t.image2, t.poster].filter((u) => u && u !== t.image);
    img.onerror = () => { const next = chain.shift(); if (next) img.src = next; else img.remove(); };
  }
  const open = (store) => { const o = t.offers[store]; if (o && o.url) openUrl(o.url); };
  el.onclick = () => open(t.best || Object.keys(t.offers)[0]);
  el.querySelector('.store-fav').onclick = (ev) => { ev.stopPropagation(); toggleStoreFavorite(t); };
  el.onmouseenter = () => { if (storeSpot !== t) setStoreSpotlight(t); };
  el.querySelectorAll('.sc-row[data-store]').forEach((r) => {
    r.onclick = (ev) => { ev.stopPropagation(); open(r.dataset.store); };
  });
  return el;
}

function storeStickLabel() {
  const id = String(padState.id || '').toLowerCase();
  if (id.includes('playstation') || id.includes('dualshock') || id.includes('dualsense')) return 'L3';
  if (id.includes('nintendo') || id.includes('switch')) return 'Levetta sinistra';
  if (id.includes('xbox')) return 'LS';
  return 'L3';
}

function renderStoreFavoriteHint() {
  const key = $('store-fav-hint-key');
  const text = $('store-fav-hint');
  if (!key || !text) return;
  const label = storeStickLabel();
  key.textContent = label;
  text.textContent = `Premi ${label} per aggiungere ai preferiti`;
}

function renderStore() {
  const grid = $('store-grid');
  renderStoreFavoriteHint();
  const hadFocus = focusEl && grid.contains(focusEl);
  const focusedKey = hadFocus && focusEl.dataset.key ? focusEl.dataset.key : null;
  grid.innerHTML = '';
  const names = { steam: 'Steam', epic: 'Epic Games', xbox: 'Xbox', rete: 'Rete' };
  const bad = Object.keys(storeState.errors).map((k) => names[k] || k);
  $('store-title').textContent = storeState.mode === 'search' && storeState.q ? I18N.t('store.results', { q: storeState.q }) : I18N.t('store.latest');
  $('store-count').textContent = storeState.loading ? '…' : String(storeState.tiles.length);
  $('store-note').textContent = storeState.loading ? I18N.t('store.loading')
    : (bad.length ? I18N.t('store.unreachable', { list: bad.join(', ') }) : I18N.t('store.note'));
  const empty = !storeState.loading && storeState.tiles.length === 0;
  $('store-empty').classList.toggle('hidden', !empty);
  if (empty) {
    $('store-empty-text').textContent = bad.length ? I18N.t('store.empty_net')
      : (storeState.mode === 'search' ? I18N.t('store.empty_search') : I18N.t('store.empty_home'));
    setStoreSpotlight(null);
  }
  if (storeState.loading) {
    for (let i = 0; i < 8; i++) { const d = document.createElement('div'); d.className = 'store-skel'; grid.appendChild(d); }
    if (hadFocus) setFocus($('store-q'));
    return;
  }
  storeState.tiles.sort((a, b) => Number(isStoreFavorite(b)) - Number(isStoreFavorite(a)));
  storeState.tiles.forEach((t, i) => grid.appendChild(buildStoreTile(t, i)));
  if (!empty) {
    const keep = storeSpot && storeState.tiles.find((t) => t.title === storeSpot.title);
    setStoreSpotlight(keep || storeState.tiles[0]);
  }
  if (hadFocus) {
    const tiles = grid.querySelectorAll('.store-card');
    const keep = focusedKey ? Array.from(tiles).find((tile) => tile.dataset.key === focusedKey) : null;
    setFocus(keep || tiles[0] || $('store-q'));
  }
}

// Navigazione "spaziale": sceglie l'elemento più vicino nella direzione premuta
function spatialNext(list, from, dir) {
  if (!from) return list[0] || null;
  const fr = from.getBoundingClientRect();
  const fx = fr.left + fr.width / 2;
  const fy = fr.top + fr.height / 2;
  let best = null;
  let bestScore = Infinity;
  list.forEach((el) => {
    if (el === from) return;
    const r = el.getBoundingClientRect();
    const dx = r.left + r.width / 2 - fx;
    const dy = r.top + r.height / 2 - fy;
    let main; let cross;
    if (dir === 'right') { main = dx; cross = Math.abs(dy); }
    else if (dir === 'left') { main = -dx; cross = Math.abs(dy); }
    else if (dir === 'down') { main = dy; cross = Math.abs(dx); }
    else { main = -dy; cross = Math.abs(dx); }
    if (main <= 8) return;
    const score = main + cross * 2.5;
    if (score < bestScore) { bestScore = score; best = el; }
  });
  return best;
}

function navigateStore(dir) {
  const q = $('store-q');
  const rf = $('store-refresh');
  const so = $('sh-open');
  const sr = $('sh-refresh');
  const soOk = so && so.offsetParent !== null;
  const tiles = Array.from(document.querySelectorAll('#store-grid .store-card'));
  const tab = document.querySelector('#cats-nav .tab[data-cat="store"]');
  const firstBelow = soOk ? so : (tiles[0] || q);
  if (focusEl === q) {
    if (dir === 'right') setFocus(rf);
    else if (dir === 'down') setFocus(firstBelow);
    else if (dir === 'up') setFocus(tab);
    else return;
  } else if (focusEl === rf) {
    if (dir === 'left') setFocus(q);
    else if (dir === 'down') setFocus(firstBelow);
    else if (dir === 'up') setFocus(tab);
    else return;
  } else if (focusEl === so) {
    if (dir === 'right') setFocus(sr);
    else if (dir === 'up') setFocus(q);
    else if (dir === 'down') setFocus(tiles[0] || so);
    else return;
  } else if (focusEl === sr) {
    if (dir === 'left') setFocus(so);
    else if (dir === 'up') setFocus(q);
    else if (dir === 'down') setFocus(tiles[0] || sr);
    else return;
  } else {
    const next = spatialNext(tiles, focusEl, dir);
    if (next) setFocus(next);
    else if (dir === 'up') setFocus(soOk ? so : q);
    else return;
  }
  sfx('playMove');
}

// ---------------------------------------------------------------- Telemetry & Clock
async function pollTelemetry() {
  try {
    const res = await fetch('/api/telemetry');
    if (!res.ok) return;
    const t = await res.json();
    $('telemetry-cpu-val').textContent = `${Math.round(t.cpu_percent)}%`;
    $('telemetry-cpu-bar').style.width = `${t.cpu_percent}%`;
    $('telemetry-ram-val').textContent = `${Math.round(t.ram_percent)}%`;
    $('telemetry-ram-bar').style.width = `${t.ram_percent}%`;
    $('ram-detail').textContent = `${t.ram_used_gb} / ${t.ram_total_gb} GB`;
  } catch (e) { /* noop */ }
}

function updateNet() {
  const on = navigator.onLine;
  $('net-ic').textContent = on ? 'wifi' : 'wifi_off';
  $('net-ic').classList.toggle('text-tertiary-fixed', on);
  $('net-ic').classList.toggle('text-error', !on);
}

function updateClock() {
  const now = new Date();
  $('clock').textContent = now.toLocaleTimeString(I18N.localeTag(), { hour: '2-digit', minute: '2-digit' });
  const dEl = $('clock-date');
  if (dEl) dEl.textContent = now.toLocaleDateString(I18N.localeTag(), { weekday: 'short', day: '2-digit', month: 'short' }).replace(/\./g, '').toUpperCase();
}

// ---------------------------------------------------------------- Bindings & Initialization
function bind() {
  // Gli input del launcher sono usati anche senza mouse: apri la tastiera
  // virtuale quando l'utente li attiva con click o con A sul gamepad.
  document.addEventListener('click', (e) => {
    const input = e.target && e.target.closest ? e.target.closest('input[type="text"]') : null;
    if (input) openOnScreenKeyboard();
  });

  // Hero action buttons
  $('btn-play').onclick = openLaunch;
  $('btn-cover').onclick = openCoverModal;
  $('btn-fav').onclick = toggleFavorite;
  $('btn-details').onclick = openDetails;

  // Header buttons
  $('fsbtn').onclick = toggleFullscreen;
  $('setbtn').onclick = () => { openModal('settings'); sfx('playSelect'); };
  $('avbtn').onclick = openDetails;
  $('br-open').onclick = () => openApp('browser');
  $('md-remove').onclick = removeCustom;
  $('store-refresh').onclick = () => loadStore(true);
  $('sh-open').onclick = () => { const u = $('sh-open').dataset.url; if (u) openUrl(u); };
  $('sh-refresh').onclick = () => loadStore(true);
  $('store-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadStore(); });
  let storeTimer = null;
  $('store-q').addEventListener('input', () => { clearTimeout(storeTimer); storeTimer = setTimeout(() => loadStore(), 700); });
  $('empty-rescan-btn').onclick = rescanLibrary;

  // Spotify controls
  $('sp-prev').onclick = () => mediaCmd('prev');
  $('sp-play').onclick = () => mediaCmd('toggle');
  $('sp-next').onclick = () => mediaCmd('next');
  $('sp-open').onclick = () => openApp('spotify');

  // Discord (tasto)
  $('dc-open').onclick = () => openApp('discord');

  // Details modal
  $('md-play').onclick = openLaunch;
  $('md-cover-btn').onclick = () => { closeModal(); openCoverModal(); };
  $('md-close').onclick = closeModal;
  $('md-close-top').onclick = closeModal;

  // Cover modal
  $('cp-browse-btn').onclick = browseCover;
  $('cp-reset-btn').onclick = resetCover;
  $('cp-apply-url-btn').onclick = () => applyCover((curGame() || {}).id, $('cp-url-in').value.trim());
  $('cp-close-btn').onclick = closeModal;

  // Settings modal
  $('st-close-top').onclick = closeModal;

  // Launch modal
  $('ldone').onclick = closeModal;
  $('lcancel').onclick = closeModal;

  // Recalculate marquees on window resize
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const g = curGame();
      if (g) updateHero(g);
      const selCard = document.querySelector('.game-card.sel');
      if (selCard && g) {
        setMarqueeText(selCard.querySelector('.card-title-box'), g.name, true);
      }
    }, 150);
  });
}

async function init() {
  bind();

  try {
    const s = await (await fetch('/api/settings')).json();
    Object.assign(settings, s);
  } catch (e) { /* defaults */ }
  settings.platforms = Object.assign({ steam: true, epic: true }, settings.platforms);
  initSettingsAndLanguage();
  renderCategories();

  try {
    const gd = await (await fetch('/api/games')).json();
    allGames = gd.games || [];
  } catch (e) { console.error('games error:', e); }

  try {
    const st = await (await fetch('/api/stats')).json();
    totalHours = st.total_hours || 0;
    $('user-level').textContent = `${Math.round(totalHours)}H`;
  } catch (e) { /* noop */ }

  renderCarousel();
  focusCard();
  if (settings.sgdb_enabled) fillSgdbArt();

  updateClock();
  setInterval(updateClock, 15000);

  updateNet();
  window.addEventListener('online', updateNet);
  window.addEventListener('offline', updateNet);

  pollTelemetry();
  setInterval(pollTelemetry, 2500);

  pollMedia();
  setInterval(pollMedia, 2500);
  setInterval(renderMedia, 1000);
}

window.addEventListener('DOMContentLoaded', init);
