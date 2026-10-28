import { icon } from './icons.js';
import { t, getLocale } from '../../utils/i18n.js';
import { formatLongDate } from '../../utils/formatters.js';
import { navigateTo } from '../../router.js';
import { startAccommodationNavigation } from '../screens/map-screen.js';

/*
 * Bloque de detalle de un alojamiento (entrada/salida, dirección,
 * teléfonos, "Cómo llegar") compartido por Hoy, Mi Camino y Alojamientos.
 *
 * Solo se usa cuando el itinerario lo activa explícitamente
 * (itinerary.showStayDetails) — el resto de peregrinos siguen viendo
 * exactamente las mismas pantallas que antes. Solo pinta los campos que
 * existen en los datos: nunca rellena huecos con "Pendiente de cargar".
 *
 * "Cómo llegar" / "Llévame al alojamiento" abren SIEMPRE la navegación a pie
 * dentro del mapa de Companion — nunca Google Maps, Apple Maps ni ninguna
 * página externa. Mismo patrón que breakfast-card.js: el clic se gestiona
 * aquí (listener delegado) y el destino viaja en los data-* del botón, con
 * la pantalla de origen para el botón "Volver al alojamiento" del mapa.
 */

export function isStayDetailsEnabled(itinerary) {
  return itinerary?.showStayDetails === true;
}

function telHref(number) {
  return `tel:${String(number).replace(/[^\d+]/g, '')}`;
}

function escapeAttr(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function hasCoordinates(accommodation) {
  const c = accommodation?.coordinates;
  return Boolean(c && Number.isFinite(c.lat) && Number.isFinite(c.lng));
}

/** Atributos data-* del botón que abre la navegación interna a un alojamiento. */
export function stayNavAttributes(stage) {
  const acc = stage?.accommodation;
  if (!hasCoordinates(acc)) return '';
  return `data-stay-nav="${escapeAttr(stage.date)}" data-lat="${acc.coordinates.lat}" data-lng="${acc.coordinates.lng}" data-name="${escapeAttr(acc.name)}" data-address="${escapeAttr(acc.address)}"`;
}

function handleStayNavClick(event) {
  const origin = event.target instanceof Element ? event.target : event.target?.parentElement;
  const btn = origin?.closest('[data-stay-nav]');
  if (!btn) return;
  const lat = Number(btn.dataset.lat);
  const lng = Number(btn.dataset.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  event.preventDefault();
  const target = {
    kind: 'stay',
    name: btn.dataset.name || '',
    address: btn.dataset.address || null,
    date: btn.dataset.stayNav,
    lat,
    lng,
    returnScreen: btn.closest('[data-screen]')?.dataset.screen || 'today',
  };
  navigateTo('map');
  // Igual que breakfast-card.js: dejar que el mapa se muestre antes de
  // centrar y arrancar la navegación.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      startAccommodationNavigation(target).catch((err) => console.error('[stay] navegación:', err));
    });
  });
}

document.addEventListener('click', handleStayNavClick);

function accommodationPhones(accommodation) {
  if (Array.isArray(accommodation?.phones) && accommodation.phones.length) return accommodation.phones;
  return accommodation?.phone ? [{ number: accommodation.phone }] : [];
}

/**
 * `directions: false` omite "Cómo llegar" (Alojamientos ya tiene su propio
 * "Llévame al alojamiento", que usa este mismo flujo).
 */
export function renderStayDetails(stage, { directions = true } = {}) {
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
  const navAttrs = directions ? stayNavAttributes(stage) : '';
  const mapsButton = navAttrs
    ? `<button type="button" class="cc-btn cc-btn--primary cc-btn--sm cc-btn--auto" ${navAttrs}>${icon('locationArrow')} ${t('stays.directions')}</button>`
    : '';

  return `
    <div data-stay-card="${escapeAttr(stage.date)}">
      ${lines.join('')}
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px">${mapsButton}${phoneButtons}</div>
    </div>`;
}
