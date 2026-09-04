/*
 * Capa STAGES — marcadores de origen/destino y puntos relevantes de cada
 * etapa. Independiente de la geometría de la ruta (route-layer) y del
 * alojamiento (accommodation-layer).
 *
 * ESPECIFICACIÓN (capturada 2026-09, "TRAZADO VISIBLE" — próxima fase, ver
 * también route-layer.js): al igual que la línea del Camino, bloqueada
 * hasta tener coordenadas/GeoJSON reales de cada etapa (hoy `stage.coordinates`
 * es `null` en todos los datos — ver companion/data/stages/**). Nunca
 * inventar una posición aproximada para un marcador.
 *
 * - setStages(stages): pinta un marcador de INICIO y otro de DESTINO por
 *   etapa, para que de un vistazo se entienda "dónde está el Camino" y
 *   "hacia dónde voy" junto con la línea de route-layer.js.
 * - highlightStage(stageId): la etapa ACTUAL se resalta (marcadores más
 *   grandes/saturados); las etapas FUTURAS quedan más discretas (menor
 *   tamaño/opacidad) — mismo criterio de jerarquía visual que
 *   setStageProgress() en route-layer.js, coordinado con esa capa para no
 *   duplicar la lógica de "qué etapa es la activa".
 * - El marcador de alojamiento NO vive aquí: ya existe en
 *   map/layers/accommodation-layer.js, implementado y en uso por "Ver en
 *   mapa" / "Llévame al alojamiento".
 */
export function createStageLayer(mapEngine) {
  return {
    setStages(_stages) {
      /* Fase 3/4 — bloqueado por falta de coordenadas reales, ver cabecera */
    },
    highlightStage(_stageId) {
      /* Fase 3/4 — bloqueado por falta de coordenadas reales, ver cabecera */
    },
    clear() {
      /* Fase 3 */
    },
  };
}
