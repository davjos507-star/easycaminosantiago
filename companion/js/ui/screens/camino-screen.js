import { t, getLocale } from '../../utils/i18n.js';
import { formatPending, isStageActiveOn } from '../../utils/formatters.js';
import { icon } from '../components/icons.js';
import { renderLoading, renderError, renderEmpty } from '../components/state-views.js';

export function renderCaminoLoading(container) {
  container.innerHTML = `<h1>${t('camino.title')}</h1>${renderLoading({ lines: 5 })}`;
}

export function renderCaminoError(container, message) {
  container.innerHTML = `<h1>${t('camino.title')}</h1>${renderError({ message })}`;
}

export function renderCamino(container, { stages }) {
  const locale = getLocale();

  if (!stages || stages.length === 0) {
    container.innerHTML = `<h1>${t('camino.title')}</h1>${renderEmpty({ title: t('camino.empty'), iconName: 'route' })}`;
    return;
  }

  const todayIdx = stages.findIndex((s) => isStageActiveOn(s));

  const items = stages
    .map((stage, i) => {
      const status = i < todayIdx ? 'done' : i === todayIdx ? 'current' : 'upcoming';
      const marker = status === 'done' ? icon('checkCircle') : status === 'current' ? '' : icon('circle');
      return `
        <li class="cc-timeline-item cc-timeline-item--${status}">
          <span class="cc-timeline-marker">${marker}</span>
          <div class="cc-timeline-content">
            <button type="button" data-stage-index="${i}">
              <div class="cc-eyebrow">${t('camino.stage_number', { number: stage.number ?? i + 1 })}</div>
              <div style="font-weight:700" class="${stage.origin ? '' : 'cc-pending'}">${stage.origin || formatPending(locale)} → ${stage.destination || formatPending(locale)}</div>
            </button>
          </div>
        </li>`;
    })
    .join('');

  container.innerHTML = `<h1>${t('camino.title')}</h1><ul class="cc-timeline">${items}</ul>`;
}
