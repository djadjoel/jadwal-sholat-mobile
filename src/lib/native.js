/* Jembatan ke fitur native (Capacitor) dengan fallback untuk browser saat pengembangan. */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Geolocation } from '@capacitor/geolocation';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { PRAYERS } from './core.js';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'android' | 'ios' | 'web'

const CH_ADZAN = 'adzan-v1';
const CH_REMIND = 'pengingat-v1';
const ID_BASE = 1000;
/* iOS membatasi 64 notifikasi terjadwal; Android tidak, tapi AlarmManager punya batas ±500. */
export const MAX_SCHEDULED = platform === 'ios' ? 60 : 180;

/* ---------- UI sistem ---------- */
export async function setupSystemUI() {
  if (!isNative) return;
  // Teks status bar terang di atas latar gelap. Edge-to-edge & safe-area ditangani SystemBars (Capacitor 8).
  try { await StatusBar.setStyle({ style: Style.Dark }); } catch { /* abaikan */ }
}

export async function hideSplash() {
  if (isNative) try { await SplashScreen.hide({ fadeOutDuration: 250 }); } catch { /* abaikan */ }
}

export function tap(style = 'light') {
  if (!isNative) return;
  Haptics.impact({ style: style === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light }).catch(() => {});
}

export function onResume(fn) {
  if (isNative) App.addListener('resume', fn);
  else document.addEventListener('visibilitychange', () => { if (!document.hidden) fn(); });
}

export function onBack(fn) {
  if (isNative) App.addListener('backButton', ({ canGoBack }) => fn(canGoBack));
}

export const exitApp = () => (isNative ? App.exitApp() : undefined);

export async function appVersion() {
  if (!isNative) return 'web-dev';
  try { const i = await App.getInfo(); return `${i.version} (${i.build})`; } catch { return '—'; }
}

/* ---------- lokasi ---------- */
export async function currentPosition() {
  if (isNative) {
    let perm = await Geolocation.checkPermissions();
    if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
      perm = await Geolocation.requestPermissions({ permissions: ['coarseLocation'] });
    }
    if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
      const e = new Error('Izin lokasi ditolak. Aktifkan di pengaturan perangkat atau pilih kota manual.');
      e.code = 1;
      throw e;
    }
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60e3 });
    return pos.coords;
  }
  if (!('geolocation' in navigator)) throw new Error('Perangkat tidak mendukung lokasi.');
  const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, {
    enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60e3,
  }));
  return pos.coords;
}

export async function locationGranted() {
  if (!isNative) {
    try { return (await navigator.permissions.query({ name: 'geolocation' })).state === 'granted'; } catch { return false; }
  }
  try {
    const p = await Geolocation.checkPermissions();
    return p.location === 'granted' || p.coarseLocation === 'granted';
  } catch { return false; }
}

/* ---------- notifikasi ---------- */
export async function notifPermission(request = false) {
  if (!isNative) {
    if (!('Notification' in window)) return 'denied';
    if (request && Notification.permission === 'default') await Notification.requestPermission();
    return Notification.permission === 'default' ? 'prompt' : Notification.permission;
  }
  let p = await LocalNotifications.checkPermissions();
  if (request && p.display !== 'granted' && p.display !== 'denied') p = await LocalNotifications.requestPermissions();
  return p.display;
}

/** Android 12+: alarm tepat waktu ('granted' | 'denied' | null bila tidak relevan). */
export async function exactAlarmStatus() {
  if (platform !== 'android') return null;
  try { return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm; } catch { return null; }
}

export async function openExactAlarmSettings() {
  if (platform !== 'android') return null;
  try { return (await LocalNotifications.changeExactNotificationSetting()).exact_alarm; } catch { return null; }
}

let channelsReady = false;
async function ensureChannels() {
  if (platform !== 'android' || channelsReady) return;
  await LocalNotifications.createChannel({
    id: CH_ADZAN, name: 'Waktu sholat', description: 'Pemberitahuan saat masuk waktu sholat',
    importance: 5, visibility: 1, sound: 'chime.wav', vibration: true, lights: true, lightColor: '#F6C56F',
  });
  await LocalNotifications.createChannel({
    id: CH_REMIND, name: 'Pengingat sebelum waktu sholat', description: 'Pengingat beberapa menit sebelum waktu sholat',
    importance: 4, visibility: 1, vibration: true,
  });
  channelsReady = true;
}

export async function cancelAll() {
  if (!isNative) return;
  const { notifications } = await LocalNotifications.getPending();
  const ours = notifications.filter((n) => n.id >= ID_BASE);
  if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
}

/**
 * Ganti seluruh notifikasi terjadwal dengan rencana baru.
 * @param {Array<{kind,k,at,time,date}>} plan
 * @param {{city:string,tzLabel:string,before:number}} ctx
 */
export async function scheduleAll(plan, ctx) {
  if (!isNative) return 0;
  await ensureChannels();
  await cancelAll();
  if (!plan.length) return 0;
  const notifications = plan.map((e, i) => {
    const name = PRAYERS[e.k].name;
    const adzan = e.kind === 'adzan';
    const sunrise = e.k === 'terbit', imsak = e.k === 'imsak';
    const title = adzan
      ? (sunrise ? `Matahari terbit · ${e.time}` : imsak ? `Waktu Imsak · ${e.time}` : `Waktu ${name} · ${e.time}`)
      : `${name} dalam ${ctx.before} menit`;
    const body = adzan
      ? (sunrise ? `Batas akhir waktu Subuh untuk ${ctx.city}.`
        : imsak ? `Telah masuk waktu imsak untuk ${ctx.city}.`
        : `Telah masuk waktu sholat ${name} untuk ${ctx.city}.`)
      : `Bersiaplah untuk sholat ${name} pukul ${e.time} ${ctx.tzLabel} (${ctx.city}).`;
    return {
      id: ID_BASE + i,
      title, body,
      largeBody: body,
      schedule: { at: new Date(e.at), allowWhileIdle: true },
      channelId: adzan ? CH_ADZAN : CH_REMIND,
      smallIcon: 'ic_stat_crescent',
      iconColor: '#F6C56F',
      sound: adzan && platform === 'android' ? 'chime.wav' : undefined,
      group: 'jadwal-sholat',
      extra: { k: e.k, kind: e.kind, date: e.date },
    };
  });
  await LocalNotifications.schedule({ notifications });
  return notifications.length;
}

/** Notifikasi contoh 5 detik lagi (ID di bawah ID_BASE agar tidak terhapus saat penjadwalan ulang). */
export async function testNotification(city) {
  if (!isNative) return;
  await ensureChannels();
  await LocalNotifications.schedule({ notifications: [{
    id: 999, title: 'Contoh notifikasi · Jadwal Sholat',
    body: `Notifikasi waktu sholat untuk ${city} berfungsi dengan baik.`,
    schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true },
    channelId: CH_ADZAN, smallIcon: 'ic_stat_crescent', iconColor: '#F6C56F',
    sound: platform === 'android' ? 'chime.wav' : undefined,
  }] });
}

export function onNotificationTap(fn) {
  if (isNative) LocalNotifications.addListener('localNotificationActionPerformed', (a) => fn(a.notification?.extra || {}));
}

export function onNotificationForeground(fn) {
  if (isNative) LocalNotifications.addListener('localNotificationReceived', (n) => fn(n.extra || {}, n));
}
