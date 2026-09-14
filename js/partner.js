// js/partner.js – Rehablix Partners page logic
// States: logged-out | loading | none (apply) | pending | rejected | approved (dashboard)

document.addEventListener('DOMContentLoaded', () => {
  const auth = firebase.auth();
  const db = firebase.database();

  const els = {
    loggedOut: document.getElementById('partnerLoggedOut'),
    loading: document.getElementById('partnerLoading'),
    none: document.getElementById('partnerStateNone'),
    pending: document.getElementById('partnerStatePending'),
    rejected: document.getElementById('partnerStateRejected'),
    approved: document.getElementById('partnerStateApproved')
  };

  function showState(name) {
    Object.entries(els).forEach(([key, el]) => {
      if (el) el.style.display = key === name ? '' : 'none';
    });
  }

  showState('loading');

  // ---------- Logged-out prompt ----------
  const loginPromptBtn = document.getElementById('partnerLoginPromptBtn');
  if (loginPromptBtn) {
    loginPromptBtn.addEventListener('click', () => {
      document.getElementById('loginBtn')?.click();
    });
  }

  // ---------- Toast (self-contained, matches site pattern) ----------
  function showToast(message, isError = false, duration = 3500) {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.background = isError ? '#ef4444' : 'var(--settings-accent, var(--accent))';
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), duration);
  }

  // ---------- Referral code generation ----------
  // Human-friendly, reasonably unique: name fragment + short random suffix.
  // Uniqueness is enforced server-side by writing to referralCodes/{code}
  // with a transaction-like existence check before committing.
  function slugify(name) {
    return (name || 'partner')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 10) || 'partner';
  }

  async function generateUniqueCode(name) {
    const base = slugify(name);
    for (let attempt = 0; attempt < 8; attempt++) {
      const suffix = Math.random().toString(36).slice(2, 6);
      const candidate = `${base}${suffix}`;
      const snap = await db.ref('referralCodes/' + candidate).once('value');
      if (!snap.exists()) return candidate;
    }
    // Extremely unlikely fallback
    return `${base}${Date.now().toString(36)}`;
  }

  // ---------- Apply form ----------
  const applyForm = document.getElementById('partnerApplyForm');
  const applyBtn = document.getElementById('partnerApplyBtn');
  const applyError = document.getElementById('partnerApplyError');

  let currentUser = null;

  if (applyForm) {
    applyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentUser) return;

      const name = document.getElementById('partnerFullName').value.trim();
      const audience = document.getElementById('partnerAudience').value;
      const payoutMethod = document.getElementById('partnerPayoutMethod').value;
      const payoutDetails = document.getElementById('partnerPayoutDetails').value.trim();
      const note = document.getElementById('partnerNote').value.trim();

      if (!name || !audience || !payoutMethod || !payoutDetails) {
        applyError.textContent = 'Please fill in all required fields.';
        return;
      }

      applyError.textContent = '';
      applyBtn.disabled = true;
      applyBtn.textContent = 'Submitting…';

      try {
        const code = await generateUniqueCode(name);
        const now = new Date().toISOString();

        const partnerRecord = {
          uid: currentUser.uid,
          name: name,
          email: currentUser.email,
          audience: audience,
          payoutMethod: payoutMethod,
          payoutDetails: payoutDetails,
          note: note,
          code: code,
          status: 'pending',
          appliedAt: now,
          earnings: { total: 0, pending: 0, paid: 0, count: 0 }
        };

        await db.ref('partners/' + currentUser.uid).set(partnerRecord);
        await db.ref('referralCodes/' + code).set(currentUser.uid);
        await db.ref(`users/${currentUser.uid}/partner`).set({ status: 'pending', code: code, appliedAt: now });

        showToast('✅ Application submitted! We\'ll email you once it\'s reviewed.');
        showState('pending');
      } catch (err) {
        console.error('Partner application failed:', err);
        applyError.textContent = 'Something went wrong submitting your application. Please try again.';
      } finally {
        applyBtn.disabled = false;
        applyBtn.textContent = 'Submit Application';
      }
    });
  }

  const reapplyBtn = document.getElementById('partnerReapplyBtn');
  if (reapplyBtn) {
    reapplyBtn.addEventListener('click', () => showState('none'));
  }

  // ---------- Dashboard (approved partners) ----------
  function formatMoney(amount) {
    const n = Number(amount) || 0;
    return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return '—';
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  async function renderDashboard(partner) {
    // Referral link
    const link = `${window.location.origin}${window.location.pathname.replace('partner.html', 'index.html')}?ref=${encodeURIComponent(partner.code)}`;
    const linkInput = document.getElementById('partnerLinkInput');
    if (linkInput) linkInput.value = link;

    const copyBtn = document.getElementById('copyPartnerLinkBtn');
    if (copyBtn && !copyBtn.dataset.wired) {
      copyBtn.dataset.wired = '1';
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(linkInput.value);
          showToast('🔗 Referral link copied!');
        } catch {
          linkInput.select();
          document.execCommand('copy');
          showToast('🔗 Referral link copied!');
        }
      });
    }

    // Stats
    const earnings = partner.earnings || {};
    document.getElementById('statEarningsTotal').textContent = formatMoney(earnings.total);
    document.getElementById('statEarningsPending').textContent = formatMoney(earnings.pending);
    document.getElementById('statConversionsCount').textContent = earnings.count || 0;

    // Referrals table
    const referrals = partner.referrals || {};
    const refKeys = Object.keys(referrals);
    document.getElementById('statReferralsCount').textContent = refKeys.length;

    const refBody = document.getElementById('referralsTableBody');
    const refEmpty = document.getElementById('referralsEmpty');
    if (refKeys.length === 0) {
      refBody.innerHTML = '';
      refEmpty.style.display = 'block';
    } else {
      refEmpty.style.display = 'none';
      refBody.innerHTML = refKeys
        .sort((a, b) => new Date(referrals[b].joinedAt || 0) - new Date(referrals[a].joinedAt || 0))
        .map(k => {
          const r = referrals[k];
          return `<tr><td>${escapeHtml(r.name || r.email || 'User')}</td><td>${formatDate(r.joinedAt)}</td></tr>`;
        }).join('');
    }

    // Transactions table
    const transactions = partner.transactions || {};
    const txKeys = Object.keys(transactions);
    const txBody = document.getElementById('transactionsTableBody');
    const txEmpty = document.getElementById('transactionsEmpty');
    if (txKeys.length === 0) {
      txBody.innerHTML = '';
      txEmpty.style.display = 'block';
    } else {
      txEmpty.style.display = 'none';
      txBody.innerHTML = txKeys
        .sort((a, b) => new Date(transactions[b].date || 0) - new Date(transactions[a].date || 0))
        .map(k => {
          const t = transactions[k];
          const planLabel = t.plan ? t.plan.charAt(0).toUpperCase() + t.plan.slice(1) : '—';
          return `<tr>
            <td>${escapeHtml(t.referredName || t.referredEmail || 'User')}</td>
            <td>${escapeHtml(planLabel)}</td>
            <td>${(t.currency || '') + ' ' + (Number(t.amount) || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
            <td>${formatMoney(t.commission)}</td>
            <td>${formatDate(t.date)}</td>
          </tr>`;
        }).join('');
    }
  }

  // ---------- Auth state / status routing ----------
  auth.onAuthStateChanged(async (user) => {
    currentUser = user;

    if (!user) {
      showState('loggedOut');
      return;
    }

    try {
      const [userPartnerSnap, partnerSnap] = await Promise.all([
        db.ref(`users/${user.uid}/partner/status`).once('value'),
        db.ref(`partners/${user.uid}`).once('value')
      ]);

      const status = userPartnerSnap.val();
      const partner = partnerSnap.val();

      if (!status || status === 'none' || !partner) {
        // Pre-fill name field with what we know
        const nameInput = document.getElementById('partnerFullName');
        if (nameInput && !nameInput.value) {
          const snap = await db.ref(`users/${user.uid}/name`).once('value');
          nameInput.value = snap.val() || user.displayName || '';
        }
        showState('none');
        return;
      }

      if (status === 'pending') {
        showState('pending');
        return;
      }

      if (status === 'rejected') {
        const reasonEl = document.getElementById('partnerRejectionReason');
        if (reasonEl && partner.rejectionReason) {
          reasonEl.textContent = `Reason: ${partner.rejectionReason}`;
        }
        showState('rejected');
        return;
      }

      if (status === 'approved') {
        await renderDashboard(partner);
        showState('approved');

        // Keep the dashboard live if earnings/referrals change while open
        db.ref(`partners/${user.uid}`).on('value', (snap) => {
          const updated = snap.val();
          if (updated) renderDashboard(updated);
        });
        return;
      }

      showState('none');
    } catch (err) {
      console.error('Failed to load partner status:', err);
      showToast('Could not load your partner status. Please refresh.', true);
    }
  });
});
