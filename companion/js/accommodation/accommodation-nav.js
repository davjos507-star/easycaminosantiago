/*
 * "IR AL ALOJAMIENTO" — navegación peatonal hasta el alojamiento, dentro
 * de Companion. Módulo independiente de la sesión de etapa "EN CAMINO"
 * (ver js/stage/stage-session.js): distinto estado, distinta
 * persistencia (esta NO se persiste — vive solo en memoria mientras dura
 * la navegación), distintos botones. Lo único que comparten es el
 * servicio GPS (map/gps-service.js), nunca un watchPosition propio.
 *
 * Responsabilidad de este módulo: estado + orquestación (GPS, routing,
 * desviación, recálculo, llegada). No toca el DOM ni MapLibre — eso vive
 * en ui/screens/map-screen.js y map/layers/*, igual que gps-controller.js
 * no dibuja nada por sí mismo salvo llamar a la capa correspondiente.
 */
import { subscribeToGps } from '../map/gps-service.js';
import { haversineDistanceMeters } from '../map/geo-utils.js';
import { projectPointOnLine } from '../map/route-projection.js';
import { fetchWalkingRoute } from './routing-service.js';
import { appStore } from '../state/store.js';

// --- Umbrales documentados (ajustables aquí sin tocar la lógica) ---

// Metros de separación perpendicular a la ruta calculada a partir de los
// cuales una lectura GPS se considera "desviada". Por encima de la
// precisión típica a pie en zona rural/urbana (5-30 m) para no disparar
// por ruido del GPS, pero lo bastante ajustado para detectar un giro real.
export const OFF_ROUTE_REROUTE_THRESHOLD_METERS = 40;

// Nº de lecturas consecutivas fuera de umbral antes de recalcular, para
// no reaccionar a un único salto puntual de precisión.
export const RECALC_MIN_CONSECUTIVE_OFFROUTE = 2;

// Tiempo mínimo entre dos llamadas al motor de routing, para no
// bombardear la API mientras el peregrino sigue desviado (a paso
// tranquilo, ~1.4 m/s, 20s equivalen a ~28 m — recálculo suficientemente
// ágil sin machacar el servicio).
export const RECALC_COOLDOWN_MS = 20000;

// Radio de llegada: distancia directa al alojamiento por debajo de la
// cual se considera "llegada", siempre que la precisión del GPS en ese
// momento sea razonable (ver ARRIVAL_MAX_ACCURACY_M) — nunca se declara
// llegada con una lectura claramente imprecisa.
export const ARRIVAL_RADIUS_METERS = 40;
export const ARRIVAL_MAX_ACCURACY_M = 60;

let unsubscribeGps = null;
let fetchInFlight = false;

function idleNav() {
  return {
    status: 'idle', // 'idle' | 'active' | 'arrived'
    accommodation: null, // { name, lat, lng }
    routeStatus: 'idle', // 'idle' | 'loading' | 'ok' | 'failed'
    routeCoordinates: null, // [[lng,lat], ...] tal cual lo devuelve el motor de routing
    routeDistanceMeters: null,
    routeDurationSeconds: null,
    remainingMeters: null, // a lo largo de la ruta, nunca en línea recta
    offRouteMeters: null,
    consecutiveOffRoute: 0,
    lastFix: null,
    gpsStatus: 'idle',
    lastRouteFetchAt: null,
  };
}

function setNav(partial) {
  appStore.setState((s) => ({
    accommodationNav: { ...s.accommodationNav, ...(typeof partial === 'function' ? partial(s.accommodationNav) : partial) },
  }));
}

function attachGps() {
  if (unsubscribeGps) return;
  unsubscribeGps = subscribeToGps(handleFix, handleGpsError);
}

function detachGps() {
  unsubscribeGps?.();
  unsubscribeGps = null;
}

