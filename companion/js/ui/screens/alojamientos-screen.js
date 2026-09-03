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

function mapsHref(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function renderStays(container, { stages }) {
  const locale = getLocale();
  const withAccommodation = (stages || []).filter((s) => s.accommodation);

  if (withAccommodation.length === 0) {
    container.innerHTML = `<h1>${t('stays.title')}</h1>${renderEmpty({ title: t('stays.empty'), iconName: 'bed' })}`;
    return;
  }

  const cards = withAccommodation
    .map((stage) => {
      const acc = stage.accommodation;
      const hasCoords = acc.coordinates && acc.coordinates.lat && acc.coordinates.lng;
      return `
        <div class="cc-card">
          <div class="cc-eyebrow">${formatDate(stage.date, locale)} · ${acc.locality || formatPending(locale)}</div>
          <div style="font-weight:800; font-family:var(--cc-font-heading); margin-bottom:4px" class="${acc.name ? '' : 'cc-pending'}">${acc.name || formatPending(locale)}</div>
          <div class="${acc.address ? '' : 'cc-pending'}" style="color:var(--cc-text-muted); font-size:0.9rem; margin-bottom:12px">${acc.address || formatPending(locale)}</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap">
            <a class="cc-btn cc-btn--secondary cc-btn--sm" ${hasCoords ? `href="${mapsHref(acc.coordinates.lat, acc.coordinates.lng)}" target="_blank" rel="noopener"` : 'disabled'}>${icon('pin')} ${t('stays.view_on_map')}</a>
            <a class="cc-btn cc-btn--secondary cc-btn--sm" ${hasCoords ? `href="https://www.google.com/maps/dir/?api=1&destination=${acc.coordinates.lat},${acc.coordinates.lng}" target="_blank" rel="noopener"` : 'disabled'}>${icon('locationArrow')} ${t('stays.take_me_there')}</a>
            <a class="cc-btn cc-btn--secondary cc-btn--sm" ${acc.phone ? `href="tel:${acc.phone}"` : 'disabled'}>${icon('phone')} ${t('stays.call')}</a>
          </div>
        </div>`;
    })
    .join('');

  container.innerHTML = `<h1>${t('stays.title')}</h1>${cards}`;
}
