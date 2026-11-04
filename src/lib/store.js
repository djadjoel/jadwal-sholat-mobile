/* Penyimpanan lokal sederhana (localStorage WebView bersifat persisten di aplikasi native). */
export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* penuh/diblokir */ } },
  remove(k) { try { localStorage.removeItem(k); } catch { /* abaikan */ } },
  keys() { try { return Object.keys(localStorage); } catch { return []; } },
};
