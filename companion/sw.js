/*
 * Service Worker — Easy Camino Companion.
 * Scope: /companion/ (registrado con scope relativo "./" desde ese path).
 * No puede interceptar peticiones del resto de easycaminosantiago.com.
 *
 * Versionado de caché: cambiar CACHE_VERSION en cada release para que
 * `activate` borre automáticamente las cachés de versiones anteriores.
 * No usar imports/módulos aquí (compatibilidad amplia con Safari iOS).
 */

const CACHE_VERSION = 'easy-camino-companion-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const DATA_CACHE = `${CACHE_VERSION}-data`;
const CURRENT_CACHES = [SHELL_CACHE, RUNTIME_CACHE, DATA_CACHE];

// Núcleo mínimo de la app shell. El resto de módulos JS y datos se cachean
// en tiempo de ejecución (ver fetch handler) para no tener que mantener
// aquí una lista manual que crecerá en cada fase.
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/fonts.css',
  './css/app.css',
  './js/app.js',
  './locales/en.json',
  './locales/es.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch((err) => console.warn('[sw] precache incompleto:', err.message))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => !CURRENT_CACHES.includes(name)).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

// Permite que register-sw.js fuerce la activación inmediata del worker en
// espera cuando el usuario acepta actualizar (evita quedarse en versión vieja).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

function isDataRequest(url) {
  return url.pathname.includes('/companion/data/') || url.pathname.includes('/companion/locales/');
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Nunca interceptar peticiones fuera de nuestro propio origen (mapas,
  // POIs, etc. en fases futuras): sin caché offline para esas todavía.
  if (url.origin !== self.location.origin) return;

  // Fuera de /companion/, este service worker no debe actuar nunca
  // (aislamiento respecto al resto del sitio).
  if (!url.pathname.startsWith('/companion/')) return;

  if (isDataRequest(url)) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  event.respondWith(cacheFirst(request, RUNTIME_CACHE));
});
