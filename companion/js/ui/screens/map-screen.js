import { t, getLocale } from '../../utils/i18n.js';
import { formatKm, formatPending, formatTime, formatDistanceMeters, isStageActiveOn } from '../../utils/formatters.js';
import { initBottomSheet } from '../components/bottom-sheet.js';
import { renderLocationConsentCard } from '../components/location-consent.js';
import { createMapEngine } from '../../map/map-engine.js';
import { createUserLocationLayer } from '../../map/layers/user-location-layer.js';
import { createRouteLayer } from '../../map/layers/route-layer.js';
import { createStageLayer } from '../../map/layers/stage-layer.js';
import { createAccommodationLayer } from '../../map/layers/accommodation-layer.js';
import { createNavRouteLayer } from '../../map/layers/nav-route-layer.js';
import { createPoiLayer } from '../../map/layers/poi-layer.js';
import {
  initGpsController,
  refreshPermissionState,
  requestAndStartWatch,
  setFollowMode,
  isFollowMode,
} from '../../map/gps-controller.js';
import { startAccommodationNav, stopAccommodationNav } from '../../accommodation/accommodation-nav.js';
import { appStore } from '../../state/store.js';
import { setDebugMapEngine } from '../components/debug-panel.js';

let sheet = null;
let mapEngine = null;
let userLocationLayer = null;
let accommodationLayer = null;
let navRouteLayer = null;
let mountPromise = null;
let consentDismissed = false;
let viewingAccommodation = null; // { name, lat, lng } — "Ver en mapa" sin navegación activa
let lastDrawnRouteCoords = null;

export function initMapScreen() {
  sheet = initBottomSheet('today-sheet');
}

function setCenterButtonActive(active) {
  const btn = document.getElementById('center-me-btn');
  btn?.classList.toggle('cc-icon-btn--active', active);
}

function renderOverlay() {
  const overlay = document.getElementById('map-overlay-top');
  if (!overlay) return;
  const { gps } = appStore.getState();

  // El watch de GPS todavía no se ha pedido: mostramos nuestro aviso de
  // privacidad propio ANTES de tocar la API nativa del navegador.
  const watchNotStarted = gps.status === 'idle';

  if (watchNotStarted) {
    if (gps.permission === 'denied') {
      overlay.innerHTML = renderGpsChip({ status: 'denied' });
      return;
    }
    if (consentDismissed) {
      overlay.innerHTML = '';
      return;
    }
    overlay.innerHTML = renderLocationConsentCard();
    document.getElementById('location-consent-enable')?.addEventListener('click', () => {
      requestAndStartWatch();
      setFollowMode(true);
    });
    document.getElementById('location-consent-dismiss')?.addEventListener('click', () => {
      consentDismissed = true;
      overlay.innerHTML = '';
    });
    return;
  }

  overlay.innerHTML = renderGpsChip(gps);
}

function renderGpsChip(gps) {
  const locale = getLocale();
  let label = '';
  switch (gps.status) {
    case 'searching':
      label = t('gps.searching');
      break;
    case 'active': {
      const acc = gps.lastPosition?.accuracy;
      const time = gps.lastPosition ? formatTime(new Date(gps.lastPosition.timestamp), locale) : '';
      label = `${t('gps.accuracy', { m: Math.round(acc || 0) })} · ${t('gps.updated', { time })}`;
      break;
    }
    case 'stale':
      label = t('gps.stale');
      break;
    case 'denied':
      label = t('gps.denied_title');
      break;
    case 'timeout':
      label = t('gps.timeout');
      break;
    case 'unavailable':
    default:
      label = t('gps.unavailable');
  }
  return `<div class="cc-gps-chip cc-gps-chip--${gps.status}"><span class="cc-gps-chip-dot"></span>${label}</div>`;
}

async function ensureMapMounted() {
  if (mountPromise) return mountPromise;
  mountPromise = mountMap();
  return mountPromise;
}

