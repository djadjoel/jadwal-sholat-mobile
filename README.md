<div align="center">

# 🕌 Jadwal Sholat — Mobile (Android & iOS)

**Jadwal sholat akurat, adzan tepat waktu, langsung dari saku Anda.**

<a href="https://github.com/djadjoel/jadwal-sholat"><img alt="Jadwal Sholat versi Web" src="https://img.shields.io/badge/🌐_Coba_Versi_Web-Jadwal_Sholat-0b1026?style=for-the-badge&labelColor=1e3a8a"></a>
<a href="https://www.hostinger.com/id?REFERRALCODE=HMMDJADJOUVL"><img alt="Hosting di Hostinger" src="https://img.shields.io/badge/🚀_Hosting_%26_VPS-Hostinger-673DE6?style=for-the-badge&logo=hostinger&logoColor=white"></a>

<a href="https://bantenweb.com"><img alt="BantenWeb" src="https://img.shields.io/badge/💼_BantenWeb-Jasa_Website-0ea5e9?style=for-the-badge"></a>
<a href="https://baniakoy.com"><img alt="Baniakoy" src="https://img.shields.io/badge/🌿_Baniakoy-Kunjungi-16a34a?style=for-the-badge"></a>

<sub>🌐 Repo versi web (PHP + PWA) · 🚀 Hostinger: hosting & VPS untuk menjalankan versi web (<i>tautan referral</i>) · 💼 BantenWeb · 🌿 Baniakoy</sub>

<br>

