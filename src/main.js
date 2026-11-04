/* Jadwal Sholat — aplikasi mobile (Capacitor). */
import './styles.css';
import {
  PRAYERS, KEYS, MAIN, AUX, TZ_LABEL, DAY, pad, titleCase, isValidCity, ymdUTC, addDays,
  cityDate as cityDateTz, toEpoch as toEpochTz, formatHijri, searchCities, planNotifications, fold,
} from './lib/core.js';
import { store } from './lib/store.js';
import { getCities, getMonth, cachedMonth, locateCity, clearCache } from './lib/data.js';
import * as N from './lib/native.js';

const DEFAULT_CITY = { id: '1301', lokasi: 'KOTA JAKARTA' };
const DEFAULT_SETTINGS = { notify: false, prayers: [...MAIN], before: 10, autoLocate: false };
const BEFORE_OPTIONS = [0, 5, 10, 15, 30];
const RING_LEN = 376.99;
const IMMINENT = 10 * 60e3;

const $ = (id) => document.getElementById(id);

/* ---------- state ---------- */
const savedCity = store.get('js.city', null);
const settings = { ...DEFAULT_SETTINGS, ...store.get('js.settings', {}) };
settings.prayers = Array.isArray(settings.prayers) ? settings.prayers.filter((k) => KEYS.includes(k)) : [...MAIN];
if (!BEFORE_OPTIONS.includes(settings.before)) settings.before = 10;

const state = {
  city: isValidCity(savedCity) ? savedCity : DEFAULT_CITY,
  tz: store.get('js.tz', 7),
  daerah: '',
  months: new Map(),
  pending: new Map(),
  view: null,
  viewAuto: true,
  today: null,
  lastMinute: -1,
  cardSig: '',
  loadToken: 0,
  tab: 'today',
  stale: false,
};

const saveSettings = () => store.set('js.settings', settings);
const cityDate = (now = Date.now()) => cityDateTz(state.tz, now);
const toEpoch = (date, hm) => toEpochTz(state.tz, date, hm);
const monthKey = (id, y, m) => `${id}-${y}-${pad(m)}`;
const nowYm = () => ymdUTC(cityDate()).slice(0, 7);
const dayRow = (date) => {
  const [y, m] = date.split('-').map(Number);
  const mo = state.months.get(monthKey(state.city.id, y, m));
  return mo ? mo.days.get(date) || null : null;
};

const fmtGreg = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmtMonth = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmtWeekday = new Intl.DateTimeFormat('id-ID', { weekday: 'short', timeZone: 'UTC' });
const fmtStamp = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/* ---------- data bulan ---------- */
function ingest(data) {
  const mo = { lokasi: data.lokasi, daerah: data.daerah, tz: data.tz, days: new Map(Object.entries(data.days)) };
  const [y, m] = data.month.split('-').map(Number);
  state.months.set(monthKey(data.id, y, m), mo);
  return mo;
}

function loadMonth(id, y, m, { force = false } = {}) {
  const key = monthKey(id, y, m);
  if (!force && state.months.has(key)) return Promise.resolve(state.months.get(key));
  if (state.pending.has(key)) return state.pending.get(key);
  const p = getMonth(id, y, m, { force, nowYm: nowYm() })
    .then(({ data, stale }) => {
      if (stale) markStale(true);
      return ingest(data);
    })
    .finally(() => state.pending.delete(key));
  state.pending.set(key, p);
  return p;
}

/** Isi memori dari cache lokal secara sinkron agar layar pertama langsung terisi. */
function hydrateFromCache(id) {
  const cd = cityDate();
  for (let i = -1; i <= 1; i++) {
    const d = new Date(Date.UTC(cd.getUTCFullYear(), cd.getUTCMonth() + i, 1));
    const c = cachedMonth(id, d.getUTCFullYear(), d.getUTCMonth() + 1);
    if (c) ingest(c.d);
  }
}

function markStale(stale) {
  state.stale = stale;
  $('sourceBadge').textContent = stale ? 'Offline' : 'Kemenag RI';
  $('sourceBadge').classList.toggle('is-offline', stale);
}

