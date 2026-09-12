/*
 * "DESVÍO AL ALOJAMIENTO" — encuentra el mejor punto de salida del Camino
 * oficial para llegar andando a un alojamiento, y la geometría peatonal
 * real hasta él. Distinto de accommodation-nav.js (navegación activa con
 * GPS en vivo): esto es una vista previa ESTÁTICA, calculada una vez por
 * alojamiento, sin depender de dónde esté físicamente el peregrino.
 *
 * Algoritmo (documentado, no una caja negra):
 *  1. Busca el punto del trazado oficial más cercano en línea recta al
 *     alojamiento (geometría real ya cargada, nunca inventada).
 *  2. A partir de ahí, muestrea unos pocos puntos candidatos a lo largo
 *     del MISMO tramo (hacia delante y hacia atrás), espaciados por
 *     distancia real recorrida — no por índice — para no probar puntos
 *     casi idénticos en tramos muy densos (p. ej. País Vasco, ~9 m entre
 *     puntos).
 *  3. Pide una ruta peatonal real a OpenRouteService (vía la función
 *     Netlify existente, walking-route.js — misma infraestructura que
 *     "Llévame al alojamiento") para CADA candidato.
 *  4. Se queda con el candidato cuya ruta peatonal (no la distancia en
 *     línea recta) sea más corta. El punto geométricamente más próximo
 *     al Camino NO se asume como el mejor acceso a pie: puede haber una
 *     carretera, un río o un desnivel que lo hagan peor que otro punto
 *     algo más lejano en línea recta.
 *
 * Nº de llamadas a ORS: como mucho MAX_CANDIDATES (5) por alojamiento,
 * calculado una sola vez y cacheado por quien use este módulo — nunca
 * se recalcula en cada tick de GPS.
 */
import { haversineDistanceMeters } from '../map/geo-utils.js';
import { fetchWalkingRoute } from './routing-service.js';

// --- Umbrales documentados ---
export const MAX_CANDIDATES = 5;
// Espaciado mínimo (distancia real a lo largo del Camino, no en índice de
// puntos) entre candidatos consecutivos, para que no queden casi
// superpuestos en tramos muy densos.
export const CANDIDATE_MIN_SPACING_M = 150;
// Si el punto del Camino más cercano en línea recta ya está más lejos que
// esto, no merece la pena intentar un "desvío corto": no hay Camino
// conocido razonablemente próximo a este alojamiento.
export const MAX_CANDIDATE_STRAIGHT_LINE_M = 3000;

function toLatLng([lng, lat]) {
  return { lat, lng };
}

/** Punto del Camino (entre todas las líneas oficiales) más cercano en línea recta. */
function findClosestPoint(caminoLines, accommodation) {
  let best = null;
  for (let lineIndex = 0; lineIndex < caminoLines.length; lineIndex += 1) {
    const line = caminoLines[lineIndex];
    for (let pointIndex = 0; pointIndex < line.length; pointIndex += 1) {
      const distance = haversineDistanceMeters(toLatLng(line[pointIndex]), accommodation);
      if (!best || distance < best.distance) {
        best = { lineIndex, pointIndex, distance };
      }
    }
  }
  return best;
}

/**
 * Candidatos a lo largo de UNA línea, partiendo del índice más cercano,
 * caminando hacia delante y hacia atrás por distancia real acumulada.
 */
function sampleCandidates(line, centerIndex, accommodation) {
  const centerPoint = toLatLng(line[centerIndex]);
  const candidates = [{ ...centerPoint, pointIndex: centerIndex }];

  function walk(direction) {
    let idx = centerIndex;
    let accumulated = 0;
    let added = 0;
    const maxPerDirection = Math.ceil((MAX_CANDIDATES - 1) / 2);
    while (added < maxPerDirection) {
      const nextIdx = idx + direction;
      if (nextIdx < 0 || nextIdx >= line.length) break;
      accumulated += haversineDistanceMeters(toLatLng(line[idx]), toLatLng(line[nextIdx]));
      idx = nextIdx;
      if (accumulated >= CANDIDATE_MIN_SPACING_M) {
        const point = toLatLng(line[idx]);
        const distance = haversineDistanceMeters(point, accommodation);
        if (distance <= MAX_CANDIDATE_STRAIGHT_LINE_M) {
          candidates.push({ ...point, pointIndex: idx });
          added += 1;
        }
        accumulated = 0;
      }
    }
  }
  walk(1);
  walk(-1);
  return candidates.slice(0, MAX_CANDIDATES);
}

/**
 * @param {{accommodation:{lat:number,lng:number}, caminoLines:Array<Array<[number,number]>>}} params
 *   caminoLines: cada elemento es una LineString oficial ya cargada
 *   ([lng,lat] por punto, formato GeoJSON) — nunca concatenadas entre sí.
 * @returns {Promise<{exitPoint:{lat:number,lng:number}, routeCoordinates:Array<[number,number]>, distanceMeters:number, durationSeconds:number|null, candidatesTried:number}|null>}
 *   null si no hay Camino conocido razonablemente cerca, o si ORS falló
 *   para todos los candidatos — nunca se fabrica una geometría de repuesto.
 */
export async function findBestCaminoAccess({ accommodation, caminoLines }) {
  if (!accommodation || !caminoLines || caminoLines.length === 0) return null;

  const closest = findClosestPoint(caminoLines, accommodation);
  if (!closest || closest.distance > MAX_CANDIDATE_STRAIGHT_LINE_M) return null;

  const candidates = sampleCandidates(caminoLines[closest.lineIndex], closest.pointIndex, accommodation);

  const settled = await Promise.allSettled(
    candidates.map((c) => fetchWalkingRoute({ from: { lat: c.lat, lng: c.lng }, to: accommodation }))
  );

  let best = null;
  settled.forEach((outcome, i) => {
    if (outcome.status !== 'fulfilled') return;
    const result = outcome.value;
    if (!Number.isFinite(result?.distanceMeters)) return;
    if (!best || result.distanceMeters < best.result.distanceMeters) {
      best = { candidate: candidates[i], result };
    }
  });

  if (!best) return null;

  return {
    exitPoint: { lat: best.candidate.lat, lng: best.candidate.lng },
    routeCoordinates: best.result.coordinates,
    distanceMeters: best.result.distanceMeters,
    durationSeconds: best.result.durationSeconds,
    candidatesTried: candidates.length,
  };
}