async function fetchRoute(from, accommodation) {
  if (fetchInFlight) return; // protección contra llamadas simultáneas
  fetchInFlight = true;
  setNav({ routeStatus: 'loading', lastRouteFetchAt: Date.now() });
  try {
    const result = await fetchWalkingRoute({ from: { lat: from.lat, lng: from.lng }, to: { lat: accommodation.lat, lng: accommodation.lng } });
    // La navegación pudo cerrarse mientras la petición estaba en curso.
    if (appStore.getState().accommodationNav.status === 'idle') return;
    setNav({
      routeStatus: 'ok',
      routeCoordinates: result.coordinates,
      routeDistanceMeters: result.distanceMeters,
      routeDurationSeconds: result.durationSeconds,
      consecutiveOffRoute: 0,
    });
  } catch (err) {
    console.warn('[accommodation-nav] routing falló:', err.message);
    if (appStore.getState().accommodationNav.status !== 'idle') {
      setNav({ routeStatus: 'failed' });
    }
  } finally {
    fetchInFlight = false;
  }
}

function maybeRecalculate(position, nav) {
  if (fetchInFlight) return;
  const now = Date.now();
  if (nav.lastRouteFetchAt && now - nav.lastRouteFetchAt < RECALC_COOLDOWN_MS) return;
  fetchRoute(position, nav.accommodation);
}

function handleFix(position) {
  const nav = appStore.getState().accommodationNav;
  if (nav.status !== 'active') return; // navegación cerrada o ya llegada: ignorar fixes sueltos

  const projection = nav.routeCoordinates ? projectPointOnLine(position, nav.routeCoordinates) : null;
  const directDistanceMeters = haversineDistanceMeters(position, nav.accommodation);

  let consecutiveOffRoute = nav.consecutiveOffRoute;
  if (projection) {
    consecutiveOffRoute = projection.offsetMeters > OFF_ROUTE_REROUTE_THRESHOLD_METERS ? consecutiveOffRoute + 1 : 0;
  }

  const hasGoodFix = !Number.isFinite(position.accuracy) || position.accuracy <= ARRIVAL_MAX_ACCURACY_M;
  const arrived = directDistanceMeters <= ARRIVAL_RADIUS_METERS && hasGoodFix;

  setNav({
    gpsStatus: 'active',
    lastFix: position,
    remainingMeters: projection ? Math.max(0, projection.totalMeters - projection.distanceAlongMeters) : null,
    offRouteMeters: projection ? projection.offsetMeters : null,
    consecutiveOffRoute,
    status: arrived ? 'arrived' : 'active',
  });

  if (arrived) {
    detachGps();
    return;
  }

  if (!nav.routeCoordinates && nav.routeStatus !== 'loading') {
    fetchRoute(position, nav.accommodation);
  } else if (projection && consecutiveOffRoute >= RECALC_MIN_CONSECUTIVE_OFFROUTE) {
    maybeRecalculate(position, nav);
  }
}

function handleGpsError(err) {
  if (appStore.getState().accommodationNav.status === 'idle') return;
  setNav({
    gpsStatus: err.code === 'denied' ? 'denied' : err.code === 'timeout' ? 'timeout' : 'unavailable',
  });
}

/**
 * Arranca (o reinicia, si el destino cambia) la navegación peatonal hacia
 * `accommodation`. Debe llamarse desde un gesto directo del usuario
 * ("Llévame al alojamiento"): dispara el prompt nativo de ubicación si
 * hiciera falta, igual que startStage() en EN CAMINO.
 */
export function startAccommodationNav(accommodation) {
  const current = appStore.getState().accommodationNav;
  if (
    current.status !== 'idle' &&
    current.accommodation?.lat === accommodation.lat &&
    current.accommodation?.lng === accommodation.lng
  ) {
    return; // ya navegando hacia el mismo destino, no reiniciar
  }
  detachGps();
  setNav({ ...idleNav(), status: 'active', accommodation, gpsStatus: 'searching' });
  attachGps();
}

/** Cierra la navegación (botón "Terminar"/"Cerrar", o tras la llegada). */
export function stopAccommodationNav() {
  detachGps();
  setNav(idleNav());
}

export function getAccommodationNavState() {
  return appStore.getState().accommodationNav;
}