/* ---------- toast ---------- */
function toast(msg, { error = false, action = null, timeout = 4500 } = {}) {
  const el = document.createElement('div');
  el.className = 'toast' + (error ? ' is-error' : '');
  el.setAttribute('role', error ? 'alert' : 'status');
  el.innerHTML = `<svg class="ico"><use href="#${error ? 'i-x' : 'i-bell'}"/></svg><span></span>`;
  el.querySelector('span').textContent = msg;
  const dismiss = () => {
    if (el.classList.contains('is-leaving')) return;
    el.classList.add('is-leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  };
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action.label;
    b.addEventListener('click', () => { dismiss(); action.run(); });
    el.append(b);
  }
  el.addEventListener('click', (e) => { if (e.target === el) dismiss(); });
  const box = $('toasts');
  while (box.children.length >= 3) box.firstElementChild.remove();
  box.append(el);
  if (timeout) setTimeout(dismiss, timeout);
}

/* ---------- daftar waktu hari ini ---------- */
const rows = new Map();
function buildTimeList() {
  const frag = document.createDocumentFragment();
  KEYS.forEach((k, i) => {
    const li = document.createElement('li');
    li.className = 'time-row' + (AUX.has(k) ? ' is-aux' : '');
    li.dataset.prayer = k;
    li.style.animationDelay = `${i * 0.035}s`;
    li.innerHTML = `
      <span class="time-row__icon"><svg class="ico"><use href="#i-${k}"/></svg></span>
      <span class="time-row__name"><span></span><span class="time-row__badge"></span></span>
      <span class="time-row__ar" lang="ar"></span>
      <span class="time-row__time">--:--</span>
      <button type="button" class="time-row__bell" aria-pressed="false"><svg class="ico"><use href="#i-bell-off"/></svg></button>`;
    li.querySelector('.time-row__name > span').textContent = PRAYERS[k].name;
    li.querySelector('.time-row__ar').textContent = PRAYERS[k].ar;
    const bell = li.querySelector('.time-row__bell');
    bell.addEventListener('click', () => togglePrayer(k));
    frag.append(li);
    rows.set(k, { el: li, time: li.querySelector('.time-row__time'), badge: li.querySelector('.time-row__badge'), bell });
  });
  $('timeList').replaceChildren(frag);
}

function renderBells() {
  for (const [k, r] of rows) {
    const on = settings.notify && settings.prayers.includes(k);
    r.bell.setAttribute('aria-pressed', String(on));
    r.bell.setAttribute('aria-label', `${on ? 'Matikan' : 'Aktifkan'} notifikasi ${PRAYERS[k].name}`);
    r.bell.firstElementChild.firstElementChild.setAttribute('href', on ? '#i-bell' : '#i-bell-off');
  }
}

function renderHeader() {
  const name = titleCase(state.city.lokasi);
  $('cityName').textContent = name;
  $('regionLabel').textContent = state.daerah ? `${titleCase(state.daerah)} · ${TZ_LABEL[state.tz] || ''}` : (TZ_LABEL[state.tz] || '');
  $('tzLabel').textContent = TZ_LABEL[state.tz] || `UTC+${state.tz}`;
  $('setCityName').textContent = state.daerah ? `${name}, ${titleCase(state.daerah)}` : name;
}

function renderToday() {
  const row = dayRow(state.today);
  const list = $('timeList');
  if (!row) { list.classList.add('is-loading'); return; }
  list.classList.remove('is-loading');
  for (const k of KEYS) rows.get(k).time.textContent = row[k];
  const d = cityDate();
  $('dateGreg').textContent = fmtGreg.format(d);
  $('dateHijri').textContent = formatHijri(d);
  state.cardSig = '';
}

/* Waktu wajib kemarin–besok; data yang belum ada diperkirakan dari hari ini. */
function timeline() {
  const ref = dayRow(state.today);
  if (!ref) return null;
  const evs = (date) => {
    const row = dayRow(date);
    const shift = row ? 0 : Math.round((Date.parse(date) - Date.parse(state.today)) / DAY) * DAY;
    const src = row || ref, base = row ? date : state.today;
    return MAIN.map((k) => ({ k, date, at: toEpoch(base, src[k]) + shift }));
  };
  return [...evs(addDays(state.today, -1)).slice(-1), ...evs(state.today), ...evs(addDays(state.today, 1)).slice(0, 1)];
}

function updateRows(now, prev, next) {
  const row = dayRow(state.today);
  if (!row) return;
  const passed = KEYS.map((k) => (toEpoch(state.today, row[k]) <= now ? 1 : 0)).join('');
  const sig = `${passed}|${prev.k}${prev.date}|${next.k}${next.date}`;
  if (sig === state.cardSig) return;
  state.cardSig = sig;
  KEYS.forEach((k, i) => {
    const r = rows.get(k);
    const isNext = next.k === k;
    const isCurrent = !isNext && prev.k === k && prev.date === state.today;
    r.el.classList.toggle('is-next', isNext);
    r.el.classList.toggle('is-current', isCurrent);
    r.el.classList.toggle('is-passed', !isNext && !isCurrent && passed[i] === '1');
    r.badge.textContent = isNext ? (next.date === state.today ? 'Berikutnya' : 'Besok') : isCurrent ? 'Sekarang' : '';
    r.badge.hidden = !r.badge.textContent;
  });
}

/* ---------- langit ---------- */
function updateSky(now) {
  const row = dayRow(state.today);
  if (!row) return;
  const t = (k) => toEpoch(state.today, row[k]);
  const [subuh, terbit, ashar, maghrib, isya] = ['subuh', 'terbit', 'ashar', 'maghrib', 'isya'].map(t);
  const phase = now < subuh ? 'night' : now < terbit ? 'dawn' : now < ashar ? 'day'
    : now < maghrib ? 'afternoon' : now < isya ? 'dusk' : 'night';
  if (document.body.dataset.phase !== phase) document.body.dataset.phase = phase;
  const orb = $('orb');
  let p, sun;
  if (now >= terbit && now < maghrib) { sun = true; p = (now - terbit) / (maghrib - terbit); }
  else {
    sun = false;
    const start = now >= maghrib ? maghrib : maghrib - DAY;
    const end = now >= maghrib ? terbit + DAY : terbit;
    p = (now - start) / (end - start);
  }
  p = Math.min(1, Math.max(0, p));
  orb.classList.toggle('is-sun', sun && phase === 'day');
  orb.classList.toggle('is-moon', !sun);
  orb.style.setProperty('--ox', `${10 + p * 80}%`);
  orb.style.setProperty('--oy', `${44 - Math.sin(Math.PI * p) * 32}%`);
}

/* ---------- tick ---------- */
const fmtDuration = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

function tick() {
  const now = Date.now();
  const cd = cityDate(now);
  $('clockHM').textContent = `${pad(cd.getUTCHours())}:${pad(cd.getUTCMinutes())}`;
  $('clockS').textContent = pad(cd.getUTCSeconds());

  const today = ymdUTC(cd);
  if (today !== state.today) { state.today = today; onDayChange(); }

  const list = timeline();
  if (!list) return;
  const i = list.findIndex((e) => e.at > now);
  if (i <= 0) return;
  const next = list[i], prev = list[i - 1];
  const frac = Math.min(1, Math.max(0, (now - prev.at) / (next.at - prev.at)));
  const remain = next.at - now;
  const info = PRAYERS[next.k];

  $('nextName').textContent = info.name;
  $('nextArabic').textContent = info.ar;
  $('countdown').textContent = fmtDuration(remain);
  $('ringBar').style.strokeDashoffset = String(RING_LEN * (1 - frac));
  $('ringPct').textContent = `${Math.floor(frac * 100)}%`;
  const nd = cityDate(next.at);
  $('nextAt').textContent = `${next.date === state.today ? 'Hari ini' : 'Besok'} pukul ${pad(nd.getUTCHours())}:${pad(nd.getUTCMinutes())} ${TZ_LABEL[state.tz] || ''}`;
  const use = $('nextIcon').firstElementChild;
  if (use.getAttribute('href') !== `#i-${next.k}`) use.setAttribute('href', `#i-${next.k}`);
  document.querySelector('.hero-card').classList.toggle('is-imminent', remain <= IMMINENT);

  updateRows(now, prev, next);
  if (cd.getUTCMinutes() !== state.lastMinute) {
    state.lastMinute = cd.getUTCMinutes();
    updateSky(now);
  }
}

let tickTimer = 0;
function startClock() {
  clearTimeout(tickTimer);
  const loop = () => { tick(); tickTimer = setTimeout(loop, 1000 - (Date.now() % 1000) + 5); };
  loop();
}

function onDayChange() {
  state.lastMinute = -1;
  renderToday();
  const [y, m] = state.today.split('-').map(Number);
  const id = state.city.id, token = state.loadToken;
  loadMonth(id, y, m)
    .then((mo) => { if (token === state.loadToken) { applyMeta(mo); renderToday(); } })
    .catch((e) => showLoadError(e));
  const tomorrow = addDays(state.today, 1);
  if (tomorrow.slice(0, 7) !== state.today.slice(0, 7)) {
    const [ny, nm] = tomorrow.split('-').map(Number);
    loadMonth(id, ny, nm).catch(() => {});
  }
  if (!state.view || state.viewAuto) setView(y, m, true);
  scheduleSoon();
}

/* ---------- notifikasi native ---------- */
let schedTimer = 0;
function scheduleSoon(delay = 400) {
  clearTimeout(schedTimer);
  schedTimer = setTimeout(() => { reschedule().catch(() => {}); }, delay);
}

/** Pastikan data bulan cukup untuk N hari ke depan, lalu jadwalkan ulang semua notifikasi. */
async function reschedule() {
  if (!N.isNative) return;
  if (!settings.notify || !settings.prayers.length) { await N.cancelAll(); return; }
  if ((await N.notifPermission(false)) !== 'granted') { await N.cancelAll(); renderNotifStatus(); return; }
  const id = state.city.id, token = state.loadToken;
  const today = state.today || ymdUTC(cityDate());
  const horizon = N.platform === 'ios' ? 8 : 20;
  const months = new Set([today.slice(0, 7), addDays(today, horizon).slice(0, 7)]);
  for (const ym of months) {
    const [y, m] = ym.split('-').map(Number);
    try { await loadMonth(id, y, m); } catch { /* jadwalkan yang tersedia saja */ }
  }
  if (token !== state.loadToken) return;
  const plan = planNotifications({
    dayRow, tz: state.tz, today, now: Date.now(),
    prayers: settings.prayers, before: settings.before, max: N.MAX_SCHEDULED, days: horizon,
  });
  const n = await N.scheduleAll(plan, {
    city: titleCase(state.city.lokasi), tzLabel: TZ_LABEL[state.tz] || '', before: settings.before,
  });
  store.set('js.sched', { t: Date.now(), n, until: plan.length ? plan[plan.length - 1].at : 0 });
  renderNotifStatus();
}

async function renderNotifStatus() {
  const el = $('notifStatus');
  const sched = store.get('js.sched', null);
  if (!N.isNative) { el.textContent = 'Notifikasi terjadwal hanya tersedia di aplikasi Android/iOS'; return; }
  const perm = await N.notifPermission(false);
  if (perm === 'denied') el.textContent = 'Izin notifikasi ditolak — aktifkan di pengaturan perangkat';
  else if (!settings.notify) el.textContent = 'Tetap berbunyi walau aplikasi ditutup';
  else if (sched && sched.n && sched.until > Date.now()) {
    el.textContent = `${sched.n} notifikasi terjadwal hingga ${fmtStamp.format(new Date(sched.until))}`;
  } else el.textContent = 'Aktif — buka aplikasi sesekali agar jadwal diperbarui';

  const exact = settings.notify ? await N.exactAlarmStatus() : null;
  $('rowExact').hidden = !(exact && exact !== 'granted');
}

async function setNotify(on) {
  if (on) {
    const perm = await N.notifPermission(true);
    if (N.isNative && perm !== 'granted') {
      $('setNotify').checked = false;
      toast('Izin notifikasi ditolak. Aktifkan lewat pengaturan perangkat.', { error: true });
      renderNotifStatus();
      return;
    }
    if (!settings.prayers.length) settings.prayers = [...MAIN];
  }
  settings.notify = on;
  saveSettings();
  renderSettings();
  renderBells();
  await reschedule().catch(() => {});
  if (on) {
    toast(N.isNative ? 'Notifikasi aktif — tetap berbunyi walau aplikasi ditutup.' : 'Notifikasi hanya berfungsi di aplikasi Android/iOS.');
    const exact = await N.exactAlarmStatus();
    if (exact && exact !== 'granted') {
      toast('Izinkan "Alarm & pengingat" agar notifikasi tepat waktu.', { timeout: 9000, action: { label: 'Izinkan', run: openExact } });
    }
  }
}

async function togglePrayer(k) {
  N.tap();
  if (!settings.notify) {
    settings.prayers = [k];
    await setNotify(true);
    return;
  }
  const on = settings.prayers.includes(k);
  settings.prayers = on ? settings.prayers.filter((p) => p !== k) : [...settings.prayers, k];
  settings.prayers.sort((a, b) => KEYS.indexOf(a) - KEYS.indexOf(b));
  if (!settings.prayers.length) settings.notify = false;
  saveSettings();
  renderBells();
  renderSettings();
  toast(`Notifikasi ${PRAYERS[k].name} ${on ? 'dimatikan' : 'diaktifkan'}.`, { timeout: 2200 });
  scheduleSoon(0);
}

async function openExact() {
  await N.openExactAlarmSettings();
  setTimeout(renderNotifStatus, 800);
}

/* ---------- tabel bulanan ---------- */
function setView(y, m, auto = false) {
  const nowY = cityDate().getUTCFullYear();
  if (m < 1) { y--; m = 12; } else if (m > 12) { y++; m = 1; }
  if (y < nowY - 1 || y > nowY + 1) return;
  state.view = { y, m };
  state.viewAuto = auto;
  $('monthPrev').disabled = y === nowY - 1 && m === 1;
  $('monthNext').disabled = y === nowY + 1 && m === 12;
  renderMonth();
}

function tableState(text, retry) {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 9; td.className = 'state'; td.textContent = text;
  if (retry) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = 'Coba lagi';
    b.style.marginLeft = '10px';
    b.addEventListener('click', retry);
    td.append(b);
  }
  tr.append(td);
  $('monthBody').replaceChildren(tr);
}

