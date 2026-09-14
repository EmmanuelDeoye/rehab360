// js/main.js
document.addEventListener('DOMContentLoaded', function() {
  console.log('rehablix main.js loaded');

  // ----- DOM elements -----
  const toolCards = document.querySelectorAll('.tool-card-link');
  const toolGrid = document.getElementById('toolGrid');
  const emptyMessage = document.getElementById('emptyMessage');
  const searchInput = document.getElementById('searchInput');
  const themeToggle = document.getElementById('themeToggle');
  const htmlElement = document.documentElement;

  // ----- Search functionality -----
  function filterTools(searchText) {
    const searchTerm = searchText.trim().toLowerCase();
    let visibleCount = 0;
    
    toolCards.forEach(card => {
      const title = card.querySelector('.tool-title').textContent.toLowerCase();
      const description = card.querySelector('.tool-description').textContent.toLowerCase();
      const meta = card.querySelector('.tool-meta').textContent.toLowerCase();
      
      const matches = searchTerm === '' || 
                      title.includes(searchTerm) || 
                      description.includes(searchTerm) ||
                      meta.includes(searchTerm);
      
      if (matches) {
        card.style.display = 'block';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });
    
    // Show/hide empty message
    if (visibleCount === 0) {
      emptyMessage.classList.remove('hidden');
      const askLink = document.getElementById('emptyMessageAskLink');
      if (askLink) askLink.href = 'index.html' + (searchTerm ? '?q=' + encodeURIComponent(searchText.trim()) : '');
    } else {
      emptyMessage.classList.add('hidden');
    }
  }

  // Welcome toast after joining a center via its custom link (join.html)
  (function showCenterWelcomeIfPresent() {
    const params = new URLSearchParams(window.location.search);
    const centerName = params.get('welcome');
    if (!centerName) return;

    const toast = document.createElement('div');
    toast.className = 'center-welcome-toast';
    toast.innerHTML = `<i class="fas fa-circle-check"></i> Welcome to ${centerName.replace(/</g, '&lt;')} — you're all set.`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 4500);

    const url = new URL(window.location.href);
    url.searchParams.delete('welcome');
    window.history.replaceState({}, '', url);
  })();

  // Search input handler
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterTools(e.target.value);
    });

    // Pressing Enter sends the query straight to the Ask AI assistant —
    // useful when what they typed isn't really a tool name but a question.
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const value = searchInput.value.trim();
        if (value) {
          window.location.href = 'index.html?q=' + encodeURIComponent(value);
        }
      }
    });
  }

  // Focus search when magnifying glass is clicked
  const searchToggle = document.getElementById('searchToggle');
  if (searchToggle && searchInput) {
    searchToggle.addEventListener('click', () => {
      searchInput.focus();
    });
  }

  // ----- Theme logic -----
  function initTheme() {
    const stored = localStorage.getItem('rehab-theme');
    if (stored === 'dark' || stored === 'light') {
      htmlElement.setAttribute('data-theme', stored);
    } else {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      htmlElement.setAttribute('data-theme', systemDark ? 'dark' : 'light');
      localStorage.setItem('rehab-theme', 'system');
    }
  }

  function cycleTheme() {
    const current = htmlElement.getAttribute('data-theme');
    let newTheme = 'light';
    if (current === 'light') newTheme = 'dark';
    else if (current === 'dark') newTheme = 'system';
    else newTheme = 'light';

    if (newTheme === 'system') {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      htmlElement.setAttribute('data-theme', systemDark ? 'dark' : 'light');
      localStorage.setItem('rehab-theme', 'system');
    } else {
      htmlElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('rehab-theme', newTheme);
    }
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', cycleTheme);
  }

  // System theme change listener
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (localStorage.getItem('rehab-theme') === 'system') {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      htmlElement.setAttribute('data-theme', systemDark ? 'dark' : 'light');
    }
  });

  // Initialize theme
  initTheme();
  
  // Add click tracking (optional)
  toolCards.forEach(card => {
    card.addEventListener('click', (e) => {
      const toolName = card.querySelector('.tool-title').textContent;
      console.log(`Tool clicked: ${toolName}`);
      // You can add analytics tracking here if needed
    });
  });

  // ----- FAQ Accordion: Keep only one item open at a time -----
  document.querySelectorAll('.faq-item').forEach(item => {
    item.addEventListener('toggle', function() {
      if (this.open) {
        document.querySelectorAll('.faq-item').forEach(other => {
          if (other !== this) other.open = false;
        });
      }
    });
  });
  
  // ----- PWA Install Button (Enhanced) -----
  let deferredPrompt;
  let installBtnDismissed = false;

  // Create the install button (hidden by default)
  const installBtn = document.createElement('button');
  installBtn.id = 'installAppBtn';
  installBtn.className = 'floating-install-btn';
  installBtn.innerHTML = `
    <span class="install-icon">📲</span>
    <span>Install App</span>
    <span class="install-close" title="Dismiss">&times;</span>
  `;
  document.body.appendChild(installBtn);

  // Check if app is already installed (standalone mode)
  function isAppInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.matchMedia('(display-mode: fullscreen)').matches ||
           window.matchMedia('(display-mode: minimal-ui)').matches ||
           navigator.standalone ||   // iOS Safari
           false;
  }

  // Check if installation was previously completed (persisted)
  function wasPreviouslyInstalled() {
    return localStorage.getItem('pwa-installed') === 'true';
  }

  // Remove button if already installed or previously dismissed
  if (isAppInstalled() || wasPreviouslyInstalled()) {
    installBtn.remove();
    console.log('App installed or previously installed, hiding install button');
  } else {
    // Listen for the install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      // Show button with a small delay for a smooth entrance
      setTimeout(() => {
        if (!installBtnDismissed) {
          installBtn.classList.add('visible');
        }
      }, 1200);
      console.log('beforeinstallprompt fired - install button shown');
    });

    // Click handler for the install button
    const handleInstall = async () => {
      if (!deferredPrompt) {
        console.log('No install prompt available – showing manual instructions');
        showInstallInstructions();
        return;
      }

      try {
        // Show the native install prompt
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`Install prompt outcome: ${outcome}`);
        
        if (outcome === 'accepted') {
          // Persist that installation happened
          localStorage.setItem('pwa-installed', 'true');
          installBtn.classList.remove('visible');
          // Clean up after animation
          setTimeout(() => installBtn.remove(), 300);
        } else {
          // User dismissed the native prompt; keep button visible but mark deferredPrompt as null
          deferredPrompt = null;
          // Optionally show the button again after a delay if you want to retry
        }
      } catch (error) {
        console.error('Install prompt error:', error);
        deferredPrompt = null;
        // Button stays visible for retry
      }
    };

    // Attach click event to the main button area (not the close button)
    installBtn.addEventListener('click', (e) => {
      if (e.target.classList.contains('install-close')) return; // handled separately
      handleInstall();
    });

    // Dismiss button (close)
    const closeBtn = installBtn.querySelector('.install-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        installBtnDismissed = true;
        installBtn.classList.remove('visible');
        // Remove after transition
        setTimeout(() => installBtn.remove(), 300);
        console.log('Install button dismissed by user');
      });
    }

    // If PWA is installed via other means (e.g., browser menu), clean up
    window.addEventListener('appinstalled', () => {
      console.log('PWA installed');
      localStorage.setItem('pwa-installed', 'true');
      installBtn.classList.remove('visible');
      setTimeout(() => installBtn.remove(), 300);
      
      // Optional: Show a success toast
      const toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = '✅ App installed successfully!';
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3000);
      }
    });

    // Fallback: If beforeinstallprompt never fires but app isn't installed, show button after 3s
    setTimeout(() => {
      if (!deferredPrompt && !isAppInstalled() && !installBtnDismissed) {
        installBtn.classList.add('visible');
        // Attach a one‑time instruction fallback
        installBtn.addEventListener('click', () => {
          if (!deferredPrompt) showInstallInstructions();
        }, { once: true });
      }
    }, 3000);
  }

  // Show platform‑specific install instructions (used as fallback)
  function showInstallInstructions() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    let message = '';
    
    if (isIOS) {
      message = '📱 Tap the Share button and then "Add to Home Screen"';
    } else if (isAndroid) {
      message = '📱 Tap the menu (⋮) and then "Install app" or "Add to Home Screen"';
    } else {
      message = '💻 Look for the install icon in your browser\'s address bar';
    }
    
    // Use the toast element if it exists, otherwise fallback to alert
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = message;
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 5000);
    } else {
      alert(message);
    }
  }

  // =========================================================================
  // CURRENT PLAN CARD
  // =========================================================================
  function updatePlanCard() {
    const card = document.getElementById('planGlassCard');
    const section = document.getElementById('currentPlanSection');
    if (!card || !section) return;

    // Show the section
    section.style.display = 'block';

    const badge = document.getElementById('planStatusBadge');
    const nameDisplay = document.getElementById('planNameDisplay');
    const descDisplay = document.getElementById('planDescriptionDisplay');
    const iconLarge = document.querySelector('.plan-icon-large');
    const upgradeBtn = document.getElementById('planUpgradeBtn');
    const expiryDiv = document.getElementById('planExpiry');
    const expiryDate = document.getElementById('planExpiryDate');
    const expiryDays = document.getElementById('planExpiryDays');
    const renewalBadge = document.getElementById('planRenewalBadge');

    const plan = window.rehabPlans ? window.rehabPlans.getCurrentPlan() : 'free';

    const config = {
      free: {
        icon: '🚀',
        name: 'Free Plan',
        desc: 'Basic access with monthly usage limits',
        badgeClass: 'free',
        btnText: 'Upgrade Plan'
      },
      student: {
        icon: '🎓',
        name: 'Student Plan',
        desc: 'Full access for healthcare students',
        badgeClass: 'student',
        btnText: 'Upgrade to Pro'
      },
      pro: {
        icon: '💎',
        name: 'Pro Plan',
        desc: 'Unlimited everything for professionals',
        badgeClass: 'pro',
        btnText: 'Manage Plan'
      }
    };

    const planConfig = config[plan] || config.free;

    // Update badge
    if (badge) {
      badge.textContent = planConfig.name;
      badge.className = `plan-status-badge ${planConfig.badgeClass}`;
    }

    // Update icon
    if (iconLarge) iconLarge.textContent = planConfig.icon;

    // Update name & description
    if (nameDisplay) nameDisplay.textContent = planConfig.name;
    if (descDisplay) descDisplay.textContent = planConfig.desc;

    // Update upgrade button text
    if (upgradeBtn) {
      const btnText = upgradeBtn.querySelector('.btn-text');
      if (btnText) btnText.textContent = planConfig.btnText;
    }

    // Show/hide expiry for paid plans
    if (plan !== 'free') {
      const user = firebase.auth().currentUser;
      if (user) {
        firebase.database().ref(`users/${user.uid}/subscription`).once('value')
          .then(snap => {
            const sub = snap.val();
            if (sub && sub.ends) {
              const endDate = new Date(sub.ends);
              const now = new Date();
              const diffDays = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
              
              if (expiryDiv) expiryDiv.style.display = 'flex';
              if (expiryDate) {
                expiryDate.textContent = endDate.toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'long', year: 'numeric'
                });
              }
              if (expiryDays) {
                expiryDays.textContent = diffDays > 0 ? `${diffDays} days left` : 'Expired';
                
                if (diffDays <= 7 && diffDays > 0) {
                  expiryDays.style.background = '#fef3c7';
                  expiryDays.style.color = '#92400e';
                } else {
                  expiryDays.style.background = '#fef2f2';
                  expiryDays.style.color = '#dc2626';
                }
              }
            } else {
              if (expiryDiv) expiryDiv.style.display = 'none';
            }
            if (renewalBadge) renewalBadge.style.display = 'inline-flex';
          })
          .catch(() => {
            if (expiryDiv) expiryDiv.style.display = 'none';
            if (renewalBadge) renewalBadge.style.display = 'none';
          });
      }
    } else {
      if (expiryDiv) expiryDiv.style.display = 'none';
      if (renewalBadge) renewalBadge.style.display = 'none';
    }
  }

  // Listen for plan updates from plan.js
  document.addEventListener('planUpdated', () => {
    updatePlanCard();
  });

  // Initial update with slight delay to ensure plan.js has loaded
  setTimeout(updatePlanCard, 500);

  // Also update when auth state changes (login/logout)
  firebase.auth().onAuthStateChanged(() => {
    setTimeout(updatePlanCard, 500);
  });

  console.log('rehablix ready');
});