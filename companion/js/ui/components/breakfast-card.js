import { icon } from './icons.js';
import { t, getLocale } from '../../utils/i18n.js';
import { formatLongDate, toLocalIsoDate } from '../../utils/formatters.js';
import { navigateTo } from '../../router.js';
import { startAccommodationNavigation } from '../screens/map-screen.js';

/*
 * Bloque "Tu desayuno" de una estancia (stage.breakfast), compartido por Hoy
 * y Mi Camino. El desayuno es el de la mañana de salida de esa estancia
 * (breakfast.date === stage.checkOutDate), así que siempre se muestra con su
 * fecha explícita.
 *
 * breakfast.location: 'accommodation' (se sirve en el propio alojamiento) o
 * 'external' (cafetería/bar fuera del alojamiento). "Cómo llegar" solo se
 * ofrece para los exteriores con coordenadas verificadas (breakfast.coordinates)
 * y abre el mapa de Companion — nunca Google Maps ni otra app externa. Solo
 * pinta los campos que existen: sin horarios salvo que vengan en los datos
 * (breakfast.hours).
 *
 * El clic se gestiona AQUÍ mismo (listener delegado que se instala al cargar
 * este módulo) y el destino viaja en los data-* del propio botón: así el
 * botón y su gestor llegan siempre juntos, aunque otro módulo (p. ej. app.js)
 * venga de una caché de otra versión, y no depende de buscar el desayuno en
 * el estado global.
 */

function telHref(number) {
  return `tel:${String(number).replace(/[^\d+]/g, '')}`;
}

function hasCoordinates(breakfast) {
  const c = breakfast?.coordinates;
  return Boolean(c && Number.isFinite(c.lat) && Number.isFinite(c.lng));
}

function escapeAttr(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Destino para la navegación dentro de Companion, leído del botón pulsado. */
function navTargetFromButton(btn) {
  const lat = Number(btn.dataset.lat);
  const lng = Number(btn.dataset.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    kind: 'breakfast',
    name: btn.dataset.name || '',
    address: btn.dataset.address || null,
    date: btn.dataset.breakfastNav,
    lat,
    lng,
    returnScreen: btn.closest('[data-screen]')?.dataset.screen || 'today',
  };
}

function handleBreakfastNavClick(event) {
  const origin = event.target instanceof Element ? event.target : event.target?.parentElement;
  const btn = origin?.closest('[data-breakfast-nav]');
  if (!btn) return;
  const target = navTargetFromButton(btn);
  if (!target) return;
  navigateTo('map');
  // Igual que "Llévame al alojamiento" (app.js#openMapThen): dejar que la
  // pantalla de mapa se muestre antes de centrar y arrancar la navegación.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      startAccommodationNavigation(target).catch((err) => console.error('[breakfast] navegación:', err));
    });
  });
}

document.addEventListener('click', handleBreakfastNavClick);

export function findBreakfastOn(stages, referenceDate = new Date()) {
  const ref = toLocalIsoDate(referenceDate);
  return (stages || []).map((s) => s.breakfast).find((b) => b && b.date === ref) || null;
}

export function renderBreakfast(breakfast, { nested = false } = {}) {
  if (!breakfast) return '';
  const locale = getLocale();
  const muted = 'color:var(--cc-text-muted); font-size:0.9rem;';
  const isExternal = breakfast.location === 'external';

  const badge = `<span class="cc-badge" style="margin:6px 0 4px; ${isExternal ? 'background:var(--cc-cream); color:var(--cc-teal-dark);' : ''}">${isExternal ? t('breakfast.external') : t('breakfast.at_accommodation')}</span>`;
  const lines = [];
  if (breakfast.description) lines.push(`<div style="${muted}">${breakfast.description}</div>`);
  if (breakfast.address) lines.push(`<div style="${muted} margin-top:4px">${breakfast.address}</div>`);
  if (breakfast.hours) lines.push(`<div style="${muted} margin-top:4px">${breakfast.hours}</div>`);

  const canNavigate = isExternal && hasCoordinates(breakfast);
  const buttons = [
    canNavigate ? `<button type="button" class="cc-btn cc-btn--primary cc-btn--sm cc-btn--auto" data-breakfast-nav="${breakfast.date}" data-lat="${breakfast.coordinates.lat}" data-lng="${breakfast.coordinates.lng}" data-name="${escapeAttr(breakfast.name)}" data-address="${escapeAttr(breakfast.address)}">${icon('locationArrow')} ${t('stays.directions')}</button>` : '',
    breakfast.phone ? `<a class="cc-btn cc-btn--secondary cc-btn--sm cc-btn--auto" href="${telHref(breakfast.phone)}">${icon('phone')} ${breakfast.phone}</a>` : '',
  ].join('');

  return `
    <div class="cc-card" data-breakfast-card="${breakfast.date}"${nested ? ' style="margin:10px 0 0"' : ''}>
      <div class="cc-eyebrow" style="margin-bottom:4px">${t('breakfast.title')} · ${formatLongDate(breakfast.date, locale, { year: false })}</div>
      <div style="font-weight:700">${breakfast.name}</div>
      ${badge}
      ${lines.join('')}
      ${buttons ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px">${buttons}</div>` : ''}
    </div>`;
}
