/*
 * Capa ACCOMMODATION — marcador del alojamiento, usado por "Ver en mapa"
 * y por "Llévame al alojamiento" (destino de la navegación). No conoce
 * POIs ni la ruta; solo pinta el punto que ya viene resuelto en los
 * datos de la etapa (nunca busca coordenadas por su cuenta).
 */
import { icon } from '../../ui/components/icons.js';

function createPinElement() {
  const el = document.createElement('div');
  el.className = 'cc-accommodation-pin';
  el.innerHTML = icon('pin');
  return el;
}

export function createAccommodationLayer(mapEngine) {
  let marker = null;
  let visible = false;

  return {
    setAccommodation({ lat, lng } /* { name, lat, lng } */) {
      if (!marker) marker = mapEngine.createMarker({ element: createPinElement(), rotationAlignment: 'viewport' });
      marker.setLngLat({ lat, lng });
      if (!visible) {
        marker.addTo();
        visible = true;
      }
    },

    clear() {
      marker?.remove();
      marker = null;
      visible = false;
    },
  };
}
