/*
 * Proyección de la posición GPS sobre la geometría de una ruta.
 *
 * Geodesia ligera hecha a medida (igual criterio que geo-utils.js):
 * proyección punto-segmento sobre un plano tangente local en metros
 * (aproximación equirrectangular), suficiente para distancias a pie de
 * pocos kilómetros — no para uso topográfico. Se evita Turf.js completo
 * por tamaño de bundle, igual que en el resto del proyecto.
 *
 * Usado hoy por accommodation-nav.js (navegación peatonal "Llévame al
 * alojamiento", sobre la ruta calculada por el motor de routing) y
 * preparado para reutilizarse cuando exista GPX oficial del Camino
 * (progreso de etapa, distancia oficial restante, desviación de ruta).
 *
 * Nunca debe calcularse la distancia restante en línea recta al destino:
 * siempre debe ser distancia acumulada a lo largo de la geometría real.
 */
import { haversineDistanceMeters } from './geo-utils.js';

const METERS_PER_DEGREE_LAT = 111320;

function toLocalXY(origin, point) {
  const latRad = (origin.lat * Math.PI) / 180;
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos(latRad);
  return {
    x: (point.lng - origin.lng) * metersPerDegreeLng,
    y: (point.lat - origin.lat) * METERS_PER_DEGREE_LAT,
  };
}

function fromLocalXY(origin, xy) {
  const latRad = (origin.lat * Math.PI) / 180;
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos(latRad);
  return {
    lat: origin.lat + xy.y / METERS_PER_DEGREE_LAT,
    lng: origin.lng + xy.x / (metersPerDegreeLng || 1),
  };
}

/** Proyecta `point` sobre el segmento [a,b], acotado a los extremos. */
function projectPointOnSegment(point, a, b) {
  const p = toLocalXY(a, point);
  const ab = toLocalXY(a, b);
  const abLenSq = ab.x ** 2 + ab.y ** 2;
  let t = abLenSq === 0 ? 0 : (p.x * ab.x + p.y * ab.y) / abLenSq;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: ab.x * t, y: ab.y * t };
  const nearestPoint = fromLocalXY(a, proj);
  const distanceToPointMeters = Math.sqrt((p.x - proj.x) ** 2 + (p.y - proj.y) ** 2);
  return { nearestPoint, t, distanceToPointMeters };
}

/**
 * @param {{lat:number,lng:number}} point
 * @param {Array<[number,number]>} lineCoordinates  [lng,lat] (formato GeoJSON)
 * @returns {{ distanceAlongMeters:number, totalMeters:number, percentage:number, nearestPoint:{lat:number,lng:number}, offsetMeters:number } | null}
 */
export function projectPointOnLine(point, lineCoordinates) {
  if (!Array.isArray(lineCoordinates) || lineCoordinates.length < 2) return null;

  let totalMeters = 0;
  const segments = [];
  for (let i = 0; i < lineCoordinates.length - 1; i += 1) {
    const a = { lat: lineCoordinates[i][1], lng: lineCoordinates[i][0] };
    const b = { lat: lineCoordinates[i + 1][1], lng: lineCoordinates[i + 1][0] };
    const lengthMeters = haversineDistanceMeters(a, b);
    segments.push({ a, b, lengthMeters });
    totalMeters += lengthMeters;
  }

  let best = null;
  let runningDistance = 0;
  for (const segment of segments) {
    const proj = projectPointOnSegment(point, segment.a, segment.b);
    const distanceAlongMeters = runningDistance + segment.lengthMeters * proj.t;
    if (!best || proj.distanceToPointMeters < best.offsetMeters) {
      best = {
        nearestPoint: proj.nearestPoint,
        distanceAlongMeters,
        offsetMeters: proj.distanceToPointMeters,
      };
    }
    runningDistance += segment.lengthMeters;
  }

  if (!best) return null;
  return {
    distanceAlongMeters: best.distanceAlongMeters,
    totalMeters,
    percentage: totalMeters > 0 ? (best.distanceAlongMeters / totalMeters) * 100 : 0,
    nearestPoint: best.nearestPoint,
    offsetMeters: best.offsetMeters,
  };
}

export function isOffRoute(projection, thresholdMeters) {
  if (!projection) return false;
  return projection.offsetMeters > thresholdMeters;
}
