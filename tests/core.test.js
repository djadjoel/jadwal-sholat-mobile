import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tzOffset, normRegion, regionKind, matchCity, parseSchedule, parseCities,
  toEpoch, addDays, planNotifications, searchCities, cleanText, formatHijri,
} from '../src/lib/core.js';

const CITIES = [
  { id: '1301', lokasi: 'KOTA JAKARTA' },
  { id: '1201', lokasi: 'KAB. BOGOR' },
  { id: '1202', lokasi: 'KOTA BOGOR' },
  { id: '1219', lokasi: 'KOTA BANDUNG' },
  { id: '1203', lokasi: 'KAB. BANDUNG' },
  { id: '2622', lokasi: 'KOTA MAKASSAR' },
  { id: '1609', lokasi: 'KAB. KEPULAUAN SERIBU' },
];

test('tzOffset sesuai provinsi', () => {
  assert.equal(tzOffset('DKI JAKARTA'), 7);
  assert.equal(tzOffset('SULAWESI SELATAN'), 8);
  assert.equal(tzOffset('BALI'), 8);
  assert.equal(tzOffset('KALIMANTAN BARAT'), 7);
  assert.equal(tzOffset('KALIMANTAN TIMUR'), 8);
  assert.equal(tzOffset('PAPUA BARAT'), 9);
  assert.equal(tzOffset('MALUKU UTARA'), 9);
});

test('normRegion & regionKind', () => {
  assert.equal(normRegion('KAB. BOGOR'), 'BOGOR');
  assert.equal(normRegion('Kota Administrasi Jakarta Selatan'), 'JAKARTA SELATAN');
  assert.equal(normRegion('KAB. KEPULAUAN SERIBU'), 'KEP SERIBU');
  assert.equal(regionKind('Kota Bogor'), 'KOTA');
  assert.equal(regionKind('KAB. BOGOR'), 'KAB');
  assert.equal(regionKind('Bogor'), null);
});

test('matchCity: alamat OSM → kab/kota Kemenag', () => {
  // Data nyata dari cache web (geo_-6_60_106_80.json)
  assert.equal(matchCity({ suburb: 'Bogor Tengah', city: 'Bogor', state: 'Jawa Barat' }, CITIES), '1202');
  assert.equal(matchCity({ county: 'Bogor', village: 'Cibinong' }, CITIES), '1201');
  assert.equal(matchCity({ city: 'Jakarta Selatan' }, CITIES), '1301');
  assert.equal(matchCity({ county: 'Kabupaten Bandung' }, CITIES), '1203');
  assert.equal(matchCity({ city: 'Makassar' }, CITIES), '2622');
  assert.equal(matchCity({ city: 'Tokyo' }, CITIES), null);
});

test('parseSchedule memvalidasi & mengurutkan', () => {
  const jadwal = [];
  for (let d = 30; d >= 1; d--) {
    jadwal.push({ date: `2026-11-${String(d).padStart(2, '0')}`, imsak: '03:59', subuh: '04:09', terbit: '05:23', dhuha: '05:51', dzuhur: '11:40', ashar: '14:55', maghrib: '17:49', isya: '19:00' });
  }
  jadwal.push({ date: 'bad', imsak: 'x' });
  jadwal.push({ date: '2026-11-31', imsak: '25:00', subuh: '04:09', terbit: '05:23', dhuha: '05:51', dzuhur: '11:40', ashar: '14:55', maghrib: '17:49', isya: '19:00' });
  const r = parseSchedule({ status: true, data: { lokasi: 'KOTA JAKARTA<script>', daerah: 'DKI JAKARTA', jadwal } }, '1301', 2026, 11);
  assert.equal(r.lokasi, 'KOTA JAKARTAscript');
  assert.equal(r.tz, 7);
  assert.equal(r.month, '2026-11');
  assert.equal(Object.keys(r.days).length, 30);
  assert.equal(Object.keys(r.days)[0], '2026-11-01');
  assert.throws(() => parseSchedule({ status: true, data: { jadwal: jadwal.slice(0, 5) } }, '1301', 2026, 11));
  assert.throws(() => parseSchedule({ status: false }, '1301', 2026, 11));
});

test('parseCities menolak data rusak', () => {
  assert.throws(() => parseCities({ status: true, data: [{ id: '1301', lokasi: 'KOTA JAKARTA' }] }));
  const data = Array.from({ length: 120 }, (_, i) => ({ id: String(1000 + i), lokasi: `KAB. X${i}` }));
  data.push({ id: '12', lokasi: 'salah' });
  assert.equal(parseCities({ status: true, data }).length, 120);
});

test('toEpoch tidak bergantung zona waktu perangkat', () => {
  assert.equal(new Date(toEpoch(7, '2026-11-04', '04:09')).toISOString(), '2026-11-03T21:09:00.000Z');
  assert.equal(new Date(toEpoch(9, '2026-11-04', '12:00')).toISOString(), '2026-11-04T03:00:00.000Z');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('planNotifications: urut, masa depan, terbatas, pengingat', () => {
  const row = { imsak: '03:59', subuh: '04:09', terbit: '05:23', dhuha: '05:51', dzuhur: '11:40', ashar: '14:55', maghrib: '17:49', isya: '19:00' };
  const now = toEpoch(7, '2026-11-04', '12:00');
  const plan = planNotifications({
    dayRow: () => row, tz: 7, today: '2026-11-04', now,
    prayers: ['subuh', 'dzuhur', 'ashar', 'maghrib', 'isya', 'imsak'], before: 10, max: 60, days: 8,
  });
  assert.ok(plan.length <= 60);
  assert.ok(plan.every((e) => e.at > now));
  assert.ok(plan.every((e, i) => i === 0 || plan[i - 1].at <= e.at));
  assert.equal(plan[0].kind, 'remind'); assert.equal(plan[0].k, 'ashar'); // 14:45
  assert.equal(plan[1].kind, 'adzan');  assert.equal(plan[1].k, 'ashar');
  assert.ok(!plan.some((e) => e.k === 'imsak' && e.kind === 'remind'), 'imsak tanpa pengingat');
  // Tanpa pengingat & hari tanpa data dilewati
  const p2 = planNotifications({ dayRow: (d) => (d === '2026-11-05' ? null : row), tz: 7, today: '2026-11-04', now, prayers: ['subuh'], before: 0, days: 3 });
  assert.deepEqual(p2.map((e) => e.date), ['2026-11-06']);
});

test('searchCities memprioritaskan awalan & kota', () => {
  const r = searchCities(CITIES, 'kota bog');
  assert.equal(r.list[0].id, '1202');
  assert.equal(searchCities(CITIES, 'band').list.length, 2);
  assert.equal(searchCities(CITIES, '').list.length, 0);
});

test('cleanText & hijriah', () => {
  assert.equal(cleanText('  Kab.   <b>Bogor</b> '), 'Kab. bBogor/b');
  assert.match(formatHijri(new Date('2026-11-04T00:00:00Z')), /^\d{1,2} [A-Za-z' ]+ 14\d\d H$/);
});

test('API MyQuran nyata (lewati bila offline)', async (t) => {
  let res;
  try { res = await (await fetch('https://api.myquran.com/v2/sholat/jadwal/1301/2026/11', { signal: AbortSignal.timeout(15000) })).json(); }
  catch { t.skip('offline'); return; }
  const r = parseSchedule(res, '1301', 2026, 11);
  assert.equal(r.lokasi, 'KOTA JAKARTA');
  assert.equal(Object.keys(r.days).length, 30);
});
