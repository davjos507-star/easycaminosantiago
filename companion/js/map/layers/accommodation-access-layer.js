/*
 * Capa ACCESO AL ALOJAMIENTO — vista previa ESTÁTICA de cómo se llega
 * desde el Camino hasta el alojamiento, calculada por
 * accommodation/camino-access-finder.js (geometría oficial del Camino +
 * routing peatonal real vía la función Netlify existente). No conoce el
 * algoritmo ni hace llamadas de red — solo dibuja el resultado ya
 * calculado, igual que accommodation-layer.js con el marcador del hotel.
 *
 * Estilo deliberadamente distinto de:
 * - route-layer.js (Camino oficial: línea azul/turquesa continua);
 * - nav-route-layer.js (navegación activa "Llévame al alojamiento":
 *   naranja continua, con GPS en vivo).
 * Este "desvío" en preview usa el mismo naranja pero DISCONTINUO, para
 * que se lea como "mismo tipo de ruta calculada, pero todavía no estás
 * caminándola" sin inventar una tercera paleta de color.
 */
const ACCESS_SOURCE = 'ecc-accommodation-access';
const ACCESS_LINE_LAYER = 'ecc-accommodation-access-line';

function createExitPointElement() {
  const el = document.createElement('div');
  el.className = 'cc-access-exit-dot';
  return el;
}

export function createAccommodationAccessLayer(mapEngine) {
  let marker = null;
  let lineVisible = false;

  return {
    /** @param {{exitPoint:{lat,lng}, routeCoordinates:Array<[number,number]>}|null} access */
    setAccess(access) {
      if (!access) {
        this.clear();
        return;
      }
      mapEngine.setGeoJSONSource(ACCESS_SOURCE, {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: access.routeCoordinates },
      });
      if (!lineVisible) {
        mapEngine.ensureLayer({
          id: ACCESS_LINE_LAYER,
          type: 'line',
          source: ACCESS_SOURCE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#D4882A',
            'line-width': 4,
            'line-opacity': 0.9,
            'line-dasharray': [2, 1.6],
          },
        });
        lineVisible = true;
      }
      if (!marker) marker = mapEngine.createMarker({ element: createExitPointElement(), rotationAlignment: 'viewport' });
      marker.setLngLat(access.exitPoint);
      marker.addTo();
    },

    clear() {
      mapEngine.removeLayer(ACCESS_LINE_LAYER);
      mapEngine.removeSource(ACCESS_SOURCE);
      marker?.remove();
      marker = null;
      lineVisible = false;
    },
  };
}
