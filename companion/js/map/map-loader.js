/*
 * Carga perezosa de MapLibre GL JS.
 *
 * MapLibre solo se descarga la primera vez que el peregrino abre la
 * pestaña MAPA, nunca en el arranque de la app (HOY, CAMINO,
 * ALOJAMIENTOS y MÁS no lo necesitan). Se sirve vendorizado desde
 * /companion/vendor/maplibre-gl/ — nunca desde un CDN externo.
 */

let loadPromise = null;

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
  // Calienta la conexión al dominio de tiles justo cuando se necesita el
  // mapa (nunca antes, para no gastar datos si el peregrino no abre MAPA).
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
    loadStylesheet('vendor/maplibre-gl/maplibre-gl.css'),
    loadScript('vendor/maplibre-gl/maplibre-gl.js'),
  ]).then(() => {
    if (!window.maplibregl) throw new Error('maplibre-gl no se inicializó correctamente');
    return window.maplibregl;
  });
  return loadPromise;
}
