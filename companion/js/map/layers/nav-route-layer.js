/*
 * Capa NAV ROUTE — geometría de la ruta peatonal calculada por el motor
 * de routing para "Llévame al alojamiento" (accommodation-nav.js).
 *
 * Independiente de CAMINO ROUTE (route-layer.js, reservada para la traza
 * oficial del Camino cuando exista su GPX): esta capa solo vive mientras
 * la navegación al alojamiento está activa y se borra al cerrarla, sin
 * tocar ninguna otra capa del mapa.
 */
const NAV_ROUTE_SOURCE = 'ecc-nav-route';
const NAV_ROUTE_LINE_LAYER = 'ecc-nav-route-line';

export function createNavRouteLayer(mapEngine) {
  let visible = false;

  return {
    setRoute(coordinates) {
      mapEngine.setGeoJSONSource(NAV_ROUTE_SOURCE, {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates },
      });
      if (!visible) {
        mapEngine.ensureLayer({
          id: NAV_ROUTE_LINE_LAYER,
          type: 'line',
          source: NAV_ROUTE_SOURCE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#D4882A', 'line-width': 5, 'line-opacity': 0.85 },
        });
        visible = true;
      }
    },

    clear() {
      mapEngine.removeLayer(NAV_ROUTE_LINE_LAYER);
      mapEngine.removeSource(NAV_ROUTE_SOURCE);
      visible = false;
    },
  };
}
