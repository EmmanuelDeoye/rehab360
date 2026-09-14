// js/index-center.js
// Homepage behavior driven by the user's active center workspace:
// a "Welcome to {center}" banner, hiding tools they don't have access to,
// and a navbar switcher for moving between their personal account and any
// center(s) they own or belong to.

document.addEventListener('DOMContentLoaded', () => {
  const banner = document.getElementById('centerContextBanner');
  const switcherWrap = document.getElementById('workspaceSwitcher');
  const switcherBtn = document.getElementById('workspaceSwitcherBtn');
  const switcherLabel = document.getElementById('workspaceSwitcherLabel');
  const switcherMenu = document.getElementById('workspaceSwitcherMenu');

  // Maps a homepage card's data-tool value to the permission key used by
  // center.js. Cards not listed here (e.g. the Assessment Format Generator)
  // aren't gated by center permissions yet, so they're always shown.
  const CARD_TOOL_MAP = {
    documentation: 'doc',
    audio: 'audio',
    rom: 'rom',
    presentation: 'presentation',
    assignment: 'assignment',
    project: 'project',
    study: 'study',
    exam: 'exam'
  };

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function applyToolVisibility(ctx) {
    const cards = document.querySelectorAll('.tool-card-link');
    cards.forEach(card => {
      const toolAttr = card.getAttribute('data-tool');
      const permKey = CARD_TOOL_MAP[toolAttr];
      let visible = true;

      if (permKey && ctx.isActiveContextCenter && ctx.centerId !== ctx.ownCenterId) {
        // Operating as a member (not owner) of a center — respect their per-tool permissions.
        visible = !(ctx.permissions && ctx.permissions[permKey] === false);
      }
      card.style.display = visible ? '' : 'none';
    });
  }

  function showWelcomeBanner(centerName) {
    banner.style.display = 'block';
    banner.innerHTML = `🏢 Welcome to <strong>${escapeHtml(centerName)}</strong>`;
  }

  function hideWelcomeBanner() {
    banner.style.display = 'none';
    banner.innerHTML = '';
  }

  async function renderSwitcher(ctx) {
    const options = await window.RehablixCenter.getAvailableContexts();
    if (options.length <= 1) {
      switcherWrap.style.display = 'none';
      return;
    }

    switcherWrap.style.display = 'block';
    const current = options.find(o => o.id === ctx.activeContext) || options[0];
    switcherLabel.textContent = current.label;

    switcherMenu.innerHTML = options.map(o => `
      <button type="button" class="workspace-option ${o.id === ctx.activeContext ? 'active' : ''}" data-context="${o.id}">
        <span class="workspace-option-icon">${o.type === 'individual' ? '👤' : o.type === 'owner' ? '👑' : '🏥'}</span>
        <span>${escapeHtml(o.label)}</span>
        ${o.id === ctx.activeContext ? '<span class="workspace-option-check">✓</span>' : ''}
      </button>
    `).join('');

    switcherMenu.querySelectorAll('.workspace-option').forEach(btn => {
      btn.addEventListener('click', async () => {
        const contextId = btn.getAttribute('data-context');
        if (contextId === ctx.activeContext) { switcherMenu.classList.remove('open'); return; }
        try {
          await window.RehablixCenter.switchActiveContext(contextId);
          window.location.reload();
        } catch (err) {
          console.error('Could not switch workspace:', err);
        }
      });
    });
  }

  switcherBtn?.addEventListener('click', () => {
    switcherMenu.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (switcherWrap && !switcherWrap.contains(e.target)) {
      switcherMenu?.classList.remove('open');
    }
  });

  async function init() {
    if (!window.RehablixCenter) { setTimeout(init, 150); return; }
    const ctx = await window.RehablixCenter.getContext();
    if (!ctx.loggedIn) { hideWelcomeBanner(); return; }

    if (ctx.isActiveContextCenter) {
      showWelcomeBanner(ctx.activeCenterName || 'your center');
    } else {
      hideWelcomeBanner();
    }
    applyToolVisibility(ctx);
    renderSwitcher(ctx);
  }

  firebase.auth().onAuthStateChanged(() => init());
});
