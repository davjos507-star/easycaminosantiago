export function initBottomSheet(rootId) {
  const root = document.getElementById(rootId);
  if (!root) return null;

  const handle = root.querySelector('.cc-sheet-handle');
  const summary = root.querySelector('.cc-sheet-summary');
  const body = root.querySelector('.cc-sheet-body');

  function toggle() {
    root.classList.toggle('cc-sheet--expanded');
    handle.setAttribute('aria-expanded', root.classList.contains('cc-sheet--expanded'));
  }

  function setExpanded(expanded) {
    root.classList.toggle('cc-sheet--expanded', expanded);
    handle.setAttribute('aria-expanded', expanded);
  }

  handle?.addEventListener('click', toggle);

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
