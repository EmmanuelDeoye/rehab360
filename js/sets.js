// js/sets.js – Settings page functionality

document.addEventListener('DOMContentLoaded', async () => {
  const auth = firebase.auth();
  const db = firebase.database();
  let currentUser = null;
  let pendingAction = null;

  // DOM Elements
  const profileName = document.getElementById('profileNameInput');
  const profileEmail = document.getElementById('profileEmail');
  const profileSpecialization = document.getElementById('profileSpecialization');
  const updateProfileBtn = document.getElementById('updateProfileBtn');
  const currentPassword = document.getElementById('currentPassword');
  const newPassword = document.getElementById('newPassword');
  const changePasswordBtn = document.getElementById('changePasswordBtn');
  const subPlan = document.getElementById('subPlan');
  const subBilling = document.getElementById('subBilling');
  const subNextDate = document.getElementById('subNextDate');
  const subAutoRenew = document.getElementById('subAutoRenew');
  const noSubscriptionMsg = document.getElementById('noSubscriptionMsg');
  const subscriptionInfo = document.getElementById('subscriptionInfo');
  const cancelRenewalSection = document.getElementById('cancelRenewalSection');
  const notifToggle = document.getElementById('notifToggle');
  const savePrefsBtn = document.getElementById('savePrefsBtn');
  const deleteAccountBtn = document.getElementById('deleteAccountBtn');
  const themeOptions = document.querySelectorAll('.theme-option');
  const confirmModal = document.getElementById('confirmModal');
  const confirmMessage = document.getElementById('confirmMessage');
  const confirmProceedBtn = document.getElementById('confirmProceedBtn');
  const confirmCancelBtn = document.getElementById('confirmCancelBtn');
  const closeConfirmModal = document.getElementById('closeConfirmModal');

  // ==================== TOAST SYSTEM ====================
  function showToast(message, type = 'success') {
    console.log('Showing toast:', message, type);
    
    // Remove any existing toasts
    const existingToasts = document.querySelectorAll('.custom-toast');
    existingToasts.forEach(toast => toast.remove());
    
    // Create toast container if needed
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      toastContainer.style.cssText = `
        position: fixed;
        bottom: 2rem;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        pointer-events: none;
      `;
      document.body.appendChild(toastContainer);
    }
    
    // Create toast
    const toast = document.createElement('div');
    toast.className = `custom-toast ${type}`;
    
    // Set colors based on type
    let bgColor = '#10b981'; // success green
    let icon = '✓';
    
    if (type === 'error') {
      bgColor = '#dc2626'; // error red
      icon = '⚠️';
    } else if (type === 'info') {
      bgColor = '#3b82f6'; // info blue
      icon = 'ℹ️';
    } else if (type === 'warning') {
      bgColor = '#f59e0b'; // warning orange
      icon = '⚠️';
    }
    
    toast.style.cssText = `
      background: ${bgColor};
      color: white;
      padding: 0.875rem 1.75rem;
      border-radius: 3rem;
      font-size: 0.875rem;
      font-weight: 500;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
      animation: slideUp 0.3s ease;
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    toast.innerHTML = `<span style="font-size: 1rem;">${icon}</span> ${message}`;
    
    // Add animation styles if not present
    if (!document.querySelector('#toast-animation-style')) {
      const style = document.createElement('style');
      style.id = 'toast-animation-style';
      style.textContent = `
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `;
      document.head.appendChild(style);
    }
    
    toastContainer.appendChild(toast);
    
    // Remove after 3 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => {
        if (toast.parentNode) toast.remove();
      }, 300);
    }, 3000);
  }

  // ==================== CONFIRMATION MODAL ====================
  function openConfirmModal(message, callback) {
    if (confirmMessage) confirmMessage.textContent = message;
    pendingAction = callback;
    if (confirmModal) {
      confirmModal.classList.add('show');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeConfirmModalHandler() {
    if (confirmModal) confirmModal.classList.remove('show');
    document.body.style.overflow = '';
    pendingAction = null;
  }

  // ==================== UPDATE NAVBAR PROFILE ====================
  async function updateNavbarProfile(user) {
    try {
      const userSnap = await db.ref(`users/${user.uid}`).once('value');
      const userData = userSnap.val() || {};
      const displayName = userData.name || user.displayName || user.email?.split('@')[0] || 'User';
      
      // Try to find navbar profile elements (they might be in different places)
      const navbarProfileName = document.querySelector('#profileName');
      const navbarProfileIcon = document.querySelector('#profileIcon');
      
      if (navbarProfileName && navbarProfileName.tagName === 'SPAN') {
        navbarProfileName.textContent = displayName;
      }
      if (navbarProfileIcon) {
        navbarProfileIcon.textContent = displayName.charAt(0).toUpperCase();
      }
      
      // Also try to find any element with class 'profile-name'
      const altProfileNames = document.querySelectorAll('.profile-name');
      altProfileNames.forEach(el => {
        if (el !== profileName) { // Don't override the input field
          el.textContent = displayName;
        }
      });
      
    } catch (error) {
      console.error('Error updating navbar:', error);
    }
  }

  // ==================== LOAD USER DATA ====================
  async function loadUserData(user) {
    if (!user) {
      console.log('No user found');
      return;
    }
    
    currentUser = user;
    const uid = user.uid;
    
    console.log('Loading user data for UID:', uid);
    console.log('User email:', user.email);
    
    try {
      // Get user data from database
      const userSnap = await db.ref(`users/${uid}`).once('value');
      const userData = userSnap.val() || {};
      
      console.log('Database user data:', userData);
      
      // IMPORTANT: Get name from database FIRST, then fallback to auth displayName
      let displayName = '';
      
      // Method 1: Check database name field
      if (userData.name && userData.name.trim() !== '') {
        displayName = userData.name;
        console.log('Found name in database:', displayName);
      }
      
      // Method 2: Check auth displayName
      if (!displayName && user.displayName && user.displayName.trim() !== '') {
        displayName = user.displayName;
        console.log('Found name in auth displayName:', displayName);
      }
      
      // Method 3: Extract from email
      if (!displayName && user.email) {
        displayName = user.email.split('@')[0];
        console.log('Extracted name from email:', displayName);
      }
      
      console.log('Final display name to display:', displayName);
      
      // Set the input field value
      if (profileName) {
        if (displayName) {
          profileName.value = displayName;
          profileName.placeholder = '';
        } else {
          profileName.value = '';
          profileName.placeholder = 'Enter your full name';
        }
      }
      
      // Set email
      if (profileEmail) {
        profileEmail.value = user.email || '';
      }
      
      // Set specialization
      if (profileSpecialization) {
        profileSpecialization.value = userData.specialization || '';
      }
      
      // IMPORTANT: If name exists in auth but not in database, save it
      if ((!userData.name || userData.name === '') && user.displayName && user.displayName.trim() !== '') {
        console.log('Syncing name from Auth to Database:', user.displayName);
        await db.ref(`users/${uid}`).update({
          name: user.displayName,
          email: user.email,
          updatedAt: new Date().toISOString()
        });
        showToast('Profile synced successfully', 'success');
      }
      
      // If still no name, show a gentle reminder
      if (!displayName && profileName) {
        setTimeout(() => {
          showToast('Please enter your name and click Update Profile', 'info');
        }, 1000);
      }
      
      // Update navbar
      await updateNavbarProfile(user);
      
      // ==================== LOAD SUBSCRIPTION ====================
      const subSnap = await db.ref(`users/${uid}/subscription`).once('value');
      const sub = subSnap.val();
      
      console.log('Subscription data:', sub);
      
      if (sub && sub.plan && sub.plan !== 'free') {
        if (subscriptionInfo) subscriptionInfo.style.display = 'block';
        if (noSubscriptionMsg) noSubscriptionMsg.style.display = 'none';
        
        if (subPlan) {
          subPlan.textContent = sub.plan === 'student' ? '🎓 Student' : '💎 Pro';
        }
        
        if (subBilling) {
          subBilling.textContent = sub.billing === 'monthly' ? 'Monthly' : 'Yearly';
        }
        
        if (sub.ends && subNextDate) {
          const endDate = new Date(sub.ends);
          subNextDate.textContent = endDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
        } else if (subNextDate) {
          subNextDate.textContent = 'N/A';
        }
        
        const autoRenew = sub.autoRenew !== false;
        
        if (subAutoRenew) {
          subAutoRenew.innerHTML = autoRenew 
            ? '<span class="badge-success">Enabled ✓</span>' 
            : '<span class="badge-warning">Disabled ✗</span>';
        }
        
        if (cancelRenewalSection) {
          if (autoRenew) {
            cancelRenewalSection.innerHTML = `
              <button class="btn-settings-secondary" id="cancelAutoRenewBtn" style="margin-top: 1rem; background: #dc2626; color: white; width: 100%;">
                <i class="fas fa-ban"></i> Cancel Auto-Renewal
              </button>
            `;
            const cancelBtn = document.getElementById('cancelAutoRenewBtn');
            if (cancelBtn) {
              cancelBtn.addEventListener('click', () => {
                openConfirmModal(
                  "Are you sure you want to cancel auto-renewal? Your subscription will remain active until the current period ends, and you will not be charged again.",
                  async () => {
                    await db.ref(`users/${uid}/subscription/autoRenew`).set(false);
                    showToast("Auto-renewal cancelled successfully", 'success');
                    loadUserData(user);
                  }
                );
              });
            }
          } else {
            cancelRenewalSection.innerHTML = '<p style="font-size: 0.8rem; color: var(--settings-text-secondary); margin-top: 1rem; text-align: center;">Auto-renewal is OFF. Your subscription will not renew.</p>';
          }
        }
      } else {
        if (subscriptionInfo) subscriptionInfo.style.display = 'none';
        if (noSubscriptionMsg) noSubscriptionMsg.style.display = 'block';
      }

      // ==================== LOAD CENTER / ORGANIZATION CARD ====================
      await loadCenterCard(uid, userData);

      // ==================== LOAD REHABLIX PARTNERS CARD ====================
      await loadPartnerCard(uid);
      
    } catch (error) {
      console.error('Error loading user data:', error);
      showToast('Error loading profile data: ' + error.message, 'error');
    }
  }

  // ==================== REHABLIX PARTNERS CARD ====================
  async function loadPartnerCard(uid) {
    const card = document.getElementById('partnerCard');
    const body = document.getElementById('partnerCardBody');
    if (!card || !body) return;

    try {
      const snap = await db.ref(`users/${uid}/partner`).once('value');
      const partner = snap.val();
      const status = partner && partner.status;

      card.style.display = 'block';

      if (!status || status === 'none') {
        body.innerHTML = `
          <p style="color: var(--settings-text-secondary); margin: 0 0 1rem;">
            Share rehablix with your network and earn <strong>20% commission</strong> on every subscription
            payment made by people you refer.
          </p>
          <a href="partner.html" class="btn-settings-primary" style="display:inline-flex; text-decoration:none;">
            <i class="fas fa-hand-holding-usd"></i> Earn with Rehablix
          </a>
        `;
      } else if (status === 'pending') {
        body.innerHTML = `
          <div class="info-row">
            <span class="info-label">Application Status:</span>
            <span class="info-value"><span class="badge-warning">Pending Review ⏳</span></span>
          </div>
          <p style="color: var(--settings-text-secondary); margin: 0.75rem 0 0; font-size: 0.9rem;">
            We'll email you as soon as a decision is made.
          </p>
        `;
      } else if (status === 'approved') {
        body.innerHTML = `
          <div class="info-row">
            <span class="info-label">Partner Status:</span>
            <span class="info-value"><span class="badge-success">Approved ✓</span></span>
          </div>
          <a href="partner.html" class="btn-settings-primary" style="display:inline-flex; text-decoration:none; margin-top: 0.75rem;">
            <i class="fas fa-chart-line"></i> View Partner Dashboard
          </a>
        `;
      } else if (status === 'rejected') {
        body.innerHTML = `
          <div class="info-row">
            <span class="info-label">Application Status:</span>
            <span class="info-value"><span class="badge-warning">Not Approved</span></span>
          </div>
          <a href="partner.html" class="btn-settings-primary" style="display:inline-flex; text-decoration:none; margin-top: 0.75rem;">
            <i class="fas fa-redo"></i> Apply Again
          </a>
        `;
      } else {
        card.style.display = 'none';
      }
    } catch (err) {
      console.error('Error loading partner card:', err);
      card.style.display = 'none';
    }
  }


  const TOOL_LABELS = {
    doc: 'Documentation', presentation: 'Presentations', rom: 'ROM & Gait Analyzer',
    project: 'Projects', standardized: 'Standardized Tests', exam: 'Exam Prep',
    study: 'Study Tools', assignment: 'Assignments', ppt: 'PPT Builder', audio: 'Audio Transcription'
  };

  async function loadCenterCard(uid, userData) {
    const body = document.getElementById('centerCardBody');
    if (!body || !window.RehablixCenter) return;

    const ctx = await window.RehablixCenter.getContext();
    const membershipEntries = Object.entries(ctx.memberships || {}); // [centerUid, {status, centerName, ...}]

    let html = '';

    // ---------- Memberships section — shown whenever the user belongs to any
    // center, regardless of whether they ALSO own one of their own. Invited
    // (not-yet-accepted) memberships get Accept/Decline right here. ----------
    if (membershipEntries.length > 0) {
      const rows = membershipEntries.map(([centerUid, m]) => {
        const statusBadge = m.status === 'active' ? '<span class="badge-success">Active</span>'
          : m.status === 'invited' ? '<span class="badge-warning">Invitation Pending</span>'
          : m.status === 'declined' ? '<span class="badge-individual">Declined</span>'
          : '<span class="badge-warning">Access Revoked</span>';
        const actions = m.status === 'invited'
          ? `<button class="btn-mini respond-invite-btn" data-center="${centerUid}" data-accept="true">Accept</button>
             <button class="btn-mini danger respond-invite-btn" data-center="${centerUid}" data-accept="false">Decline</button>`
          : '';
        return `
          <div class="member-row">
            <div class="member-row-head">
              <div><strong>${escapeHtml(m.centerName || 'A center')}</strong></div>
              <div class="member-row-actions">${statusBadge} ${actions}</div>
            </div>
          </div>
        `;
      }).join('');
      html += `
        <h4 class="settings-subheading">Your Center Memberships</h4>
        <div class="members-list">${rows}</div>
      `;
    }

    // ---------- Ownership / conversion section ----------
    if (ctx.isCenterOwner) {
      html += await renderOwnerSectionHtml(ctx.ownCenterId);
    } else {
      html += `
        <h4 class="settings-subheading">${membershipEntries.length ? 'Own a Center Too?' : 'Center / Organization'}</h4>
        <p class="settings-hint">Register as a <strong>Center / Organization</strong> to invite other rehablix
        users (e.g. staff or students), control their access to shared work at will, and track who did what.</p>
        <div class="form-group">
          <label for="convertOrgName">Organization / Center Name</label>
          <input type="text" id="convertOrgName" class="settings-input" placeholder="e.g. Sunrise Rehab Clinic">
        </div>
        <button class="btn-settings-primary" id="convertToCenterBtn">
          <i class="fas fa-hospital"></i> Convert to Center Account
        </button>
      `;
    }

    body.innerHTML = html;

    // ---- Respond to a pending invite, right from settings ----
    body.querySelectorAll('.respond-invite-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const centerUid = btn.getAttribute('data-center');
        const accept = btn.getAttribute('data-accept') === 'true';
        btn.closest('.member-row').querySelectorAll('button').forEach(b => b.disabled = true);
        try {
          await window.RehablixCenter.respondToInvite(centerUid, accept);
          showToast(accept ? 'Joined!' : 'Invitation declined', 'success');
          loadUserData(currentUser);
        } catch (err) {
          showToast(err.message || 'Could not respond', 'error');
        }
      });
    });

    // ---- Convert-to-center button (only present if not already an owner) ----
    document.getElementById('convertToCenterBtn')?.addEventListener('click', async () => {
      const nameInput = document.getElementById('convertOrgName');
      const orgName = nameInput ? nameInput.value.trim() : '';
      if (!orgName) { showToast('Please enter your organization name', 'error'); return; }
      try {
        await window.RehablixCenter.convertToCenter(orgName);
        showToast('Your account is now a Center account!', 'success');
        loadUserData(currentUser);
      } catch (err) {
        showToast(err.message || 'Could not convert account', 'error');
      }
    });

    // ---- Owner console interactions (only present if this user owns a center) ----
    if (ctx.isCenterOwner) {
      wireOwnerConsoleEvents(body, ctx.ownCenterId);
    }
  }

  // Builds the HTML for the center-owner management console: custom link,
  // invite form, member list (with per-tool toggles), and activity log.
  async function renderOwnerSectionHtml(centerUid) {
    const centerSnap = await db.ref('users/' + centerUid + '/centers').once('value');
    const center = centerSnap.val() || {};
    const membersSnap = await db.ref(`users/${centerUid}/centers/members`).once('value');
    const members = membersSnap.val() || {};
    const activitySnap = await db.ref(`users/${centerUid}/centers/activity`).limitToLast(25).once('value');
    const activityVal = activitySnap.val() || {};
    const activity = Object.values(activityVal).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    const STATUS_BADGES = {
      active: '<span class="badge-success">Active</span>',
      invited: '<span class="badge-warning">Invitation Pending</span>',
      declined: '<span class="badge-individual">Declined</span>',
      revoked: '<span class="badge-warning">Revoked</span>'
    };

    const memberRows = Object.keys(members).map(mUid => {
      const m = members[mUid];
      const perms = m.permissions || {};
      const toggles = Object.keys(TOOL_LABELS).map(k => `
        <label class="tool-toggle-chip ${perms[k] !== false ? 'on' : ''}" data-member="${mUid}" data-tool="${k}">
          <input type="checkbox" ${perms[k] !== false ? 'checked' : ''}> ${TOOL_LABELS[k]}
        </label>
      `).join('');
      const canToggleAccess = m.status === 'active' || m.status === 'revoked';
      const revokeBtn = canToggleAccess ? `
        <button class="btn-mini toggle-revoke-btn" data-member="${mUid}" data-status="${m.status === 'revoked' ? 'active' : 'revoked'}">
          ${m.status === 'revoked' ? 'Restore Access' : 'Revoke Access'}
        </button>
      ` : '';
      return `
        <div class="member-row" data-member="${mUid}">
          <div class="member-row-head">
            <div>
              <strong>${escapeHtml(m.name || m.email)}</strong>
              <span class="member-email">${escapeHtml(m.email)}</span>
            </div>
            <div class="member-row-actions">
              ${STATUS_BADGES[m.status] || STATUS_BADGES.active}
              ${revokeBtn}
              <button class="btn-mini danger remove-member-btn" data-member="${mUid}"><i class="fas fa-trash-alt"></i></button>
            </div>
          </div>
          <div class="tool-toggle-list">${toggles}</div>
        </div>
      `;
    }).join('') || '<p class="info-empty-inline">No members yet. Invite your first team member below.</p>';

    const activityRows = activity.map(a => `
      <div class="activity-row">
        <span class="activity-who">${escapeHtml(a.name || a.email)}</span>
        <span class="activity-what">${escapeHtml(a.action || '')} ${a.detail ? '— ' + escapeHtml(a.detail) : ''}</span>
        <span class="activity-where">${escapeHtml(a.page || '')}</span>
        <span class="activity-when">${a.timestamp ? new Date(a.timestamp).toLocaleString() : ''}</span>
      </div>
    `).join('') || '<p class="info-empty-inline">No activity recorded yet.</p>';

    const currentSlug = center.slug || '';
    const cooldownDays = window.RehablixCenter.daysUntilSlugEditable(center.slugUpdatedAt);
    const canEditSlug = !currentSlug || cooldownDays === 0;

    return `
      <h4 class="settings-subheading">Your Center: ${escapeHtml(center.name || '')}</h4>

      <h4 class="settings-subheading">Your Center's Link</h4>
      <p class="settings-hint">Share this link with your team. Anyone with active access can use it to get straight to your center's tools.</p>
      ${currentSlug ? `
        <div class="center-link-display">
          <code>rehablix.com/${escapeHtml(currentSlug)}</code>
          <button class="btn-mini" id="copyCenterLinkBtn" type="button"><i class="fas fa-copy"></i> Copy</button>
        </div>
      ` : ''}
      <div class="invite-row">
        <span class="center-link-prefix">rehablix.com/</span>
        <input type="text" id="centerSlugInput" class="settings-input" placeholder="yourcentername" value="${escapeHtml(currentSlug)}" maxlength="30" ${canEditSlug ? '' : 'disabled'}>
        <button class="btn-settings-primary22" id="saveCenterSlugBtn" data-center="${centerUid}" ${canEditSlug ? '' : 'disabled'}>
          <i class="fas fa-link"></i> <span>${currentSlug ? 'Update' : 'Create Link'}</span>
        </button>
      </div>
      ${!canEditSlug ? `<small class="form-hint">You can change your link again in ${cooldownDays} day${cooldownDays === 1 ? '' : 's'}.</small>` : `<small class="form-hint">3-30 characters: lowercase letters, numbers, and hyphens only. You can change it again 15 days after saving.</small>`}
      <div id="centerSlugStatus" class="form-hint" style="min-height:1.1em;"></div>

      <h4 class="settings-subheading">Invite a Team Member</h4>
      <p class="settings-hint">They'll get a popup invitation to accept or decline — nobody is added automatically.</p>
      <div class="invite-row">
        <input type="email" id="inviteMemberEmail" class="settings-input" placeholder="colleague@email.com">
        <button class="btn-settings-primary22" id="inviteMemberBtn" data-center="${centerUid}"><i class="fas fa-user-plus"></i> <span>Invite</span></button>
      </div>
      <small class="form-hint">If they don't have a rehablix account yet, the invite links automatically the moment they sign up.</small>

      <h4 class="settings-subheading">Members (${Object.keys(members).length})</h4>
      <div class="members-list">${memberRows}</div>

      <h4 class="settings-subheading">Recent Activity</h4>
      <div class="activity-log">${activityRows}</div>
    `;
  }

  // Wires up all the click/change handlers for the owner console rendered above.
  function wireOwnerConsoleEvents(body, centerUid) {
    document.getElementById('copyCenterLinkBtn')?.addEventListener('click', () => {
      const code = document.querySelector('.center-link-display code');
      const slug = code ? code.textContent.replace('rehablix.com/', '') : '';
      navigator.clipboard.writeText(`https://rehablix.com/${slug}`)
        .then(() => showToast('Link copied!', 'success'))
        .catch(() => showToast('Could not copy link', 'error'));
    });

    document.getElementById('saveCenterSlugBtn')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const input = document.getElementById('centerSlugInput');
      const statusEl = document.getElementById('centerSlugStatus');
      const raw = input ? input.value : '';
      btn.disabled = true;
      statusEl.textContent = 'Checking availability…';
      try {
        const finalSlug = await window.RehablixCenter.setCenterSlug(btn.getAttribute('data-center'), raw);
        statusEl.textContent = '';
        showToast(`Your center link is now rehablix.com/${finalSlug}`, 'success');
        loadUserData(currentUser);
      } catch (err) {
        statusEl.textContent = err.message || 'Could not save link';
        btn.disabled = false;
      }
    });

    document.getElementById('inviteMemberBtn')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const input = document.getElementById('inviteMemberEmail');
      const email = input ? input.value.trim() : '';
      if (!email) { showToast('Enter an email to invite', 'error'); return; }
      try {
        const result = await window.RehablixCenter.inviteMember(btn.getAttribute('data-center'), email);
        showToast(result.linked ? 'Invitation sent!' : 'Invite saved — they\'ll be invited when they join rehablix.', 'success');
        if (input) input.value = '';
        loadUserData(currentUser);
      } catch (err) {
        showToast(err.message || 'Could not send invite', 'error');
      }
    });

    body.querySelectorAll('.tool-toggle-chip input').forEach(cb => {
      cb.addEventListener('change', async (e) => {
        const chip = e.target.closest('.tool-toggle-chip');
        const memberUid = chip.getAttribute('data-member');
        const tool = chip.getAttribute('data-tool');
        await window.RehablixCenter.setMemberPermission(centerUid, memberUid, tool, e.target.checked);
        chip.classList.toggle('on', e.target.checked);
        showToast('Access updated', 'success');
      });
    });

    body.querySelectorAll('.toggle-revoke-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const memberUid = btn.getAttribute('data-member');
        const newStatus = btn.getAttribute('data-status');
        await window.RehablixCenter.setMemberStatus(centerUid, memberUid, newStatus);
        showToast(newStatus === 'revoked' ? 'Access revoked' : 'Access restored', 'success');
        loadUserData(currentUser);
      });
    });

    body.querySelectorAll('.remove-member-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const memberUid = btn.getAttribute('data-member');
        openConfirmModal('Remove this member from your center? They will lose access to shared work.', async () => {
          await window.RehablixCenter.removeMember(centerUid, memberUid);
          showToast('Member removed', 'success');
          loadUserData(currentUser);
        });
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  // ==================== UPDATE PROFILE ====================
  if (updateProfileBtn) {
    updateProfileBtn.addEventListener('click', async () => {
      if (!currentUser) {
        showToast("Please log in first", 'error');
        return;
      }
      
      const name = profileName ? profileName.value.trim() : '';
      const specialization = profileSpecialization ? profileSpecialization.value : '';
      
      if (!name) {
        showToast("Please enter your name", 'error');
        profileName.focus();
        return;
      }
      
      console.log('Updating profile - Name:', name, 'Specialization:', specialization);
      
      try {
        // Update database
        await db.ref(`users/${currentUser.uid}`).update({
          name: name,
          specialization: specialization,
          email: currentUser.email,
          updatedAt: new Date().toISOString()
        });
        
        // Update Firebase Auth displayName
        await currentUser.updateProfile({ displayName: name });
        
        // Force refresh user object
        await currentUser.reload();
        
        // Update navbar
        await updateNavbarProfile(currentUser);
        
        showToast("Profile updated successfully", 'success');
        
        // Reload data to ensure consistency
        await loadUserData(currentUser);
        
      } catch (error) {
        console.error('Update error:', error);
        showToast(error.message || 'Error updating profile', 'error');
      }
    });
  }

  // ==================== CHANGE PASSWORD ====================
  if (changePasswordBtn) {
    changePasswordBtn.addEventListener('click', async () => {
      if (!currentUser) {
        showToast("Please log in first", 'error');
        return;
      }
      
      const currentPwd = currentPassword ? currentPassword.value : '';
      const newPwd = newPassword ? newPassword.value : '';
      
      if (!currentPwd || !newPwd) {
        showToast("Please fill in both password fields", 'error');
        return;
      }
      
      if (newPwd.length < 6) {
        showToast("New password must be at least 6 characters", 'error');
        return;
      }
      
      try {
        const credential = firebase.auth.EmailAuthProvider.credential(
          currentUser.email,
          currentPwd
        );
        await currentUser.reauthenticateWithCredential(credential);
        await currentUser.updatePassword(newPwd);
        showToast("Password changed successfully", 'success');
        if (currentPassword) currentPassword.value = '';
        if (newPassword) newPassword.value = '';
      } catch (error) {
        console.error('Password error:', error);
        if (error.code === 'auth/wrong-password') {
          showToast("Current password is incorrect", 'error');
        } else if (error.code === 'auth/weak-password') {
          showToast("New password is too weak. Use at least 6 characters.", 'error');
        } else {
          showToast(error.message, 'error');
        }
      }
    });
  }

  // ==================== THEME OPTIONS ====================
  function applyTheme(theme) {
    if (theme === 'system') {
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    localStorage.setItem('rehab-theme', theme);
    
    // Update active state
    themeOptions.forEach(option => {
      if (option.dataset.theme === theme) {
        option.classList.add('active');
      } else {
        option.classList.remove('active');
      }
    });
  }
  
  const savedTheme = localStorage.getItem('rehab-theme') || 'system';
  applyTheme(savedTheme);
  
  themeOptions.forEach(option => {
    option.addEventListener('click', () => {
      applyTheme(option.dataset.theme);
      showToast(`Theme changed to ${option.dataset.theme}`, 'success');
    });
  });

  // ==================== SAVE PREFERENCES ====================
  if (savePrefsBtn) {
    savePrefsBtn.addEventListener('click', () => {
      const notifEnabled = notifToggle ? notifToggle.checked : false;
      localStorage.setItem('rehab-notifications', notifEnabled);
      showToast("Preferences saved successfully", 'success');
    });
  }
  
  // Load notification preference
  const savedNotif = localStorage.getItem('rehab-notifications');
  if (notifToggle && savedNotif !== null) {
    notifToggle.checked = savedNotif === 'true';
  }

  // ==================== DELETE ACCOUNT ====================
  if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener('click', () => {
      openConfirmModal(
        "⚠️ PERMANENT ACTION: All your data including profile, analyses, and subscription history will be deleted forever. This cannot be undone. Are you absolutely sure?",
        async () => {
          if (!currentUser) return;
          try {
            // Delete user data from database
            await db.ref(`users/${currentUser.uid}`).remove();
            // Delete the auth account
            await currentUser.delete();
            showToast("Account deleted successfully. Redirecting...", 'success');
            setTimeout(() => {
              window.location.href = 'index.html';
            }, 2000);
          } catch (error) {
            console.error('Delete error:', error);
            if (error.code === 'auth/requires-recent-login') {
              showToast("Please log out and log back in before deleting your account", 'error');
            } else {
              showToast(error.message, 'error');
            }
          }
        }
      );
    });
  }

  // ==================== CONFIRM MODAL HANDLERS ====================
  if (confirmProceedBtn) {
    confirmProceedBtn.addEventListener('click', () => {
      if (pendingAction) pendingAction();
      closeConfirmModalHandler();
    });
  }
  
  if (confirmCancelBtn) {
    confirmCancelBtn.addEventListener('click', closeConfirmModalHandler);
  }
  
  if (closeConfirmModal) {
    closeConfirmModal.addEventListener('click', closeConfirmModalHandler);
  }
  
  if (confirmModal) {
    confirmModal.addEventListener('click', (e) => {
      if (e.target === confirmModal) closeConfirmModalHandler();
    });
  }
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && confirmModal?.classList.contains('show')) {
      closeConfirmModalHandler();
    }
  });

  // ==================== THEME TOGGLE (NAVBAR) ====================
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const html = document.documentElement;
      const current = html.getAttribute('data-theme');
      const newTheme = current === 'light' ? 'dark' : 'light';
      applyTheme(newTheme);
    });
  }

  // ==================== AUTH STATE LISTENER ====================
  auth.onAuthStateChanged(async (user) => {
    console.log('Auth state changed:', user ? `Logged in as ${user.email}` : 'Logged out');
    
    if (!user) {
      // Redirect to home if not logged in
      window.location.href = 'index.html';
      return;
    }
    
    // Small delay to ensure Firebase is ready
    setTimeout(async () => {
      await loadUserData(user);
    }, 100);
  });
  
  // ==================== DEBUG HELPER (Remove in production) ====================
  window.debugSettings = async function() {
    const user = auth.currentUser;
    if (!user) {
      console.log('No user logged in');
      return;
    }
    const snap = await db.ref(`users/${user.uid}`).once('value');
    console.log('Full user data:', snap.val());
    console.log('Auth displayName:', user.displayName);
    console.log('Auth email:', user.email);
  };
});
