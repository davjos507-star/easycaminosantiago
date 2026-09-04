/*
 * Capa CAMINO ROUTE — geometría GPX/GeoJSON del Camino sobre el mapa base.
 * Responsabilidad única: dibujar la ruta y distinguir etapa actual /
 * completadas / próximas / variantes. No conoce POIs, GPS ni alojamiento.
 *
 * BLOQUEADA hasta que exista GeoJSON real por etapa: hoy `stage.routeFile`
 * apunta a `routes/camino-norte/000-pending.geojson` en todas las etapas
 * (ver companion/data/stages/**). Nunca dibujar una línea recta entre
 * origen y destino como si fuera el trazado — eso sería inventar un dato.
 * En cuanto haya GPX/GeoJSON real confirmado por etapa, implementar aquí:
 *
 * ESPECIFICACIÓN (capturada 2026-09, "TRAZADO VISIBLE" — próxima fase):
 *
 * 1. CAMINO PRINCIPAL
 *    - Línea azul destacada, con contraste suficiente sobre los tiles de
 *      OpenFreeMap tanto en tramo urbano como en zona rural (el estilo
 *      "Liberty" usa tonos claros/crema — un azul saturado tipo #1A56DB
 *      o similar es buen punto de partida, a confirmar visualmente sobre
 *      el estilo real antes de fijarlo).
 *    - Geometría SIEMPRE tomada del GPX/GeoJSON real de la etapa — nunca
 *      una línea recta entre pueblos ni una aproximación.
 *    - setRoute(geojson): dibuja el trazado completo de la etapa activa.
 *    - setStageProgress(completedStageIds, currentStageId): la etapa
 *      ACTUAL se resalta (más gruesa/opaca); las etapas FUTURAS se pintan
 *      más discretas (menor opacidad o línea más fina) — nunca con el
 *      mismo peso visual que la etapa activa, para que se entienda de un
 *      vistazo "hacia dónde voy" frente al resto del itinerario.
 *    - El tramo ya recorrido dentro de la etapa activa, diferenciado
 *      visualmente del tramo pendiente, queda para una fase POSTERIOR a
 *      esta (no implementar todavía; requiere proyectar la posición GPS
 *      sobre la geometría real — ver map/route-projection.js, ya
 *      implementado y reutilizable para ese cálculo cuando toque).
 *    - Nunca el mismo estilo que ACCESO AL ALOJAMIENTO (línea secundaria,
 *      visualmente distinta — ver nav-route-layer.js: color naranja
 *      #D4882A, más fina). El Camino principal debe leerse siempre como
 *      "la ruta oficial", distinto de cualquier tramo de acceso puntual.
 *
 * 2. Marcadores (podrían vivir aquí o en stage-layer.js — a decidir en la
 *    implementación, pero deben coexistir sin duplicar lógica con
 *    accommodation-layer.js, que ya pinta el marcador del alojamiento):
 *    - Marcador de INICIO de etapa.
 *    - Marcador de DESTINO de etapa.
 *    (El marcador de alojamiento ya existe: map/layers/accommodation-layer.js.)
 *
 * Nada de esto se activa solo con tener el GeoJSON: sigue habiendo que
 * decidir el color exacto contra el estilo real, y verificar legibilidad
 * en dispositivo antes de dar la fase por cerrada.
 */
export function createRouteLayer(mapEngine) {
  return {
    setRoute(_geojson) {
      /* Fase 3 — bloqueado por falta de GeoJSON real, ver cabecera */
    },
    setStageProgress(_completedStageIds, _currentStageId) {
      /* Fase 3 — bloqueado por falta de GeoJSON real, ver cabecera */
    },
    clear() {
      /* Fase 3 */
    },
  };
}
