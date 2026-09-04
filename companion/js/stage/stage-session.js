/*
 * Sesión de etapa "EN CAMINO" — gestión de sesión + orquestación de GPS.
 *
 * Deliberadamente NO calcula nada que dependa de la geometría oficial
 * del Camino (sin GPX real todavía): nada de % completado, km oficiales
 * restantes, proyección sobre ruta, desviación ni ETA. Lo único que
 * calcula es la distancia GPS realmente recorrida por el peregrino
 * durante la sesión, sumando tramos entre posiciones consecutivas que
 * superan el filtro de js/stage/geo-filter.js.
 *
 * GPS: se suscribe al servicio compartido (map/gps-service.js), nunca
 * abre un watchPosition propio — así nunca hay dos watch nativos
 * simultáneos aunque el mapa también esté usando el GPS a la vez.
 *
 * Persistencia: el estado de la sesión se guarda en localStorage
 * (storage.js, KEYS.STAGE_SESSION) en cada actualización, acotado a
 * MAX_STORED_POINTS puntos, para poder recuperarla si se recarga la
 * página o se cierra y reabre la app mientras la etapa está en curso.
 * Se borra al finalizar. Nunca se envía a ningún servidor.
 */
import { subscribeToGps, getPermissionState } from '../map/gps-service.js';
import { evaluateGpsPoint } from './geo-filter.js';
import { appStore } from '../state/store.js';
import { getJSON, setJSON, remove, KEYS } from '../state/storage.js';

const MAX_STORED_POINTS = 3000;

let unsubscribeGps = null;

function idleSession() {
  return {
    status: 'idle',
    stageNumber: null,
    stageOrigin: null,
    stageDestination: null,
    startedAt: null,
    finishedAt: null,
    pausedAt: null,
    totalPausedMs: 0,
    distanceMeters: 0,
    points: [],
    lastFix: null,
    gpsStatus: 'idle',
  };
}

function setSession(partial) {
  appStore.setState((s) => ({
    stageSession: { ...s.stageSession, ...(typeof partial === 'function' ? partial(s.stageSession) : partial) },
  }));
  persist();
}

function persist() {
  const session = appStore.getState().stageSession;
  if (session.status === 'idle') {
    remove(KEYS.STAGE_SESSION);
  } else {
    setJSON(KEYS.STAGE_SESSION, session);
  }
}

/** Debe llamarse una vez al arrancar la app para recuperar una sesión en curso. */
export function hydrateStageSession() {
  const saved = getJSON(KEYS.STAGE_SESSION, null);
  if (!saved) return;
  appStore.setState({ stageSession: { ...idleSession(), ...saved } });
  if (saved.status === 'active' || saved.status === 'paused') {
    attachGps();
  }
}

function attachGps() {
  if (unsubscribeGps) return; // ya suscrito, no duplicar
  setSession({ gpsStatus: 'searching' });
  unsubscribeGps = subscribeToGps(handleFix, handleGpsError);
}

function detachGps() {
  unsubscribeGps?.();
  unsubscribeGps = null;
}

function handleFix(position) {
  const session = appStore.getState().stageSession;
  if (session.status !== 'active' && session.status !== 'paused') return;

  const lastAccepted = session.points[session.points.length - 1] || null;
  const result = session.status === 'active' ? evaluateGpsPoint(lastAccepted, position) : { accept: false, distanceMeters: 0 };

  const nextPoints = result.accept
    ? [...session.points, position].slice(-MAX_STORED_POINTS)
    : session.points;
  const nextDistance = result.accept ? session.distanceMeters + result.distanceMeters : session.distanceMeters;

  setSession({
    gpsStatus: 'active',
    lastFix: position,
    points: nextPoints,
    distanceMeters: nextDistance,
  });
}

function handleGpsError(err) {
  setSession({
    gpsStatus: err.code === 'denied' ? 'denied' : err.code === 'timeout' ? 'timeout' : 'unavailable',
  });
}

/**
 * Arranca una sesión nueva para la etapa indicada. Debe llamarse desde
 * un gesto directo del usuario (clic en "Empezar etapa"): es lo que
 * dispara el prompt nativo de permiso de ubicación si hiciera falta.
 */
export function startStage({ number, origin, destination }) {
  const current = appStore.getState().stageSession;
  if (current.status === 'active' || current.status === 'paused') return; // ya en marcha, no reiniciar

  setSession({
    ...idleSession(),
    status: 'active',
    stageNumber: number,
    stageOrigin: origin,
    stageDestination: destination,
    startedAt: Date.now(),
  });
  attachGps();
}

export function pauseStage() {
  const session = appStore.getState().stageSession;
  if (session.status !== 'active') return;
  setSession({ status: 'paused', pausedAt: Date.now() });
}

export function resumeStage() {
  const session = appStore.getState().stageSession;
  if (session.status !== 'paused') return;
  const pausedMs = Date.now() - (session.pausedAt || Date.now());
  setSession({ status: 'active', pausedAt: null, totalPausedMs: session.totalPausedMs + pausedMs });
}

export function finishStage() {
  const session = appStore.getState().stageSession;
  if (session.status !== 'active' && session.status !== 'paused') return;
  const extraPausedMs = session.status === 'paused' ? Date.now() - (session.pausedAt || Date.now()) : 0;
  detachGps();
  setSession({
    status: 'finished',
    finishedAt: Date.now(),
    pausedAt: null,
    totalPausedMs: session.totalPausedMs + extraPausedMs,
  });
}

/** Vuelve a idle. Se usa cuando la etapa "de hoy" ya no es la de la sesión finalizada. */
export function resetStageSession() {
  detachGps();
  setSession(idleSession());
}

/**
 * Tiempo transcurrido "real" de la etapa (excluye el tiempo en pausa),
 * en milisegundos. Función pura para que la UI la recalcule cada
 * segundo sin tocar el store.
 */
export function computeElapsedMs(session, now = Date.now()) {
  if (!session.startedAt) return 0;
  const end = session.finishedAt || now;
  const ongoingPauseMs = session.status === 'paused' && session.pausedAt ? now - session.pausedAt : 0;
  return Math.max(0, end - session.startedAt - session.totalPausedMs - ongoingPauseMs);
}

export { getPermissionState };
