import { t, getLocale } from '../../utils/i18n.js';
import { formatKm, formatPending, formatTime, formatDistanceMeters, isStageActiveOn } from '../../utils/formatters.js';
import { icon } from '../components/icons.js';
import { renderLoading, renderError, renderEmpty } from '../components/state-views.js';
import { appStore } from '../../state/store.js';
import {
  startStage,
  pauseStage,
  resumeStage,
  finishStage,
  resetStageSession,
  computeElapsedMs,
} from '../../stage/stage-session.js';

let currentStageCtx = null;
let lastWidgetStatus = null;
let tickTimer = null;
let subscribed = false;

function findTodayStageIndex(stages) {
  const idx = stages.findIndex((stage) => isStageActiveOn(stage));
  return idx === -1 ? (stages.length ? 0 : -1) : idx;
}

export function renderTodayLoading(container) {
  container.innerHTML = renderLoading({ lines: 4 });
}

export function renderTodayError(container, message) {
  container.innerHTML = renderError({ message });
}

function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function renderSessionGpsLine(session) {
  const status = session.gpsStatus;
  if (status === 'denied') {
    return `<div class="cc-gps-chip cc-gps-chip--denied"><span class="cc-gps-chip-dot"></span>${t('gps.denied_title')}</div>
      <p class="cc-pending" style="margin:6px 0 0">${t('today.location_required')}</p>`;
  }
  if (status === 'timeout') {
    return `<div class="cc-gps-chip cc-gps-chip--timeout"><span class="cc-gps-chip-dot"></span>${t('gps.timeout')}</div>`;
  }
  if (status === 'unavailable') {
    return `<div class="cc-gps-chip cc-gps-chip--unavailable"><span class="cc-gps-chip-dot"></span>${t('gps.unavailable')}</div>`;
  }
  if (status !== 'active' || !session.lastFix) {
    return `<div class="cc-gps-chip cc-gps-chip--searching"><span class="cc-gps-chip-dot"></span>${t('gps.searching')}</div>`;
  }
  const locale = getLocale();
  const fix = session.lastFix;
  const parts = [t('gps.accuracy', { m: Math.round(fix.accuracy || 0) })];
  if (Number.isFinite(fix.speed)) {
    parts.push(`${t('today.current_speed')}: ${(fix.speed * 3.6).toFixed(1)} km/h`);
  }
  parts.push(t('gps.updated', { time: formatTime(new Date(fix.timestamp), locale) }));
  return `<div class="cc-gps-chip cc-gps-chip--active"><span class="cc-gps-chip-dot"></span>${parts.join(' · ')}</div>`;
}

function renderIdleWidget() {
  return `
    <button type="button" class="cc-btn cc-btn--primary" id="start-stage-btn">
      ${icon('walk')} ${t('today.start_stage')}
    </button>
  `;
}

function wireIdleWidget(ctx) {
  document.getElementById('start-stage-btn')?.addEventListener('click', () => {
    if (!ctx) return;
    startStage({ number: ctx.stageKey, origin: ctx.origin, destination: ctx.destination });
  });
}

function renderActiveWidget(session) {
  const paused = session.status === 'paused';
  const badgeText = paused ? t('today.paused_badge') : t('today.on_the_way');
  return `
    <div class="cc-badge" style="margin-bottom:10px; background:${paused ? 'var(--cc-cream)' : 'var(--cc-teal-dark)'}; color:${paused ? 'var(--cc-teal-dark)' : '#fff'};">${badgeText}</div>
    <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
      <span style="color:var(--cc-text-muted)">${t('today.elapsed_time')}</span>
      <strong id="stage-elapsed-value">${formatElapsed(computeElapsedMs(session))}</strong>
    </div>
    <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
      <span style="color:var(--cc-text-muted)">${t('today.distance_recorded')}</span>
      <strong id="stage-distance-value">${formatDistanceMeters(session.distanceMeters)}</strong>
    </div>
    <div id="stage-gps-line" style="margin-bottom:12px;">${renderSessionGpsLine(session)}</div>
    <div style="display:flex; gap:8px;">
      <button type="button" class="cc-btn cc-btn--secondary" id="stage-pause-resume-btn">${paused ? t('today.resume') : t('today.pause')}</button>
      <button type="button" class="cc-btn cc-btn--danger" id="stage-finish-btn">${t('today.finish_stage')}</button>
    </div>
  `;
}

function wireActiveWidget() {
  document.getElementById('stage-pause-resume-btn')?.addEventListener('click', () => {
    const session = appStore.getState().stageSession;
    if (session.status === 'paused') resumeStage();
    else pauseStage();
  });
  document.getElementById('stage-finish-btn')?.addEventListener('click', () => {
    if (window.confirm(t('today.confirm_finish'))) finishStage();
  });
}

function renderFinishedWidget(session) {
  const locale = getLocale();
  return `
    <div class="cc-badge" style="margin-bottom:10px;">${t('today.finished_badge')}</div>
    <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
      <span style="color:var(--cc-text-muted)">${t('today.started_at')}</span>
      <strong>${session.startedAt ? formatTime(new Date(session.startedAt), locale) : '—'}</strong>
    </div>
    <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
      <span style="color:var(--cc-text-muted)">${t('today.finished_at')}</span>
      <strong>${session.finishedAt ? formatTime(new Date(session.finishedAt), locale) : '—'}</strong>
    </div>
    <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
      <span style="color:var(--cc-text-muted)">${t('today.duration')}</span>
      <strong>${formatElapsed(computeElapsedMs(session))}</strong>
    </div>
    <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
      <span style="color:var(--cc-text-muted)">${t('today.distance_recorded')}</span>
      <strong>${formatDistanceMeters(session.distanceMeters)}</strong>
    </div>
    <button type="button" class="cc-btn cc-btn--secondary" id="stage-close-summary-btn">${t('today.close_summary')}</button>
  `;
}

