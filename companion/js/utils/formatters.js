const PENDING_LABEL = { en: 'Pending', es: 'Pendiente de cargar' };

export function formatPending(locale = 'en') {
  return PENDING_LABEL[locale] || PENDING_LABEL.en;
}

export function formatKm(value, locale = 'en') {
  if (value === null || value === undefined || Number.isNaN(value)) return formatPending(locale);
  return `${value.toFixed(1)} km`;
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
