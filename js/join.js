// js/join.js
// Drives join.html: resolves the ?c=slug in the URL to a center, then
// routes the visitor based on who they are — owner, active member,
// revoked member, or a stranger who isn't part of this center at all.

document.addEventListener('DOMContentLoaded', () => {
  const card = document.getElementById('joinCard');
  const params = new URLSearchParams(window.location.search);
  const slug = (params.get('c') || params.get('slug') || '').trim().toLowerCase();

  function render(html) {
    card.innerHTML = html;
  }

  function renderNotFound() {
    render(`
      <div class="join-icon"><i class="fas fa-link-slash"></i></div>
      <h2>Link not found</h2>
      <p>We couldn't find a center at this link. Double-check the address, or ask your center admin for the correct one.</p>
      <a href="index.html" class="btn-primary">Go to rehablix</a>
    `);
  }

  function renderNeedsLogin(centerName) {
    render(`
      <div class="join-icon"><i class="fas fa-hospital"></i></div>
      <h2>${escapeHtml(centerName)}</h2>
      <p>Sign in with the email your center admin invited to get access to your team's tools and shared patient records.</p>
      <button class="btn-primary" id="joinLoginBtn"><i class="fas fa-right-to-bracket"></i> Sign In / Register</button>
    `);
    document.getElementById('joinLoginBtn')?.addEventListener('click', () => {
      document.getElementById('loginBtn')?.click();
    });
  }

  function renderNoAccess(centerName) {
    render(`
      <div class="join-icon join-icon-warn"><i class="fas fa-user-lock"></i></div>
      <h2>No access yet</h2>
      <p>You're signed in, but this account doesn't have access to <strong>${escapeHtml(centerName)}</strong>. Ask the center admin to invite this email address, then reload this link.</p>
      <a href="index.html" class="btn-secondary">Go to rehablix</a>
    `);
  }

  function renderRevoked(centerName) {
    render(`
      <div class="join-icon join-icon-warn"><i class="fas fa-user-lock"></i></div>
      <h2>Access paused</h2>
      <p>Your access to <strong>${escapeHtml(centerName)}</strong> has been turned off by your center admin. Reach out to them to have it restored.</p>
      <a href="index.html" class="btn-secondary">Go to rehablix</a>
    `);
  }

  function renderWelcome(centerName, destinationLabel) {
    render(`
      <div class="join-icon join-icon-success"><i class="fas fa-circle-check"></i></div>
      <h2>Welcome to ${escapeHtml(centerName)}</h2>
      <p>Taking you to ${escapeHtml(destinationLabel)}…</p>
    `);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  async function resolve() {
    if (!slug) { renderNotFound(); return; }
    if (!window.RehablixCenter) { setTimeout(resolve, 150); return; } // center.js still loading

    let center;
    try {
      center = await window.RehablixCenter.getCenterBySlug(slug);
    } catch (err) {
      console.error('Slug lookup failed:', err);
      renderNotFound();
      return;
    }
    if (!center) { renderNotFound(); return; }

    firebase.auth().onAuthStateChanged(async (user) => {
      if (!user) { renderNeedsLogin(center.name); return; }

      let ctx;
      try {
        ctx = await window.RehablixCenter.getContext();
      } catch (err) {
        renderNeedsLogin(center.name);
        return;
      }

      if (ctx.isCenterOwner && ctx.uid === center.centerUid) {
        renderWelcome(center.name, 'your center dashboard');
        setTimeout(() => { window.location.href = 'settings.html'; }, 900);
        return;
      }

      // `ctx.centerId` only reflects whichever workspace is already the
      // user's *active* context — which, for someone landing on this link
      // for the first time (the whole point of this page), usually isn't
      // set to this center yet. So look up their membership for THIS
      // specific center directly, rather than relying on activeContext.
      const membership = (ctx.memberships || {})[center.centerUid] || null;

      if (!membership) { renderNoAccess(center.name); return; }
      if (membership.status === 'revoked') { renderRevoked(center.name); return; }
      if (membership.status === 'declined') { renderNoAccess(center.name); return; }

      try {
        if (membership.status === 'invited') {
          // First time following this link: accept the invite, which also
          // switches their active workspace to this center.
          await window.RehablixCenter.respondToInvite(center.centerUid, true);
        } else if (ctx.activeContext !== center.centerUid) {
          // Already an active member, just not currently "in" this
          // workspace — switch them into it so the tools/pages read the
          // right data.
          await window.RehablixCenter.switchActiveContext(center.centerUid);
        }
      } catch (err) {
        console.error('Could not activate center membership:', err);
        renderNoAccess(center.name);
        return;
      }

      renderWelcome(center.name, 'your tools');
      setTimeout(() => { window.location.href = 'index.html?welcome=' + encodeURIComponent(center.name); }, 900);
    });
  }

  resolve();
});
