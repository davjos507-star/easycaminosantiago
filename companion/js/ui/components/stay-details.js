import { icon } from './icons.js';
import { t, getLocale } from '../../utils/i18n.js';
import { formatLongDate } from '../../utils/formatters.js';

/*
 * Bloque de detalle de un alojamiento (entrada/salida, dirección,
 * teléfonos, "Cómo llegar") compartido por Hoy, Mi Camino y Alojamientos.
 *
 * Solo se usa cuando el itinerario lo activa explícitamente
 * (itinerary.showStayDetails) — el resto de peregrinos siguen viendo
 * exactamente las mismas pantallas que antes. Solo pinta los campos que
 * existen en los datos: nunca rellena huecos con "Pendiente de cargar".
 *
 * "Cómo llegar" sí abre Google Maps (pestaña externa), a diferencia de
 * "Ver en mapa"/"Llévame al alojamiento" de alojamientos-screen.js, que se
 * quedan dentro del mapa de Companion.
 */

export function isStayDetailsEnabled(itinerary) {
  return itinerary?.showStayDetails === true;
}

function telHref(number) {
  return `tel:${String(number).replace(/[^\d+]/g, '')}`;
}

export function googleMapsDirectionsUrl(accommodation) {
  const c = accommodation?.coordinates;
  if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}&travelmode=walking`;
}

function accommodationPhones(accommodation) {
  if (Array.isArray(accommodation?.phones) && accommodation.phones.length) return accommodation.phones;
  return accommodation?.phone ? [{ number: accommodation.phone }] : [];
}

export function renderStayDetails(stage) {
  const locale = getLocale();
  const acc = stage?.accommodation;
  if (!acc) return '';

  const muted = 'color:var(--cc-text-muted); font-size:0.9rem;';
  const lines = [];
  if (stage.date) {
    lines.push(`<div style="${muted}">${t('stays.check_in_date')}: <strong style="color:var(--cc-text)">${formatLongDate(stage.date, locale)}</strong></div>`);
  }
  if (stage.checkOutDate) {
    lines.push(`<div style="${muted}">${t('stays.check_out_date')}: <strong style="color:var(--cc-text)">${formatLongDate(stage.checkOutDate, locale)}</strong></div>`);
  }
  if (acc.address) lines.push(`<div style="${muted} margin-top:6px">${acc.address}</div>`);
  const extras = [acc.roomType, acc.breakfast, acc.bookingStatus].filter(Boolean);
  if (extras.length) lines.push(`<div style="${muted} margin-top:6px">${extras.join(' · ')}</div>`);

  const phoneButtons = accommodationPhones(acc)
    .map((p) => `<a class="cc-btn cc-btn--secondary cc-btn--sm cc-btn--auto" href="${telHref(p.number)}">${icon('phone')} ${p.number}${p.label ? ` · ${p.label}` : ''}</a>`)
    .join('');
  const mapsUrl = googleMapsDirectionsUrl(acc);
  const mapsButton = mapsUrl
    ? `<a class="cc-btn cc-btn--primary cc-btn--sm cc-btn--auto" href="${mapsUrl}" target="_blank" rel="noopener">${icon('locationArrow')} ${t('stays.directions')}</a>`
    : '';

  return `
    ${lines.join('')}
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px">${mapsButton}${phoneButtons}</div>`;
}
