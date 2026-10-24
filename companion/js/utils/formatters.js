const PENDING_LABEL = { en: 'Pending', es: 'Pendiente de cargar' };

export function formatPending(locale = 'en') {
  return PENDING_LABEL[locale] || PENDING_LABEL.en;
}

export function formatKm(value, locale = 'en') {
  if (value === null || value === undefined || Number.isNaN(value)) return formatPending(locale);
  const text = value.toFixed(1);
  return `${locale === 'es' ? text.replace('.', ',') : text} km`;
}

// Distancia medida realmente (GPS registrado en EN CAMINO, o restante por
// una ruta calculada en "Llévame al alojamiento") — nunca una distancia
// oficial del Camino ni un porcentaje. Ver stage/stage-session.js y
// accommodation/accommodation-nav.js.
export function formatDistanceMeters(meters, locale = 'en') {
  if (!Number.isFinite(meters)) return formatPending(locale);
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatPercentage(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Math.round(value)}%`;
}

export function formatDate(isoDate, locale = 'en') {
  if (!isoDate) return formatPending(locale);
  try {
    const date = new Date(`${isoDate}T00:00:00`);
    return new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(date);
  } catch (err) {
    return isoDate;
  }
}

// "domingo, 25 de octubre de 2026" — día de la semana y fecha completa.
// Con { year: false }: "domingo 25 de octubre".
export function formatLongDate(isoDate, locale = 'en', { year = true } = {}) {
  if (!isoDate) return formatPending(locale);
  try {
    const date = new Date(`${isoDate}T00:00:00`);
    const formatted = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      ...(year ? { year: 'numeric' } : {}),
    }).format(date);
    return year ? formatted : formatted.replace(',', '');
  } catch (err) {
    return isoDate;
  }
}

export function formatTime(date = new Date(), locale = 'en') {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function isSameLocalDate(isoDate, referenceDate = new Date()) {
  if (!isoDate) return false;
  const [y, m, d] = isoDate.split('-').map(Number);
  return (
    y === referenceDate.getFullYear() &&
    m === referenceDate.getMonth() + 1 &&
    d === referenceDate.getDate()
  );
}

export function toLocalIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * True if `referenceDate` falls anywhere within a stage's stay — from
 * `stage.date` (check-in / walking day) up to but not including
 * `stage.checkOutDate` — not just on the exact check-in day. Needed for
 * multi-night stays (rest days): e.g. a 2-night stage is still "today"
 * on its rest day, not only on the day the peregrino walks in.
 * Falls back to an exact-day match if the stage has no checkOutDate
 * (older/placeholder single-date stages).
 */
export function isStageActiveOn(stage, referenceDate = new Date()) {
  if (!stage?.date) return false;
  if (!stage.checkOutDate) return isSameLocalDate(stage.date, referenceDate);
  const ref = toLocalIsoDate(referenceDate);
  return ref >= stage.date && ref < stage.checkOutDate;
}