async function renderMonth() {
  const { y, m } = state.view;
  const id = state.city.id, token = state.loadToken;
  $('monthLabel').textContent = fmtMonth.format(new Date(Date.UTC(y, m - 1, 1)));
  $('monthCity').textContent = `${titleCase(state.city.lokasi)} · ${TZ_LABEL[state.tz] || ''}`;
  if (!state.months.has(monthKey(id, y, m))) tableState('Memuat jadwal…');
  let mo;
  try { mo = await loadMonth(id, y, m); } catch (e) {
    if (token === state.loadToken) tableState(e.message, () => renderMonth());
    return;
  }
  if (token !== state.loadToken || state.view.y !== y || state.view.m !== m) return;
  const frag = document.createDocumentFragment();
  for (const [date, row] of mo.days) {
    const d = new Date(`${date}T00:00:00Z`);
    const tr = document.createElement('tr');
    if (date === state.today) tr.className = 'is-today';
    if (d.getUTCDay() === 5) tr.classList.add('is-friday');
    const first = document.createElement('td');
    const wrap = document.createElement('span'); wrap.className = 'day';
    const b = document.createElement('b'); b.textContent = String(d.getUTCDate());
    const s = document.createElement('span'); s.textContent = d.getUTCDay() === 5 ? "Jum'at" : fmtWeekday.format(d);
    wrap.append(b, s); first.append(wrap); tr.append(first);
    for (const k of KEYS) {
      const td = document.createElement('td');
      td.textContent = row[k];
      if (AUX.has(k)) td.className = 'aux';
      tr.append(td);
    }
    frag.append(tr);
  }
  $('monthBody').replaceChildren(frag);
  scrollToToday();
}

