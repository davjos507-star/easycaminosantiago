export function initBottomSheet(rootId) {
  const root = document.getElementById(rootId);
  if (!root) return null;

  const handle = root.querySelector('.cc-sheet-handle');
  const summary = root.querySelector('.cc-sheet-summary');
  const body = root.querySelector('.cc-sheet-body');

  function toggle() {
    root.classList.toggle('cc-sheet--expanded');
    handle.setAttribute('aria-expanded', root.classList.contains('cc-sheet--expanded'));
    updateLiveHeight();
  }

  function setExpanded(expanded) {
    root.classList.toggle('cc-sheet--expanded', expanded);
    handle.setAttribute('aria-expanded', expanded);
    updateLiveHeight();
  }

  /*
   * Publica la altura REALMENTE visible de la hoja como variable CSS
   * (--cc-sheet-live-height), para que los controles flotantes del mapa
   * (botón de centrar, FAB de ayuda) puedan colocarse siempre justo por
   * encima de ella sin importar cuánto contenido tenga en cada momento
   * ("Cargando…", una distancia, el chip de GPS, un aviso de error…) ni
   * el ancho de pantalla. Nunca una posición fija pensada para un solo
   * contenido: se mide el DOM real en cada cambio.
   *
   * Colapsada, el alto visible es el "peek" (token --cc-sheet-peek);
   * expandida, es el alto real de la hoja (root.offsetHeight ya respeta
   * su max-height y el scroll interno del body).
   */
  function updateLiveHeight() {
    const expanded = root.classList.contains('cc-sheet--expanded');
    if (expanded) {
      document.documentElement.style.setProperty('--cc-sheet-live-height', `${root.offsetHeight}px`);
    } else {
      const peek = getComputedStyle(document.documentElement).getPropertyValue('--cc-sheet-peek').trim() || '88px';
      document.documentElement.style.setProperty('--cc-sheet-live-height', peek);
    }
  }

  handle?.addEventListener('click', toggle);

  // Captura cambios de alto por contenido (setSummary/setBody) mientras
  // está expandida, sin que cada pantalla tenga que acordarse de avisar.
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(updateLiveHeight).observe(root);
  }
  updateLiveHeight();

  return {
    setSummary(html) {
      if (summary) summary.innerHTML = html;
    },
    setBody(html) {
      if (body) body.innerHTML = html;
    },
    expand: () => setExpanded(true),
    collapse: () => setExpanded(false),
    show: () => { root.hidden = false; },
    hide: () => { root.hidden = true; },
  };
}
