/*
 * Capa POIs — resultados de "Cerca de mí". Recibe resultados ya resueltos
 * por js/data/poi/poi-provider.js (proveedor abstracto, ver ese módulo);
 * esta capa no sabe ni le importa qué proveedor los generó.
 * Implementación real en Fase 7.
 */
export function createPoiLayer(mapEngine) {
  return {
    setPois(_pois /* [{ id, name, category, lat, lng }] */) {
      /* Fase 7 */
    },
    setCategoryVisible(_category, _visible) {
      /* Fase 7 */
    },
    clear() {
      /* Fase 7 */
    },
  };
}
