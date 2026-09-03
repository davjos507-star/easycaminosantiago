import { qsa } from './utils/dom.js';

const VALID_SCREENS = ['today', 'map', 'camino', 'stays', 'more'];
const DEFAULT_SCREEN = 'today';

function screenFromHash() {
  const hash = window.location.hash.replace('#', '');
  return VALID_SCREENS.includes(hash) ? hash : DEFAULT_SCREEN;
}

export function initRouter({ onNavigate } = {}) {
  function render() {
    const screen = screenFromHash();
    qsa('[data-screen]').forEach((el) => {
      el.hidden = el.dataset.screen !== screen;
    });
    qsa('.cc-nav-item').forEach((el) => {
      el.setAttribute('aria-current', el.dataset.navTarget === screen ? 'page' : 'false');
    });
    onNavigate?.(screen);
  }

  qsa('.cc-nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.location.hash = btn.dataset.navTarget;
    });
  });

  window.addEventListener('hashchange', render);
  render();
}

export function navigateTo(screen) {
  if (VALID_SCREENS.includes(screen)) window.location.hash = screen;
}
