import { t } from '../../utils/i18n.js';
import { icon } from './icons.js';

export function renderLocationConsentCard() {
  return `
    <div class="cc-card cc-location-consent" id="location-consent">
      <div style="display:flex; gap:10px; align-items:flex-start">
        ${icon('locationArrow')}
        <div style="flex:1">
          <p style="margin:0 0 12px">${t('privacy.location_consent_body')}</p>
          <div style="display:flex; gap:8px">
            <button type="button" class="cc-btn cc-btn--primary cc-btn--sm" id="location-consent-enable">${t('privacy.enable_location')}</button>
            <button type="button" class="cc-btn cc-btn--ghost cc-btn--sm" id="location-consent-dismiss">${t('privacy.not_now')}</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
