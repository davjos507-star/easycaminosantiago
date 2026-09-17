/*
 * Configuración general de la app (no confundir con js/map/config.js,
 * que es específico del proveedor de mapas).
 */

export const APP_NAME = 'Easy Camino Companion';
export const APP_VERSION = '0.1.0'; // Fase 1 — scaffolding

export const DEFAULT_PILGRIM_ID = 'osyris';

export const OFF_ROUTE_THRESHOLD_METERS = 60;
export const OFF_ROUTE_CONSECUTIVE_READINGS = 3;

export const GEOLOCATION_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 5000,
  timeout: 15000,
};

// Datos de contacto de Easy Camino Santiago mostrados en el botón AYUDA.
export const EASY_CAMINO_CONTACT = {
  phone: '+34625875316',
  whatsapp: '34982907629',
};

export const EMERGENCY_NUMBER = '112';
