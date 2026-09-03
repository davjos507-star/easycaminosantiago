/*
 * Capa USER LOCATION — punto azul, círculo de precisión y flecha de
 * orientación. Solo pinta las posiciones que le pasa gps-controller.js;
 * no solicita permisos ni gestiona el watch por sí misma.
 */
import { circlePolygonFeature } from '../geo-utils.js';

const ACCURACY_SOURCE = 'ecc-user-accuracy';
const ACCURACY_FILL_LAYER = 'ecc-user-accuracy-fill';
const ACCURACY_LINE_LAYER = 'ecc-user-accuracy-line';

function createDotElement() {
  const el = document.createElement('div');
  el.className = 'cc-user-dot';
  el.innerHTML = `
    <div class="cc-user-dot-pulse"></div>
    <div class="cc-user-dot-heading"></div>
    <div class="cc-user-dot-core"></div>
  `;
  return el;
}

export function createUserLocationLayer(mapEngine) {
  let marker = null;
  let dotElement = null;
  let visible = false;

  function ensureMarker() {
    if (marker) return marker;
    dotElement = createDotElement();
    marker = mapEngine.createMarker({ element: dotElement, rotationAlignment: 'map' });
    return marker;
  }

  return {
    setPosition({ lat, lng, accuracy, heading }) {
      if (!visible) {
        ensureMarker().addTo();
        visible = true;
      }
      marker.setLngLat({ lat, lng });

      dotElement?.classList.toggle('has-heading', heading != null);
      if (heading != null) marker.setRotation(heading);

      const accuracyMeters = Number.isFinite(accuracy) ? accuracy : 30;
      mapEngine.setGeoJSONSource(ACCURACY_SOURCE, circlePolygonFeature({ lat, lng }, accuracyMeters));
      mapEngine.ensureLayer({
        id: ACCURACY_FILL_LAYER,
        type: 'fill',
        source: ACCURACY_SOURCE,
        paint: { 'fill-color': '#1E88E5', 'fill-opacity': 0.12 },
      });
      mapEngine.ensureLayer({
        id: ACCURACY_LINE_LAYER,
        type: 'line',
        source: ACCURACY_SOURCE,
        paint: { 'line-color': '#1E88E5', 'line-opacity': 0.35, 'line-width': 1.5 },
      });
    },

    setFollowMode(_enabled) {
      // El seguimiento (centrar el mapa) lo decide gps-controller.js
      // llamando a mapEngine.setCenter(); esta capa solo pinta.
    },

    clear() {
      marker?.remove();
      marker = null;
      dotElement = null;
      visible = false;
      mapEngine.removeLayer(ACCURACY_FILL_LAYER);
      mapEngine.removeLayer(ACCURACY_LINE_LAYER);
      mapEngine.removeSource(ACCURACY_SOURCE);
    },
  };
}
