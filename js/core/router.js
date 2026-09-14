// js/core/router.js
//
// Tiny hash-based view router for the authenticated app shell (Lixa /
// Workspace). Deliberately minimal per the refactor brief: no framework,
// no history-library dependency. It only manages which *view* is active
// inside index.html — it does not touch navigation between dedicated
// pages like doc.html/rom.html (those are plain links/redirects).
//
// Coexists safely with js/auth.js's history.pushState/replaceState
// override (used there for page-view analytics) because this router only
// reads/writes location.hash and listens for 'hashchange'; it never calls
// pushState/replaceState itself.

(function () {
  const HASH_PREFIX = '#/';
  let views = [];
  let defaultView = null;
  let currentView = null;
  let onChange = function () {};

  function parseHash() {
    const raw = (window.location.hash || '').replace(HASH_PREFIX, '').replace('#', '');
    return raw || null;
  }

  function isValid(view) {
    return views.indexOf(view) !== -1;
  }

  function go(view, opts) {
    opts = opts || {};
    if (!isValid(view)) view = defaultView;
    currentView = view;
    const newHash = HASH_PREFIX + view;
    if (window.location.hash !== newHash) {
      if (opts.replace) {
        window.location.replace(window.location.pathname + window.location.search + newHash);
      } else {
        window.location.hash = newHash;
      }
    }
    onChange(currentView);
  }

  function handleHashChange() {
    const parsed = parseHash();
    const view = isValid(parsed) ? parsed : defaultView;
    currentView = view;
    onChange(currentView);
  }

  function init(config) {
    views = config.views || [];
    defaultView = config.default || views[0];
    onChange = config.onChange || function () {};

    window.addEventListener('hashchange', handleHashChange);

    const initial = parseHash();
    go(isValid(initial) ? initial : defaultView, { replace: true });
  }

  window.RehablixRouter = {
    init: init,
    go: go,
    current: function () { return currentView; }
  };
})();
