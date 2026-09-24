import './data/poi/mock-poi-provider.js';
import { initI18n, getLocale, applyStaticI18n } from './utils/i18n.js';
import { getString, setString, KEYS } from './state/storage.js';
import { appStore } from './state/store.js';
import { initRouter } from './router.js';
import { resolvePilgrimId } from './data/pilgrim-resolver.js';
import { loadPilgrim } from './data/pilgrim-loader.js';
import { loadItinerary, loadAllStages } from './data/itinerary-loader.js';
import { initOnboarding } from './ui/components/onboarding.js';
import { initConnectivityBanner } from './ui/components/connectivity-banner.js';
import { initEmergencyModal } from './ui/components/emergency-modal.js';
import { initInfoModal } from './ui/components/info-modal.js';
import { registerServiceWorker } from './pwa/register-sw.js';
import { initInstallPrompt, promptInstall, isRunningStandalone } from './pwa/install-prompt.js';
import { renderTodayLoading, renderTodayError, renderToday, initTodayScreen } from './ui/screens/today-screen.js';
import { hydrateStageSession } from './stage/stage-session.js';
import {
  initMapScreen,
  onMapScreenShown,
  renderMapSheet,
  focusAccommodationOnMap,
  startAccommodationNavigation,
} from './ui/screens/map-screen.js';
import { renderCaminoLoading, renderCaminoError, renderCamino } from './ui/screens/camino-screen.js';
import { renderStaysLoading, renderStaysError, renderStays } from './ui/screens/alojamientos-screen.js';
import { renderMore } from './ui/screens/mas-screen.js';
import { initDebugPanel } from './ui/components/debug-panel.js';
import { qs } from './utils/dom.js';
import { navigateTo } from './router.js';

const screens = {
  today: () => qs('[data-screen="today"]'),
  map: () => qs('[data-screen="map"]'),
  camino: () => qs('[data-screen="camino"]'),
  stays: () => qs('[data-screen="stays"]'),
  more: () => qs('[data-screen="more"]'),
};

// Cambia primero a la pantalla MAPA y espera a que el router haya mostrado
// el contenedor antes de montar/centrar MapLibre. Evita montar el mapa en un
// elemento hidden (0x0), que hacía que los botones de alojamientos parecieran
// no responder en algunos móviles.
function openMapThen(action, accommodation) {
  navigateTo('map');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      action(accommodation).catch((err) => console.error('[app] acción de alojamiento:', err));
    });
  });
}

function getCaminoCompletionDate(stages = []) {
  const dates = stages.map((stage) => stage.date).filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

function isTripCompleted(stages = []) {
  const completionDate = getCaminoCompletionDate(stages);
  if (!completionDate) return false;
  const today = new Date();
  const localToday = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
  return localToday > completionDate;
}

function renderCompletedJourney(state) {
  const todayScreen = screens.today();

  ['map', 'camino', 'stays', 'more'].forEach((key) => {
    const el = screens[key]();
    if (el) el.hidden = true;
  });
  document.querySelector('.cc-bottom-nav')?.setAttribute('hidden', '');
  document.querySelector('.cc-help-fab')?.setAttribute('hidden', '');

  if (!todayScreen) return;
  todayScreen.hidden = false;
  todayScreen.innerHTML = `
    <div style="max-width:620px;margin:0 auto;padding:4rem 1.25rem 5rem;text-align:center;">
      <div style="font-size:3rem;line-height:1;margin-bottom:1rem;">🥾</div>
      <p style="margin:0 0 .5rem;letter-spacing:.14em;text-transform:uppercase;font-size:.78rem;opacity:.65;">Easy Camino Santiago</p>
      <h1 style="margin:.25rem 0 1rem;">¡Camino completado!</h1>
      <p style="line-height:1.6;margin:0 auto 1.5rem;max-width:500px;">Esperamos que hayáis disfrutado de esta experiencia. Vuestra Easy Camino Companion ha finalizado junto con vuestro viaje.</p>
      <p style="line-height:1.6;margin:0 auto 1.5rem;max-width:500px;">Por privacidad y seguridad, la información operativa del viaje ya no está disponible.</p>
      <p style="margin-top:1.5rem;">Si necesitáis cualquier cosa, seguimos a vuestra disposición.</p>
      <p style="margin-top:1.25rem;"><a href="tel:+34625875316" style="font-weight:700;">+34 625 875 316</a><br><a href="mailto:info@easycaminosantiago.com">info@easycaminosantiago.com</a></p>
      <p style="margin-top:2rem;font-weight:700;">Gracias por confiar en Easy Camino Santiago.<br>¡Buen Camino!</p>
    </div>`;
}

function renderAllData() {
  applyStaticI18n();
  const state = appStore.getState();
  renderToday(screens.today(), state);
  renderMapSheet(state);
  renderCamino(screens.camino(), state);
  renderStays(screens.stays(), state, {
    onViewOnMap: (acc) => openMapThen(focusAccommodationOnMap, acc),
    onNavigateTo: (acc) => openMapThen(startAccommodationNavigation, acc),
  });
  renderMoreScreen();
}

async function handleLanguageToggle(nextLocale) {
  setString(KEYS.LOCALE, nextLocale);
  await initI18n(nextLocale);
  renderAllData();
}

function renderMoreScreen() {
  renderMore(screens.more(), {
    onInstallClick: async () => {
      if (isRunningStandalone()) return;
      await promptInstall();
    },
    onLanguageToggle: handleLanguageToggle,
  });
}

function renderFatalError(message) {
  ['today', 'camino', 'stays'].forEach((key) => {
    const el = screens[key]();
    if (key === 'today') renderTodayError(el, message);
    if (key === 'camino') renderCaminoError(el, message);
    if (key === 'stays') renderStaysError(el, message);
  });
}

async function boot() {
  const preferredLocale = getString(KEYS.LOCALE);
  await initI18n(preferredLocale || 'en');
  applyStaticI18n();

  initConnectivityBanner();
  registerServiceWorker();
  initInstallPrompt();
  initMapScreen();
  initEmergencyModal();
  initInfoModal({ onLanguageToggle: handleLanguageToggle });
  initDebugPanel();
  initTodayScreen();
  hydrateStageSession();

  renderTodayLoading(screens.today());
  renderCaminoLoading(screens.camino());
  renderStaysLoading(screens.stays());

  initRouter({
    onNavigate: (screen) => {
      appStore.setState({ activeScreen: screen });
      if (screen === 'map') onMapScreenShown();
    },
  });

  const pilgrimRef = resolvePilgrimId();
  if (!pilgrimRef) {
    renderFatalError('No pilgrim identified.');
    return;
  }

  let pilgrim;
  try {
    pilgrim = await loadPilgrim(pilgrimRef.id);
  } catch (err) {
    console.error('[app] error cargando peregrino:', err);
    renderFatalError(err.message);
    return;
  }

  if (!preferredLocale && pilgrim.language && pilgrim.language !== getLocale()) {
    await initI18n(pilgrim.language);
  }
  appStore.setState({ pilgrim });

  try {
    const itinerary = await loadItinerary(pilgrim.itineraryId);
    const stages = await loadAllStages(itinerary);
    appStore.setState({ itinerary, stages });
  } catch (err) {
    console.error('[app] error cargando itinerario:', err);
    renderFatalError(err.message);
    return;
  }

  if (isTripCompleted(appStore.getState().stages)) {
    renderCompletedJourney(appStore.getState());
  } else {
    renderAllData();
    initOnboarding();
  }
}

boot();
