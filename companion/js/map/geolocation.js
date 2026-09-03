/*
 * Utilidades de GPS.
 *
 * Ninguna función de este módulo persiste coordenadas: la posición vive
 * solo en memoria (appStore.gps.lastPosition) mientras la pestaña está
 * abierta, y no se transmite a ningún servidor. Ver gps-controller.js
 * para la orquestación (seguimiento, modo "seguir", detección de señal
 * perdida) y el punto de extensión documentado para una futura función
 * opt-in de "compartir ubicación con Easy Camino" (todavía sin implementar).
 */

import { GEOLOCATION_OPTIONS } from '../config.js';

export function isGeolocationSupported() {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

export async function getPermissionState() {
  if (typeof navigator === 'undefined' || !navigator.permissions) return 'unknown';
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state; // 'granted' | 'denied' | 'prompt'
  } catch (err) {
    return 'unknown';
  }
}

function mapPosition(pos) {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    heading: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
    speed: Number.isFinite(pos.coords.speed) ? pos.coords.speed : null,
    timestamp: pos.timestamp,
  };
}

function mapError(err) {
  // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
  const code = err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable';
  return { code, message: err.message };
}

/**
 * Llama al navigator.geolocation nativo (esto es lo que dispara el
 * prompt de permiso del navegador). Solo debe invocarse como reacción a
 * una acción explícita del usuario sobre nuestro propio aviso de
 * privacidad (ver ui/components/location-consent.js) o cuando el
 * permiso ya estaba concedido de antes.
 *
 * @returns {() => void} función para cancelar el seguimiento.
 */
export function watchPosition(onUpdate, onError) {
  if (!isGeolocationSupported()) {
    onError({ code: 'unsupported', message: 'Geolocation API no disponible' });
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (pos) => onUpdate(mapPosition(pos)),
    (err) => onError(mapError(err)),
    GEOLOCATION_OPTIONS
  );
  return () => navigator.geolocation.clearWatch(id);
}
