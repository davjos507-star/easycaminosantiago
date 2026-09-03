/*
 * Envoltorio de localStorage con espacio de nombres propio.
 *
 * Regla de arquitectura (no negociable): este módulo NUNCA debe ganar un
 * método para persistir histórico de GPS. La posición en vivo vive solo en
 * memoria (ver state/store.js) y desaparece al cerrar la app. Cualquier
 * envío futuro de ubicación a un servidor requiere consentimiento explícito
 * y no pasa por aquí.
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
};
