/*
 * Soporte opcional de orientación/brújula para la flecha de dirección
 * sobre el punto azul. Progresivo: si el dispositivo o el navegador no
 * lo permiten, la app sigue funcionando con un punto sin flecha — nunca
 * debe bloquear el uso del mapa.
 */

export function isOrientationSupported() {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}

function needsExplicitPermission() {
  return typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
}

/**
 * En iOS 13+ debe llamarse de forma síncrona dentro de un gesto del
 * usuario (p. ej. el mismo click que activa el GPS), igual que
 * navigator.geolocation. Si el navegador no lo requiere (Android, iOS
 * antiguo), se resuelve `true` sin pedir nada.
 */
export async function requestOrientationPermission() {
  if (!isOrientationSupported()) return false;
  if (!needsExplicitPermission()) return true;
  try {
    const result = await DeviceOrientationEvent.requestPermission();
    return result === 'granted';
  } catch (err) {
    return false;
  }
}

/**
 * @returns {() => void} función para dejar de escuchar.
 */
export function watchHeading(onHeading) {
  if (!isOrientationSupported()) return () => {};

  function handler(event) {
    // iOS expone webkitCompassHeading (ya en grados desde el norte real).
    // El resto de navegadores exponen `alpha` (heading relativo al eje Z);
    // con `absolute: true` puede aproximarse al norte magnético.
    const heading = typeof event.webkitCompassHeading === 'number'
      ? event.webkitCompassHeading
      : event.absolute && event.alpha != null
        ? 360 - event.alpha
        : null;
    if (heading != null && Number.isFinite(heading)) onHeading(heading);
  }

  window.addEventListener('deviceorientationabsolute', handler, true);
  window.addEventListener('deviceorientation', handler, true);
  return () => {
    window.removeEventListener('deviceorientationabsolute', handler, true);
    window.removeEventListener('deviceorientation', handler, true);
  };
}