function scrollToToday() {
  const tr = $('monthBody').querySelector('.is-today');
  const wrap = $('tableWrap');
  if (tr && state.viewAuto && state.tab === 'month') {
    wrap.scrollTop = Math.max(0, tr.offsetTop - wrap.clientHeight / 3);
  }
}

/* ---------- kota ---------- */
function applyMeta(mo) {
  if (mo.tz && mo.tz !== state.tz) {
    state.tz = mo.tz;
    store.set('js.tz', state.tz);
    state.today = null;
  }
  state.daerah = mo.daerah || '';
  renderHeader();
}

function showLoadError(e) {
  markStale(true);
  toast(e.message || 'Gagal memuat jadwal.', {
    error: true, timeout: 0, action: { label: 'Coba lagi', run: () => setCity(state.city, { force: true }) },
  });
}

async function setCity(city, { force = false, announce = false } = {}) {
  if (!isValidCity(city)) return;
  const changed = city.id !== state.city.id;
  state.city = { id: city.id, lokasi: city.lokasi };
  store.set('js.city', state.city);
  const recent = store.get('js.recent', []).filter((c) => isValidCity(c) && c.id !== city.id);
  store.set('js.recent', [state.city, ...recent].slice(0, 6));
  if (!changed && !force) return;

  const token = ++state.loadToken;
  state.daerah = '';
  renderHeader();
  if (changed) { hydrateFromCache(city.id); }
  $('timeList').classList.add('is-loading');
  const cd = cityDate();
  markStale(false); // loadMonth menandai offline lagi bila hanya cache yang tersedia
  try {
    const mo = await loadMonth(city.id, cd.getUTCFullYear(), cd.getUTCMonth() + 1, { force });
    if (token !== state.loadToken) return;
    applyMeta(mo);
    state.today = null;
    state.view = null;
    tick();
    if (announce) toast(`Jadwal ditampilkan untuk ${titleCase(city.lokasi)}.`, { timeout: 2600 });
    store.set('js.sync', Date.now());
    renderSync();
  } catch (e) {
    if (token === state.loadToken) showLoadError(e);
  }
}

