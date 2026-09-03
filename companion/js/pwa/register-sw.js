/*
 * Registro del Service Worker + estrategia segura de actualización.
 *
 * Objetivo (condición explícita de la Fase 1): que Osyris nunca se quede
 * usando datos/JS antiguos en caché tras publicar una actualización.
 *
 * Flujo:
 * 1. Se registra sw.js con scope "/companion/" (no puede tocar el resto
 *    del dominio).
 * 2. Cuando el navegador detecta un Service Worker nuevo y ya había uno
 *    controlando la página (es una actualización, no la primera visita),
 *    se muestra un aviso no intrusivo ("Nueva versión disponible").
 * 3. Al pulsar "Actualizar" se le pide al worker en espera que tome el
 *    control (mensaje SKIP_WAITING) y, en cuanto lo hace, se recarga la
 *    página una única vez.
 */
import { t } from '../utils/i18n.js';

function showUpdateToast(onUpdate) {
  const toast = document.getElementById('update-toast');
  if (!toast) return;
  toast.hidden = false;
  toast.querySelector('#update-toast-text').textContent = t('pwa.update_available');
  toast.querySelector('#update-toast-btn').textContent = t('pwa.update_now');
  toast.querySelector('#update-toast-btn').addEventListener('click', onUpdate, { once: true });
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('sw.js', { scope: './' });

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          const hasExistingController = Boolean(navigator.serviceWorker.controller);
          if (newWorker.state === 'installed' && hasExistingController) {
            showUpdateToast(() => {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            });
          }
        });
      });

      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    } catch (err) {
      console.warn('[pwa] no se pudo registrar el service worker:', err.message);
    }
  });
}
