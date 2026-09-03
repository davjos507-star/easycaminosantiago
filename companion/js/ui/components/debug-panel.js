/*
 * Panel de diagnóstico opcional para desarrollo (?debug=1).
 *
 * Nada de lo que se muestra aquí se guarda (ni localStorage ni memoria
 * propia: se lee en directo de appStore/mapEngine en cada refresco) ni se
 * envía a ningún servidor. "COPY DEBUG INFO" solo copia al portapapeles
 * del propio dispositivo, para que el peregrino/tester pueda pegarlo en
 * un mensaje si algo falla.
 */
import { isDebugEnabled } from '../../utils/debug.js';
import { appStore } from '../../state/store.js';
import { formatTime } from '../../utils/formatters.js';

const REFRESH_MS = 1000;

let mapEngineRef = null;
let panelEl = null;
let expanded = false;

function collect() {
  const state = appStore.getState();
  const gps = state.gps;
  const pos = gps.lastPosition;
  const mapInfo = mapEngineRef?.getDebugInfo?.() || {};

  return {
    lat: pos?.lat ?? null,
    lng: pos?.lng ?? null,
    accuracy: pos?.accuracy ?? null,
    heading: pos?.heading ?? null,
    speed: pos?.speed ?? null,
    gpsStatus: gps.status,
    gpsPermission: gps.permission,
    followMode: Boolean(state.followMode),
    lastFixAt: pos?.timestamp ? `${formatTime(new Date(pos.timestamp))} (${new Date(pos.timestamp).toISOString()})` : null,
    online: state.online,
    mapProvider: mapInfo.provider ?? null,
    styleUrl: mapInfo.styleUrl ?? null,
    styleLoaded: mapInfo.styleLoaded ?? false,
    zoom: mapInfo.zoom ?? null,
    tileErrorCount: mapInfo.tileErrorCount ?? 0,
    maplibreVersion: mapInfo.maplibreVersion ?? null,
  };
}

function fmt(value) {
  if (value === null || value === undefined) return '—';
  return String(value);
}

function buildCopyText(d) {
  const lines = [
    'Easy Camino Companion — DEBUG INFO',
    `generated_at: ${new Date().toISOString()}`,
    '',
    `lat: ${fmt(d.lat)}`,
    `lng: ${fmt(d.lng)}`,
    `accuracy_m: ${fmt(d.accuracy)}`,
    `heading: ${fmt(d.heading)}`,
    `speed: ${fmt(d.speed)}`,
    `gps_status: ${fmt(d.gpsStatus)}`,
    `gps_permission: ${fmt(d.gpsPermission)}`,
    `follow_mode: ${fmt(d.followMode)}`,
    `last_fix_at: ${fmt(d.lastFixAt)}`,
    `online: ${fmt(d.online)}`,
    '',
    `map_provider: ${fmt(d.mapProvider)}`,
    `map_style_url: ${fmt(d.styleUrl)}`,
    `style_loaded: ${fmt(d.styleLoaded)}`,
    `zoom: ${fmt(d.zoom)}`,
    `tile_error_count: ${fmt(d.tileErrorCount)}`,
    `maplibre_version: ${fmt(d.maplibreVersion)}`,
    '',
    `user_agent: ${navigator.userAgent}`,
  ];
  return lines.join('\n');
}

function render() {
  if (!panelEl) return;
  const d = collect();

  if (!expanded) {
    panelEl.innerHTML = `<button type="button" class="cc-debug-toggle" id="ecc-debug-toggle">DEBUG</button>`;
    document.getElementById('ecc-debug-toggle')?.addEventListener('click', () => {
      expanded = true;
      render();
    });
    return;
  }

  const rows = [
    ['lat', fmt(d.lat)],
    ['lng', fmt(d.lng)],
    ['accuracy', d.accuracy != null ? `${d.accuracy.toFixed(1)} m` : '—'],
    ['heading', fmt(d.heading)],
    ['speed', fmt(d.speed)],
    ['gps status', fmt(d.gpsStatus)],
    ['gps permission', fmt(d.gpsPermission)],
    ['followMode', fmt(d.followMode)],
    ['last fix', d.lastFixAt || '—'],
    ['online', fmt(d.online)],
    ['provider', fmt(d.mapProvider)],
    ['style loaded', fmt(d.styleLoaded)],
    ['zoom', fmt(d.zoom)],
    ['tile errors', fmt(d.tileErrorCount)],
    ['maplibre', fmt(d.maplibreVersion)],
  ];

  panelEl.innerHTML = `
    <div class="cc-debug-header">
      <strong>DEBUG</strong>
      <button type="button" class="cc-debug-close" id="ecc-debug-collapse" aria-label="Collapse">×</button>
    </div>
    <dl class="cc-debug-grid">
      ${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}
    </dl>
    <button type="button" class="cc-btn cc-btn--secondary cc-btn--sm" id="ecc-debug-copy">COPY DEBUG INFO</button>
  `;

  document.getElementById('ecc-debug-collapse')?.addEventListener('click', () => {
    expanded = false;
    render();
  });
  document.getElementById('ecc-debug-copy')?.addEventListener('click', async (e) => {
    const text = buildCopyText(d);
    const btn = e.currentTarget;
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'COPIED';
      setTimeout(() => { btn.textContent = 'COPY DEBUG INFO'; }, 1500);
    } catch (err) {
      console.warn('[debug-panel] no se pudo copiar:', err.message);
    }
  });
}

export function initDebugPanel() {
  if (!isDebugEnabled()) return; // Sin ?debug=1 no se crea ningún nodo en el DOM.

  panelEl = document.createElement('div');
  panelEl.id = 'ecc-debug-panel';
  panelEl.className = 'cc-debug-panel';
  document.body.appendChild(panelEl);

  render();
  setInterval(render, REFRESH_MS);
  appStore.subscribe(() => { if (expanded) render(); });
}

export function setDebugMapEngine(mapEngine) {
  mapEngineRef = mapEngine;
}
