/*
 * Capa CAMINO ROUTE — trazado oficial del Camino sobre el mapa base.
 *
 * Fuente: CNIG/IGN, dataset "Rutas de Caminos de Santiago 2020-2026"
 * (datos FEAACS), CC-BY 4.0. Geometría real descargada y validada
 * (continuidad, orientación, cruce contra alojamientos de Osyris) antes
 * de integrarse aquí — nunca una línea recta entre pueblos.
 * companion/data/routes/osyris-camino.geojson.
 *
 * Atribución obligatoria (mostrada en Más → Acerca de):
 *   "Obra derivada de Rutas de Caminos de Santiago 2020-2026 CC-BY 4.0 FEAACS"
 *
 * Anomalías conocidas y documentadas (no corregidas automáticamente —
 * ver informe de validación de la fase de investigación GPX): huecos de
 * continuidad sin explicar en Deba/Markina (~122 m), Santillana/San
 * Vicente-Llanes (~312 m), Cadavedo/Luarca (~160 m) y en la convergencia
 * Sobrado/Arzúa con el Camino Francés (~293 m); varios alojamientos
 * (Gijón, Tapia de Casariego, Arzúa, Güemes, Miraz) quedan a más
 * distancia del trazado de la esperada — pendiente de una segunda fase
 * de investigación, no bloquea esta integración inicial.
 *
 * Hoy se dibuja el trazado COMPLETO (sin resaltar la etapa activa ni
 * distinguir tramo recorrido): setStageProgress() queda para una fase
 * posterior, cuando haya forma fiable de identificar qué tramo exacto
 * corresponde a la etapa de hoy sin arriesgar la entrega.
 */
const ROUTE_SOURCE = 'ecc-camino-oficial';
const ROUTE_LINE_LAYER = 'ecc-camino-oficial-line';

export function createRouteLayer(mapEngine) {
  let visible = false;

  return {
    setRoute(geojson) {
      if (!geojson) return;
      mapEngine.setGeoJSONSource(ROUTE_SOURCE, geojson);
      if (!visible) {
        mapEngine.ensureLayer({
          id: ROUTE_LINE_LAYER,
          type: 'line',
          source: ROUTE_SOURCE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#2D4A52',
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 5],
            'line-opacity': 0.82,
          },
        });
        visible = true;
      }
    },

    setStageProgress(_completedStageIds, _currentStageId) {
      /* Fase posterior — ver cabecera del archivo */
    },

    clear() {
      mapEngine.removeLayer(ROUTE_LINE_LAYER);
      mapEngine.removeSource(ROUTE_SOURCE);
      visible = false;
    },
  };
}