![Capacitor](https://img.shields.io/badge/Capacitor-8-119EFF?logo=capacitor&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Android](https://img.shields.io/badge/Android-✓-3DDC84?logo=android&logoColor=white)
![iOS](https://img.shields.io/badge/iOS-✓-000000?logo=apple&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

</div>

---

Versi aplikasi mobile dari [Jadwal Sholat (web)](https://github.com/djadjoel/jadwal-sholat), dibangun dengan **Capacitor 8** + **Vite**. Satu basis kode menghasilkan aplikasi native Android dan iOS. Datanya tetap dari **Bimas Islam Kementerian Agama RI** melalui API publik MyQuran (`api.myquran.com/v2`).

## Fitur
- Jadwal harian & bulanan untuk 500+ kab/kota, jam real-time, hitung mundur, dan langit dinamis seperti versi web.
- **Notifikasi adzan native** yang terjadwal di sistem, jadi tetap berbunyi walau aplikasi ditutup atau HP di-restart. Bisa diatur per waktu sholat, dengan pengingat 5/10/15/30 menit sebelumnya. Di Android ada channel dengan nada khusus (`res/raw/chime.wav`) dan dukungan alarm tepat waktu (Android 12+).
- **Deteksi lokasi via GPS** (izin lokasi perkiraan), opsional diperbarui otomatis tiap aplikasi dibuka.
- **Offline-first**: jadwal tersimpan di perangkat dan langsung tampil, lalu diperbarui di latar belakang.
- UI mobile: tab bar (Hari Ini · Bulanan · Pengaturan), bottom sheet pencarian kota, lonceng per waktu sholat, haptic, tombol back Android, safe-area/notch, splash & ikon.

## Perbedaan arsitektur dari versi web
Versi web memakai proxy PHP (`api.php`). Versi mobile **tidak membutuhkan server**: aplikasi memanggil MyQuran dan Nominatim (OpenStreetMap) langsung, lewat HTTP native (`CapacitorHttp`). Logika server dipindahkan ke [`src/lib/core.js`](src/lib/core.js):

| PHP (web) | JS (mobile) |
|---|---|
| validasi jadwal & daftar kota | `parseSchedule`, `parseCities` |
| `tz_offset`, `norm_region`, `region_kind`, `match_city` | `tzOffset`, `normRegion`, `regionKind`, `matchCity` |
| `clean_text` | `cleanText` |
| cache berkas (7/60/30/180 hari) | cache `localStorage` dengan TTL yang sama ([`src/lib/data.js`](src/lib/data.js)) |

Koordinat tetap dibulatkan ke ~1 km sebelum dikirim ke Nominatim.

## Struktur
| Berkas | Fungsi |
|---|---|
| `index.html`, `src/styles.css` | Tampilan |
| `src/main.js` | Logika UI, jam, tab, pengaturan, penjadwalan ulang notifikasi |
| `src/lib/core.js` | Logika murni (diuji dengan `npm test`) |
| `src/lib/data.js` | Akses API + cache offline |
| `src/lib/native.js` | Notifikasi, GPS, status bar, splash, haptic, tombol back |
| `android/`, `ios/` | Proyek native (Android Studio / Xcode) |
| `assets/`, `scripts/` | Sumber ikon/splash dan pembuat nada notifikasi |

## Kebutuhan
- Node.js 20+ (sudah dites dengan Node 24)
- **Android**: Android Studio (JDK 21 bawaan) dengan Android SDK 36
- **iOS**: macOS dengan Xcode 16+ (iOS 15+). Proyek memakai Swift Package Manager, jadi tidak perlu CocoaPods.

## Pengembangan
```bash
npm install
npm run dev          # pratinjau di browser (http://localhost:5173), fitur native memakai fallback
npm test             # unit test logika inti (+ 1 tes ke API nyata)
```

## Build & jalankan di perangkat
```bash
npm run android      # build web → sync → buka Android Studio, lalu Run ▶
npm run ios          # build web → sync → buka Xcode, pilih Team (Signing), lalu Run ▶
npm run run:android  # atau langsung ke emulator/HP yang terhubung
```
Setiap kali kode di `src/` atau `index.html` berubah, jalankan `npm run sync`.

### Live reload di emulator/HP Android

```bash
npm run dev            # terminal 1: server Vite
npm run live:android   # terminal 2: pasang ke emulator/HP, perubahan kode langsung terlihat
```
Debug WebView: buka `chrome://inspect` di Chrome desktop. Ekstensi VS Code yang disarankan ada di `.vscode/extensions.json`.

### APK / AAB rilis (Android)
1. Android Studio → **Build › Generate Signed App Bundle / APK**, lalu buat keystore (simpan baik-baik, jangan di-commit).
2. Pilih **Android App Bundle (.aab)** untuk Google Play, atau **APK** untuk dipasang langsung.

**Cara cepat (APK untuk dibagikan via WhatsApp, tanpa Play Store):**

```bash
npm run apk
```

Hasilnya: `android/app/build/outputs/apk/release/app-release.apk`. Signing dibaca dari `android/keystore.properties` + `android/jadwal-sholat-release.jks` (keduanya tidak di-commit — **backup**, karena update APK wajib memakai keystore yang sama). Butuh JDK 21 (`JAVA_HOME`); JDK 25 bawaan Android Studio belum didukung Gradle 8.14.

Untuk update: naikkan `versionCode` (dan `versionName`) di `android/app/build.gradle`, build ulang, lalu bagikan APK baru — penerima cukup memasangnya di atas versi lama.

### Rilis iOS
Xcode → pilih *Any iOS Device* → **Product › Archive** → **Distribute App** (perlu Apple Developer Program).

## Ganti ikon / splash
Ubah desain di `scripts/make-assets.mjs` (atau taruh PNG sendiri di `assets/`), lalu jalankan:
```bash
npm run assets
```

## Catatan
- **App ID** adalah `id.jadwalsholat.app` (`capacitor.config.json`). Ganti sebelum rilis pertama ke store, karena ID tidak bisa diubah setelah terbit.
- **Batas notifikasi**: iOS hanya mengizinkan 64 notifikasi terjadwal, jadi aplikasi menjadwalkan ±8 hari ke depan. Android menjadwalkan ±20 hari. Setiap kali aplikasi dibuka, jadwal diperbarui otomatis.
- **Nada khusus iOS**: iOS memakai nada notifikasi bawaan. Untuk nada khusus, jalankan `node scripts/make-chime.mjs ios/App/App/chime.wav`, tambahkan berkasnya ke target *App* di Xcode, lalu ubah `sound` di `src/lib/native.js` agar `chime.wav` juga dipakai di iOS.
- Beberapa HP Android (Xiaomi, Oppo, Vivo, dll.) mematikan alarm aplikasi demi hemat baterai. Bila notifikasi terlambat, set baterai aplikasi ke **Tanpa batasan**.

## Lisensi
MIT. Data jadwal © Bimas Islam Kementerian Agama RI; data lokasi © kontributor OpenStreetMap.
