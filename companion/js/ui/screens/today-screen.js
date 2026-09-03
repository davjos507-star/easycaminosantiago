import { t, getLocale } from '../../utils/i18n.js';
import { formatKm, formatPending, isSameLocalDate } from '../../utils/formatters.js';
import { icon } from '../components/icons.js';
import { renderLoading, renderError, renderEmpty } from '../components/state-views.js';

function findTodayStageIndex(stages) {
  const idx = stages.findIndex((stage) => isSameLocalDate(stage.date));
  return idx === -1 ? (stages.length ? 0 : -1) : idx;
}

export function renderTodayLoading(container) {
  container.innerHTML = renderLoading({ lines: 4 });
}

export function renderTodayError(container, message) {
  container.innerHTML = renderError({ message });
}

export function renderToday(container, { pilgrim, stages }) {
  const locale = getLocale();
  const name = pilgrim?.name || formatPending(locale);

  if (!stages || stages.length === 0) {
    container.innerHTML = `
      <div class="cc-screen-header">
        <div>
          <div class="cc-eyebrow">${t('today.todays_stage')}</div>
          <h1>${t('today.greeting', { name })}</h1>
        </div>
      </div>
      ${renderEmpty({ title: t('today.no_stage_today'), iconName: 'route' })}
    `;
    return;
  }

  const idx = findTodayStageIndex(stages);
  const stage = stages[idx];
  const accommodation = stage.accommodation || {};
  const isPendingOrigin = !stage.origin;
  const isPendingDest = !stage.destination;

  container.innerHTML = `
    <div class="cc-screen-header">
      <div>
        <div class="cc-eyebrow">${t('today.todays_stage')}</div>
        <h1>${t('today.greeting', { name })}</h1>
      </div>
    </div>

    <div class="cc-card">
      <div style="display:flex; align-items:center; gap:8px; font-family:var(--cc-font-heading); font-weight:800; font-size:1.15rem; margin-bottom:8px;">
        <span class="${isPendingOrigin ? 'cc-pending' : ''}">${stage.origin || formatPending(locale)}</span>
        <span class="cc-icon-chevron">${icon('chevronRight')}</span>
        <span class="${isPendingDest ? 'cc-pending' : ''}">${stage.destination || formatPending(locale)}</span>
      </div>
      <p style="margin-bottom:16px">${t('today.km_remaining', { km: formatKm(stage.km, locale) })}</p>
      <button type="button" class="cc-btn cc-btn--primary" id="start-stage-btn" disabled>
        ${icon('walk')} ${t('today.start_stage')}
      </button>
      <p class="cc-pending" style="text-align:center; margin:8px 0 0; font-size:0.8rem;">${t('more.coming_soon')}</p>
    </div>

    <div class="cc-card">
      <div class="cc-eyebrow" style="margin-bottom:8px">${t('today.accommodation_tonight')}</div>
      <div style="font-weight:700" class="${accommodation.name ? '' : 'cc-pending'}">${accommodation.name || formatPending(locale)}</div>
      <div class="${accommodation.locality ? 'cc-text-muted' : 'cc-pending'}" style="color:var(--cc-text-muted); font-size:0.9rem;">${accommodation.locality || formatPending(locale)}</div>
    </div>
  `;
}
