import { icon } from './icons.js';
import { t, getLocale } from '../../utils/i18n.js';
import { formatPending, formatDate } from '../../utils/formatters.js';
import { appStore } from '../../state/store.js';
import { APP_VERSION } from '../../config.js';

/*
 * Modal genérico de contenido informativo para el menú MÁS (Perfil,
 * Credencial y documentos, Configuración, Acerca de, Privacidad).
 * Mismo patrón que emergency-modal.js (un backdrop, delegación de
 * eventos vía atributo data-*), pero con contenido según el "kind"
 * pedido en vez de una sola pantalla fija.
 *
 * Solo muestra datos reales ya disponibles en la app (pilgrim,
 * itinerary, config, i18n) — nunca inventa nada. Donde todavía no hay
 * una función real construida (Credencial, más ajustes de Configuración)
 * lo dice explícitamente en vez de simular contenido que no existe.
 */
export function initInfoModal({ onLanguageToggle } = {}) {
  const backdrop = document.getElementById('info-modal');
  if (!backdrop) return;

  function renderProfile() {
    const { pilgrim, itinerary, stages } = appStore.getState();
    const locale = getLocale();
    const row = (label, value, pending) => `
      <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
        <span style="color:var(--cc-text-muted)">${label}</span>
        <strong class="${pending ? 'cc-pending' : ''}">${value}</strong>
      </div>`;
    return `
      ${row(t('profile.pilgrim'), pilgrim?.name || formatPending(locale), !pilgrim?.name)}
      ${row(t('profile.itinerary'), itinerary?.name || formatPending(locale), !itinerary?.name)}
      ${row(t('profile.language'), locale.toUpperCase(), false)}
      ${row(t('profile.start_date'), pilgrim?.startDate ? formatDate(pilgrim.startDate, locale) : formatPending(locale), !pilgrim?.startDate)}
      ${row(t('profile.total_stages'), stages?.length ?? formatPending(locale), !stages?.length)}
    `;
  }

  function renderCredential() {
    return `<p style="margin:0">${t('credential.body')}</p>`;
  }

  function renderSettings() {
    const locale = getLocale();
    return `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
        <span style="color:var(--cc-text-muted)">${t('settings.language_current')}</span>
        <button type="button" class="cc-btn cc-btn--secondary cc-btn--auto cc-btn--sm" id="info-language-toggle">${locale.toUpperCase()}</button>
      </div>
      <p class="cc-pending" style="margin:0">${t('settings.more_soon')}</p>
    `;
  }

  function renderAbout() {
    return `
      <p style="margin:0 0 12px">${t('about.description')}</p>
      <p style="margin:0 0 16px; color:var(--cc-text-muted); font-size:0.85rem;">Easy Camino Companion · v${APP_VERSION}</p>
      <a class="cc-btn cc-btn--secondary" href="https://easycaminosantiago.com" target="_blank" rel="noopener">${t('about.website')}</a>
    `;
  }

  function renderPrivacy() {
    return `
      <p style="margin:0 0 12px">${t('privacy.location_consent_body')}</p>
      <p style="margin:0 0 12px">${t('privacy.stage_session_detail')}</p>
      <p style="margin:0">${t('privacy.routing_detail')}</p>
    `;
  }

  const PANELS = {
    profile: { title: () => t('profile.title'), render: renderProfile },
    credential: { title: () => t('credential.title'), render: renderCredential },
    settings: { title: () => t('settings.title'), render: renderSettings },
    about: { title: () => t('about.title'), render: renderAbout },
    privacy: { title: () => t('privacy.title'), render: renderPrivacy },
  };

  let currentKind = null;

  function render() {
    const panel = PANELS[currentKind];
    if (!panel) return;
    backdrop.innerHTML = `
      <div class="cc-modal" role="dialog" aria-modal="true" aria-labelledby="info-modal-title">
        <div class="cc-modal-title">
          <h2 id="info-modal-title" style="margin:0">${panel.title()}</h2>
          <button type="button" class="cc-icon-btn" id="info-modal-close" aria-label="${t('common.close')}">${icon('close')}</button>
        </div>
        ${panel.render()}
      </div>
    `;
    backdrop.querySelector('#info-modal-close').addEventListener('click', close);
    backdrop.querySelector('#info-language-toggle')?.addEventListener('click', async () => {
      const next = getLocale() === 'en' ? 'es' : 'en';
      await onLanguageToggle?.(next); // guarda, cambia i18n y re-renderiza el resto de la app
      render(); // refresca este modal en el nuevo idioma
    });
  }

  function open(kind) {
    if (!PANELS[kind]) return;
    currentKind = kind;
    render();
    backdrop.hidden = false;
  }

  function close() {
    backdrop.hidden = true;
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-open-info]');
    if (trigger) open(trigger.getAttribute('data-open-info'));
  });

  return { open, close };
}
