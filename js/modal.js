// js/modal.js
// Dynamic Auth Modal Creator + Review System + Profile Modal
// Settings now redirects to settings.html (no settings modal)

// ---------- Rehablix Partners: capture ?ref=CODE on any page ----------
// Runs immediately (not deferred to DOMContentLoaded) so a referral link
// is captured even if the visitor lands on an inner page. The code is
// held in localStorage until the visitor actually signs up (js/auth.js
// reads and clears it at registration time), so it survives navigation
// between pages before they create an account.
(function captureReferralCode() {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      localStorage.setItem('rehablix_ref_code', ref.trim());
    }
  } catch (e) {
    console.warn('Referral capture skipped:', e);
  }
})();

function setupPasswordToggles() {
  const passwordInputs = document.querySelectorAll('#loginPassword, #regPassword, #regRepeatPassword');
  
  passwordInputs.forEach(input => {
    if (!input.parentElement.classList.contains('password-input-wrapper')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'password-input-wrapper';
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);
      
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'password-toggle-btn';
      toggleBtn.setAttribute('aria-label', 'Show password');
      toggleBtn.innerHTML = `
        <svg class="eye-icon eye-open" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
        <svg class="eye-icon eye-closed" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path>
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"></path>
        </svg>
      `;
      
      wrapper.appendChild(toggleBtn);
      
      toggleBtn.addEventListener('click', () => {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        const eyeOpen = toggleBtn.querySelector('.eye-open');
        const eyeClosed = toggleBtn.querySelector('.eye-closed');
        if (isPassword) {
          eyeOpen.style.display = 'none';
          eyeClosed.style.display = 'block';
          toggleBtn.setAttribute('aria-label', 'Hide password');
        } else {
          eyeOpen.style.display = 'block';
          eyeClosed.style.display = 'none';
          toggleBtn.setAttribute('aria-label', 'Show password');
        }
      });
    }
  });
}

