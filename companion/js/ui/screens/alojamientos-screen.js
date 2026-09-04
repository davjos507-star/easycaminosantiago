import { t, getLocale } from '../../utils/i18n.js';
import { formatPending, formatDate } from '../../utils/formatters.js';
import { icon } from '../components/icons.js';
import { renderLoading, renderError, renderEmpty } from '../components/state-views.js';

export function renderStaysLoading(container) {
  container.innerHTML = `<h1>${t('stays.title')}</h1>${renderLoading({ lines: 4 })}`;
}

export function renderStaysError(container, message) {
  container.innerHTML = `<h1>${t('stays.title')}</h1>${renderError({ message })}`;
}

/**
 * "Ver en mapa" y "Llévame al alojamiento" ocurren siempre dentro del
 * mapa MapLibre de Companion (ver ui/screens/map-screen.js): nunca abren
 * Google Maps, Apple Maps ni ninguna pestaña externa. `onViewOnMap` y
 * `onNavigateTo` los conecta app.js con las funciones correspondientes de
 * map-screen.js.
 */
export function renderStays(container, { stages }, { onViewOnMap, onNavigateTo } = {}) {
  const locale = getLocale();
  const withAccommodation = (stages || []).filter((s) => s.accommodation);

  if (withAccommodation.length === 0) {
    container.innerHTML = `<h1>${t('stays.title')}</h1>${renderEmpty({ title: t('stays.empty'), iconName: 'bed' })}`;
    return;
  }

  const cards = withAccommodation
    .map((stage, idx) => {
      const acc = stage.accommodation;
      const hasCoords = Boolean(acc.coordinates && Number.isFinite(acc.coordinates.lat) && Number.isFinite(acc.coordinates.lng));
      return `
        <div class="cc-card">
          <div class="cc-eyebrow">${formatDate(stage.date, locale)} · ${acc.locality || formatPending(locale)}</div>
          <div style="font-weight:800; font-family:var(--cc-font-heading); margin-bottom:4px" class="${acc.name ? '' : 'cc-pending'}">${acc.name || formatPending(locale)}</div>
          <div class="${acc.address ? '' : 'cc-pending'}" style="color:var(--cc-text-muted); font-size:0.9rem; margin-bottom:12px">${acc.address || formatPending(locale)}</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap">
            <button type="button" class="cc-btn cc-btn--secondary cc-btn--sm" data-action="view" data-idx="${idx}" ${hasCoords ? '' : 'disabled'}>${icon('pin')} ${t('stays.view_on_map')}</button>
            <button type="button" class="cc-btn cc-btn--secondary cc-btn--sm" data-action="navigate" data-idx="${idx}" ${hasCoords ? '' : 'disabled'}>${icon('locationArrow')} ${t('stays.take_me_there')}</button>
            <a class="cc-btn cc-btn--secondary cc-btn--sm" ${acc.phone ? `href="tel:${acc.phone}"` : 'disabled'}>${icon('phone')} ${t('stays.call')}</a>
          </div>
        </div>`;
    })
    .join('');

  container.innerHTML = `<h1>${t('stays.title')}</h1>${cards}`;

  function accommodationAt(idx) {
    const acc = withAccommodation[idx].accommodation;
    return { name: acc.name, lat: acc.coordinates.lat, lng: acc.coordinates.lng };
  }

  container.querySelectorAll('[data-action="view"]').forEach((btn) => {
    btn.addEventListener('click', () => onViewOnMap?.(accommodationAt(Number(btn.dataset.idx))));
  });
  container.querySelectorAll('[data-action="navigate"]').forEach((btn) => {
    btn.addEventListener('click', () => onNavigateTo?.(accommodationAt(Number(btn.dataset.idx))));
  });
}
