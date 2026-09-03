import { icon } from './icons.js';
import { t, getLocale } from '../../utils/i18n.js';
import { formatPending } from '../../utils/formatters.js';
import { EASY_CAMINO_CONTACT, EMERGENCY_NUMBER } from '../../config.js';
import { appStore } from '../../state/store.js';

export function initEmergencyModal() {
  const backdrop = document.getElementById('emergency-modal');
  if (!backdrop) return;

  function currentAccommodationLabel() {
    const state = appStore.getState();
    const stage = state.stages?.[state.currentStageIndex];
    return stage?.accommodation?.name || formatPending(getLocale());
  }

  function currentLocationLabel() {
    const pos = appStore.getState().gps.lastPosition;
    if (!pos) return formatPending(getLocale());
    return `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`;
  }

  function render() {
    const pos = appStore.getState().gps.lastPosition;
    const coordsText = pos ? `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}` : null;

    backdrop.innerHTML = `
      <div class="cc-modal" role="dialog" aria-modal="true" aria-labelledby="emergency-title">
        <div class="cc-modal-title">
          <h2 id="emergency-title" style="margin:0">${t('emergency.title')}</h2>
          <button type="button" class="cc-icon-btn" id="emergency-close" aria-label="${t('common.close')}">${icon('close')}</button>
        </div>

        <button type="button" class="cc-btn cc-btn--primary" style="margin-bottom:8px" id="emergency-call">
          ${icon('phone')} ${t('emergency.call')} ${EASY_CAMINO_CONTACT.phone}
        </button>
        <a class="cc-btn cc-btn--secondary" style="margin-bottom:16px" href="https://wa.me/${EASY_CAMINO_CONTACT.whatsapp}" target="_blank" rel="noopener">
          ${icon('whatsapp')} ${t('emergency.whatsapp')}
        </a>

        <a class="cc-btn cc-btn--danger" style="margin-bottom:16px" href="tel:${EMERGENCY_NUMBER}">
          ${icon('warning')} ${t('emergency.emergency_112')}
        </a>

        <div class="cc-card">
          <div class="cc-eyebrow">${t('emergency.current_accommodation')}</div>
          <p class="${currentAccommodationLabel() === formatPending(getLocale()) ? 'cc-pending' : ''}" style="margin:4px 0 0">${currentAccommodationLabel()}</p>
        </div>

        <div class="cc-card">
          <div class="cc-eyebrow">${t('emergency.current_location')}</div>
          <p class="${coordsText ? '' : 'cc-pending'}" style="margin:4px 0 12px">${coordsText || currentLocationLabel()}</p>
          <div style="display:flex; gap:8px">
            <button type="button" class="cc-btn cc-btn--secondary cc-btn--sm" id="emergency-copy" ${coordsText ? '' : 'disabled'}>${icon('copy')} ${t('emergency.copy_coordinates')}</button>
            <button type="button" class="cc-btn cc-btn--secondary cc-btn--sm" id="emergency-share" ${coordsText ? '' : 'disabled'}>${icon('share')} ${t('emergency.share_location')}</button>
          </div>
        </div>

        <p class="cc-pending" style="text-align:center; margin-top:8px">${t('emergency.disclaimer')}</p>
      </div>
    `;

    backdrop.querySelector('#emergency-close').addEventListener('click', close);
    backdrop.querySelector('#emergency-call').addEventListener('click', () => {
      window.location.href = `tel:${EASY_CAMINO_CONTACT.phone}`;
    });

    const copyBtn = backdrop.querySelector('#emergency-copy');
    copyBtn?.addEventListener('click', async () => {
      if (!coordsText) return;
      try {
        await navigator.clipboard.writeText(coordsText);
        copyBtn.textContent = t('emergency.copied');
      } catch (err) {
        console.warn('[emergency] no se pudo copiar:', err.message);
      }
    });

    const shareBtn = backdrop.querySelector('#emergency-share');
    shareBtn?.addEventListener('click', async () => {
      if (!coordsText || !navigator.share) return;
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${pos.lat},${pos.lng}`;
      try {
        await navigator.share({ title: t('emergency.current_location'), text: coordsText, url: mapsUrl });
      } catch (err) {
        /* el usuario canceló el share sheet, no es un error */
      }
    });
  }

  function open() {
    render();
    backdrop.hidden = false;
  }

  function close() {
    backdrop.hidden = true;
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  // Delegación de eventos: el botón flotante global y el ítem del menú
  // "MÁS" existen en el DOM en momentos distintos del arranque.
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-emergency]')) open();
  });

  return { open, close };
}