/* ---------- sheet pencarian kota ---------- */
const dlg = $('cityDialog'), input = $('cityInput'), listEl = $('cityList');
let results = [];

function highlight(el, text, q) {
  const i = q ? fold(text).indexOf(q) : -1;
  if (i < 0) { el.textContent = text; return; }
  const mark = document.createElement('mark');
  mark.textContent = text.slice(i, i + q.length);
  el.append(text.slice(0, i), mark, text.slice(i + q.length));
}

function renderResults(all) {
  const r = searchCities(all, input.value);
  if (!r.q) {
    const recent = store.get('js.recent', []).filter(isValidCity);
    results = recent.length ? recent : all.slice(0, 50);
    $('cityHint').textContent = recent.length ? 'Terakhir dipilih' : `${all.length} kabupaten/kota tersedia`;
  } else {
    results = r.list;
    $('cityHint').textContent = results.length ? `${r.total} hasil` : 'Tidak ditemukan. Coba kata kunci lain.';
  }
  const frag = document.createDocumentFragment();
  results.forEach((c, i) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.dataset.index = String(i);
    if (c.id === state.city.id) li.classList.add('is-active-city');
    li.innerHTML = '<svg class="ico"><use href="#i-pin"/></svg><span></span><small></small>';
    const label = titleCase(c.lokasi);
    highlight(li.querySelector('span'), label.replace(/^(Kab\.|Kota)\s+/, ''), r.q || '');
    li.querySelector('small').textContent = /^kota/i.test(c.lokasi) ? 'Kota' : 'Kabupaten';
    frag.append(li);
  });
  listEl.replaceChildren(frag);
  listEl.scrollTop = 0;
}

