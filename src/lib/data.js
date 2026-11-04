/* Lapisan data: langsung ke API publik MyQuran (Bimas Islam Kemenag RI) & Nominatim,
   dengan cache lokal agar aplikasi tetap berfungsi tanpa internet. */
import { parseCities, parseSchedule, matchCity, cleanText, isValidCity, pad, DAY } from './core.js';
import { store } from './store.js';

const UPSTREAM = 'https://api.myquran.com/v2';
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const APP_UA = 'JadwalSholatMobile/1.0 (+https://github.com/djadjoel/jadwal-sholat)';
const MAX_BODY = 2_000_000;
const MONTH_KEEP = 14; // jumlah bulan yang disimpan offline

export class DataError extends Error {
  constructor(message, { offline = false } = {}) { super(message); this.offline = offline; }
}

async function getJSON(url, { timeout = 12000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: ctrl.signal });
  } catch {
    throw new DataError('Tidak dapat terhubung ke server. Periksa koneksi internet.', { offline: true });
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) throw new DataError(`Server mengembalikan galat (${res.status}).`);
  const text = await res.text();
  if (text.length > MAX_BODY) throw new DataError('Respons server terlalu besar.');
  try { return JSON.parse(text); } catch { throw new DataError('Respons server tidak valid.'); }
}

/* ---------- daftar kota ---------- */
let citiesMem = null;
export async function getCities({ force = false } = {}) {
  if (citiesMem && !force) return citiesMem;
  const cached = store.get('js.cities', null);
  const valid = cached && Array.isArray(cached.list) && cached.list.length > 100;
  if (valid && !force && Date.now() - cached.t < 30 * DAY) {
    return (citiesMem = cached.list.filter(isValidCity));
  }
  try {
    const list = parseCities(await getJSON(`${UPSTREAM}/sholat/kota/semua`));
    store.set('js.cities', { t: Date.now(), list });
    return (citiesMem = list);
  } catch (e) {
    if (valid) return (citiesMem = cached.list.filter(isValidCity)); // data lama lebih baik daripada kosong
    throw e;
  }
}

/* ---------- jadwal bulanan ---------- */
const monthStoreKey = (id, ym) => `js.m.${id}.${ym}`;

function pruneMonths() {
  const idx = store.get('js.m.idx', []);
  while (idx.length > MONTH_KEEP) store.remove(idx.shift());
  store.set('js.m.idx', idx);
}

function rememberMonth(key) {
  const idx = store.get('js.m.idx', []).filter((k) => k !== key);
  idx.push(key);
  store.set('js.m.idx', idx);
  pruneMonths();
}

/** Bulan dari cache lokal tanpa jaringan (atau null). */
export function cachedMonth(id, y, m) {
  const c = store.get(monthStoreKey(id, `${y}-${pad(m)}`), null);
  return c && c.d && c.d.id === id && c.d.days ? c : null;
}

/**
 * Ambil jadwal 1 bulan. Mengembalikan { data, stale } — `stale` true bila diambil dari
 * cache karena jaringan gagal. Bulan berjalan dianggap segar 7 hari, bulan lalu 60 hari.
 */
export async function getMonth(id, y, m, { force = false, nowYm } = {}) {
  const ym = `${y}-${pad(m)}`;
  const key = monthStoreKey(id, ym);
  const c = cachedMonth(id, y, m);
  const ttl = nowYm && ym < nowYm ? 60 * DAY : 7 * DAY;
  if (c && !force && Date.now() - c.t < ttl) return { data: c.d, stale: false };
  try {
    const data = parseSchedule(await getJSON(`${UPSTREAM}/sholat/jadwal/${id}/${y}/${pad(m)}`), id, y, m);
    store.set(key, { t: Date.now(), d: data });
    rememberMonth(key);
    return { data, stale: false };
  } catch (e) {
    if (c) return { data: c.d, stale: true };
    throw e;
  }
}

/* ---------- deteksi lokasi ---------- */
export async function locateCity(lat, lon) {
  if (!(lat >= -11.5 && lat <= 6.5 && lon >= 94.5 && lon <= 141.5)) {
    throw new DataError('Lokasi berada di luar wilayah Indonesia. Silakan pilih kota manual.');
  }
  // Dibulatkan (~1 km) demi privasi & efisiensi cache.
  const rl = Math.round(lat * 100) / 100, ro = Math.round(lon * 100) / 100;
  const gkey = `js.geo.${rl.toFixed(2)}_${ro.toFixed(2)}`;
  let addr = store.get(gkey, null);
  if (!addr || Date.now() - addr.t > 180 * DAY) {
    const q = new URLSearchParams({ format: 'jsonv2', lat: rl, lon: ro, zoom: 14, addressdetails: 1, 'accept-language': 'id' });
    const res = await getJSON(`${NOMINATIM}/reverse?${q}`, { headers: { 'User-Agent': APP_UA } });
    if (!res || typeof res.address !== 'object') throw new DataError('Alamat untuk lokasi Anda tidak ditemukan.');
    const a = {};
    for (const [k, v] of Object.entries(res.address)) if (typeof v === 'string') a[k] = cleanText(v);
    addr = { t: Date.now(), a };
    store.set(gkey, addr);
  }
  const cities = await getCities();
  const id = matchCity(addr.a, cities);
  if (!id) throw new DataError('Kab/kota untuk lokasi Anda belum ditemukan. Silakan pilih manual.');
  return cities.find((c) => c.id === id);
}

export function clearCache() {
  const keep = new Set(['js.city', 'js.settings', 'js.recent', 'js.tz']);
  store.keys().filter((k) => k.startsWith('js.') && !keep.has(k)).forEach((k) => store.remove(k));
  citiesMem = null;
}
