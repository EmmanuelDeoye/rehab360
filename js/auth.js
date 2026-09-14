// js/auth.js
document.addEventListener('DOMContentLoaded', function() {
  console.log('Auth.js loaded with Firebase Realtime Database');
  
  // Check if Firebase is initialized
  if (typeof firebase === 'undefined') {
    console.error('Firebase SDK not loaded!');
    return;
  }
  
  // Wait a moment for Firebase to fully initialize
  setTimeout(initializeAuth, 100);
});

function initializeAuth() {
  if (firebase.apps.length === 0) {
    console.error('Firebase not initialized.');
    return;
  }

  // DOM Elements with null checks
  const modal = document.getElementById('authModal');
  const loginBtn = document.getElementById('loginBtn');
  const profileDropdown = document.getElementById('profileDropdown');
  const profileBtn = document.getElementById('profileBtn');
  const profileIcon = document.getElementById('profileIcon');
  const profileName = document.getElementById('profileName');
  const dropdownMenu = document.getElementById('dropdownMenu');
  const logoutMenuItem = document.getElementById('logoutMenuItem');
  const profileMenuItem = document.getElementById('profileMenuItem');
  const settingsMenuItem = document.getElementById('settingsMenuItem');
  const closeBtn = document.getElementById('closeModal');
  const loginTab = document.getElementById('loginTab');
  const registerTab = document.getElementById('registerTab');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const toast = document.getElementById('toast');
  const welcomeOverlay = document.getElementById('welcomeOverlay');
  const loginError = document.getElementById('loginError');
  const registerError = document.getElementById('registerError');
  const heroTitle = document.getElementById('heroTitle');
  const forgotPassword = document.getElementById('forgotPassword');
  const googleSignInBtn = document.getElementById('googleSignInBtn');
  
  // Get the history navigation button element (supports both IDs used across pages)
  const historyNavBtn = document.getElementById('historyNavBtn');
  const toggleHistoryBtn = document.getElementById('toggleHistoryBtn');
  // Use whichever button exists in the current page
  const historyButton = historyNavBtn || toggleHistoryBtn;

  // Check if critical elements exist
  if (!modal || !loginBtn || !closeBtn) {
    console.error('Critical auth elements are missing!');
    return;
  }

  // Get Firebase instances
  const auth = firebase.auth();
  const database = firebase.database();

  // ==============================================================
  // REHABLIX PARTNERS: resolve a stored referral code to a partner uid
  // ==============================================================
  // js/modal.js captures ?ref=CODE into localStorage on any page load.
  // At signup time we look that code up in the referralCodes index
  // (referralCodes/{code} -> partnerUid) to find who to credit. We don't
  // clear localStorage here — the caller clears it only after a
  // successful account creation, so a failed signup attempt can still
  // retry with the same code.
  async function resolveReferralCode() {
    try {
      const code = localStorage.getItem('rehablix_ref_code');
      if (!code) return null;
      const snap = await database.ref('referralCodes/' + code).once('value');
      return snap.val() || null;
    } catch (err) {
      console.warn('Referral code lookup failed:', err);
      return null;
    }
  }

  // Show toast message
  function showToast(message, duration = 3000, isError = false) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    toast.style.background = isError ? '#dc2626' : 'var(--accent)';
    
    setTimeout(() => {
      toast.classList.add('hidden');
    }, duration);
  }

  // Show welcome animation
  function showWelcomeAnimation() {
    if (!welcomeOverlay) return;
    welcomeOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    setTimeout(() => {
      welcomeOverlay.classList.add('hidden');
      document.body.style.overflow = '';
    }, 4000);
  }

  // Close modal function
  function closeModal() {
    if (!modal) return;
    modal.classList.remove('show');
    document.body.style.overflow = '';
    if (loginForm) loginForm.reset();
    if (registerForm) registerForm.reset();
    if (loginError) loginError.textContent = '';
    if (registerError) registerError.textContent = '';
  }

  // Get user initials for profile icon
  function getUserInitials(name) {
    if (!name) return '👤';
    const words = name.split(' ');
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  // Translate Firebase error codes to friendly messages
  function getFriendlyErrorMessage(error) {
    const errorCode = error.code || '';
    
    const errorMessages = {
      // Login errors
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/user-disabled': 'This account has been disabled. Please contact support.',
      'auth/user-not-found': 'No account found with this email. Would you like to create one?',
      'auth/wrong-password': 'Incorrect password. Please try again or reset your password.',
      'auth/invalid-credential': 'Incorrect email or password. Please try again.',
      'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
      
      // Registration errors
      'auth/email-already-in-use': 'An account with this email already exists. Try logging in instead.',
      'auth/weak-password': 'Please choose a stronger password — at least 6 characters.',
      'auth/operation-not-allowed': 'Registration is currently unavailable. Please try again later.',
      
      // Google sign-in errors
      'auth/popup-closed-by-user': 'Sign-in was cancelled.',
      'auth/popup-blocked': 'Pop-up was blocked by your browser. Please allow pop-ups for this site.',
      'auth/cancelled-popup-request': 'Sign-in was cancelled.',
      'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method. Try logging in with email and password instead.',
      
      // Password reset errors
      'auth/missing-email': 'Please enter your email address first.',
      
      // Generic / network errors
      'auth/network-request-failed': 'Network error. Please check your internet connection and try again.',
      'auth/internal-error': 'Something went wrong on our end. Please try again in a moment.',
      'auth/timeout': 'The request timed out. Please check your connection and try again.',
    };
    
    // Return friendly message if we have one, otherwise a clean generic message
    if (errorMessages[errorCode]) {
      return errorMessages[errorCode];
    }
    
    // Fallback: if Firebase gave us a message, clean it up
    if (error.message) {
      // Remove "Firebase: " prefix and " (auth/...)" suffix
      let cleanMessage = error.message
        .replace(/^Firebase:\s*/i, '')
        .replace(/\s*\(auth\/[^)]+\)\s*$/i, '')
        .trim();
      
      // If it still looks technical, use a generic message
      if (cleanMessage.length > 100 || cleanMessage.includes('{')) {
        return 'Something went wrong. Please try again.';
      }
      
      return cleanMessage;
    }
    
    return 'Something went wrong. Please try again.';
  }

  // ==============================================================
  // USER VISIT TRACKING
  // ==============================================================
  
  /**
   * Records a user's visit with timestamp and page URL
   * @param {string} userId - The Firebase user ID
   * @param {string} email - User's email (for fallback)
   * @param {string} pageUrl - The current page URL
   */
  function recordUserVisit(userId, email, pageUrl) {
    if (!userId) return;

    // If a center owner previously invited this email before they had an
    // account, link them up now that they exist / are signing in.
    if (window.RehablixCenter && typeof window.RehablixCenter.linkPendingInviteForUser === 'function') {
      database.ref('users/' + userId + '/name').once('value')
        .then(snap => window.RehablixCenter.linkPendingInviteForUser(userId, email, snap.val()))
        .catch(err => console.error('linkPendingInviteForUser error:', err));
    }

    // One-time silent migration of any legacy top-level centers/{uid} data
    // (from before centers were nested under users/{uid}/centers).
    if (window.RehablixCenter && typeof window.RehablixCenter.migrateLegacyCenterNode === 'function') {
      window.RehablixCenter.migrateLegacyCenterNode(userId).catch(err => console.error('migrateLegacyCenterNode error:', err));
    }

    // One-time silent migration from the old single memberOf field to the
    // new multi-center memberships map.
    if (window.RehablixCenter && typeof window.RehablixCenter.migrateLegacyMembership === 'function') {
      window.RehablixCenter.migrateLegacyMembership(userId).catch(err => console.error('migrateLegacyMembership error:', err));
    }
    
    const now = Date.now();
    const visitData = {
      timestamp: now,
      date: new Date().toISOString(),
      page: pageUrl || window.location.pathname,
      userAgent: navigator.userAgent.substring(0, 200) // Truncate to avoid storage limits
    };
    
    // Use a push operation to add to visits array (keeps history)
    const visitRef = database.ref(`users/${userId}/visits`).push();
    visitRef.set(visitData)
      .then(() => {
        console.log('✅ Visit recorded for user:', email);
      })
      .catch((error) => {
        console.error('❌ Error recording visit:', error);
      });
    
    // Also update a "lastVisit" field for quick access
    const lastVisitRef = database.ref(`users/${userId}/lastVisit`);
    lastVisitRef.set({
      timestamp: now,
      date: new Date().toISOString(),
      page: pageUrl || window.location.pathname
    }).catch((error) => {
      console.error('❌ Error updating lastVisit:', error);
    });
    
    // Update last page URL
    const lastPageRef = database.ref(`users/${userId}/lastPage`);
    lastPageRef.set({
      url: pageUrl || window.location.href,
      timestamp: now,
      date: new Date().toISOString()
    }).catch((error) => {
      console.error('❌ Error updating lastPage:', error);
    });
  }

  /**
   * Records a page view for the current user
   * This should be called on every page navigation
   */
  function recordPageView() {
    const user = auth.currentUser;
    if (!user) return;
    
    const pageUrl = window.location.href;
    const pagePath = window.location.pathname;
    
    // Record as a page view (lighter than full visit)
    const pageViewRef = database.ref(`users/${user.uid}/pageViews`).push();
    pageViewRef.set({
      timestamp: Date.now(),
      date: new Date().toISOString(),
      page: pagePath,
      url: pageUrl,
      referrer: document.referrer || ''
    }).catch((error) => {
      console.error('❌ Error recording page view:', error);
    });
    
    // Also update last page
    database.ref(`users/${user.uid}/lastPage`).set({
      url: pageUrl,
      page: pagePath,
      timestamp: Date.now(),
      date: new Date().toISOString()
    }).catch((error) => {
      console.error('❌ Error updating lastPage:', error);
    });
  }

  // ==============================================================
  // ANONYMOUS VISIT TRACKING
  // ==============================================================
  
  /**
   * Records a visit from an anonymous (non-logged-in) user
   * Uses a combination of localStorage and session data to track unique visitors
   */
  function recordAnonymousVisit() {
    try {
      // Generate or retrieve anonymous visitor ID
      let visitorId = localStorage.getItem('rehab_visitor_id');
      if (!visitorId) {
        visitorId = 'anon_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        localStorage.setItem('rehab_visitor_id', visitorId);
      }

      // Check if we've already recorded a visit for this session
      const sessionKey = 'rehab_visit_' + visitorId;
      const lastVisitTime = sessionStorage.getItem(sessionKey);
      const now = Date.now();
      
      // Only record if more than 30 minutes have passed since last visit in this session
      // This prevents counting every page reload as a new visit
      const shouldRecord = !lastVisitTime || (now - parseInt(lastVisitTime) > 30 * 60 * 1000);
      
      if (shouldRecord) {
        // Update session storage
        sessionStorage.setItem(sessionKey, now.toString());
        
        // Build visit data
        const visitData = {
          timestamp: now,
          date: new Date().toISOString(),
          page: window.location.pathname,
          url: window.location.href,
          referrer: document.referrer || 'direct',
          userAgent: navigator.userAgent.substring(0, 200),
          visitorId: visitorId,
          isAnonymous: true,
          screenSize: `${window.innerWidth}x${window.innerHeight}`,
          language: navigator.language || 'unknown'
        };

        // Store in Firebase under anonymous-visits
        const visitRef = database.ref('anonymous-visits').push();
        visitRef.set(visitData)
          .then(() => {
            console.log('✅ Anonymous visit recorded:', visitorId);
          })
          .catch((error) => {
            console.error('❌ Error recording anonymous visit:', error);
          });

        // Also update daily stats for quick access
        updateDailyAnonymousStats(now);
      }
    } catch (error) {
      console.error('❌ Error in anonymous visit tracking:', error);
    }
  }

  /**
   * Updates daily anonymous visit statistics
   * @param {number} timestamp - The current timestamp
   */
  function updateDailyAnonymousStats(timestamp) {
    try {
      const date = new Date(timestamp);
      const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
      
      // Get or create daily stats
      const statsRef = database.ref(`anonymous-stats/${dateKey}`);
      statsRef.transaction((currentData) => {
        if (currentData === null) {
          return {
            count: 1,
            date: dateKey,
            firstVisit: timestamp,
            lastVisit: timestamp,
            pages: {}
          };
        }
        
        // Increment count
        currentData.count = (currentData.count || 0) + 1;
        currentData.lastVisit = timestamp;
        
        // Track page visits
        const page = window.location.pathname;
        if (!currentData.pages) currentData.pages = {};
        if (!currentData.pages[page]) {
          currentData.pages[page] = 0;
        }
        currentData.pages[page] = (currentData.pages[page] || 0) + 1;
        
        return currentData;
      }).catch((error) => {
        console.error('❌ Error updating daily stats:', error);
      });
    } catch (error) {
      console.error('❌ Error in daily stats update:', error);
    }
  }

  /**
   * Gets anonymous visitor count for the current day
   * @returns {Promise<number>} - Number of anonymous visits today
   */
  async function getAnonymousVisitsToday() {
    try {
      const dateKey = new Date().toISOString().split('T')[0];
      const snapshot = await database.ref(`anonymous-stats/${dateKey}/count`).once('value');
      return snapshot.val() || 0;
    } catch (error) {
      console.error('❌ Error getting anonymous visits:', error);
      return 0;
    }
  }

  /**
   * Gets total anonymous visitor count (all time)
   * @returns {Promise<number>} - Total anonymous visits
   */
  async function getTotalAnonymousVisits() {
    try {
      const snapshot = await database.ref('anonymous-visits').once('value');
      const data = snapshot.val();
      if (!data) return 0;
      
      // Count all anonymous visits
      let count = 0;
      for (const key in data) {
        if (data[key] && data[key].isAnonymous !== false) {
          count++;
        }
      }
      return count;
    } catch (error) {
      console.error('❌ Error getting total anonymous visits:', error);
      return 0;
    }
  }

  // ==============================================================
  // UPDATE HERO TITLE
  // ==============================================================
  
  function updateHeroTitle(user) {
    if (!heroTitle) return;
    
    if (user) {
      const userId = user.uid;
      database.ref('users/' + userId).once('value').then((snapshot) => {
        const userData = snapshot.val();
        const displayName = userData && userData.name ? userData.name : user.displayName || user.email.split('@')[0];
        heroTitle.innerHTML = `Welcome <span class="hero-accent">${displayName}</span>`;
        
        if (profileName) profileName.textContent = displayName;
        if (profileIcon) {
          if (userData && userData.photoURL) {
            profileIcon.innerHTML = `<img src="${userData.photoURL}" alt="${displayName}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
          } else {
            profileIcon.textContent = getUserInitials(displayName);
          }
        }
      }).catch((error) => {
        console.error('Error fetching user data:', error);
        const emailName = user.email.split('@')[0];
        heroTitle.innerHTML = `Welcome <span class="hero-accent">${emailName}</span>`;
        if (profileName) profileName.textContent = emailName;
        if (profileIcon) profileIcon.textContent = getUserInitials(emailName);
      });
    } else {
      heroTitle.innerHTML = `Welcome to <span class="hero-accent">rehablix</span>`;
    }
  }

  // ==============================================================
  // UPDATE AUTH UI
  // ==============================================================
  
  function updateAuthUI(user) {
    if (!loginBtn || !profileDropdown) return;
    
    if (user) {
      loginBtn.style.display = 'none';
      profileDropdown.style.display = 'inline-block';
      updateHeroTitle(user);
    } else {
      loginBtn.style.display = 'inline-block';
      profileDropdown.style.display = 'none';
      updateHeroTitle(null);
    }
  }

  // Show or hide the history button based on login state
  function updateHistoryButtonVisibility(user) {
    if (!historyButton) {
      console.warn('History button not found in DOM - this is fine if the page has no history button');
      return;
    }
    
    if (user) {
      // User is logged in: make the history button visible
      historyButton.style.display = 'inline-flex';
      console.log('History button shown (user logged in)');
    } else {
      // User is logged out: hide the history button
      historyButton.style.display = 'none';
      console.log('History button hidden (user logged out)');
    }
  }

  // ==============================================================
  // GOOGLE SIGN-IN
  // ==============================================================
  
  if (googleSignInBtn) {
    googleSignInBtn.addEventListener('click', async () => {
      const provider = new firebase.auth.GoogleAuthProvider();
      
      try {
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        
        const userRef = database.ref('users/' + user.uid);
        const snapshot = await userRef.once('value');
        
        if (!snapshot.exists()) {
          const userData = {
            name: user.displayName || user.email.split('@')[0],
            email: user.email,
            specialization: '',
            createdAt: new Date().toISOString(),
            userId: user.uid,
            photoURL: user.photoURL || '',
            provider: 'google',
            termsAgreed: true,
            termsAgreedAt: new Date().toISOString()
          };

          // Rehablix Partners: attribute this signup to a referring
          // partner if a valid ?ref= code is on file (see resolveReferralCode).
          const referrerUid = await resolveReferralCode();
          if (referrerUid && referrerUid !== user.uid) {
            userData.referredBy = referrerUid;
          }

          await userRef.set(userData);

          if (referrerUid && referrerUid !== user.uid) {
            database.ref(`partners/${referrerUid}/referrals/${user.uid}`).set({
              name: userData.name,
              email: userData.email,
              joinedAt: new Date().toISOString()
            }).catch(err => console.warn('Referral tracking failed:', err));
          }
          localStorage.removeItem('rehablix_ref_code');

          showToast('🎉 Account created with Google!');
          showWelcomeAnimation();
        } else {
          const existingData = snapshot.val();
          const displayName = existingData.name || user.displayName || user.email.split('@')[0];
          showToast(`👋 Welcome back, ${displayName}!`);
        }
        
        // Record visit after successful login
        recordUserVisit(user.uid, user.email, window.location.pathname);
        
        closeModal();
      } catch (error) {
        console.error('Google sign-in error:', error);
        showToast(getFriendlyErrorMessage(error), 4000, true);
      }
    });
  }

  // ==============================================================
  // AUTH STATE LISTENER
  // ==============================================================
  
  auth.onAuthStateChanged((user) => {
    updateAuthUI(user);
    updateHistoryButtonVisibility(user);
    
    if (user) {
      console.log('User logged in:', user.email);
      
      // Record visit when user is detected (on page load)
      setTimeout(() => {
        recordUserVisit(user.uid, user.email, window.location.pathname);
      }, 500);
      
      // Also record a page view
      setTimeout(() => {
        recordPageView();
      }, 600);
      
    } else {
      console.log('User logged out');
    }
  });

  // ==============================================================
  // PAGE VIEW TRACKING ON NAVIGATION
  // ==============================================================
  
  // Track page views when the page loads (for SPA-like behavior)
  // This uses the History API to detect navigation
  let lastPageUrl = window.location.href;
  
  function handlePageChange() {
    const user = auth.currentUser;
    if (user && window.location.href !== lastPageUrl) {
      lastPageUrl = window.location.href;
      recordPageView();
      // Also record a visit (less frequent, but good for tracking)
      recordUserVisit(user.uid, user.email, window.location.pathname);
    }
    
    // Also record anonymous page view
    recordAnonymousVisit();
  }
  
  // Listen for popstate (back/forward navigation)
  window.addEventListener('popstate', handlePageChange);
  
  // Override pushState and replaceState to detect SPA navigation
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function() {
    originalPushState.apply(this, arguments);
    handlePageChange();
  };
  
  history.replaceState = function() {
    originalReplaceState.apply(this, arguments);
    handlePageChange();
  };
  
  // Also listen for hash changes
  window.addEventListener('hashchange', handlePageChange);

  // ==============================================================
  // EVENT LISTENERS
  // ==============================================================
  
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      modal.classList.add('show');
      document.body.style.overflow = 'hidden';
      if (loginError) loginError.textContent = '';
      if (registerError) registerError.textContent = '';
    });
  }

  if (profileBtn && dropdownMenu) {
    profileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownMenu.classList.toggle('show');
    });
  }

  document.addEventListener('click', (e) => {
    if (dropdownMenu && profileBtn && !profileBtn.contains(e.target) && !dropdownMenu.contains(e.target)) {
      dropdownMenu.classList.remove('show');
    }
  });

  // ----- Profile Menu Item -----
  if (profileMenuItem) {
    profileMenuItem.addEventListener('click', () => {
      if (dropdownMenu) dropdownMenu.classList.remove('show');
      // Open profile modal (defined in modal.js)
      if (typeof window.openProfileModal === 'function') {
        window.openProfileModal();
      } else {
        showToast('👤 loading profile');
      }
    });
  }

  // ----- Settings Menu Item -----
  if (settingsMenuItem) {
    settingsMenuItem.addEventListener('click', () => {
      if (dropdownMenu) dropdownMenu.classList.remove('show');
      // Open settings modal (defined in modal.js)
      if (typeof window.openSettingsModal === 'function') {
        window.openSettingsModal();
      } else {
        showToast('⚙️ opening settings...');
      }
    });
  }

  // ----- Logout Menu Item -----
  if (logoutMenuItem) {
    logoutMenuItem.addEventListener('click', async () => {
      if (dropdownMenu) dropdownMenu.classList.remove('show');
      try {
        // Record logout time
        const user = auth.currentUser;
        if (user) {
          await database.ref(`users/${user.uid}/lastLogout`).set({
            timestamp: Date.now(),
            date: new Date().toISOString()
          });
        }
        await auth.signOut();
        showToast('👋 Logged out successfully!');
      } catch (error) {
        console.error('Logout error:', error);
        showToast('Error logging out. Please try again.', 3000, true);
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
  }
  
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
  }

  if (loginTab && registerTab && loginForm && registerForm) {
    loginTab.addEventListener('click', () => {
      loginTab.classList.add('active');
      registerTab.classList.remove('active');
      loginForm.classList.add('active');
      registerForm.classList.remove('active');
      if (loginError) loginError.textContent = '';
      if (registerError) registerError.textContent = '';
    });

    registerTab.addEventListener('click', () => {
      registerTab.classList.add('active');
      loginTab.classList.remove('active');
      registerForm.classList.add('active');
      loginForm.classList.remove('active');
      if (loginError) loginError.textContent = '';
      if (registerError) registerError.textContent = '';
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('show')) {
      closeModal();
    }
  });

  // ==============================================================
  // LOGIN FORM HANDLER
  // ==============================================================
  
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('loginEmail')?.value;
      const password = document.getElementById('loginPassword')?.value;
      const loginTerms = document.getElementById('loginTerms')?.checked;
      const submitBtn = document.getElementById('loginSubmitBtn');
      
      if (!email || !password) return;
      
      // Check if terms are agreed
      if (!loginTerms) {
        if (loginError) loginError.textContent = 'Please agree to the terms and conditions.';
        return;
      }
      
      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Logging in...';
        }
        if (loginError) loginError.textContent = '';
        
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Record visit on login
        recordUserVisit(user.uid, user.email, window.location.pathname);
        
        closeModal();
        showToast(`👋 Welcome back!`);
        
      } catch (error) {
        console.error('Login error:', error);
        if (loginError) loginError.textContent = getFriendlyErrorMessage(error);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Login';
        }
      }
    });
  }

  // ==============================================================
  // REGISTER FORM HANDLER
  // ==============================================================
  
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const name = document.getElementById('regName')?.value;
      const email = document.getElementById('regEmail')?.value;
      const password = document.getElementById('regPassword')?.value;
      const repeatPassword = document.getElementById('regRepeatPassword')?.value;
      const specialization = document.getElementById('voiceRange')?.value;
      const registerTerms = document.getElementById('registerTerms')?.checked;
      const accountType = document.getElementById('regAccountType')?.value === 'center' ? 'center' : 'individual';
      const orgName = document.getElementById('regOrgName')?.value?.trim();
      const submitBtn = document.getElementById('registerSubmitBtn');
      
      if (!name || !email || !password || !repeatPassword || !specialization) return;

      if (accountType === 'center' && !orgName) {
        if (registerError) registerError.textContent = 'Please enter your organization / center name.';
        return;
      }
      
      // Check if terms are agreed
      if (!registerTerms) {
        if (registerError) registerError.textContent = 'You must agree to the terms and conditions.';
        return;
      }
      
      if (password !== repeatPassword) {
        if (registerError) registerError.textContent = 'Passwords do not match. Please try again.';
        return;
      }
      
      if (password.length < 6) {
        if (registerError) registerError.textContent = 'Password must be at least 6 characters.';
        return;
      }
      
      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Creating account...';
        }
        if (registerError) registerError.textContent = '';
        
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        await user.updateProfile({ displayName: name });

        const userRecord = {
          name: name,
          email: email,
          specialization: specialization,
          createdAt: new Date().toISOString(),
          termsAgreed: true,
          termsAgreedAt: new Date().toISOString(),
          userId: user.uid,
          provider: 'email',
          accountType: accountType
        };

        if (accountType === 'center') {
          userRecord.centerId = user.uid; // a center owner's own uid doubles as the center id
        }

        // Rehablix Partners: if this visitor arrived via a partner's
        // referral link, resolve the code to a partner uid and attach it
        // so future subscription payments can be attributed & commissioned.
        const referrerUid = await resolveReferralCode();
        if (referrerUid && referrerUid !== user.uid) {
          userRecord.referredBy = referrerUid;
        }

        await database.ref('users/' + user.uid).set(userRecord);

        if (referrerUid && referrerUid !== user.uid) {
          database.ref(`partners/${referrerUid}/referrals/${user.uid}`).set({
            name: name,
            email: email,
            joinedAt: new Date().toISOString()
          }).catch(err => console.warn('Referral tracking failed:', err));
        }
        localStorage.removeItem('rehablix_ref_code');

        if (accountType === 'center') {
          await database.ref('users/' + user.uid + '/centers').set({
            name: orgName,
            ownerUid: user.uid,
            ownerEmail: email,
            createdAt: new Date().toISOString()
          });
        }
        
        // Record first visit
        recordUserVisit(user.uid, user.email, window.location.pathname);
        
        closeModal();
        showWelcomeAnimation();
        
      } catch (error) {
        console.error('Registration error:', error);
        if (registerError) registerError.textContent = getFriendlyErrorMessage(error);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Account';
        }
      }
    });
  }

  // ==============================================================
  // FORGOT PASSWORD
  // ==============================================================
  
  if (forgotPassword) {
    forgotPassword.addEventListener('click', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail')?.value;
      
      if (!email) {
        if (loginError) loginError.textContent = 'Please enter your email address first so we can send you a reset link.';
        return;
      }
      
      try {
        await auth.sendPasswordResetEmail(email);
        showToast('📧 Password reset link sent! Check your inbox.');
        closeModal();
      } catch (error) {
        console.error('Password reset error:', error);
        if (loginError) loginError.textContent = getFriendlyErrorMessage(error);
      }
    });
  }

  if (welcomeOverlay) {
    welcomeOverlay.addEventListener('click', () => {
      welcomeOverlay.classList.add('hidden');
      document.body.style.overflow = '';
    });
  }

  // ==============================================================
  // ANONYMOUS VISIT TRACKING - INITIALIZATION
  // ==============================================================
  
  // Record anonymous visit when page loads
  setTimeout(() => {
    recordAnonymousVisit();
  }, 300);

  // Also record on visibility change (when user comes back to tab)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      // User returned to the page - record a visit
      setTimeout(() => {
        recordAnonymousVisit();
      }, 500);
    }
  });

  // Expose anonymous visit functions globally for debugging or dashboard use
  window.getAnonymousVisitsToday = getAnonymousVisitsToday;
  window.getTotalAnonymousVisits = getTotalAnonymousVisits;

  console.log('Auth.js initialization complete');
}
