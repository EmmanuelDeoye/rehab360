// js/invite-modal.js
// Shows a popup modal for any pending center invitations the current user
// hasn't responded to yet — accept, decline, or dismiss to answer later
// (they can always respond from settings.html afterwards too).

(function () {
  function buildModal(invites) {
    let overlay = document.getElementById('inviteModal');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'inviteModal';
    overlay.className = 'im-overlay';
    overlay.innerHTML = `
      <div class="im-box">
        <div class="im-icon"><i class="fas fa-hospital"></i></div>
        <h3>${invites.length > 1 ? "You've been invited to join centers" : "You've been invited to join a center"}</h3>
        <div class="im-invite-list" id="imInviteList"></div>
        <button type="button" class="im-later-btn" id="imLaterBtn">Decide Later</button>
      </div>
    `;
    document.body.appendChild(overlay);

    const list = document.getElementById('imInviteList');
    invites.forEach(invite => {
      const row = document.createElement('div');
      row.className = 'im-invite-row';
      row.innerHTML = `
        <p><strong>${escapeHtml(invite.centerName || 'A center')}</strong> invited you to join their team on rehablix.</p>
        <div class="im-invite-actions">
          <button type="button" class="im-btn im-btn-decline" data-center="${invite.centerUid}">Decline</button>
          <button type="button" class="im-btn im-btn-accept" data-center="${invite.centerUid}">Accept</button>
        </div>
      `;
      list.appendChild(row);
    });

    list.querySelectorAll('.im-btn-accept').forEach(btn => {
      btn.addEventListener('click', () => respond(btn.dataset.center, true, btn));
    });
    list.querySelectorAll('.im-btn-decline').forEach(btn => {
      btn.addEventListener('click', () => respond(btn.dataset.center, false, btn));
    });

    document.getElementById('imLaterBtn').addEventListener('click', () => closeModal(overlay));

    requestAnimationFrame(() => overlay.classList.add('show'));
  }

  function closeModal(overlay) {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 200);
  }

  async function respond(centerUid, accept, btn) {
    const row = btn.closest('.im-invite-row');
    row.querySelectorAll('button').forEach(b => b.disabled = true);
    try {
      await window.RehablixCenter.respondToInvite(centerUid, accept);
      row.innerHTML = `<p>${accept ? '✅ Joined!' : 'Declined.'}</p>`;
      setTimeout(() => {
        row.remove();
        const overlay = document.getElementById('inviteModal');
        if (overlay && !overlay.querySelector('.im-invite-row')) closeModal(overlay);
        if (accept) {
          // Their active workspace just changed — reload so the whole app reflects it.
          window.location.reload();
        }
      }, 900);
    } catch (err) {
      row.querySelectorAll('button').forEach(b => b.disabled = false);
      console.error('respondToInvite failed:', err);
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  async function checkForInvites() {
    if (!window.RehablixCenter) return;
    try {
      const invites = await window.RehablixCenter.getPendingInvites();
      if (invites && invites.length) buildModal(invites);
    } catch (err) {
      console.error('Could not check pending invites:', err);
    }
  }

  function init() {
    if (!window.firebase || !firebase.auth) return;
    firebase.auth().onAuthStateChanged((user) => {
      if (user) setTimeout(checkForInvites, 400); // brief delay so center.js has settled in
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
