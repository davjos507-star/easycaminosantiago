/*
 * Carga perezosa de MapLibre GL JS.
 *
 * Los assets se resuelven SIEMPRE desde la raíz /companion/. Esto es
 * imprescindible porque cada peregrino puede entrar por una URL anidada
 * como /companion/mario-jasso/; las rutas relativas antiguas intentaban
 * cargar /companion/mario-jasso/vendor/... y el mapa no arrancaba.
 */

let loadPromise = null;
const COMPANION_ROOT = '/companion/';

function loadStylesheet(href) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`link[href="${href}"]`)) {
      resolve();
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`No se pudo cargar ${href}`));
    document.head.appendChild(link);
  });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.maplibregl) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.body.appendChild(script);
  });
}

function preconnectTileProvider() {
  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = 'https://tiles.openfreemap.org';
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
}

export function loadMapLibre() {
  if (loadPromise) return loadPromise;
  preconnectTileProvider();
  loadPromise = Promise.all([
    loadStylesheet(`${COMPANION_ROOT}vendor/maplibre-gl/maplibre-gl.css`),
    loadScript(`${COMPANION_ROOT}vendor/maplibre-gl/maplibre-gl.js`),
  ]).then(() => {
    if (!window.maplibregl) throw new Error('maplibre-gl no se inicializó correctamente');
    return window.maplibregl;
  });
  return loadPromise;
}
