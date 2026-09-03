/*
 * Configuración general de la app (no confundir con js/map/config.js,
 * que es específico del proveedor de mapas).
 */

export const APP_NAME = 'Easy Camino Companion';
export const APP_VERSION = '0.1.0'; // Fase 1 — scaffolding

// Peregrino por defecto mientras solo existe uno cargado en el sistema.
// El mecanismo de resolución (ver data/pilgrim-resolver.js) es genérico:
// query param -> localStorage -> este valor. La interfaz nunca depende
// del nombre "osyris" directamente, solo este fallback de arranque.
export const DEFAULT_PILGRIM_ID = 'osyris';

// Distancia (metros) a partir de la cual se considera que el peregrino se
// ha desviado del Camino durante varios registros consecutivos.
// Ajustar aquí para afinar sensibilidad sin tocar la lógica de detección
// (ver map/route-projection.js, implementada en Fase 4).
export const OFF_ROUTE_THRESHOLD_METERS = 60;

// Nº de lecturas GPS consecutivas fuera de umbral antes de avisar,
// para evitar falsas alarmas por un salto puntual de precisión.
export const OFF_ROUTE_CONSECUTIVE_READINGS = 3;

export const GEOLOCATION_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 5000,
  timeout: 15000,
};

// Datos de contacto reales de Easy Camino Santiago (confirmados en
// easycaminosantiago.com — schema.org TravelAgency y botón flotante de
// WhatsApp del sitio principal). No es información sensible del cliente.
export const EASY_CAMINO_CONTACT = {
  phone: '+34982907629',
  whatsapp: '34982907629',
};

export const EMERGENCY_NUMBER = '112';
