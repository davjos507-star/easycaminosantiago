import { t, getLocale } from '../../utils/i18n.js';
import { formatKm, formatPending, formatTime, isSameLocalDate } from '../../utils/formatters.js';
import { initBottomSheet } from '../components/bottom-sheet.js';
import { renderLocationConsentCard } from '../components/location-consent.js';
import { createMapEngine } from '../../map/map-engine.js';
import { createUserLocationLayer } from '../../map/layers/user-location-layer.js';
import { createRouteLayer } from '../../map/layers/route-layer.js';
import { createStageLayer } from '../../map/layers/stage-layer.js';
import { createAccommodationLayer } from '../../map/layers/accommodation-layer.js';
import { createPoiLayer } from '../../map/layers/poi-layer.js';
import {
  initGpsController,
  refreshPermissionState,
  requestAndStartWatch,
  setFollowMode,
  isFollowMode,
} from '../../map/gps-controller.js';
import { appStore } from '../../state/store.js';
import { setDebugMapEngine } from '../components/debug-panel.js';

let sheet = null;
let mapEngine = null;
let userLocationLayer = null;
let mountStarted = false;
let consentDismissed = false;

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
  if (mountStarted) return;
  mountStarted = true;

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
  // Instanciadas para dejar la composición de capas completa y lista
  // (CAMINO ROUTE / STAGES / ACCOMMODATION / POIs); su implementación
  // real llega en fases posteriores, cuando haya datos que pintar.
  createRouteLayer(mapEngine);
  createStageLayer(mapEngine);
  createAccommodationLayer(mapEngine);
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

export function renderMapSheet({ pilgrim, stages }) {
  if (!sheet) return;
  const locale = getLocale();

  if (!stages || stages.length === 0) {
    sheet.setSummary(`<p class="cc-pending" style="margin:0">${t('camino.empty')}</p>`);
    sheet.setBody('');
    return;
  }

  const idx = stages.findIndex((s) => isSameLocalDate(s.date));
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
