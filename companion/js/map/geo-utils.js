/*
 * Utilidades geodésicas ligeras, hechas a medida en vez de traer una
 * librería completa (justificado por la prioridad de rendimiento).
 * Suficientemente precisas para radios de precisión GPS a pie
 * (decenas de metros), no para uso topográfico.
 */

const EARTH_RADIUS_M = 6371000;

export function haversineDistanceMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Polígono aproximado (GeoJSON, [lng,lat]) de un círculo de `radiusMeters`
 * centrado en `center`. Usado para dibujar el círculo de precisión GPS
 * como capa del mapa (escala correctamente en metros al hacer zoom, a
 * diferencia de un marcador en píxeles).
 */
export function circlePolygonCoordinates(center, radiusMeters, points = 48) {
  const coords = [];
  const latRad = (center.lat * Math.PI) / 180;
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos(latRad);

  for (let i = 0; i <= points; i += 1) {
    const angle = (i / points) * 2 * Math.PI;
    const dLat = (radiusMeters * Math.sin(angle)) / metersPerDegreeLat;
    const dLng = (radiusMeters * Math.cos(angle)) / (metersPerDegreeLng || 1);
    coords.push([center.lng + dLng, center.lat + dLat]);
  }
  return coords;
}

export function circlePolygonFeature(center, radiusMeters) {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [circlePolygonCoordinates(center, radiusMeters)],
    },
  };
}
