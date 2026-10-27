import { store } from './storage.js';
import tr from './locales/tr.js';
import en from './locales/en.js';

const DICT = { tr, en };

const saved = store.get('lang');
let lang = saved in DICT ? saved : ((navigator.language || '').toLowerCase().startsWith('tr') ? 'tr' : 'en');

export function getLang() {
  return lang;
}

export function setLang(next) {
  if (!(next in DICT)) return;
  lang = next;
  store.set('lang', next);
  applyI18n();
}

export function t(key, vars = {}) {
  const text = DICT[lang][key] ?? DICT.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '');
}

export function applyI18n(root = document) {
  document.documentElement.lang = lang;
  document.title = t('meta.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('meta.description'));
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  // sadece sözlükteki sabit metinler (SSS'deki link ve vurgular)
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    const text = t(el.dataset.i18nAria);
    el.setAttribute('aria-label', text);
    el.title = text;
  });
}
