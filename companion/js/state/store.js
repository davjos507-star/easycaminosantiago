/*
 * Store observable minimalista (sin dependencias externas).
 * El estado vive únicamente en memoria: se reconstruye desde
 * data/*.json y localStorage (ver storage.js) en cada carga de la app.
 *
 * gps.lastPosition es deliberadamente efímero: nunca se escribe en
 * storage.js ni se envía a ningún servidor (ver condición de privacidad
 * en CLAUDE.md / instrucciones de la Fase 1).
 */

function createStore(initialState) {
  let state = { ...initialState };
  const listeners = new Set();

  function getState() {
    return state;
  }

  function setState(partial) {
    state = { ...state, ...(typeof partial === 'function' ? partial(state) : partial) };
    listeners.forEach((listener) => listener(state));
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { getState, setState, subscribe };
}

export const appStore = createStore({
  pilgrim: null,
  itinerary: null,
  stages: [],
  currentStageIndex: null,
  onboardingComplete: false,
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  gps: {
    supported: null,
    permission: 'unknown', // 'granted' | 'denied' | 'prompt' | 'unknown'
    status: 'idle', // 'idle' | 'searching' | 'active' | 'stale' | 'denied' | 'timeout' | 'unavailable'
    lastPosition: null, // { lat, lng, accuracy, heading, timestamp } — solo en memoria
  },
  followMode: false,
  loading: {
    pilgrim: false,
    itinerary: false,
  },
  error: null,
});
