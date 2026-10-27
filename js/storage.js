// gizli pencerede vs. localStorage hata atabiliyor
const PREFIX = 'abt.';

export const store = {
  get(key) {
    try { return localStorage.getItem(PREFIX + key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(PREFIX + key, value); } catch { /* yoksay */ }
  },
};