let citiesList = null;
async function openCityDialog() {
  input.value = '';
  dlg.classList.remove('is-closing');
  if (!dlg.open) dlg.showModal();
  listEl.replaceChildren();
  try {
    citiesList = await getCities();
    renderResults(citiesList);
  } catch (e) {
    $('cityHint').textContent = e.message;
  }
}

function closeCityDialog() {
  if (!dlg.open || dlg.classList.contains('is-closing')) return;
  input.blur();
  dlg.classList.add('is-closing');
  dlg.addEventListener('animationend', () => { dlg.classList.remove('is-closing'); dlg.close(); }, { once: true });
}

let searchTimer = 0;
input.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => citiesList && renderResults(citiesList), 60);
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); input.blur(); if (results.length === 1) choose(0); }
});
listEl.addEventListener('click', (e) => {
  const li = e.target.closest('[role="option"]');
  if (li) choose(Number(li.dataset.index));
});
function choose(i) {
  const c = results[i];
  if (!c) return;
  N.tap();
  closeCityDialog();
  setCity(c, { announce: true }).then(() => scheduleSoon(0));
}
dlg.addEventListener('click', (e) => { if (e.target === dlg) closeCityDialog(); });
dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeCityDialog(); });
$('cityClose').addEventListener('click', closeCityDialog);

