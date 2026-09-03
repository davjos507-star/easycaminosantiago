/*
 * Set propio de iconos SVG en línea (sin librería externa, sin emojis).
 * Trazo uniforme 1.8, viewBox 24x24, color heredado (currentColor) para
 * funcionar igual en modo claro/oscuro.
 */

const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

const ICONS = {
  today: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5"/><path d="M7.8 13.2l1.9 1.9 3.8-3.9"/></svg>`,
  map: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M9 4.5 4 6.5v13l5-2 6 2 5-2v-13l-5 2-6-2Z"/><path d="M9 4.5v13M15 6.5v13"/></svg>`,
  route: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="6" cy="6" r="2.3"/><circle cx="18" cy="18" r="2.3"/><path d="M6 8.3v3.2a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4"/></svg>`,
  bed: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7"/><path d="M3 18v2.5M21 18v2.5"/><path d="M3 13V8.5a1.5 1.5 0 0 1 1.5-1.5H9a1.5 1.5 0 0 1 1.5 1.5V13"/></svg>`,
  more: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>`,
  chevronUp: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M6 15l6-6 6 6"/></svg>`,
  chevronDown: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M6 9l6 6 6-6"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M9 6l6 6-6 6"/></svg>`,
  locationArrow: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M12 3l7.5 17-7.5-4-7.5 4L12 3Z"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M6.5 4h3l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4Z"/></svg>`,
  share: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="18" cy="5.5" r="2.3"/><circle cx="6" cy="12" r="2.3"/><circle cx="18" cy="18.5" r="2.3"/><path d="M8.1 10.8l7.8-4.4M8.1 13.2l7.8 4.4"/></svg>`,
  close: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M12 4.5 21 19H3L12 4.5Z"/><path d="M12 10.5v4M12 17h.01"/></svg>`,
  wifiOff: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M3 8.5a16 16 0 0 1 5-3M21 8.5a16 16 0 0 0-5.6-3.3M6.5 12.3a10 10 0 0 1 3-1.6M17.5 12.3a10 10 0 0 0-2-1.3"/><path d="M9.5 16a5 5 0 0 1 5 0"/><circle cx="12" cy="19.2" r="1" fill="currentColor" stroke="none"/><path d="M3 3l18 18"/></svg>`,
  checkCircle: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.6 2.6L16.2 9"/></svg>`,
  circle: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="12" r="9"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M12 3.5 19 6v6c0 5-3 8-7 9-4-1-7-4-7-9V6l7-2.5Z"/></svg>`,
  download: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M12 4v11m0 0 4-4m-4 4-4-4"/><path d="M5 19.5h14"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z"/><circle cx="12" cy="9" r="2.3"/></svg>`,
  walk: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="13" cy="4.5" r="1.6" fill="currentColor" stroke="none"/><path d="M10 9l2.5-1.5L15 9l2 2.5M9 21l2-6 1.5-3M12 15l3 2 2 4"/></svg>`,
  info: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 8h.01"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M6 18.5 4.5 21l2.6-1.4A8 8 0 1 0 4 12a7.9 7.9 0 0 0 1.2 4.2L6 18.5Z"/><path d="M9 10c0 3 2 5 5 5 .6 0 1-.3 1-1v-.8c0-.3-.2-.5-.5-.6l-1.6-.4c-.2 0-.4 0-.5.2l-.4.5a4.6 4.6 0 0 1-2.4-2.4l.5-.4c.2-.1.2-.3.2-.5L10 8.5c-.1-.3-.3-.5-.6-.5H8.6c-.6 0-1 .4-1 1"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/></svg>`,
};

export function icon(name) {
  const svg = ICONS[name];
  if (!svg) {
    console.warn(`[icons] "${name}" no existe`);
    return '';
  }
  return svg;
}

export const ICON_NAMES = Object.keys(ICONS);
