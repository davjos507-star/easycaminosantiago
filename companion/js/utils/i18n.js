let currentLocale = 'en';
let strings = {};
let fallbackStrings = {};

async function loadLocale(locale) {
  const res = await fetch(`locales/${locale}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`i18n: no se pudo cargar "${locale}"`);
  return res.json();
}

function getNested(obj, path) {
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

export async function initI18n(locale = 'en') {
  fallbackStrings = await loadLocale('en');
  try {
    strings = locale === 'en' ? fallbackStrings : await loadLocale(locale);
  } catch (err) {
    console.warn('[i18n] usando inglés como fallback:', err.message);
    strings = fallbackStrings;
    locale = 'en';
  }
  currentLocale = locale;
  document.documentElement.lang = locale;
}

export function t(key, params = {}) {
  let value = getNested(strings, key) ?? getNested(fallbackStrings, key) ?? key;
  if (typeof value !== 'string') return value;
  for (const [k, v] of Object.entries(params)) {
    value = value.replaceAll(`{{${k}}}`, v);
  }
  return value;
}

export function getLocale() {
  return currentLocale;
}

export function applyStaticI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
}
