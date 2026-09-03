/*
 * Punto único de configuración del proveedor de mapas.
 *
 * MapLibre GL JS es solo el motor de RENDERIZADO. Este archivo decide de
 * dónde vienen los tiles/el estilo vectorial, para poder cambiar de
 * proveedor sin tocar map-engine.js, las capas (layers/) ni ningún otro
 * módulo de la app (GPS, GPX, etapas, progreso, POIs, alojamiento, UI).
 *
 * ── Proveedor actual: OpenFreeMap (instancia pública, "dev-openfreemap") ──
 * Elegido para esta fase porque cumple la condición explícita de "desarrollo
 * local sin coste, sin API key, sin tarjeta, sin registro":
 *   - Sin API key, sin registro, sin cookies, sin límite de peticiones.
 *   - Todo servido desde un único dominio propio (tiles.openfreemap.org):
 *     tiles vectoriales + sprites + glyphs. Nada de terceros adicionales.
 *   - Uso comercial explícitamente permitido por el proveedor.
 *   - Infraestructura y estilos open-source (MIT); datos de OpenStreetMap
 *     (ODbL) vía esquema OpenMapTiles estándar.
 *   - SIN garantía de SLA/soporte (proyecto sostenido por donaciones) — por
 *     eso se marca "dev" y no se usa como proveedor de producción: hay que
 *     revisar esto antes de un lanzamiento real (ver MAP_PROVIDER abajo).
 *   - La atribución (OpenFreeMap / OpenMapTiles / OpenStreetMap) es
 *     obligatoria y MapLibre GL JS la añade automáticamente mientras el
 *     AttributionControl por defecto siga activo (no desactivarlo).
 *
 * Reglas:
 * - Nunca escribir aquí una API key real. Si el proveedor de producción la
 *   requiere, debe inyectarse en runtime (variable de entorno de build,
 *   endpoint propio que la sirva restringida por dominio, etc.), nunca
 *   como literal commiteado. MAP_API_KEY es `null` en este repositorio.
 * - Cambiar de proveedor = cambiar MAP_PROVIDER + MAP_STYLE_URL (+
 *   MAP_API_KEY si aplica) aquí. Ningún otro módulo debe conocer el
 *   proveedor concreto.
 */

// 'dev-openfreemap' (actual) | 'maptiler' | 'stadia' | 'mapbox' | ...
export const MAP_PROVIDER = 'dev-openfreemap';

// Estilo "Liberty" de OpenFreeMap: calles, carreteras, edificios, ríos,
// nombres de lugares y jerarquía vial completa a partir de datos OSM.
// https://openfreemap.org — sin API key.
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

// Este proveedor no requiere key. Se deja el campo listo para cuando la
// Fase de producción introduzca un proveedor que sí la necesite.
export const MAP_API_KEY = null;

export const MAP_DEFAULTS = {
  zoom: 15,
  minZoom: 5,
  // Los tiles vectoriales de OpenFreeMap llegan hasta z14; MapLibre
  // sobre-escala (overzoom) esos mismos datos en niveles superiores, que
  // es el comportamiento estándar de cualquier mapa vectorial urbano a
  // pie (calles/edificios se ven nítidos hasta z18-19 igualmente).
  maxZoom: 19,
  pitch: 0,
  // Irún — inicio del Camino del Norte. Coordenadas verificadas
  // (Wikipedia/Wikidata: es.wikipedia.org/wiki/Irún), no estimadas.
  center: { lat: 43.337806, lng: -1.788806 },
};

export function isMapProviderConfigured() {
  return Boolean(MAP_PROVIDER !== 'pending' && MAP_STYLE_URL);
}
