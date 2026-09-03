import { icon } from './icons.js';
import { t } from '../../utils/i18n.js';

export function renderLoading({ lines = 3 } = {}) {
  const rows = Array.from({ length: lines })
    .map((_, i) => `<div class="cc-skeleton cc-skeleton--text" style="width:${i === lines - 1 ? '70%' : '100%'}"></div>`)
    .join('');
  return `
    <div class="cc-card" role="status" aria-live="polite" aria-label="${t('state.loading')}">
      <div class="cc-skeleton cc-skeleton--title"></div>
      ${rows}
    </div>
  `;
}

export function renderError({ message, onRetryId } = {}) {
  return `
    <div class="cc-state cc-state--error" role="alert">
      ${icon('warning')}
      <div class="cc-state-title">${t('state.error_title')}</div>
      <p>${message || t('state.error_body')}</p>
      ${onRetryId ? `<button id="${onRetryId}" class="cc-btn cc-btn--secondary cc-btn--auto">${t('state.retry')}</button>` : ''}
    </div>
  `;
}

export function renderEmpty({ title, body, iconName = 'info' } = {}) {
  return `
    <div class="cc-state">
      ${icon(iconName)}
      <div class="cc-state-title">${title || t('state.empty_title')}</div>
      ${body ? `<p>${body}</p>` : ''}
    </div>
  `;
}
