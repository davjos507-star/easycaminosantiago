/*
 * Capa CAMINO ROUTE — geometría GPX/GeoJSON del Camino sobre el mapa base.
 * Responsabilidad única: dibujar la ruta y distinguir etapa actual /
 * completadas / próximas / variantes. No conoce POIs, GPS ni alojamiento.
 * Implementación real en Fase 2/3, una vez haya GeoJSON confirmado.
 */
export function createRouteLayer(mapEngine) {
  return {
    setRoute(_geojson) {
      /* Fase 3 */
    },
    setStageProgress(_completedStageIds, _currentStageId) {
      /* Fase 3 */
    },
    clear() {
      /* Fase 3 */
    },
  };
}
