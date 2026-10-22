import { t, getLocale } from '../../utils/i18n.js';
import { formatPending, formatKm, formatLongDate, isStageActiveOn } from '../../utils/formatters.js';
import { icon } from '../components/icons.js';
import { isStayDetailsEnabled, renderStayDetails } from '../components/stay-details.js';
import { renderLoading, renderError, renderEmpty } from '../components/state-views.js';

export function renderCaminoLoading(container) {
  container.innerHTML = `<h1>${t('camino.title')}</h1>${renderLoading({ lines: 5 })}`;
}

export function renderCaminoError(container, message) {
  container.innerHTML = `<h1>${t('camino.title')}</h1>${renderError({ message })}`;
}

export function renderCamino(container, { stages, itinerary }) {
  const locale = getLocale();
  const showDetails = isStayDetailsEnabled(itinerary);

  if (!stages || stages.length === 0) {
    container.innerHTML = `<h1>${t('camino.title')}</h1>${renderEmpty({ title: t('camino.empty'), iconName: 'route' })}`;
    return;
  }

  const todayIdx = stages.findIndex((s) => isStageActiveOn(s));

  const items = stages
    .map((stage, i) => {
      const status = i < todayIdx ? 'done' : i === todayIdx ? 'current' : 'upcoming';
      const marker = status === 'done' ? icon('checkCircle') : status === 'current' ? '' : icon('circle');
      // Jornada de llegada (sin km): "Llegada a X — domingo 25 de octubre",
      // no "Pendiente de cargar → X" ni "Etapa 0" — ese día no se camina.
      const isArrivalDay = stage.km == null;
      const titleHtml = isArrivalDay
        ? `${t('today.arrival_title', { destination: stage.destination || formatPending(locale) })}${stage.date ? ` — ${formatLongDate(stage.date, locale, { year: false })}` : ''}`
        : `${stage.origin || formatPending(locale)} → ${stage.destination || formatPending(locale)}`;
      const eyebrow = isArrivalDay
        ? (showDetails ? formatLongDate(stage.date, locale) : '')
        : `${t('camino.stage_number', { number: stage.number ?? i + 1 })}${showDetails && stage.date ? ` · ${formatLongDate(stage.date, locale)}` : ''}`;
      const detailsHtml = showDetails
        ? `
            ${!isArrivalDay ? `<div style="margin-top:4px; font-weight:600">${formatKm(stage.km, locale)}</div>` : ''}
            ${!isArrivalDay && stage.kmNote ? `<div style="color:var(--cc-text-muted); font-size:0.8rem">${stage.kmNote}</div>` : ''}
            ${stage.accommodation?.name ? `
              <div class="cc-card" style="margin:10px 0 0">
                <div class="cc-eyebrow" style="margin-bottom:4px">${t('camino.accommodation')}</div>
                <div style="font-weight:700">${stage.accommodation.name}</div>
                ${renderStayDetails(stage)}
              </div>` : ''}`
        : '';
      return `
        <li class="cc-timeline-item cc-timeline-item--${status}">
          <span class="cc-timeline-marker">${marker}</span>
          <div class="cc-timeline-content">
            <button type="button" data-stage-index="${i}">
              ${eyebrow ? `<div class="cc-eyebrow">${eyebrow}</div>` : ''}
              <div style="font-weight:700" class="${!isArrivalDay && !stage.origin ? 'cc-pending' : ''}">${titleHtml}</div>
            </button>
            ${detailsHtml}
          </div>
        </li>`;
    })
    .join('');

  container.innerHTML = `<h1>${t('camino.title')}</h1><ul class="cc-timeline">${items}</ul>`;
}