async function mountMap() {
  const canvas = document.getElementById('map-canvas');
  const overlayEl = document.getElementById('map-overlay-top');
  // No escribimos dentro de #map-canvas: MapLibre gestiona ese contenedor
  // por completo en cuanto se instancia (limpia su contenido). El aviso
  // de carga vive en el overlay, que sí controlamos nosotros.
  if (overlayEl) {
    overlayEl.innerHTML = `<div class="cc-gps-chip"><span class="cc-gps-chip-dot"></span>${t('state.loading')}</div>`;
  }

  mapEngine = createMapEngine({ container: canvas });
  setDebugMapEngine(mapEngine);
  userLocationLayer = createUserLocationLayer(mapEngine);
  accommodationLayer = createAccommodationLayer(mapEngine);
  navRouteLayer = createNavRouteLayer(mapEngine);
  // Instanciadas para dejar la composición de capas completa y lista
  // (CAMINO ROUTE / STAGES / POIs); su implementación real llega en fases
  // posteriores, cuando haya datos que pintar.
  createRouteLayer(mapEngine);
  createStageLayer(mapEngine);
  createPoiLayer(mapEngine);

  initGpsController({ mapEngine, userLocationLayer });

  mapEngine.on('error', () => {
    const overlay = document.getElementById('map-overlay-top');
    if (overlay && !overlay.querySelector('.cc-location-consent')) {
      const chip = document.createElement('div');
      chip.className = 'cc-gps-chip cc-gps-chip--unavailable';
      chip.innerHTML = `<span class="cc-gps-chip-dot"></span>${t('map.error_loading')}`;
      overlay.appendChild(chip);
    }
  });

  await mapEngine.mount();

  const centerBtn = document.getElementById('center-me-btn');
  centerBtn?.removeAttribute('disabled');
  centerBtn?.removeAttribute('title');
  centerBtn?.addEventListener('click', async () => {
    const state = appStore.getState();
    if (state.gps.status === 'idle') {
      // Un toque deliberado en "centrar" vuelve a pedir el permiso aunque
      // el peregrino hubiera cerrado el aviso de privacidad antes.
      consentDismissed = false;
      renderOverlay();
      return;
    }
    if (state.gps.status === 'denied') return;
    const next = !isFollowMode();
    setFollowMode(next);
    setCenterButtonActive(next);
  });

  appStore.subscribe((state) => {
    setCenterButtonActive(state.followMode);
    renderOverlay();

    const nav = state.accommodationNav;
    if (nav.status !== 'idle') {
      if (nav.routeCoordinates && nav.routeCoordinates !== lastDrawnRouteCoords) {
        navRouteLayer.setRoute(nav.routeCoordinates);
        lastDrawnRouteCoords = nav.routeCoordinates;
      }
      renderMapSheet(state);
    }
  });

  const permission = await refreshPermissionState();
  if (permission === 'granted') {
    requestAndStartWatch();
    setFollowMode(true);
  } else {
    renderOverlay();
  }
}

export async function onMapScreenShown() {
  await ensureMapMounted();
  mapEngine?.resize();
}

/**
 * "Ver en mapa": centra el mapa en el alojamiento y muestra su marcador,
 * sin activar seguimiento GPS continuo. No interrumpe una navegación
 * "Llévame al alojamiento" que ya estuviera en curso.
 */
export async function focusAccommodationOnMap(accommodation) {
  await ensureMapMounted();
  if (appStore.getState().accommodationNav.status !== 'idle') return;
  viewingAccommodation = accommodation;
  accommodationLayer.setAccommodation(accommodation);
  mapEngine.setCenter({ lat: accommodation.lat, lng: accommodation.lng }, { animate: true, zoom: 16 });
  renderMapSheet(appStore.getState());
}

function clearAccommodationView() {
  viewingAccommodation = null;
  accommodationLayer?.clear();
  renderMapSheet(appStore.getState());
}

/**
 * "Llévame al alojamiento": arranca la navegación peatonal dentro de
 * Companion (ver accommodation-nav.js). Reutiliza el mismo servicio GPS
 * compartido que ya usa el punto azul del mapa y EN CAMINO — por eso
 * también nos aseguramos aquí de que el watch de gps-controller.js esté
 * activo, para que la posición actual se vea en el mapa durante la
 * navegación (sin forzar el modo "seguir": el peregrino puede mover el
 * mapa libremente y usar "RECENTRAR" cuando quiera).
 */
export async function startAccommodationNavigation(accommodation) {
  await ensureMapMounted();
  viewingAccommodation = null;
  lastDrawnRouteCoords = null;
  accommodationLayer.setAccommodation(accommodation);
  mapEngine.setCenter({ lat: accommodation.lat, lng: accommodation.lng }, { animate: true, zoom: 16 });
  requestAndStartWatch();
  startAccommodationNav(accommodation);
  renderMapSheet(appStore.getState());
}

/** Botón "Terminar"/"Cerrar": no toca EN CAMINO ni ningún otro estado. */
export function stopAccommodationNavigation() {
  stopAccommodationNav();
  navRouteLayer?.clear();
  accommodationLayer?.clear();
  lastDrawnRouteCoords = null;
  viewingAccommodation = null;
  renderMapSheet(appStore.getState());
}

