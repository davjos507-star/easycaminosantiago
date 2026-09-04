/*
 * Único punto de entrada al GPS real del dispositivo para toda la app.
 *
 * Antes, el punto azul del mapa (gps-controller.js) llamaba directamente
 * a geolocation.js#watchPosition(). Con la sesión de etapa (ver
 * js/stage/stage-session.js) necesitando también el GPS en vivo,
 * cualquier módulo que llamara a watchPosition() por su cuenta
 * duplicaría un segundo watch nativo del navegador en paralelo — más
 * batería, más peticiones al hardware GPS, sin ningún beneficio.
 *
 * Este módulo mantiene UN ÚNICO navigator.geolocation.watchPosition()
 * activo (o ninguno) y lo reparte a todos los suscriptores mediante un
 * recuento de referencias: se arranca con el primer suscriptor, se
 * detiene cuando se da de baja el último. gps-controller.js y
 * stage-session.js son ambos consumidores de este módulo, nunca llaman
 * a geolocation.js directamente.
 */
import { isGeolocationSupported, getPermissionState, watchPosition } from './geolocation.js';

export { isGeolocationSupported, getPermissionState };

let stopNativeWatch = null;
const updateSubscribers = new Set();
const errorSubscribers = new Set();

function handleUpdate(position) {
  updateSubscribers.forEach((fn) => fn(position));
}

function handleError(err) {
  errorSubscribers.forEach((fn) => fn(err));
}

function ensureWatching() {
  if (stopNativeWatch) return;
  stopNativeWatch = watchPosition(handleUpdate, handleError);
}

function stopIfUnused() {
  if (updateSubscribers.size === 0 && stopNativeWatch) {
    stopNativeWatch();
    stopNativeWatch = null;
  }
}

/**
 * @returns {() => void} función para darse de baja.
 */
export function subscribeToGps(onUpdate, onError) {
  updateSubscribers.add(onUpdate);
  if (onError) errorSubscribers.add(onError);
  ensureWatching();
  return () => {
    updateSubscribers.delete(onUpdate);
    if (onError) errorSubscribers.delete(onError);
    stopIfUnused();
  };
}

/** Solo para el panel de diagnóstico (?debug=1) y pruebas. */
export function isGpsWatchActive() {
  return stopNativeWatch !== null;
}

export function activeGpsSubscriberCount() {
  return updateSubscribers.size;
}
