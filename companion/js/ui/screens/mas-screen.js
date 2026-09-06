import { t, getLocale } from '../../utils/i18n.js';
import { icon } from '../components/icons.js';
import { APP_VERSION } from '../../config.js';

const MENU_ITEMS = [
  { key: 'more.profile', icon: 'today', action: 'info', infoKind: 'profile' },
  { key: 'more.assistance', icon: 'phone', action: 'emergency' },
  { key: 'more.credential', icon: 'shield', action: 'info', infoKind: 'credential' },
  { key: 'more.settings', icon: 'more', action: 'info', infoKind: 'settings' },
  { key: 'more.about', icon: 'info', action: 'info', infoKind: 'about' },
  { key: 'more.privacy', icon: 'shield', action: 'info', infoKind: 'privacy' },
];

export function renderMore(container, { onInstallClick, onLanguageToggle } = {}) {
  const locale = getLocale();

  container.innerHTML = `
    <h1>${t('more.title')}</h1>

    <div class="cc-card cc-card--flush">
      ${MENU_ITEMS.map(
        (item) => `
        <button type="button" class="cc-more-item" data-action="${item.action}" ${item.infoKind ? `data-info-kind="${item.infoKind}"` : ''} style="width:100%; display:flex; align-items:center; gap:12px; padding:16px; background:none; border:none; border-bottom:1px solid var(--cc-border); text-align:left; cursor:pointer; color:var(--cc-text); min-height:var(--cc-tap-min)">
          ${icon(item.icon)}
          <span style="flex:1; font-weight:600">${t(item.key)}</span>
        </button>`
      ).join('')}
    </div>

    <div class="cc-card" style="display:flex; align-items:center; justify-content:space-between">
      <span style="font-weight:600">${t('more.language')}</span>
      <button type="button" class="cc-btn cc-btn--secondary cc-btn--auto cc-btn--sm" id="language-toggle">${locale.toUpperCase()}</button>
    </div>

    <button type="button" class="cc-btn cc-btn--accent" id="install-btn" style="margin-bottom:16px">
      ${icon('download')} ${t('more.install')}
    </button>

    <p class="cc-pending" style="text-align:center; font-size:0.78rem">Easy Camino Companion · v${APP_VERSION}</p>
    <p class="cc-pending" style="text-align:center; font-size:0.7rem">Obra derivada de Rutas de Caminos de Santiago 2020-2026 CC-BY 4.0 <a href="https://www.caminosantiago.org/cpperegrino/comun/inicio.asp" target="_blank" rel="noopener">FEAACS</a></p>
  `;

  container.querySelectorAll('[data-action="emergency"]').forEach((btn) => {
    btn.setAttribute('data-open-emergency', '');
  });
  container.querySelectorAll('[data-action="info"]').forEach((btn) => {
    btn.setAttribute('data-open-info', btn.getAttribute('data-info-kind'));
  });

  container.querySelector('#install-btn')?.addEventListener('click', () => onInstallClick?.());
  container.querySelector('#language-toggle')?.addEventListener('click', () => onLanguageToggle?.(locale === 'en' ? 'es' : 'en'));
}
