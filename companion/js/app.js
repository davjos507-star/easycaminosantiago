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
import { registerServiceWorker } from './pwa/register-sw.js';
import { initInstallPrompt, promptInstall, isRunningStandalone } from './pwa/install-prompt.js';
import { renderTodayLoading, renderTodayError, renderToday } from './ui/screens/today-screen.js';
import { initMapScreen, onMapScreenShown, renderMapSheet } from './ui/screens/map-screen.js';
import { renderCaminoLoading, renderCaminoError, renderCamino } from './ui/screens/camino-screen.js';
import { renderStaysLoading, renderStaysError, renderStays } from './ui/screens/alojamientos-screen.js';
import { renderMore } from './ui/screens/mas-screen.js';
import { initDebugPanel } from './ui/components/debug-panel.js';
import { qs } from './utils/dom.js';

const screens = {
  today: () => qs('[data-screen="today"]'),
  map: () => qs('[data-screen="map"]'),
  camino: () => qs('[data-screen="camino"]'),
  stays: () => qs('[data-screen="stays"]'),
  more: () => qs('[data-screen="more"]'),
};

function renderAllData() {
  applyStaticI18n();
  const state = appStore.getState();
  renderToday(screens.today(), state);
  renderMapSheet(state);
  renderCamino(screens.camino(), state);
  renderStays(screens.stays(), state);
  renderMoreScreen();
}

function renderMoreScreen() {
  renderMore(screens.more(), {
    onInstallClick: async () => {
      if (isRunningStandalone()) return;
      await promptInstall();
    },
    onLanguageToggle: async (nextLocale) => {
      setString(KEYS.LOCALE, nextLocale);
      await initI18n(nextLocale);
      renderAllData();
    },
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
  initDebugPanel();

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

  renderAllData();
  initOnboarding();
}

boot();
