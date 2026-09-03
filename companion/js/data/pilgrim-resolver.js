/*
 * Resuelve QUÉ peregrino está usando la app ahora mismo.
 *
 * Importante: la URL /companion/<id>/ (ver companion/osyris/index.html)
 * es solo una comodidad de enrutado, NO un mecanismo de autenticación ni
 * de privacidad — cualquiera con el enlace puede abrirlo. El diseño de
 * este resolver deja un punto de extensión (`resolveSecureIdentifier`)
 * para que una fase futura pueda sustituirlo por un token firmado o un
 * identificador emitido por un backend, sin tener que rehacer el resto
 * de la app: todo lo demás (pilgrim-loader, itinerary-loader, UI) solo
 * conoce un `pilgrimId`, nunca cómo se obtuvo.
 */

import { getString, setString, KEYS } from '../state/storage.js';
import { DEFAULT_PILGRIM_ID } from '../config.js';

// Fase futura: validar/decodificar un token seguro (JWT, enlace firmado,
// sesión de backend...) y devolver el id de peregrino que autoriza.
// Debe devolver `null` si no hay identificador seguro disponible.
function resolveSecureIdentifier() {
  return null;
}

export function resolvePilgrimId() {
  const secure = resolveSecureIdentifier();
  if (secure) return { id: secure, source: 'secure-token' };

  const fromQuery = new URLSearchParams(window.location.search).get('pilgrim');
  if (fromQuery) {
    setString(KEYS.PILGRIM_ID, fromQuery);
    return { id: fromQuery, source: 'query' };
  }

  const stored = getString(KEYS.PILGRIM_ID);
  if (stored) return { id: stored, source: 'storage' };

  if (DEFAULT_PILGRIM_ID) return { id: DEFAULT_PILGRIM_ID, source: 'default' };

  return null;
}