// Helper to format ISO date
function formatDate(isoString) {
  if (!isoString) return 'Unknown';
  const date = new Date(isoString);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function createAuthModal() {
  if (document.getElementById('authModal')) return;

  // ---------- Auth Modal ----------
  const modalHTML = `
    <div id="authModal" class="modal">
      <div class="modal-content glass">
        <button class="modal-close" id="closeModal">&times;</button>
        
        <div class="auth-tabs">
          <button class="auth-tab active" id="loginTab">Login</button>
          <button class="auth-tab" id="registerTab">Register</button>
        </div>

        <form id="loginForm" class="auth-form active">
          <h2>Welcome Back</h2>
          <div class="form-group">
            <label for="loginEmail">Email</label>
            <input type="email" id="loginEmail" required placeholder="your@email.com">
          </div>
          <div class="form-group">
            <label for="loginPassword">Password</label>
            <input type="password" id="loginPassword" required placeholder="••••••••">
          </div>
          <div class="form-footer">
            <a href="#" class="forgot-link" id="forgotPassword">Forgot password?</a>
          </div>
          <div class="form-group checkbox">
            <input type="checkbox" id="loginTerms" required>
            <label for="loginTerms">I agree to the <a href="terms_and_condition.html" target="_blank">terms and conditions</a></label>
          </div>
          <button type="submit" class="auth-btn" id="loginSubmitBtn">Login</button>
          <div id="loginError" class="error-message"></div>
        </form>

        <form id="registerForm" class="auth-form">
          <h2>Join rehablix</h2>
          <div class="form-group">
            <label for="regName">Full Name</label>
            <input type="text" id="regName" required placeholder="Your name">
          </div>
          <div class="form-group">
            <label>Account Type</label>
            <div class="account-type-toggle" id="accountTypeToggle">
              <button type="button" class="account-type-option active" data-account-type="individual" id="acctTypeIndividual">
                <i class="fas fa-user"></i>
                <span>Individual</span>
              </button>
              <button type="button" class="account-type-option" data-account-type="center" id="acctTypeCenter">
                <i class="fas fa-hospital"></i>
                <span>Center / Organization</span>
              </button>
            </div>
            <input type="hidden" id="regAccountType" value="individual">
            <small class="form-hint">A Center account lets you invite other rehablix users, control their access to shared work, and track their activity.</small>
          </div>
          <div class="form-group" id="regOrgNameGroup" style="display:none;">
            <label for="regOrgName">Organization / Center Name</label>
            <input type="text" id="regOrgName" placeholder="e.g. Sunrise Rehab Clinic">
          </div>
          <div class="form-group">
            <label for="regEmail">Email</label>
            <input type="email" id="regEmail" required placeholder="your@email.com">
          </div>
          <div class="form-group">
            <label for="regPassword">Password</label>
            <input type="password" id="regPassword" required placeholder="••••••••" minlength="6">
          </div>
          <div class="form-group">
            <label for="regRepeatPassword">Repeat Password</label>
            <input type="password" id="regRepeatPassword" required placeholder="••••••••" minlength="6">
          </div>
          <div class="form-group">
            <label for="voiceRange">Specialization</label>
            <select id="voiceRange" required>
              <option value="">Select your area</option>
              <option value="occupational therapy">Occupational Therapy</option>
              <option value="psychology">Psychology</option>
              <option value="speech therapy">Speech Therapy</option>
              <option value="physiotherapy">Physiotherapy</option>
              <option value="Doctor">Doctor/Consultant</option>
            </select>
          </div>
          <div class="form-group checkbox">
            <input type="checkbox" id="registerTerms" required>
            <label for="registerTerms">I agree to the <a href="terms_and_condition.html" target="_blank">terms and conditions</a></label>
          </div>
          <button type="submit" class="auth-btn" id="registerSubmitBtn">Create Account</button>
          <div id="registerError" class="error-message"></div>
        </form>

        <div class="auth-divider">
          <span>or</span>
        </div>

        <div class="google-signin-container">
          <button type="button" class="google-signin-btn" id="googleSignInBtn">
            <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  `;

  // ---------- Feedback Modal ----------
  const feedbackModalHTML = `
    <div id="feedbackModal" class="modal">
      <div class="modal-content glass feedback-modal-content">
        <button class="modal-close" id="closeFeedbackModal">&times;</button>
        <h3>Share your thoughts</h3>
        <div class="feedback-rating-display" id="feedbackRatingEmoji"></div>
        <textarea id="feedbackText" class="feedback-textarea" rows="4" placeholder="Tell us more (optional)..."></textarea>
        <p class="feedback-anonymous-note" id="anonymousNote">You're posting as <strong>anonymous</strong></p>
        <button class="auth-btn" id="submitFeedbackBtn">Submit Feedback</button>
      </div>
    </div>
  `;

  // ---------- Profile Modal ----------
  const profileModalHTML = `
    <div id="profileModal" class="modal">
      <div class="modal-content glass profile-modal-content">
        <button class="modal-close" id="closeProfileModal">&times;</button>
        <div class="profile-header-card">
          <div class="profile-avatar" id="profileAvatar"></div>
          <h2 id="profileNameDisplay"></h2>
          <span class="profile-specialization" id="profileSpec"></span>
        </div>
        <div class="profile-details-grid">
          <div class="detail-item">
            <span class="detail-label">Email</span>
            <span class="detail-value" id="profileEmail"></span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Member Since</span>
            <span class="detail-value" id="profileCreatedAt"></span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Subscription Plan</span>
            <span class="detail-value" id="profilePlan"></span>
          </div>
        </div>
        <p class="profile-id">User ID: <span id="profileUserId"></span></p>
        <!-- Added a button to go to settings page -->
        <div style="margin-top: 1rem; text-align: center;">
          <button class="auth-btn" id="goToSettingsFromProfile" style="background: #009688;">⚙️ Account Settings</button>
        </div>
      </div>
    </div>
  `;

  // Toast element
  if (!document.getElementById('toast')) {
    const toastHTML = `<div id="toast" class="toast hidden"></div>`;
    document.body.insertAdjacentHTML('beforeend', toastHTML);
  }

  // Welcome overlay
  if (!document.getElementById('welcomeOverlay')) {
    const overlayHTML = `
      <div id="welcomeOverlay" class="welcome-overlay hidden">
        <div class="welcome-card glass">
          <div class="welcome-content">
            <h2>🎉 Welcome to rehablix! 🎉</h2>
            <p>Your intelligent rehabilitation assistant</p>
            <div class="welcome-icon">⚕️</div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', overlayHTML);
  }

  // Login button
  if (!document.getElementById('loginBtn')) {
    const navRight = document.querySelector('.nav-right');
    if (navRight) {
      const loginBtn = document.createElement('button');
      loginBtn.id = 'loginBtn';
      loginBtn.className = 'btn-login';
      loginBtn.textContent = 'Login';
      loginBtn.style.display = 'none';
      const themeToggle = navRight.querySelector('.theme-toggle');
      if (themeToggle && themeToggle.parentNode === navRight) {
        themeToggle.insertAdjacentElement('afterend', loginBtn);
      } else {
        navRight.appendChild(loginBtn);
      }
    }
  }

  // Profile dropdown
  if (!document.getElementById('profileDropdown')) {
    const navRight = document.querySelector('.nav-right');
    if (navRight) {
      const profileHTML = `
        <div class="profile-dropdown" id="profileDropdown" style="display: none;">
          <button class="btn-profile" id="profileBtn">
            <span class="profile-icon" id="profileIcon">👤</span>
            <span class="profile-name" id="profileName"></span>
          </button>
          <div class="dropdown-menu" id="dropdownMenu">
            <button class="dropdown-item" id="profileMenuItem">
              <span>👤</span> My Profile
            </button>
            <button class="dropdown-item" id="settingsMenuItem">
              <span>⚙️</span> Settings
            </button>
            <button class="dropdown-item" id="partnerMenuItem" style="display:none;">
              <span>💰</span> Rehablix Partner
            </button>
            <div class="dropdown-divider"></div>
            <button class="dropdown-item" id="logoutMenuItem">
              <span>🚪</span> Logout
            </button>
          </div>
        </div>
      `;
      navRight.insertAdjacentHTML('beforeend', profileHTML);
    }
  }

  // ---------- Rehablix Partners: show dropdown item for approved partners ----------
  const partnerMenuItem = document.getElementById('partnerMenuItem');
  if (partnerMenuItem) {
    partnerMenuItem.addEventListener('click', () => {
      window.location.href = 'partner.html';
    });
  }
  firebase.auth().onAuthStateChanged((user) => {
    if (!partnerMenuItem) return;
    if (!user) {
      partnerMenuItem.style.display = 'none';
      return;
    }
    firebase.database().ref(`users/${user.uid}/partner/status`).once('value')
      .then(snap => {
        partnerMenuItem.style.display = snap.val() === 'approved' ? 'flex' : 'none';
      })
      .catch(() => { partnerMenuItem.style.display = 'none'; });
  });

  // Insert modals (settings modal is REMOVED)
  document.body.insertAdjacentHTML('beforeend', modalHTML + feedbackModalHTML + profileModalHTML);

  // ---------- Review Bar (Footer) ----------
  const footer = document.querySelector('footer.site-footer');
  if (footer && !document.getElementById('reviewBar')) {
    const reviewBar = document.createElement('div');
    reviewBar.id = 'reviewBar';
    reviewBar.className = 'review-bar';
    reviewBar.innerHTML = `
      <span class="review-label">Rate your experience:</span>
      <div class="emoji-rating">
        <button class="emoji-btn" data-rating="5" data-emoji="😍" title="Love it!">😍</button>
        <button class="emoji-btn" data-rating="4" data-emoji="😊" title="Good">😊</button>
        <button class="emoji-btn" data-rating="3" data-emoji="😐" title="Okay">😐</button>
        <button class="emoji-btn" data-rating="2" data-emoji="😕" title="Not great">😕</button>
        <button class="emoji-btn" data-rating="1" data-emoji="😞" title="Bad">😞</button>
      </div>
    `;
    footer.insertBefore(reviewBar, footer.firstChild);
  }

  // ---------- Feedback Logic ----------
  const feedbackModal = document.getElementById('feedbackModal');
  const closeFeedbackBtn = document.getElementById('closeFeedbackModal');
  const ratingEmojiDisplay = document.getElementById('feedbackRatingEmoji');
  const feedbackTextarea = document.getElementById('feedbackText');
  const submitFeedbackBtn = document.getElementById('submitFeedbackBtn');
  const anonymousNote = document.getElementById('anonymousNote');

  let selectedRating = null;

  function openFeedbackModal(rating, emoji) {
    selectedRating = rating;
    ratingEmojiDisplay.textContent = emoji;
    feedbackTextarea.value = '';

    const user = firebase.auth().currentUser;
    anonymousNote.innerHTML = user
      ? `Posting as <strong>${user.displayName || user.email}</strong>`
      : 'Posting as <strong>anonymous</strong>';

    feedbackModal.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closeFeedbackModal() {
    feedbackModal.classList.remove('show');
    document.body.style.overflow = '';
  }

  document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openFeedbackModal(btn.getAttribute('data-rating'), btn.getAttribute('data-emoji'));
    });
  });

  if (closeFeedbackBtn) closeFeedbackBtn.addEventListener('click', closeFeedbackModal);
  if (feedbackModal) {
    feedbackModal.addEventListener('click', (e) => {
      if (e.target === feedbackModal) closeFeedbackModal();
    });
  }

  if (submitFeedbackBtn) {
    submitFeedbackBtn.addEventListener('click', async () => {
      const feedback = feedbackTextarea.value.trim();
      const timestamp = new Date().toISOString();
      const user = firebase.auth().currentUser;

      const reviewData = {
        rating: selectedRating,
        emoji: ratingEmojiDisplay.textContent,
        feedback: feedback || '',
        timestamp: timestamp
      };

      if (user) {
        reviewData.user = {
          uid: user.uid,
          name: user.displayName || '',
          email: user.email || ''
        };
      } else {
        reviewData.user = 'anonymous';
      }

      try {
        await firebase.database().ref('reviews').push(reviewData);
        const toast = document.getElementById('toast');
        if (toast) {
          toast.textContent = '✅ Thank you for your feedback!';
          toast.classList.remove('hidden');
          setTimeout(() => toast.classList.add('hidden'), 3000);
        }
        closeFeedbackModal();
      } catch (error) {
        console.error('Feedback error:', error);
        const toast = document.getElementById('toast');
        if (toast) {
          toast.textContent = '❌ Error submitting feedback.';
          toast.classList.remove('hidden');
          setTimeout(() => toast.classList.add('hidden'), 3000);
        }
      }
    });
  }

  // ---------- Profile Modal Logic ----------
  window.openProfileModal = async function() {
    const user = firebase.auth().currentUser;
    if (!user) return;

    const profileModal = document.getElementById('profileModal');
    if (!profileModal) return;

    // Show loading state
    document.getElementById('profileNameDisplay').textContent = 'Loading...';
    document.getElementById('profileEmail').textContent = '';
    document.getElementById('profileSpec').textContent = '';
    document.getElementById('profileCreatedAt').textContent = '';
    document.getElementById('profilePlan').textContent = '';
    document.getElementById('profileUserId').textContent = '';

    // Fetch user data from Firebase
    const snapshot = await firebase.database().ref('users/' + user.uid).once('value');
    const data = snapshot.val() || {};

    // Populate
    document.getElementById('profileNameDisplay').textContent = data.name || user.displayName || 'User';
    document.getElementById('profileEmail').textContent = data.email || user.email;
    document.getElementById('profileSpec').textContent = data.specialization || 'Not specified';
    document.getElementById('profileCreatedAt').textContent = formatDate(data.createdAt);
    document.getElementById('profileUserId').textContent = user.uid;

    // Subscription
    const subSnap = await firebase.database().ref('users/' + user.uid + '/subscription').once('value');
    const sub = subSnap.val();
    if (sub && sub.plan) {
      document.getElementById('profilePlan').textContent = sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1) +
        (sub.ends ? ' (until ' + formatDate(sub.ends) + ')' : '');
    } else {
      document.getElementById('profilePlan').textContent = 'Free';
    }

    // Avatar
    const avatarEl = document.getElementById('profileAvatar');
    if (data.photoURL) {
      avatarEl.innerHTML = `<img src="${data.photoURL}" alt="${data.name}" class="profile-avatar-img">`;
    } else {
      avatarEl.textContent = (data.name || user.email).charAt(0).toUpperCase();
    }

    profileModal.classList.add('show');
    document.body.style.overflow = 'hidden';
  };

  document.getElementById('closeProfileModal')?.addEventListener('click', () => {
    document.getElementById('profileModal').classList.remove('show');
    document.body.style.overflow = '';
  });

  document.getElementById('profileModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('profileModal')) {
      document.getElementById('profileModal').classList.remove('show');
      document.body.style.overflow = '';
    }
  });

  // ---------- Redirect to settings.html when settings menu item is clicked ----------
  const settingsMenuItem = document.getElementById('settingsMenuItem');
  if (settingsMenuItem) {
    settingsMenuItem.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.location.href = 'settings.html';
    });
  }

  // Also handle the settings button inside profile modal (if exists)
  const goToSettingsBtn = document.getElementById('goToSettingsFromProfile');
  if (goToSettingsBtn) {
    goToSettingsBtn.addEventListener('click', () => {
      window.location.href = 'settings.html';
    });
  }

  // Close modals with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (feedbackModal && feedbackModal.classList.contains('show')) closeFeedbackModal();
      if (document.getElementById('profileModal')?.classList.contains('show')) {
        document.getElementById('profileModal').classList.remove('show');
        document.body.style.overflow = '';
      }
    }
  });

  setupPasswordToggles();
  setupAccountTypeToggle();
  console.log('Auth modal, review system, profile modal created – Settings redirects to settings.html');
}

// ---------- Account Type Toggle (Individual vs Center) ----------
function setupAccountTypeToggle() {
  const toggle = document.getElementById('accountTypeToggle');
  const hiddenInput = document.getElementById('regAccountType');
  const orgNameGroup = document.getElementById('regOrgNameGroup');
  const orgNameInput = document.getElementById('regOrgName');
  if (!toggle || !hiddenInput) return;

  toggle.querySelectorAll('.account-type-option').forEach(btn => {
    btn.addEventListener('click', () => {
      toggle.querySelectorAll('.account-type-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const type = btn.getAttribute('data-account-type');
      hiddenInput.value = type;
      if (orgNameGroup) {
        orgNameGroup.style.display = type === 'center' ? 'block' : 'none';
      }
      if (orgNameInput) {
        orgNameInput.required = type === 'center';
        if (type !== 'center') orgNameInput.value = '';
      }
    });
  });
}

// Auto-create when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createAuthModal);
} else {
  createAuthModal();
}