/* ---------- lokasi ---------- */
let locating = false;
async function locate({ silent = false } = {}) {
  if (locating) return;
  locating = true;
  const btns = [$('btnLocate'), $('cityLocate')];
  btns.forEach((b) => { b.classList.add('is-busy'); b.disabled = true; });
  try {
    const c = await N.currentPosition();
    const city = await locateCity(c.latitude, c.longitude);
    const changed = city.id !== state.city.id;
    closeCityDialog();
    await setCity(city);
    if (changed) scheduleSoon(0);
    if (!silent || changed) toast(`Lokasi terdeteksi: ${titleCase(city.lokasi)}`, { timeout: 3000 });
  } catch (e) {
    if (!silent) {
      const msg = e && e.code === 1 ? 'Izin lokasi ditolak. Silakan pilih kota manual.'
        : e && typeof e.code === 'number' ? 'Lokasi tidak dapat ditentukan. Pastikan GPS aktif.'
        : (e && e.message) || 'Lokasi tidak dapat ditentukan.';
      toast(msg, { error: true, action: dlg.open ? null : { label: 'Pilih kota', run: openCityDialog } });
    }
  } finally {
    locating = false;
    btns.forEach((b) => { b.classList.remove('is-busy'); b.disabled = false; });
  }
}

/* ---------- tab ---------- */
function setTab(tab) {
  if (tab === state.tab) return;
  state.tab = tab;
  document.body.dataset.tab = tab;
  for (const v of document.querySelectorAll('.view')) v.hidden = v.dataset.view !== tab;
  for (const t of document.querySelectorAll('.tab')) {
    if (t.dataset.tab === tab) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
  if (tab === 'month') {
    if (!state.view) { const cd = cityDate(); setView(cd.getUTCFullYear(), cd.getUTCMonth() + 1, true); }
    else requestAnimationFrame(scrollToToday);
  }
  if (tab === 'settings') { renderSettings(); renderNotifStatus(); renderSync(); }
}

/* ---------- pengaturan ---------- */
function buildSettings() {
  const chips = $('prayerChips');
  for (const k of KEYS) {
    if (k === 'dhuha') continue;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.dataset.k = k; b.textContent = PRAYERS[k].name;
    b.addEventListener('click', () => togglePrayer(k));
    chips.append(b);
  }
  const seg = $('beforeSeg');
  for (const v of BEFORE_OPTIONS) {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.v = String(v);
    b.textContent = v ? `${v} mnt` : 'Mati';
    b.addEventListener('click', () => {
      N.tap();
      settings.before = v; saveSettings(); renderSettings(); scheduleSoon(0);
    });
    seg.append(b);
  }
  $('setNotify').addEventListener('change', (e) => { N.tap(); setNotify(e.target.checked); });
  $('setAutoLocate').addEventListener('change', async (e) => {
    N.tap();
    settings.autoLocate = e.target.checked;
    saveSettings();
    if (settings.autoLocate) locate();
  });
  $('rowExact').addEventListener('click', openExact);
  $('rowTest').addEventListener('click', testNotification);
  $('rowCity').addEventListener('click', openCityDialog);
  $('rowRefresh').addEventListener('click', refreshAll);
  $('rowClear').addEventListener('click', () => {
    N.tap('medium');
    clearCache();
    state.months.clear();
    toast('Data offline dihapus. Mengunduh ulang…', { timeout: 2500 });
    refreshAll();
  });
}

function renderSettings() {
  $('setNotify').checked = settings.notify;
  $('setAutoLocate').checked = settings.autoLocate;
  for (const b of $('prayerChips').children) b.setAttribute('aria-pressed', String(settings.prayers.includes(b.dataset.k)));
  for (const b of $('beforeSeg').children) b.setAttribute('aria-checked', String(Number(b.dataset.v) === settings.before));
  $('rowPrayers').classList.toggle('is-disabled', !settings.notify);
  $('beforeSeg').parentElement.classList.toggle('is-disabled', !settings.notify);
}

function renderSync() {
  const t = store.get('js.sync', 0);
  $('lastSync').textContent = t ? `Terakhir diperbarui ${fmtStamp.format(new Date(t))}` : 'Belum pernah diperbarui';
}

async function refreshAll() {
  const btn = $('rowRefresh');
  btn.classList.add('is-disabled');
  try {
    const cd = cityDate();
    const y = cd.getUTCFullYear(), m = cd.getUTCMonth() + 1;
    const next = new Date(Date.UTC(y, m, 1));
    const id = state.city.id;
    markStale(false); // loadMonth menandai offline lagi bila hanya cache yang tersedia
    const [mo] = await Promise.all([
      loadMonth(id, y, m, { force: true }),
      loadMonth(id, next.getUTCFullYear(), next.getUTCMonth() + 1, { force: true }).catch(() => null),
    ]);
    if (id !== state.city.id) return;
    applyMeta(mo);
    state.today = null; tick();
    if (state.view) renderMonth();
    if (!state.stale) { store.set('js.sync', Date.now()); renderSync(); }
    await reschedule().catch(() => {});
    if (state.stale) toast('Tidak ada koneksi — menampilkan jadwal tersimpan.', { error: true });
    else toast('Jadwal diperbarui dari Kemenag RI.', { timeout: 2500 });
  } catch (e) {
    toast(e.message || 'Gagal memperbarui.', { error: true });
  } finally {
    btn.classList.remove('is-disabled');
  }
}

async function testNotification() {
  N.tap();
  if (!N.isNative) { toast('Uji notifikasi hanya tersedia di aplikasi Android/iOS.'); return; }
  if ((await N.notifPermission(true)) !== 'granted') {
    toast('Izin notifikasi belum diberikan.', { error: true }); return;
  }
  await N.testNotification(titleCase(state.city.lokasi));
  toast('Notifikasi contoh akan muncul dalam 5 detik. Coba kunci layar.', { timeout: 5000 });
}

/* ---------- init ---------- */
async function init() {
  buildTimeList();
  buildSettings();
  renderHeader();
  renderBells();
  renderSettings();
  N.setupSystemUI();
  N.appVersion().then((v) => { $('appVersion').textContent = v; });

  for (const t of document.querySelectorAll('.tab')) t.addEventListener('click', () => { N.tap(); setTab(t.dataset.tab); });
  $('btnCity').addEventListener('click', openCityDialog);
  $('btnLocate').addEventListener('click', () => locate());
  $('cityLocate').addEventListener('click', () => locate());
  $('monthPrev').addEventListener('click', () => { N.tap(); setView(state.view.y, state.view.m - 1); });
  $('monthNext').addEventListener('click', () => { N.tap(); setView(state.view.y, state.view.m + 1); });

  // Tampilan instan dari cache lokal, lalu segarkan dari jaringan.
  hydrateFromCache(state.city.id);
  const cd = cityDate();
  const cur = state.months.get(monthKey(state.city.id, cd.getUTCFullYear(), cd.getUTCMonth() + 1));
  if (cur) applyMeta(cur);
  startClock();
  const hashTab = location.hash.slice(1);
  if (hashTab === 'month' || hashTab === 'settings') setTab(hashTab);
  N.hideSplash();

  if (cur) {
    // Revalidasi di latar belakang bila cache sudah berumur.
    getMonth(state.city.id, cd.getUTCFullYear(), cd.getUTCMonth() + 1, { nowYm: nowYm() })
      .then(({ data, stale }) => { markStale(stale); applyMeta(ingest(data)); renderToday(); })
      .catch(() => markStale(true));
  }

  // Tombol back Android: tutup sheet → kembali ke tab Hari Ini → keluar.
  N.onBack(() => {
    if (dlg.open) closeCityDialog();
    else if (state.tab !== 'today') setTab('today');
    else N.exitApp();
  });

  N.onResume(() => {
    state.today = null; // paksa cek pergantian hari
    tick();
    renderNotifStatus();
    if (settings.autoLocate) locate({ silent: true });
    scheduleSoon(1000);
  });

  N.onNotificationTap(() => setTab('today'));
  N.onNotificationForeground((extra) => {
    if (extra && extra.k && extra.kind === 'adzan') {
      toast(`Telah masuk waktu ${PRAYERS[extra.k].name} untuk ${titleCase(state.city.lokasi)}.`, { timeout: 12000 });
    }
  });

  // Pertama kali: coba deteksi lokasi bila izin sudah ada, atau tawarkan.
  if (!savedCity) {
    if (await N.locationGranted()) locate({ silent: true });
    else toast('Gunakan lokasi Anda untuk jadwal yang sesuai.', { timeout: 9000, action: { label: 'Deteksi', run: () => locate() } });
  } else if (settings.autoLocate) {
    locate({ silent: true });
  }

  scheduleSoon(1500);
}

init();
