/*
 * Cliente del routing peatonal para "Llévame al alojamiento".
 *
 * MapLibre no calcula rutas: la geometría real viene de una función
 * Netlify propia (netlify/functions/walking-route.js) que llama a
 * OpenRouteService (perfil foot-walking) manteniendo la API key en el
 * servidor — nunca en este archivo ni en ningún JS público (ver cabecera
 * de esa función para el porqué). Esta función es la ÚNICA que sale de
 * /companion/, y solo para ese proxy imprescindible.
 *
 * Solo viajan al servidor las dos coordenadas estrictamente necesarias
 * para calcular la ruta (origen y destino) — nunca un histórico de
 * posiciones (ver CLAUDE.md / condición de privacidad del proyecto).
 *
 * MapProvider / RouteProvider — separación arquitectónica (2026-09):
 * este módulo (RouteProvider, el "de dónde sale la geometría de la
 * ruta") es completamente independiente de map/config.js (MapProvider,
 * "de dónde salen los tiles del mapa"). Ningún módulo de mapa/capas
 * importa nada de aquí, y este archivo no importa nada de map/ — solo
 * habla con accommodation-nav.js (que a su vez entrega la geometría a
 * map/layers/nav-route-layer.js para dibujarla). Cambiar de proveedor de
 * mapas (OpenFreeMap → otro) nunca debería requerir tocar este archivo,
 * y cambiar de motor de routing (hoy OpenRouteService, vía la función
 * Netlify) nunca debería requerir tocar map/config.js ni las capas del
 * mapa. Ver netlify/functions/walking-route.js para el lado servidor de
 * esta misma garantía.
 */

const ROUTE_ENDPOINT = '/.netlify/functions/walking-route';

/**
 * @param {{from:{lat:number,lng:number}, to:{lat:number,lng:number}}} params
 * @returns {Promise<{coordinates:Array<[number,number]>, distanceMeters:number|null, durationSeconds:number|null}>}
 * @throws si el routing falla o la respuesta no trae geometría utilizable.
 */
export async function fetchWalkingRoute({ from, to }) {
  const res = await fetch(ROUTE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fromLat: from.lat,
      fromLng: from.lng,
      toLat: to.lat,
      toLng: to.lng,
    }),
  });

  if (!res.ok) {
    throw new Error(`routing-service: respuesta ${res.status}`);
  }

  const data = await res.json();
  if (!data || !Array.isArray(data.coordinates) || data.coordinates.length < 2) {
    throw new Error('routing-service: respuesta sin geometría válida');
  }

  return {
    coordinates: data.coordinates,
    distanceMeters: Number.isFinite(data.distanceMeters) ? data.distanceMeters : null,
    durationSeconds: Number.isFinite(data.durationSeconds) ? data.durationSeconds : null,
  };
}
