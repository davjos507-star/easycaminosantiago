/*
 * Orquesta GPS + orientación + capa de posición + modo "seguir" +
 * detección de señal perdida. Ni este módulo ni geolocation.js
 * persisten coordenadas ni las envían a ningún servidor: viven solo en
 * appStore.gps mientras la pestaña está abierta.
 *
 * Punto de extensión para el futuro (NO implementado todavía, ver
 * instrucciones del proyecto): una función opt-in "Share my location
 * with Easy Camino Santiago" se conectaría aquí, dentro del callback de
 * `onFix`, llamando a un servicio de envío solo si el peregrino lo ha
 * activado explícitamente (nunca por defecto). Hoy ese servicio no
 * existe y no se invoca nada.
 */
import { isGeolocationSupported, getPermissionState, watchPosition } from './geolocation.js';
import { requestOrientationPermission, watchHeading } from './orientation.js';
import { appStore } from '../state/store.js';

const STALE_AFTER_MS = 12000; // sin lectura nueva en 12s -> señal débil/perdida temporalmente

let stopWatch = null;
let stopHeadingWatch = null;
let staleTimer = null;
let followMode = false;
let mapEngineRef = null;
let userLocationLayerRef = null;
let lastHeading = null;

function setGpsState(partial) {
  appStore.setState((s) => ({ gps: { ...s.gps, ...partial } }));
}

export function initGpsController({ mapEngine, userLocationLayer }) {
  mapEngineRef = mapEngine;
  userLocationLayerRef = userLocationLayer;
  setGpsState({ supported: isGeolocationSupported() });

  mapEngine.on('user-drag', () => {
    if (followMode) setFollowMode(false);
  });
}

export async function refreshPermissionState() {
  const permission = await getPermissionState();
  setGpsState({ permission });
  return permission;
}

function armStaleTimer() {
  clearTimeout(staleTimer);
  staleTimer = setTimeout(() => {
    const current = appStore.getState().gps.status;
    if (current === 'active') setGpsState({ status: 'stale' });
  }, STALE_AFTER_MS);
}

function handleFix(position) {
  armStaleTimer();
  setGpsState({ status: 'active', permission: 'granted', lastPosition: { ...position, heading: position.heading ?? lastHeading } });
  userLocationLayerRef?.setPosition({ ...position, heading: position.heading ?? lastHeading });
  if (followMode) mapEngineRef?.setCenter({ lat: position.lat, lng: position.lng }, { animate: true });
}

function handleGeoError(err) {
  setGpsState({
    status: err.code === 'denied' ? 'denied' : err.code === 'timeout' ? 'timeout' : 'unavailable',
    permission: err.code === 'denied' ? 'denied' : appStore.getState().gps.permission,
  });
}

/**
 * Dispara el prompt nativo del navegador (y, si procede, el de
 * orientación). Debe llamarse solo tras el consentimiento explícito del
 * peregrino sobre nuestro propio aviso de privacidad.
 */
export function requestAndStartWatch() {
  if (stopWatch) return;

  // Debe iniciarse dentro del mismo gesto de usuario que el GPS para
  // funcionar en iOS; si no está disponible o se rechaza, no bloquea nada.
  requestOrientationPermission().then((granted) => {
    if (!granted) return;
    stopHeadingWatch = watchHeading((heading) => {
      lastHeading = heading;
      const pos = appStore.getState().gps.lastPosition;
      if (pos) userLocationLayerRef?.setPosition({ ...pos, heading });
    });
  });

  setGpsState({ status: 'searching' });
  stopWatch = watchPosition(handleFix, handleGeoError);
}

export function stopWatchPosition() {
  stopWatch?.();
  stopWatch = null;
  stopHeadingWatch?.();
  stopHeadingWatch = null;
  clearTimeout(staleTimer);
  followMode = false;
}

export function setFollowMode(enabled) {
  followMode = enabled;
  appStore.setState({ followMode: enabled });
  const pos = appStore.getState().gps.lastPosition;
  if (enabled && pos) mapEngineRef?.setCenter({ lat: pos.lat, lng: pos.lng }, { animate: true, zoom: 17 });
}

export function isFollowMode() {
  return followMode;
}
