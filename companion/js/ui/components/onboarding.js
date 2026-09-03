import { t } from '../../utils/i18n.js';
import { icon } from './icons.js';
import { getString, setString, KEYS } from '../../state/storage.js';

const SLIDES = [
  { icon: 'route', titleKey: 'onboarding.slide1_title', bodyKey: 'onboarding.slide1_body' },
  { icon: 'bed', titleKey: 'onboarding.slide2_title', bodyKey: 'onboarding.slide2_body' },
  { icon: 'locationArrow', titleKey: 'onboarding.slide3_title', bodyKey: 'onboarding.slide3_body' },
];

export function initOnboarding() {
  const root = document.getElementById('onboarding');
  if (!root) return;

  if (getString(KEYS.ONBOARDING_DONE) === '1') {
    root.hidden = true;
    return;
  }

  let index = 0;

  root.innerHTML = `
    <div class="cc-onboarding-slides">
      ${SLIDES.map(
        (slide, i) => `
        <div class="cc-onboarding-slide${i === 0 ? ' cc-is-active' : ''}" data-slide="${i}">
          ${icon(slide.icon)}
          <h2>${t(slide.titleKey)}</h2>
          <p>${t(slide.bodyKey)}</p>
        </div>`
      ).join('')}
    </div>
    <div class="cc-onboarding-dots">
      ${SLIDES.map((_, i) => `<span class="cc-onboarding-dot${i === 0 ? ' cc-is-active' : ''}" data-dot="${i}"></span>`).join('')}
    </div>
    <button type="button" class="cc-btn cc-btn--accent" id="onboarding-cta">${t('onboarding.start')}</button>
  `;

  const slides = Array.from(root.querySelectorAll('[data-slide]'));
  const dots = Array.from(root.querySelectorAll('[data-dot]'));
  const cta = root.querySelector('#onboarding-cta');

  function render() {
    slides.forEach((el, i) => el.classList.toggle('cc-is-active', i === index));
    dots.forEach((el, i) => el.classList.toggle('cc-is-active', i === index));
    cta.textContent = index === SLIDES.length - 1 ? t('onboarding.start') : t('onboarding.next');
  }

  function finish() {
    setString(KEYS.ONBOARDING_DONE, '1');
    root.hidden = true;
  }

  cta.addEventListener('click', () => {
    if (index < SLIDES.length - 1) {
      index += 1;
      render();
    } else {
      finish();
    }
  });

  root.hidden = false;
  render();
}
