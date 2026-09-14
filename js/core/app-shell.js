// js/core/app-shell.js
//
// Phase 2 of the Lixa/Workspace refactor (see REFACTOR-NOTES.md).
//
// Responsibilities of this file:
//   1. Show the app shell (#appShell: Lixa + Workspace + bottom nav)
//      immediately on load, for EVERYONE — logged in or not. Per the
//      product decision made in Phase 2, Lixa is the front door and,
//      just like ask.html always did, does not require login to use.
//      (#marketingHome — the old hero/tool-grid/FAQ homepage — is kept
//      in the DOM but no longer shown by default. See REFACTOR-NOTES.md
//      for the SEO/marketing-landing tradeoff this implies.)
//   2. Wire the two-item bottom nav (Lixa | Workspace) to js/core/router.js.
//   3. Render the Workspace tool-launcher cards (real links to the
//      existing dedicated pages — doc.html, rom.html, project.html,
//      exam.html — exactly as index.html already linked to them).
//
// Lixa's actual chat UI is NOT rendered by this file — #lixaView's
// markup is now static HTML identical in structure to ask.html, and
// js/ask.js (loaded unmodified) runs against it directly. This file
// never touches #chatMessages/#messageInput/etc.

(function () {
  'use strict';

  const WORKSPACE_TOOLS = [
    {
      key: 'doc',
      title: 'Smart EMR',
      description: 'Clinical documentation, generated and organized for you.',
      href: 'doc.html',
      icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h6"/></svg>'
    },
    {
      key: 'rom',
      title: 'Motion & Gait',
      description: 'Video-based ROM and gait analysis.',
      href: 'rom.html',
      icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2"/><path d="M12 7v6l-3 7"/><path d="M12 13l4 7"/><path d="M9 11l6-1"/></svg>'
    },
    {
      key: 'project',
      title: 'Project Maker',
      description: 'Academic project chapters, built with you.',
      href: 'project.html',
      icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>'
    },
    {
      key: 'exam',
      title: 'Exam Simulator',
      description: 'Timed, AI-generated practice exams with feedback.',
      href: 'exam.html',
      icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>'
    }
  ];

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function renderWorkspaceView() {
    const mount = document.getElementById('workspaceCardsMount');
    if (!mount) return;

    const cardsHtml = WORKSPACE_TOOLS.map((tool) => `
      <a class="workspace-card" href="${tool.href}" data-tool="${tool.key}">
        <span class="workspace-card-icon" aria-hidden="true">${tool.icon}</span>
        <span class="workspace-card-body">
          <span class="workspace-card-title">${escapeHtml(tool.title)}</span>
          <span class="workspace-card-desc">${escapeHtml(tool.description)}</span>
        </span>
        <span class="workspace-card-arrow" aria-hidden="true">→</span>
      </a>
    `).join('');

    mount.innerHTML = `
      <div class="workspace-header">
        <h2 id="workspaceViewHeading">Workspace</h2>
        <p class="workspace-subtitle">Your professional tools</p>
      </div>
      <div class="workspace-grid">${cardsHtml}</div>
    `;

    WORKSPACE_TOOLS.forEach((tool) => {
      const card = mount.querySelector(`[data-tool="${tool.key}"]`);
      if (card && window.RehablixCenter && typeof window.RehablixCenter.logActivity === 'function') {
        card.addEventListener('click', () => {
          window.RehablixCenter.logActivity(tool.href, 'open_workspace_tool', tool.key);
        });
      }
    });
  }

  function switchView(viewName) {
    const lixaView = document.getElementById('lixaView');
    const workspaceView = document.getElementById('workspaceView');
    const navLixa = document.getElementById('navBtnLixa');
    const navWorkspace = document.getElementById('navBtnWorkspace');
    if (!lixaView || !workspaceView) return;

    const isLixa = viewName !== 'workspace';
    lixaView.style.display = isLixa ? '' : 'none';
    workspaceView.style.display = isLixa ? 'none' : '';

    if (navLixa && navWorkspace) {
      navLixa.classList.toggle('is-active', isLixa);
      navWorkspace.classList.toggle('is-active', !isLixa);
      navLixa.setAttribute('aria-current', isLixa ? 'page' : 'false');
      navWorkspace.setAttribute('aria-current', !isLixa ? 'page' : 'false');
    }

    // Focus the message box when landing on Lixa, matching ask.html's own
    // behavior (skipped on touch devices so the keyboard doesn't pop up
    // unprompted).
    if (isLixa) {
      const isMobile = window.matchMedia('(pointer: coarse)').matches;
      const input = document.getElementById('messageInput');
      if (input && !isMobile) input.focus();
    }
  }

  function updateNavbarHeightVar() {
    const navbar = document.querySelector('body.app-shell-active > .navbar');
    if (!navbar) return;
    const h = Math.ceil(navbar.getBoundingClientRect().height);
    if (h > 0) document.documentElement.style.setProperty('--rehablix-navbar-h', h + 'px');
  }

  function init() {
    const appShell = document.getElementById('appShell');
    const marketingHome = document.getElementById('marketingHome');
    if (!appShell) return;

    // Marketing/SEO homepage escape hatch (Phase 9: FAQ/pricing content
    // was folded into Workspace directly, so this now just shows the
    // hero/search/tool-grid marketing page — index.html?marketing=1,
    // not linked from the app shell's UI. Not a bottom-nav item (the
    // brief is explicit: Lixa | Workspace only). The marketing page
    // itself has a "← Back to rehablix" link to return to the app.
    if (new URLSearchParams(window.location.search).get('marketing') === '1') {
      if (marketingHome) marketingHome.style.display = '';
      appShell.style.display = 'none';
      return;
    }

    document.body.classList.add('app-shell-active');
    if (marketingHome) marketingHome.style.display = 'none';
    appShell.style.display = '';

    // #appShell is position:fixed and needs the navbar's real rendered
    // height so it starts exactly below it, rather than overlapping or
    // leaving a gap. Re-measured on resize for orientation changes /
    // dynamic mobile toolbars.
    updateNavbarHeightVar();
    window.addEventListener('resize', updateNavbarHeightVar);

    renderWorkspaceView();

    const navLixa = document.getElementById('navBtnLixa');
    const navWorkspace = document.getElementById('navBtnWorkspace');
    if (navLixa) navLixa.addEventListener('click', () => window.RehablixRouter.go('lixa'));
    if (navWorkspace) navWorkspace.addEventListener('click', () => window.RehablixRouter.go('workspace'));

    window.RehablixRouter.init({
      views: ['lixa', 'workspace'],
      default: 'lixa',
      onChange: switchView
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
