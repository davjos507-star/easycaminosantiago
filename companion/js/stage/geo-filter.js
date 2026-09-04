/*
 * Reglas de aceptación de puntos GPS para la sesión de etapa. Puramente
 * funciones — sin estado, sin DOM, sin persistencia — para poder
 * razonar sobre ellas (y probarlas) de forma aislada.
 *
 * Objetivo: que la "distancia registrada" acumulada sea conservadora.
 * Ante la duda, se descarta el tramo en vez de sumarlo — nunca se
 * inventa ni se interpola un movimiento entre dos puntos descartados.
 */
import { haversineDistanceMeters } from '../map/geo-utils.js';

// Constantes documentadas para poder afinarlas sin tocar la lógica.
export const MAX_ACCEPTABLE_ACCURACY_M = 35; // peor precisión que esto, se descarta el punto
export const MIN_SEGMENT_DISTANCE_M = 3; // ruido de deriva GPS en reposo, por debajo de esto no se cuenta
export const MIN_SEGMENT_INTERVAL_MS = 2000; // no aceptar puntos demasiado seguidos entre sí
export const MAX_REALISTIC_SPEED_MPS = 3.5; // ≈12.6 km/h, generoso para caminar/trote — por encima, salto GPS

export function hasValidCoordinates(point) {
  return (
    Number.isFinite(point?.lat) &&
    Number.isFinite(point?.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180
  );
}

/**
 * Decide si un punto nuevo es aceptable respecto al último punto ya
 * aceptado en la sesión, y qué distancia sumaría si se acepta.
 *
 * @param {object|null} lastAccepted - último punto aceptado, o null si es el primero.
 * @param {object} candidate - { lat, lng, accuracy, timestamp }
 * @returns {{ accept: boolean, distanceMeters: number, reason: string|null }}
 */
export function evaluateGpsPoint(lastAccepted, candidate) {
  if (!hasValidCoordinates(candidate)) {
    return { accept: false, distanceMeters: 0, reason: 'invalid-coordinates' };
  }
  if (Number.isFinite(candidate.accuracy) && candidate.accuracy > MAX_ACCEPTABLE_ACCURACY_M) {
    return { accept: false, distanceMeters: 0, reason: 'low-accuracy' };
  }
  if (!lastAccepted) {
    return { accept: true, distanceMeters: 0, reason: null };
  }

  const dtMs = candidate.timestamp - lastAccepted.timestamp;
  if (!Number.isFinite(dtMs) || dtMs < MIN_SEGMENT_INTERVAL_MS) {
    return { accept: false, distanceMeters: 0, reason: 'too-soon' };
  }

  const distanceMeters = haversineDistanceMeters(lastAccepted, candidate);

  if (distanceMeters < MIN_SEGMENT_DISTANCE_M) {
    return { accept: false, distanceMeters: 0, reason: 'no-movement' };
  }

  const speedMps = distanceMeters / (dtMs / 1000);
  if (speedMps > MAX_REALISTIC_SPEED_MPS) {
    return { accept: false, distanceMeters: 0, reason: 'unrealistic-speed' };
  }

  return { accept: true, distanceMeters, reason: null };
}
