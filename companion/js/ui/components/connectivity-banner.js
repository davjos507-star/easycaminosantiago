import { t } from '../../utils/i18n.js';
import { appStore } from '../../state/store.js';

export function initConnectivityBanner() {
  const banner = document.getElementById('connectivity-banner');
  const dot = banner?.querySelector('.cc-connectivity-dot');
  const label = document.getElementById('connectivity-text');
  if (!banner || !label) return;

  let hideTimer = null;

  function render(online, { transient }) {
    label.textContent = online ? t('connectivity.online') : t('connectivity.offline');
    banner.classList.toggle('cc-connectivity-banner--offline', !online);
    banner.hidden = false;
    clearTimeout(hideTimer);
    if (transient) {
      hideTimer = setTimeout(() => {
        banner.hidden = true;
      }, 2500);
    }
  }

  function update(online, { transient = false } = {}) {
    appStore.setState({ online });
    render(online, { transient });
  }

  window.addEventListener('online', () => update(true, { transient: true }));
  window.addEventListener('offline', () => update(false, { transient: false }));

  if (!navigator.onLine) update(false, { transient: false });
  void dot;
}
