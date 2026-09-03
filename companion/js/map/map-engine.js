/*
 * Motor de mapa — implementación real sobre MapLibre GL JS (Fase 2).
 *
 * Las capas (map/layers/*.js) hablan con la interfaz de este módulo, no
 * con `maplibregl` directamente, salvo un único punto de escape
 * documentado (getInstance(), usado solo por user-location-layer.js para
 * su marcador DOM). Así, BASE MAP, CAMINO ROUTE, USER LOCATION, STAGES,
 * ACCOMMODATION y POIs permanecen desacoplados entre sí y del proveedor
 * concreto (ver map/config.js): cambiar de proveedor cartográfico en el
 * futuro no debería requerir tocar las capas.
 */

import { MAP_PROVIDER, MAP_STYLE_URL, MAP_DEFAULTS, isMapProviderConfigured } from './config.js';
import { loadMapLibre } from './map-loader.js';

export function createMapEngine({ container } = {}) {
  let map = null;
  let maplibregl = null;
  let ready = false;
  let tileErrorCount = 0;
  const listeners = new Map();
  const pendingStyleTasks = [];

  function emit(event, payload) {
    (listeners.get(event) || []).forEach((fn) => fn(payload));
  }

  function runWhenStyleReady(task) {
    if (ready && map?.isStyleLoaded()) task();
    else pendingStyleTasks.push(task);
  }

  return {
    async mount() {
      if (!container) throw new Error('map-engine: falta el contenedor del mapa');
      if (!isMapProviderConfigured()) {
        console.info('[map-engine] Proveedor de mapas sin configurar (ver js/map/config.js).');
        emit('provider-pending');
        return;
      }

      maplibregl = await loadMapLibre();

      map = new maplibregl.Map({
        container,
        style: MAP_STYLE_URL,
        center: [MAP_DEFAULTS.center.lng, MAP_DEFAULTS.center.lat],
        zoom: MAP_DEFAULTS.zoom,
        minZoom: MAP_DEFAULTS.minZoom,
        maxZoom: MAP_DEFAULTS.maxZoom,
        pitch: MAP_DEFAULTS.pitch,
        attributionControl: false,
        // Atribución obligatoria del proveedor (ver config.js): MapLibre la
        // rellena automáticamente desde el TileJSON de la fuente. Nunca
        // quitar este control.
      });
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');

      map.on('load', () => {
        ready = true;
        pendingStyleTasks.splice(0).forEach((task) => task());
        emit('ready');
      });
      map.on('error', (e) => {
        tileErrorCount += 1;
        console.warn('[map-engine]', e?.error?.message || e);
        emit('error', e);
      });
      map.on('dragstart', () => emit('user-drag'));
    },

    unmount() {
      map?.remove();
      map = null;
      ready = false;
      listeners.clear();
      pendingStyleTasks.length = 0;
    },

    isReady() {
      return ready;
    },

    resize() {
      map?.resize();
    },

    getInstance() {
      return map; // Escape hatch documentado — ver cabecera del archivo.
    },

    fitBounds(bounds, options = {}) {
      runWhenStyleReady(() => map.fitBounds(bounds, options));
    },

    setCenter({ lat, lng }, { animate = false, zoom } = {}) {
      runWhenStyleReady(() => {
        const opts = { center: [lng, lat], ...(zoom ? { zoom } : {}) };
        if (animate) map.easeTo({ ...opts, duration: 500 });
        else map.jumpTo(opts);
      });
    },

    // --- Helpers genéricos de fuente/capa GeoJSON, para que route/stage/
    // accommodation/poi-layer no necesiten conocer la API de MapLibre. ---
    setGeoJSONSource(id, geojson) {
      runWhenStyleReady(() => {
        const source = map.getSource(id);
        if (source) source.setData(geojson);
        else map.addSource(id, { type: 'geojson', data: geojson });
      });
    },

    ensureLayer(layerDef, beforeId) {
      runWhenStyleReady(() => {
        if (!map.getLayer(layerDef.id)) map.addLayer(layerDef, beforeId);
      });
    },

    removeLayer(id) {
      runWhenStyleReady(() => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
    },

    removeSource(id) {
      runWhenStyleReady(() => {
        if (map.getSource(id)) map.removeSource(id);
      });
    },

    // Envoltorio del marcador DOM del proveedor (usado solo por
    // user-location-layer.js para el punto azul + flecha de orientación:
    // un marcador en píxeles, a diferencia del círculo de precisión, que
    // sí escala en metros vía setGeoJSONSource/ensureLayer). Mantiene la
    // clase `maplibregl.Marker` encapsulada dentro de este módulo.
    createMarker({ element, rotationAlignment = 'map' } = {}) {
      const marker = new maplibregl.Marker({ element, rotationAlignment });
      return {
        setLngLat({ lat, lng }) {
          marker.setLngLat([lng, lat]);
          return this;
        },
        setRotation(deg) {
          marker.setRotation(deg);
          return this;
        },
        addTo() {
          marker.addTo(map);
          return this;
        },
        remove() {
          marker.remove();
        },
      };
    },

    // Solo para el panel de diagnóstico opcional (?debug=1). No se usa en
    // ninguna ruta normal de la app.
    getDebugInfo() {
      return {
        provider: MAP_PROVIDER,
        styleUrl: MAP_STYLE_URL,
        styleLoaded: Boolean(map?.isStyleLoaded()),
        zoom: map ? Number(map.getZoom().toFixed(2)) : null,
        tileErrorCount,
        maplibreVersion: maplibregl?.version || null,
      };
    },

    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(handler);
      return () => {
        listeners.set(event, (listeners.get(event) || []).filter((fn) => fn !== handler));
      };
    },
  };
}
