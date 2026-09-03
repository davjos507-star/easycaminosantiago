/*
 * Proyección de la posición GPS sobre la geometría de la ruta.
 *
 * Fase 1: solo la interfaz. La implementación real (Fase 4) usará
 * geodesia ligera hecha a medida (haversine + proyección punto-segmento)
 * en lugar de una librería como Turf.js completa, para mantener el bundle
 * pequeño — justificado por la prioridad de rendimiento en cobertura móvil
 * mala. Si más adelante se necesitan operaciones geoespaciales más
 * avanzadas, se puede introducir Turf de forma modular sin romper este
 * contrato.
 *
 * Nunca debe calcularse la distancia restante en línea recta al destino:
 * siempre debe ser distancia acumulada a lo largo de la geometría real.
 */

/**
 * @param {{lat:number,lng:number}} _point
 * @param {Array<[number,number]>} _lineCoordinates  [lng,lat] (formato GeoJSON)
 * @returns {{ distanceAlongMeters:number, totalMeters:number, percentage:number, nearestPoint:{lat:number,lng:number} } | null}
 */
export function projectPointOnLine(_point, _lineCoordinates) {
  console.info('[route-projection] projectPointOnLine: se implementa en la Fase 4');
  return null;
}

export function isOffRoute(_projection, _thresholdMeters) {
  return false; // Fase 4
}
