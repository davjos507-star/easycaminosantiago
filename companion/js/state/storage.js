/*
 * Envoltorio de localStorage con espacio de nombres propio.
 *
 * Regla de arquitectura (no negociable): este módulo no persiste
 * histórico de GPS en segundo plano ni indefinido. La única excepción
 * explícita es la sesión de etapa en curso (ver js/stage/stage-session.js,
 * clave KEYS.STAGE_SESSION): un registro acotado, iniciado siempre por
 * una acción deliberada del peregrino ("Empezar etapa"), que se borra al
 * pulsar "Finalizar etapa". Nunca se activa solo, nunca se envía a
 * ningún servidor. Fuera de esa sesión, la posición en vivo sigue
 * viviendo solo en memoria (ver state/store.js) y desaparece al cerrar
 * la app.
 */

const PREFIX = 'ecc:'; // Easy Camino Companion

function safeGet(key) {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch (err) {
    console.warn('[storage] no disponible:', err.message);
    return null;
  }
}

function safeSet(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch (err) {
    console.warn('[storage] no se pudo guardar:', err.message);
  }
}

function safeRemove(key) {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch (err) {
    /* noop */
  }
}

export function getJSON(key, fallback = null) {
  const raw = safeGet(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

export function setJSON(key, value) {
  safeSet(key, JSON.stringify(value));
}

export function getString(key, fallback = null) {
  const value = safeGet(key);
  return value === null ? fallback : value;
}

export function setString(key, value) {
  safeSet(key, value);
}

export function remove(key) {
  safeRemove(key);
}

// --- Claves conocidas de la app (evita strings mágicos repetidos) ---
export const KEYS = {
  ONBOARDING_DONE: 'onboarding-done',
  PILGRIM_ID: 'pilgrim-id',
  LOCALE: 'locale',
  COMPLETED_STAGE_IDS: 'completed-stage-ids',
  STAGE_SESSION: 'stage-session',
};
