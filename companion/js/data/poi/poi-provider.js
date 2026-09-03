/*
 * Registro de proveedores de POIs ("Cerca de mí").
 *
 * La app nunca llama a un proveedor concreto directamente: siempre pasa
 * por getActivePoiProvider(). Esto permite que en Fase 7 se añada un
 * proveedor real (p. ej. Overpass API para desarrollo/arranque, o un
 * proveedor profesional de pago más adelante) sin acoplar el resto de la
 * app a esa elección ni reescribir poi-layer.js ni las pantallas.
 *
 * Contrato que debe cumplir cualquier proveedor registrado:
 *   async searchNearby({ lat, lng, radiusMeters, categories }) ->
 *     Array<{ id, name, category, lat, lng, distanceMeters }>
 *
 * Importante: ningún proveedor debe hacer scraping ni depender de
 * Nominatim para extracción masiva/sistemática de POIs.
 */

const registry = new Map();
let activeProviderName = 'mock';

export function registerPoiProvider(name, factory) {
  registry.set(name, factory);
}

export function setActivePoiProvider(name) {
  if (!registry.has(name)) throw new Error(`poi-provider: "${name}" no está registrado`);
  activeProviderName = name;
}

export function getActivePoiProvider() {
  const factory = registry.get(activeProviderName);
  if (!factory) throw new Error(`poi-provider: no hay proveedor activo válido ("${activeProviderName}")`);
  return factory();
}

export const POI_CATEGORIES = [
  'pharmacy',
  'health_center',
  'hospital',
  'supermarket',
  'restaurant',
  'cafe',
  'atm',
  'water',
  'train_station',
  'taxi',
  'post_office',
  'tourist_office',
];