function wireFinishedWidget() {
  document.getElementById('stage-close-summary-btn')?.addEventListener('click', () => resetStageSession());
}

function ensureTicking(status) {
  if (status === 'active') {
    if (tickTimer) return;
    tickTimer = setInterval(() => {
      const session = appStore.getState().stageSession;
      const el = document.getElementById('stage-elapsed-value');
      if (el && session.status === 'active') el.textContent = formatElapsed(computeElapsedMs(session));
    }, 1000);
  } else {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

function renderSessionWidget(ctx) {
  const widget = document.getElementById('stage-session-widget');
  if (!widget) return;
  const session = appStore.getState().stageSession;

  // Una sesión finalizada de una etapa que ya no es "la de hoy" no debe
  // quedarse bloqueando la pantalla: se limpia sola, sin borrar sesiones
  // activas o en pausa (esas las cierra siempre el peregrino).
  if (session.status === 'finished' && ctx && session.stageNumber !== ctx.stageKey) {
    resetStageSession();
    return;
  }

  lastWidgetStatus = session.status;
  ensureTicking(session.status);

  if (session.status === 'active' || session.status === 'paused') {
    widget.innerHTML = renderActiveWidget(session);
    wireActiveWidget();
  } else if (session.status === 'finished') {
    widget.innerHTML = renderFinishedWidget(session);
    wireFinishedWidget();
  } else {
    widget.innerHTML = renderIdleWidget();
    wireIdleWidget(ctx);
  }
}

function updateActiveWidgetLive(session) {
  const distanceEl = document.getElementById('stage-distance-value');
  if (distanceEl) distanceEl.textContent = formatDistanceMeters(session.distanceMeters);
  const gpsLineEl = document.getElementById('stage-gps-line');
  if (gpsLineEl) gpsLineEl.innerHTML = renderSessionGpsLine(session);
}

/**
 * Se suscribe una vez al store para mantener el widget de sesión al día
 * (tiempo, GPS, distancia) sin depender de que otra pantalla vuelva a
 * llamar a renderToday(). Debe llamarse una vez desde app.js#boot.
 */
export function initTodayScreen() {
  if (subscribed) return;
  subscribed = true;
  appStore.subscribe((state) => {
    const widget = document.getElementById('stage-session-widget');
    if (!widget) return;
    const session = state.stageSession;
    if (session.status !== lastWidgetStatus) {
      renderSessionWidget(currentStageCtx);
    } else if (session.status === 'active' || session.status === 'paused') {
      updateActiveWidgetLive(session);
    }
  });
}

export function renderToday(container, { pilgrim, stages }) {
  const locale = getLocale();
  const name = pilgrim?.name || formatPending(locale);

  if (!stages || stages.length === 0) {
    currentStageCtx = null;
    container.innerHTML = `
      <div class="cc-screen-header">
        <div>
          <div class="cc-eyebrow">${t('today.todays_stage')}</div>
          <h1>${t('today.greeting', { name })}</h1>
        </div>
      </div>
      ${renderEmpty({ title: t('today.no_stage_today'), iconName: 'route' })}
    `;
    return;
  }

  const idx = findTodayStageIndex(stages);
  const stage = stages[idx];
  const accommodation = stage.accommodation || {};
  const isPendingOrigin = !stage.origin;
  const isPendingDest = !stage.destination;

  currentStageCtx = {
    stageKey: stage.number ?? idx,
    origin: stage.origin || null,
    destination: stage.destination || null,
  };

  container.innerHTML = `
    <div class="cc-screen-header">
      <div>
        <div class="cc-eyebrow">${t('today.todays_stage')}</div>
        <h1>${t('today.greeting', { name })}</h1>
      </div>
    </div>

    <div class="cc-card">
      <div style="display:flex; align-items:center; gap:8px; font-family:var(--cc-font-heading); font-weight:800; font-size:1.15rem; margin-bottom:8px;">
        <span class="${isPendingOrigin ? 'cc-pending' : ''}">${stage.origin || formatPending(locale)}</span>
        <span class="cc-icon-chevron">${icon('chevronRight')}</span>
        <span class="${isPendingDest ? 'cc-pending' : ''}">${stage.destination || formatPending(locale)}</span>
      </div>
      <p style="margin-bottom:16px">${t('today.km_remaining', { km: formatKm(stage.km, locale) })}</p>
      <div id="stage-session-widget"></div>
    </div>

    <div class="cc-card">
      <div class="cc-eyebrow" style="margin-bottom:8px">${t('today.accommodation_tonight')}</div>
      <div style="font-weight:700" class="${accommodation.name ? '' : 'cc-pending'}">${accommodation.name || formatPending(locale)}</div>
      <div class="${accommodation.locality ? 'cc-text-muted' : 'cc-pending'}" style="color:var(--cc-text-muted); font-size:0.9rem;">${accommodation.locality || formatPending(locale)}</div>
    </div>
  `;

  renderSessionWidget(currentStageCtx);
}