function renderNavGpsLine(nav) {
  return renderGpsChip({ status: nav.gpsStatus, lastPosition: nav.lastFix });
}

function renderNavigatingSheet(nav) {
  const arrived = nav.status === 'arrived';

  sheet.setSummary(`
    <div class="cc-eyebrow">${t('nav.title')}</div>
    <strong>${nav.accommodation?.name || ''}</strong>
  `);

  if (arrived) {
    sheet.setBody(`
      <p style="font-weight:700; margin:0 0 12px">${t('nav.arrived', { name: nav.accommodation?.name || '' })}</p>
      <button type="button" class="cc-btn cc-btn--secondary" id="nav-close-btn">${t('nav.close')}</button>
    `);
  } else {
    const distanceLine =
      nav.remainingMeters != null
        ? formatDistanceMeters(nav.remainingMeters, getLocale())
        : nav.routeStatus === 'loading'
        ? t('nav.route_loading')
        : nav.routeStatus === 'failed'
        ? '—'
        : t('state.loading');

    sheet.setBody(`
      ${nav.routeStatus === 'failed' ? `<p class="cc-pending" style="margin:0 0 10px">${t('nav.route_failed')}</p>` : ''}
      <div style="display:flex; flex-wrap:wrap; justify-content:space-between; gap:2px 12px; margin-bottom:6px;">
        <span style="color:var(--cc-text-muted)">${t('nav.distance_remaining')}</span>
        <strong style="text-align:right;">${distanceLine}</strong>
      </div>
      <div style="margin-bottom:12px;">${renderNavGpsLine(nav)}</div>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        <button type="button" class="cc-btn cc-btn--secondary" id="nav-recenter-btn" style="flex:1 1 120px;">${t('nav.recenter')}</button>
        <button type="button" class="cc-btn cc-btn--primary" id="nav-close-btn" style="flex:1 1 120px;">${t('nav.finish')}</button>
      </div>
    `);
  }

  sheet.expand();

  document.getElementById('nav-recenter-btn')?.addEventListener('click', () => {
    const fix = appStore.getState().accommodationNav.lastFix;
    if (fix) mapEngine.setCenter({ lat: fix.lat, lng: fix.lng }, { animate: true, zoom: 17 });
  });
  document.getElementById('nav-close-btn')?.addEventListener('click', () => {
    stopAccommodationNavigation();
  });
}

function renderViewingSheet(accommodation) {
  sheet.setSummary(`
    <div class="cc-eyebrow">${t('stays.view_on_map')}</div>
    <strong>${accommodation.name}</strong>
  `);
  sheet.setBody(`
    <button type="button" class="cc-btn cc-btn--secondary" id="map-back-to-today-btn">${t('map.back_to_today')}</button>
  `);
  sheet.expand();
  document.getElementById('map-back-to-today-btn')?.addEventListener('click', () => {
    clearAccommodationView();
  });
}

function renderDefaultSheet({ pilgrim, stages }) {
  if (!sheet) return;
  const locale = getLocale();

  if (!stages || stages.length === 0) {
    sheet.setSummary(`<p class="cc-pending" style="margin:0">${t('camino.empty')}</p>`);
    sheet.setBody('');
    return;
  }

  const idx = stages.findIndex((s) => isStageActiveOn(s));
  const stage = stages[idx === -1 ? 0 : idx];
  const accommodation = stage.accommodation || {};

  sheet.setSummary(`
    <div class="cc-eyebrow">${t('today.todays_stage')}</div>
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <strong class="${stage.origin ? '' : 'cc-pending'}">${stage.origin || formatPending(locale)} → ${stage.destination || formatPending(locale)}</strong>
      <span class="cc-badge">${formatKm(stage.km, locale)}</span>
    </div>
  `);

  sheet.setBody(`
    <div class="cc-card">
      <div class="cc-eyebrow">${t('today.accommodation_tonight')}</div>
      <div style="font-weight:700" class="${accommodation.name ? '' : 'cc-pending'}">${accommodation.name || formatPending(locale)}</div>
    </div>
    <div class="cc-card">
      <div class="cc-eyebrow">${t('today.next_point')}</div>
      <p class="cc-pending" style="margin:4px 0 0">${formatPending(locale)}</p>
    </div>
  `);

  void pilgrim;
}

export function renderMapSheet(state) {
  if (!sheet) return;
  const nav = appStore.getState().accommodationNav;
  if (nav.status === 'active' || nav.status === 'arrived') {
    renderNavigatingSheet(nav);
    return;
  }
  if (viewingAccommodation) {
    renderViewingSheet(viewingAccommodation);
    return;
  }
  renderDefaultSheet(state || {});
}
