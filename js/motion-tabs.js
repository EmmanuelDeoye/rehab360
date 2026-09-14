// js/motion-tabs.js
// Switches the merged Motion & Gait Analyzer page (rom.html) between its
// two modes — "rom" and "gait" — driven by data-active-mode on <body>,
// which CSS (motion-merge.css) uses to show/hide .rom-only / .gait-only
// elements. Also stops whichever camera is running when the user switches
// away from its mode, and keeps the URL's ?mode= param in sync.

(function () {
  function initMotionTabs() {
    const tabRom = document.getElementById('modeTabRom');
    const tabGait = document.getElementById('modeTabGait');
    if (!tabRom || !tabGait) return; // not on the merged page

    function setMode(mode, updateUrl) {
      const finalMode = mode === 'gait' ? 'gait' : 'rom';
      document.body.setAttribute('data-active-mode', finalMode);

      tabRom.classList.toggle('active', finalMode === 'rom');
      tabGait.classList.toggle('active', finalMode === 'gait');
      tabRom.setAttribute('aria-selected', finalMode === 'rom');
      tabGait.setAttribute('aria-selected', finalMode === 'gait');

      if (updateUrl) {
        const url = new URL(window.location.href);
        if (finalMode === 'rom') {
          url.searchParams.delete('mode');
        } else {
          url.searchParams.set('mode', finalMode);
        }
        window.history.replaceState({}, '', url);
      }

      // Let rom.js / gait.js know so they can stop an active camera/scan
      // when their mode is no longer visible.
      window.dispatchEvent(new CustomEvent('rehablix:modechange', { detail: { mode: finalMode } }));
    }

    tabRom.addEventListener('click', () => setMode('rom', true));
    tabGait.addEventListener('click', () => setMode('gait', true));

    const initialMode = new URLSearchParams(window.location.search).get('mode') === 'gait' ? 'gait' : 'rom';
    setMode(initialMode, false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMotionTabs);
  } else {
    initMotionTabs();
  }
})();
