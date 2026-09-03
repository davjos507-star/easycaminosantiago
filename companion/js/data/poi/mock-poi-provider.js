/*
 * Proveedor por defecto en Fase 1: no consulta ningún servicio externo,
 * devuelve siempre una lista vacía. Sirve para que "Cerca de mí" tenga
 * un estado vacío correcto desde ya, sin acoplar la app a Overpass ni a
 * ningún otro proveedor real todavía (eso llega en la Fase 7).
 */
import { registerPoiProvider } from './poi-provider.js';

registerPoiProvider('mock', () => ({
  async searchNearby(_params) {
    return [];
  },
}));
