import { icon } from './icons.js';
import { t, getLocale } from '../../utils/i18n.js';
import { formatLongDate, toLocalIsoDate } from '../../utils/formatters.js';

/*
 * Bloque "Tu desayuno" de una estancia (stage.breakfast), compartido por Hoy
 * y Mi Camino. El desayuno es el de la mañana de salida de esa estancia
 * (breakfast.date === stage.checkOutDate), así que siempre se muestra con su
 * fecha explícita.
 *
 * breakfast.location: 'accommodation' (se sirve en el propio alojamiento) o
 * 'external' (cafetería/bar fuera del alojamiento). "Cómo llegar" solo se
 * ofrece para los exteriores con coordenadas verificadas (breakfast.coordinates)
 * y abre el mapa de Companion — nunca Google Maps ni otra app externa (el clic
 * lo gestiona app.js vía [data-breakfast-nav]). Solo pinta los campos que
 * existen: sin horarios salvo que vengan en los datos (breakfast.hours).
 */

function telHref(number) {
  return `tel:${String(number).replace(/[^\d+]/g, '')}`;
}

function hasCoordinates(breakfast) {
  const c = breakfast?.coordinates;
  return Boolean(c && Number.isFinite(c.lat) && Number.isFinite(c.lng));
}

/** Destino para la navegación dentro de Companion (map-screen.js). */
export function breakfastNavTarget(breakfast, returnScreen) {
  if (!hasCoordinates(breakfast)) return null;
  return {
    kind: 'breakfast',
    name: breakfast.name,
    address: breakfast.address || null,
    date: breakfast.date,
    lat: breakfast.coordinates.lat,
    lng: breakfast.coordinates.lng,
    returnScreen,
  };
}

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
    canNavigate ? `<button type="button" class="cc-btn cc-btn--primary cc-btn--sm cc-btn--auto" data-breakfast-nav="${breakfast.date}">${icon('locationArrow')} ${t('stays.directions')}</button>` : '',
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
