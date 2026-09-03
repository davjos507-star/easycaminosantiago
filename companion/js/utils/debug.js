/*
 * Modo de depuración para desarrollo (?debug=1). Desactivado por defecto.
 * No debe usarse para nada visible a un peregrino en uso normal.
 */
export function isDebugEnabled() {
  return new URLSearchParams(window.location.search).get('debug') === '1';
}
