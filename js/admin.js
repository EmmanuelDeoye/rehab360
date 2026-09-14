// js/admin.js - Complete admin dashboard functionality

document.addEventListener('DOMContentLoaded', function() {
  console.log('Admin.js loaded');

  // ==============================================================
  // DOM ELEMENTS
  // ==============================================================
  const adminAuthScreen = document.getElementById('adminAuthScreen');
  const adminDashboard = document.getElementById('adminDashboard');
  const authStatusMsg = document.getElementById('authStatusMsg');
  const setupForm = document.getElementById('setupForm');
  const loginForm = document.getElementById('loginForm');
  const setupPassword = document.getElementById('setupPassword');
  const setupPasswordConfirm = document.getElementById('setupPasswordConfirm');
  const setupBtn = document.getElementById('setupBtn');
  const setupError = document.getElementById('setupError');
  const loginPassword = document.getElementById('loginPassword');
  const loginBtn = document.getElementById('loginBtn');
  const loginError = document.getElementById('loginError');
  const adminLogoutBtn = document.getElementById('adminLogoutBtn');
  const adminEmailDisplay = document.getElementById('adminEmailDisplay');
  const themeToggle = document.getElementById('themeToggle');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const adminSidebar = document.getElementById('adminSidebar');

  // Views
  const viewDashboard = document.getElementById('viewDashboard');
  const viewUsers = document.getElementById('viewUsers');
  const viewReviews = document.getElementById('viewReviews');
  const viewPartners = document.getElementById('viewPartners');
  const viewSettings = document.getElementById('viewSettings');
  const sidebarLinks = document.querySelectorAll('.sidebar-link');

  // Dashboard stats
  const statTotalUsers = document.getElementById('statTotalUsers');
  const statVisitsToday = document.getElementById('statVisitsToday');
  const statVisitsWeek = document.getElementById('statVisitsWeek');
  const statVisitsMonth = document.getElementById('statVisitsMonth');
  const planFreeCount = document.getElementById('planFreeCount');
  const planStudentCount = document.getElementById('planStudentCount');
  const planProCount = document.getElementById('planProCount');
  const userCountBadge = document.getElementById('userCountBadge');

  // Stats cards
  const statTotalUsersCard = document.getElementById('statTotalUsersCard');
  const statTodayCard = document.getElementById('statTodayCard');
  const statWeekCard = document.getElementById('statWeekCard');
  const statMonthCard = document.getElementById('statMonthCard');

  // Users table
  const userTableBody = document.getElementById('userTableBody');
  const usersEmpty = document.getElementById('usersEmpty');
  const usersLoading = document.getElementById('usersLoading');
  const userSearch = document.getElementById('userSearch');
  const filterSpecialization = document.getElementById('filterSpecialization');
  const filterPlan = document.getElementById('filterPlan');
  const filterProvider = document.getElementById('filterProvider');
  const filterAccountType = document.getElementById('filterAccountType');
  const sortUsers = document.getElementById('sortUsers');
  const refreshUsersBtn = document.getElementById('refreshUsersBtn');

  // Reviews table
  const reviewTableBody = document.getElementById('reviewTableBody');
  const reviewsEmpty = document.getElementById('reviewsEmpty');
  const reviewsLoading = document.getElementById('reviewsLoading');
  const reviewSearch = document.getElementById('reviewSearch');
  const filterReviewType = document.getElementById('filterReviewType');
  const filterReviewTool = document.getElementById('filterReviewTool');
  const filterReviewStatus = document.getElementById('filterReviewStatus');
  const sortReviews = document.getElementById('sortReviews');
  const refreshReviewsBtn = document.getElementById('refreshReviewsBtn');
  const reviewCountBadge = document.getElementById('reviewCountBadge');

  // Partners table
  const partnerTableBody = document.getElementById('partnerTableBody');
  const partnersEmpty = document.getElementById('partnersEmpty');
  const partnersLoading = document.getElementById('partnersLoading');
  const partnerSearch = document.getElementById('partnerSearch');
  const filterPartnerStatus = document.getElementById('filterPartnerStatus');
  const sortPartners = document.getElementById('sortPartners');
  const refreshPartnersBtn = document.getElementById('refreshPartnersBtn');
  const partnerCountBadge = document.getElementById('partnerCountBadge');

  // Modals
  const userDetailModal = document.getElementById('userDetailModal');
  const changePlanModal = document.getElementById('changePlanModal');
  const contactModal = document.getElementById('contactModal');
  const reviewDetailModal = document.getElementById('reviewDetailModal');
  const confirmModal = document.getElementById('confirmModal');
  const partnerDetailModal = document.getElementById('partnerDetailModal');
  const rejectReasonModal = document.getElementById('rejectReasonModal');

  // Settings
  const newAdminPass = document.getElementById('newAdminPass');
  const newAdminPassConfirm = document.getElementById('newAdminPassConfirm');
  const changeAdminPassBtn = document.getElementById('changeAdminPassBtn');
  const settingsMsg = document.getElementById('settingsMsg');
  const clearVisitsBtn = document.getElementById('clearVisitsBtn');
  const addAccessEmail = document.getElementById('addAccessEmail');
  const addAccessBtn = document.getElementById('addAccessBtn');
  const accessList = document.getElementById('accessList');
  const accessMsg = document.getElementById('accessMsg');
  const addAccessForm = document.getElementById('addAccessForm');
  const accessManagementCard = document.getElementById('accessManagementCard');

  // Chart elements
  const visitChartCanvas = document.getElementById('visitChart');
  const chartTimeBtns = document.querySelectorAll('.chart-time-btn');

  // ==============================================================
  // FIREBASE SETUP
  // ==============================================================
  const auth = firebase.auth();
  const database = firebase.database();

  // ==============================================================
  // CONSTANTS
  // ==============================================================
  const MASTER_ADMIN_EMAIL = 'tolexar.ted@gmail.com';
  const ADMIN_ACCESS_PATH = 'admin/access';

  // ==============================================================
  // EMAILJS (client-side transactional email — this site has no backend)
  // ==============================================================
  // Sign up free at https://www.emailjs.com, connect an email service
  // (Gmail, Outlook, SMTP, etc.), and create two templates: one for partner
  // approval and one for partner rejection. Then fill these in. Until you
  // do, emails are skipped gracefully (logged to console) rather than
  // breaking the approve/reject flow.
  const EMAILJS_CONFIG = {
    PUBLIC_KEY: 'YOUR_EMAILJS_PUBLIC_KEY',
    SERVICE_ID: 'YOUR_EMAILJS_SERVICE_ID',
    TEMPLATE_APPROVED: 'YOUR_EMAILJS_APPROVED_TEMPLATE_ID',
    TEMPLATE_REJECTED: 'YOUR_EMAILJS_REJECTED_TEMPLATE_ID'
  };
  const emailJsReady = () =>
    typeof emailjs !== 'undefined' &&
    !EMAILJS_CONFIG.PUBLIC_KEY.startsWith('YOUR_');

  if (emailJsReady()) {
    try { emailjs.init({ publicKey: EMAILJS_CONFIG.PUBLIC_KEY }); } catch (e) { console.warn('EmailJS init failed:', e); }
  }

  // Sends a partner status-update email. Template params available to your
  // EmailJS template: to_email, to_name, status, reason, referral_link.
  async function sendPartnerStatusEmail(partner, status, reason) {
    if (!emailJsReady()) {
      console.warn(`[EmailJS not configured] Would have emailed ${partner.email}: partner ${status}.` +
        (reason ? ` Reason: ${reason}` : ''));
      return;
    }
    const templateId = status === 'approved' ? EMAILJS_CONFIG.TEMPLATE_APPROVED : EMAILJS_CONFIG.TEMPLATE_REJECTED;
    try {
      await emailjs.send(EMAILJS_CONFIG.SERVICE_ID, templateId, {
        to_email: partner.email,
        to_name: partner.name || partner.email,
        status: status,
        reason: reason || '',
        referral_link: `${window.location.origin}/index.html?ref=${encodeURIComponent(partner.code || '')}`
      });
    } catch (err) {
      console.error('EmailJS send failed:', err);
      showToast('Status updated, but the notification email failed to send.', 'warning');
    }
  }

  // ==============================================================
  // STATE
  // ==============================================================
  let allUsers = [];
  let filteredUsers = [];
  let allReviews = [];
  let filteredReviews = [];
  let selectedReviewKey = null;
  let allPartners = [];
  let filteredPartners = [];
  let selectedPartnerUid = null;
  let pendingRejectUid = null;
  let contactContext = null; // { email, phone, label, kind: 'user'|'review', refId }
  let currentView = 'dashboard';
  let selectedUserId = null;
  let confirmAction = null;
  let confirmData = null;
  let isMasterAdmin = false;
  let currentAdminEmail = null;
  let isLoggedIn = false;
  let refreshTimeout = null;
  let isLoading = false;
  let visitChart = null;
  let currentChartRange = 'today';

  // ==============================================================
  // TOAST / NOTIFICATIONS
  // ==============================================================
  const toast = document.getElementById('adminToast');

  function showToast(message, type = 'success', duration = 3000) {
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'admin-toast';
    if (type === 'error') toast.classList.add('error');
    if (type === 'warning') toast.classList.add('warning');
    toast.classList.remove('hidden');

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.add('hidden');
    }, duration);
  }

  // ==============================================================
  // THEME
  // ==============================================================
  function initTheme() {
    const stored = localStorage.getItem('rehab-theme');
    const html = document.documentElement;
    if (stored === 'dark' || stored === 'light') {
      html.setAttribute('data-theme', stored);
    } else {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      html.setAttribute('data-theme', systemDark ? 'dark' : 'light');
    }
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const html = document.documentElement;
      const current = html.getAttribute('data-theme');
      const newTheme = current === 'light' ? 'dark' : 'light';
      html.setAttribute('data-theme', newTheme);
      localStorage.setItem('rehab-theme', newTheme);
      // Update chart colors on theme change
      if (visitChart) {
        updateChartColors();
      }
    });
  }

  initTheme();

  // ==============================================================
  // SIDEBAR TOGGLE (mobile)
  // ==============================================================
  if (sidebarToggle && adminSidebar) {
    sidebarToggle.addEventListener('click', () => {
      adminSidebar.classList.toggle('open');
    });
  }

  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && adminSidebar && adminSidebar.classList.contains('open')) {
      if (!adminSidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
        adminSidebar.classList.remove('open');
      }
    }
  });

  // ==============================================================
  // SIDEBAR NAVIGATION
  // ==============================================================
  sidebarLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.dataset.view;

      sidebarLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      document.querySelectorAll('.admin-view').forEach(v => v.style.display = 'none');

      if (view === 'dashboard') {
        viewDashboard.style.display = 'block';
        currentView = 'dashboard';
        updateDashboardStats();
        updateVisitChart(currentChartRange);
      } else if (view === 'users') {
        viewUsers.style.display = 'block';
        currentView = 'users';
        loadUsers();
      } else if (view === 'reviews') {
        viewReviews.style.display = 'block';
        currentView = 'reviews';
        loadReviews();
      } else if (view === 'partners') {
        viewPartners.style.display = 'block';
        currentView = 'partners';
        loadPartners();
      } else if (view === 'settings') {
        viewSettings.style.display = 'block';
        currentView = 'settings';
        loadAccessList();
        updateSettingsUI();
      }

      if (window.innerWidth <= 768 && adminSidebar) {
        adminSidebar.classList.remove('open');
      }
    });
  });

  // ==============================================================
  // STATS CARDS - CLICK HANDLERS
  // ==============================================================
  
  // Total Users card -> scroll to Users section
  if (statTotalUsersCard) {
    statTotalUsersCard.addEventListener('click', () => {
      // Navigate to users view
      const usersLink = document.querySelector('.sidebar-link[data-view="users"]');
      if (usersLink) usersLink.click();
    });
  }

  // Visit stats cards -> scroll to chart
  function scrollToChart() {
    const chartSection = document.querySelector('.visit-chart-section');
    if (chartSection) {
      chartSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  if (statTodayCard) {
    statTodayCard.addEventListener('click', () => {
      // Switch to today view and scroll
      document.querySelector('.chart-time-btn[data-range="today"]')?.click();
      scrollToChart();
    });
  }

  if (statWeekCard) {
    statWeekCard.addEventListener('click', () => {
      document.querySelector('.chart-time-btn[data-range="7days"]')?.click();
      scrollToChart();
    });
  }

  if (statMonthCard) {
    statMonthCard.addEventListener('click', () => {
      document.querySelector('.chart-time-btn[data-range="30days"]')?.click();
      scrollToChart();
    });
  }

  // ==============================================================
  // ADMIN AUTHENTICATION (PASS-BASED)
  // ==============================================================
  
  async function checkAdminPassword() {
    try {
      const snapshot = await database.ref('admin/pass').once('value');
      const password = snapshot.val();

      if (!password) {
        setupForm.style.display = 'block';
        loginForm.style.display = 'none';
        authStatusMsg.textContent = 'No admin password found. Set one up.';
        return false;
      } else {
        setupForm.style.display = 'none';
        loginForm.style.display = 'block';
        authStatusMsg.textContent = 'Enter the admin password to continue.';
        return true;
      }
    } catch (error) {
      console.error('Error checking admin password:', error);
      authStatusMsg.textContent = 'Error connecting to database.';
      showToast('Database error. Please try again.', 'error');
      return false;
    }
  }

  // Setup admin password
  if (setupBtn) {
    setupBtn.addEventListener('click', async () => {
      const pass = setupPassword.value.trim();
      const confirm = setupPasswordConfirm.value.trim();

      if (!pass || pass.length < 4) {
        setupError.textContent = 'Password must be at least 4 characters.';
        return;
      }

      if (pass !== confirm) {
        setupError.textContent = 'Passwords do not match.';
        return;
      }

      try {
        await database.ref('admin/pass').set(pass);
        setupError.textContent = '';
        setupPassword.value = '';
        setupPasswordConfirm.value = '';
        showToast('✅ Admin password set successfully!');
        checkAdminPassword();
      } catch (error) {
        console.error('Error setting password:', error);
        setupError.textContent = 'Error saving password. Please try again.';
      }
    });
  }

  // Login with password
  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      const pass = loginPassword.value.trim();

      if (!pass) {
        loginError.textContent = 'Please enter the password.';
        return;
      }

      try {
        loginBtn.disabled = true;
        loginBtn.textContent = 'Checking...';
        
        const snapshot = await database.ref('admin/pass').once('value');
        const storedPass = snapshot.val();

        if (pass === storedPass) {
          loginError.textContent = '';
          loginPassword.value = '';
          adminAuthScreen.style.display = 'none';
          adminDashboard.style.display = 'block';
          isLoggedIn = true;
          isMasterAdmin = true;
          currentAdminEmail = MASTER_ADMIN_EMAIL;
          
          if (adminEmailDisplay) {
            adminEmailDisplay.textContent = 'Master Admin';
          }
          
          showToast('🔓 Welcome to the admin dashboard!');
          updateDashboardStats();
          loadUsers();
          updateSettingsUI();
          updateVisitChart('today');
        } else {
          loginError.textContent = 'Incorrect password. Please try again.';
        }
      } catch (error) {
        console.error('Login error:', error);
        loginError.textContent = 'Error connecting to database.';
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Unlock Dashboard';
      }
    });
  }

  // Enter key for login
  if (loginPassword) {
    loginPassword.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') loginBtn.click();
    });
  }

  // Logout
  if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener('click', () => {
      adminDashboard.style.display = 'none';
      adminAuthScreen.style.display = 'flex';
      loginPassword.value = '';
      loginError.textContent = '';
      isLoggedIn = false;
      isMasterAdmin = false;
      currentAdminEmail = null;
      if (visitChart) {
        visitChart.destroy();
        visitChart = null;
      }
      showToast('👋 Logged out.');
    });
  }

  // ==============================================================
  // UPDATE SETTINGS UI (based on admin role)
  // ==============================================================
  function updateSettingsUI() {
    if (accessManagementCard) {
      if (isMasterAdmin) {
        accessManagementCard.classList.remove('disabled-setting');
        if (addAccessForm) addAccessForm.style.display = 'flex';
        if (accessList) accessList.style.opacity = '1';
      } else {
        accessManagementCard.classList.add('disabled-setting');
        if (addAccessForm) addAccessForm.style.display = 'none';
        if (accessList) accessList.style.opacity = '0.6';
      }
    }
    
    const passCard = document.getElementById('changePasswordCard');
    if (passCard) {
      passCard.style.display = isMasterAdmin ? 'block' : 'none';
    }
  }

  // ==============================================================
  // DASHBOARD STATS
  // ==============================================================
  async function updateDashboardStats() {
    try {
      const usersSnapshot = await database.ref('users').once('value');
      const users = usersSnapshot.val() || {};
      const userKeys = Object.keys(users);
      const totalUsers = userKeys.length;

      let free = 0,
        student = 0,
        pro = 0;
      let visits = [];
      let anonymousVisits = [];

      userKeys.forEach(key => {
        const user = users[key];
        if (user.subscription && user.subscription.plan) {
          if (user.subscription.plan === 'student') student++;
          else if (user.subscription.plan === 'pro') pro++;
          else free++;
        } else {
          free++;
        }

        if (user.visits) {
          if (Array.isArray(user.visits)) {
            visits = visits.concat(user.visits);
          } else if (typeof user.visits === 'object') {
            visits = visits.concat(Object.values(user.visits));
          }
        }
      });

      // Get anonymous visits
      try {
        const anonSnapshot = await database.ref('anonymous-visits').once('value');
        const anonData = anonSnapshot.val() || {};
        for (const key in anonData) {
          if (anonData[key] && anonData[key].timestamp) {
            anonymousVisits.push(anonData[key].timestamp);
          }
        }
      } catch (e) {
        console.log('No anonymous visits data yet');
      }

      // Combine all visits
      const allVisits = [...visits, ...anonymousVisits];

      if (statTotalUsers) statTotalUsers.textContent = totalUsers;
      if (planFreeCount) planFreeCount.textContent = free;
      if (planStudentCount) planStudentCount.textContent = student;
      if (planProCount) planProCount.textContent = pro;
      if (userCountBadge) userCountBadge.textContent = totalUsers;
      updateReviewBadge();
      updatePartnerBadge();

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const weekAgo = today - 7 * 24 * 60 * 60 * 1000;
      const monthAgo = today - 30 * 24 * 60 * 60 * 1000;

      let todayCount = 0,
        weekCount = 0,
        monthCount = 0;

      allVisits.forEach(visit => {
        const visitTime = typeof visit === 'number' ? visit : new Date(visit).getTime();
        if (visitTime >= today) todayCount++;
        if (visitTime >= weekAgo) weekCount++;
        if (visitTime >= monthAgo) monthCount++;
      });

      if (statVisitsToday) statVisitsToday.textContent = todayCount;
      if (statVisitsWeek) statVisitsWeek.textContent = weekCount;
      if (statVisitsMonth) statVisitsMonth.textContent = monthCount;

    } catch (error) {
      console.error('Error updating dashboard stats:', error);
    }
  }

  // ==============================================================
  // VISIT CHART
  // ==============================================================
  
  function getChartColors() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      gridColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      textColor: isDark ? '#a0aec0' : '#6b7280',
      gradientStart: isDark ? 'rgba(20,184,166,0.3)' : 'rgba(0,150,136,0.3)',
      gradientEnd: isDark ? 'rgba(20,184,166,0.02)' : 'rgba(0,150,136,0.02)',
      borderColor: isDark ? '#14b8a6' : '#009688',
      pointColor: isDark ? '#14b8a6' : '#009688'
    };
  }

  function updateChartColors() {
    if (!visitChart) return;
    const colors = getChartColors();
    visitChart.data.datasets[0].borderColor = colors.borderColor;
    visitChart.data.datasets[0].pointBackgroundColor = colors.pointColor;
    visitChart.data.datasets[0].pointBorderColor = colors.pointColor;
    
    // Update gradient
    const ctx = visitChartCanvas?.getContext('2d');
    if (ctx) {
      const gradient = ctx.createLinearGradient(0, 0, 0, 220);
      gradient.addColorStop(0, colors.gradientStart);
      gradient.addColorStop(1, colors.gradientEnd);
      visitChart.data.datasets[0].backgroundColor = gradient;
    }
    
    visitChart.options.scales.x.grid.color = colors.gridColor;
    visitChart.options.scales.y.grid.color = colors.gridColor;
    visitChart.options.scales.x.ticks.color = colors.textColor;
    visitChart.options.scales.y.ticks.color = colors.textColor;
    
    visitChart.update();
  }

  async function updateVisitChart(range) {
    if (!visitChartCanvas) return;
    currentChartRange = range;

    try {
      // Collect all visit data
      const allVisits = [];
      
      // Get user visits
      const usersSnapshot = await database.ref('users').once('value');
      const users = usersSnapshot.val() || {};
      
      for (const key in users) {
        const user = users[key];
        if (user.visits) {
          if (Array.isArray(user.visits)) {
            user.visits.forEach(v => {
              if (v && typeof v === 'object' && v.timestamp) {
                allVisits.push({ timestamp: v.timestamp, type: 'user' });
              } else if (typeof v === 'number') {
                allVisits.push({ timestamp: v, type: 'user' });
              }
            });
          } else if (typeof user.visits === 'object') {
            for (const vKey in user.visits) {
              const v = user.visits[vKey];
              if (v && v.timestamp) {
                allVisits.push({ timestamp: v.timestamp, type: 'user' });
              }
            }
          }
        }
      }

      // Get anonymous visits
      try {
        const anonSnapshot = await database.ref('anonymous-visits').once('value');
        const anonData = anonSnapshot.val() || {};
        for (const key in anonData) {
          if (anonData[key] && anonData[key].timestamp) {
            allVisits.push({ timestamp: anonData[key].timestamp, type: 'anonymous' });
          }
        }
      } catch (e) {
        console.log('No anonymous visits data');
      }

      // Also get daily stats from anonymous-stats
      try {
        const statsSnapshot = await database.ref('anonymous-stats').once('value');
        const statsData = statsSnapshot.val() || {};
        for (const dateKey in statsData) {
          // We'll use the daily counts for additional context
        }
      } catch (e) {
        console.log('No daily stats data');
      }

      // Determine date range
      const now = new Date();
      let daysToShow;
      let dateFormat;
      
      switch (range) {
        case 'today':
          daysToShow = 1;
          dateFormat = { hour: '2-digit', minute: '2-digit' };
          break;
        case '7days':
          daysToShow = 7;
          dateFormat = { month: 'short', day: 'numeric' };
          break;
        case '30days':
          daysToShow = 30;
          dateFormat = { month: 'short', day: 'numeric' };
          break;
        default:
          daysToShow = 7;
          dateFormat = { month: 'short', day: 'numeric' };
      }

      // Generate date labels
      const labels = [];
      const dateMap = {};
      
      for (let i = daysToShow - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        labels.push(key);
        dateMap[key] = 0;
      }

      // Count visits per day
      allVisits.forEach(visit => {
        const d = new Date(visit.timestamp);
        const key = d.toISOString().split('T')[0];
        if (dateMap.hasOwnProperty(key)) {
          dateMap[key]++;
        }
      });

      const data = labels.map(key => dateMap[key] || 0);

      // Format labels for display
      const displayLabels = labels.map(key => {
        const d = new Date(key);
        if (range === 'today') {
          return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      });

      // Create or update chart
      const ctx = visitChartCanvas.getContext('2d');
      const colors = getChartColors();
      
      // Create gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, 220);
      gradient.addColorStop(0, colors.gradientStart);
      gradient.addColorStop(1, colors.gradientEnd);

      if (visitChart) {
        visitChart.destroy();
        visitChart = null;
      }

      visitChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: displayLabels,
          datasets: [{
            label: 'Visits',
            data: data,
            borderColor: colors.borderColor,
            backgroundColor: gradient,
            pointBackgroundColor: colors.pointColor,
            pointBorderColor: colors.pointColor,
            pointRadius: 4,
            pointHoverRadius: 6,
            tension: 0.4,
            fill: true,
            borderWidth: 2.5
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              backgroundColor: 'var(--card-bg)',
              titleColor: 'var(--text-primary)',
              bodyColor: 'var(--text-primary)',
              borderColor: 'var(--border-light)',
              borderWidth: 1,
              cornerRadius: 8,
              padding: 10,
              callbacks: {
                label: function(context) {
                  return `${context.parsed.y} visit${context.parsed.y !== 1 ? 's' : ''}`;
                }
              }
            }
          },
          scales: {
            x: {
              grid: {
                color: colors.gridColor,
                drawBorder: false
              },
              ticks: {
                color: colors.textColor,
                font: { size: 10 },
                maxTicksLimit: range === 'today' ? 12 : 12
              }
            },
            y: {
              grid: {
                color: colors.gridColor,
                drawBorder: false
              },
              ticks: {
                color: colors.textColor,
                font: { size: 10 },
                stepSize: 1,
                beginAtZero: true
              },
              beginAtZero: true
            }
          },
          interaction: {
            intersect: false,
            mode: 'index'
          }
        }
      });

    } catch (error) {
      console.error('Error updating visit chart:', error);
    }
  }

  // Chart time buttons
  chartTimeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      chartTimeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const range = btn.dataset.range;
      updateVisitChart(range);
    });
  });

  // ==============================================================
  // USERS MANAGEMENT (with debounced refresh)
  // ==============================================================
  
  let loadUsersTimeout = null;
  
  async function loadUsers(force = false) {
    if (isLoading && !force) return;
    if (!viewUsers || viewUsers.style.display === 'none') return;

    if (loadUsersTimeout) {
      clearTimeout(loadUsersTimeout);
      loadUsersTimeout = null;
    }

    try {
      isLoading = true;
      usersLoading.classList.add('show');
      usersEmpty.classList.remove('show');
      userTableBody.innerHTML = '';

      const snapshot = await database.ref('users').once('value');
      const users = snapshot.val() || {};

      allUsers = Object.keys(users).map(key => {
        const data = users[key];
        const isBanned = data.banned === true || data.banned === 'true';

        let plan = 'free';
        if (data.subscription && data.subscription.plan) {
          plan = data.subscription.plan;
        }

        let provider = data.provider || 'email';
        if (provider === 'google' || (data.photoURL && !data.password)) {
          provider = 'google';
        }

        let lastVisit = 'Never';
        let lastVisitTime = 0;
        let lastPage = '—';
        
        if (data.lastVisit) {
          if (data.lastVisit.timestamp) {
            lastVisitTime = data.lastVisit.timestamp;
            lastVisit = new Date(data.lastVisit.timestamp).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });
          }
          if (data.lastVisit.page) {
            lastPage = data.lastVisit.page;
          }
        } else if (data.visits) {
          const visitTimes = [];
          if (Array.isArray(data.visits)) {
            data.visits.forEach(v => {
              if (typeof v === 'number') visitTimes.push(v);
              else if (v && typeof v === 'object' && v.timestamp) visitTimes.push(v.timestamp);
            });
          } else if (typeof data.visits === 'object') {
            Object.values(data.visits).forEach(v => {
              if (typeof v === 'number') visitTimes.push(v);
              else if (v && v.timestamp) visitTimes.push(v.timestamp);
            });
          }
          if (visitTimes.length > 0) {
            const maxTime = Math.max(...visitTimes);
            lastVisitTime = maxTime;
            lastVisit = new Date(maxTime).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });
          }
        }

        if (data.lastPage && data.lastPage.page) {
          lastPage = data.lastPage.page;
        }

        const spec = data.specialization || 'Not specified';
        const accountType = data.accountType === 'center' ? 'center' : 'individual';
        const centerData = data.centers || null; // now nested under users/{uid}/centers
        const activeMemberships = Object.entries(data.memberships || {}).filter(([, m]) => m && m.status === 'active');

        return {
          uid: key,
          name: data.name || data.displayName || 'Unknown',
          email: data.email || '',
          specialization: spec,
          plan: plan,
          provider: provider,
          lastVisit: lastVisit,
          lastVisitTime: lastVisitTime,
          lastPage: lastPage,
          joined: data.createdAt || data.created_at || 'Unknown',
          isBanned: isBanned,
          photoURL: data.photoURL || '',
          accountType: accountType,
          memberOf: activeMemberships.length ? activeMemberships[0][0] : null,
          memberOfCount: activeMemberships.length,
          centerName: centerData ? (centerData.name || '') : '',
          memberCount: centerData && centerData.members ? Object.keys(centerData.members).length : 0,
          raw: data
        };
      });

      const specs = [...new Set(allUsers.map(u => u.specialization))];
      const currentSpec = filterSpecialization.value;
      filterSpecialization.innerHTML = '<option value="">All Departments</option>';
      specs.sort().forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        filterSpecialization.appendChild(opt);
      });
      filterSpecialization.value = currentSpec;

      usersLoading.classList.remove('show');
      isLoading = false;
      applyFilters();

    } catch (error) {
      console.error('Error loading users:', error);
      usersLoading.classList.remove('show');
      isLoading = false;
      showToast('Error loading users. Please refresh.', 'error');
    }
  }

  function applyFilters() {
    const search = userSearch.value.toLowerCase().trim();
    const spec = filterSpecialization.value;
    const plan = filterPlan.value;
    const provider = filterProvider.value;
    const accountTypeFilter = filterAccountType ? filterAccountType.value : '';
    const sort = sortUsers.value;

    filteredUsers = allUsers.filter(user => {
      if (search) {
        const nameMatch = user.name.toLowerCase().includes(search);
        const emailMatch = user.email.toLowerCase().includes(search);
        if (!nameMatch && !emailMatch) return false;
      }
      if (spec && user.specialization !== spec) return false;
      if (plan && user.plan !== plan) return false;
      if (provider && user.provider !== provider) return false;
      if (accountTypeFilter) {
        if (accountTypeFilter === 'center' && user.accountType !== 'center') return false;
        if (accountTypeFilter === 'individual' && (user.accountType === 'center' || user.memberOf)) return false;
        if (accountTypeFilter === 'member' && !user.memberOf) return false;
      }
      return true;
    });

    switch (sort) {
      case 'newest':
        filteredUsers.sort((a, b) => (b.lastVisitTime || 0) - (a.lastVisitTime || 0));
        break;
      case 'oldest':
        filteredUsers.sort((a, b) => (a.lastVisitTime || 0) - (b.lastVisitTime || 0));
        break;
      case 'az':
        filteredUsers.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'za':
        filteredUsers.sort((a, b) => b.name.localeCompare(a.name));
        break;
    }

    renderUsersTable();
  }

  function renderUsersTable() {
    if (!userTableBody) return;

    if (filteredUsers.length === 0) {
      userTableBody.innerHTML = '';
      usersEmpty.classList.add('show');
      return;
    }
    usersEmpty.classList.remove('show');

    let html = '';
    filteredUsers.forEach(user => {
      const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      const rowClass = user.isBanned ? 'banned-row' : '';
      const isAdmin = user.email === MASTER_ADMIN_EMAIL;
      const accountBadge = user.accountType === 'center'
        ? `<span class="badge-center" title="${escapeHtml(user.centerName || '')}">🏥 Center${user.memberCount ? ' · ' + user.memberCount + ' member' + (user.memberCount === 1 ? '' : 's') : ''}</span>`
        : (user.memberOf ? `<span class="badge-member">👥 Center Member${user.memberOfCount > 1 ? ' ×' + user.memberOfCount : ''}</span>` : `<span class="badge-individual">Individual</span>`);

      html += `
        <tr class="${rowClass}" data-uid="${user.uid}">
          <td>
            <div class="user-cell" style="cursor:pointer;">
              <div class="user-avatar" style="background: ${stringToColor(user.uid)}">${initials}</div>
              <div class="user-cell-info">
                <span class="user-cell-name">${escapeHtml(user.name)} ${isAdmin ? '<span class="badge-admin">Master</span>' : ''}</span>
                <span class="user-cell-email">${escapeHtml(user.email)}</span>
                <span class="user-cell-badges">${accountBadge}</span>
              </div>
            </div>
          </td>
          <td style="text-align:center;">
            <div class="table-cell-actions">
              <button class="action-menu-btn" data-uid="${user.uid}" title="Actions">⋮</button>
              <div class="action-dropdown" data-uid="${user.uid}">
                <button class="action-dropdown-item" data-action="detail">
                  <span class="action-icon">👁️</span>
                  <span class="action-label">View Details</span>
                </button>
                <button class="action-dropdown-item" data-action="plan">
                  <span class="action-icon">📋</span>
                  <span class="action-label">Change Plan</span>
                </button>
                <button class="action-dropdown-item" data-action="contact">
                  <span class="action-icon">✉️</span>
                  <span class="action-label">Contact</span>
                </button>
                <button class="action-dropdown-item ${user.isBanned ? '' : 'danger'}" data-action="ban">
                  <span class="action-icon">${user.isBanned ? '🔓' : '🔒'}</span>
                  <span class="action-label">${user.isBanned ? 'Unban' : 'Ban'}</span>
                </button>
                <button class="action-dropdown-item danger" data-action="delete">
                  <span class="action-icon">🗑️</span>
                  <span class="action-label">Delete</span>
                </button>
              </div>
            </div>
          </td>
        </tr>
      `;
    });

    userTableBody.innerHTML = html;

    userTableBody.querySelectorAll('tr[data-uid] .user-cell').forEach(cell => {
      cell.addEventListener('click', (e) => {
        const row = cell.closest('tr');
        const uid = row.dataset.uid;
        openUserDetail(uid);
      });
    });

    userTableBody.querySelectorAll('.action-menu-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const uid = btn.dataset.uid;
        const dropdown = document.querySelector(`.action-dropdown[data-uid="${uid}"]`);

        document.querySelectorAll('.action-dropdown.show').forEach(d => {
          if (d.dataset.uid !== uid) d.classList.remove('show');
        });

        dropdown.classList.toggle('show');
      });
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.table-cell-actions')) {
        document.querySelectorAll('.action-dropdown.show').forEach(d => d.classList.remove('show'));
      }
    });

    userTableBody.querySelectorAll('.action-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = item.dataset.action;
        const dropdown = item.closest('.action-dropdown');
        const uid = dropdown.dataset.uid;
        dropdown.classList.remove('show');
        handleUserAction(action, uid);
      });
    });
  }

  function handleUserAction(action, uid) {
    const user = allUsers.find(u => u.uid === uid);
    if (!user) {
      showToast('User not found.', 'error');
      return;
    }

    switch (action) {
      case 'detail':
        openUserDetail(uid);
        break;
      case 'plan':
        openChangePlan(uid);
        break;
      case 'contact':
        openContact({
          email: user.email,
          phone: '',
          label: user.name || user.email,
          kind: 'user',
          refId: uid
        });
        break;
      case 'ban':
        toggleBan(uid);
        break;
      case 'delete':
        confirmDelete(uid);
        break;
    }
  }

  // ==============================================================
  // REVIEWS (API ISSUE REPORTS)
  // ==============================================================
  let isLoadingReviews = false;

  async function updateReviewBadge() {
    try {
      const snapshot = await database.ref('reviews').once('value');
      const data = snapshot.val() || {};
      const unresolvedCount = Object.values(data).filter(r => !r.resolved).length;
      if (reviewCountBadge) reviewCountBadge.textContent = unresolvedCount;
    } catch (error) {
      console.error('Error updating review badge:', error);
    }
  }

  async function loadReviews(force = false) {
    if (isLoadingReviews && !force) return;
    if (!viewReviews || viewReviews.style.display === 'none') return;

    try {
      isLoadingReviews = true;
      reviewsLoading.classList.add('show');
      reviewsEmpty.classList.remove('show');
      reviewTableBody.innerHTML = '';

      const snapshot = await database.ref('reviews').once('value');
      const reviews = snapshot.val() || {};

      allReviews = Object.keys(reviews).map(key => {
        const data = reviews[key];
        const isUserFeedback = data.rating !== undefined; // modal.js star/emoji feedback shape

        // Normalize timestamp: issue reports use Firebase ServerValue (ms
        // number), user feedback entries store an ISO string.
        let ts = data.timestamp || 0;
        if (typeof ts === 'string') {
          const parsed = Date.parse(ts);
          ts = isNaN(parsed) ? 0 : parsed;
        }

        if (isUserFeedback) {
          const userObj = (data.user && typeof data.user === 'object') ? data.user : null;
          return {
            key,
            type: 'user_feedback',
            tool: 'feedback',
            context: data.feedback || '',
            status: null,
            detail: '',
            comment: '',
            page: '',
            userAgent: '',
            userId: userObj ? userObj.uid : '',
            userEmail: userObj ? userObj.email : '',
            resolved: data.resolved === true,
            timestamp: ts,
            rating: Number(data.rating) || 0,
            emoji: data.emoji || '',
            feedback: data.feedback || '',
            userName: userObj ? userObj.name : (data.user === 'anonymous' ? 'Anonymous' : '')
          };
        }

        return {
          key,
          type: data.type || 'api_error',
          tool: data.tool || 'unknown',
          context: data.context || '',
          status: data.status ?? null,
          detail: data.detail || '',
          comment: data.comment || '',
          page: data.page || '',
          userAgent: data.userAgent || '',
          userId: data.userId || '',
          userEmail: data.userEmail || '',
          resolved: data.resolved === true,
          timestamp: ts,
          rating: null,
          emoji: '',
          feedback: '',
          userName: ''
        };
      });

      // Average rating summary (user feedback entries only)
      const ratingEntries = allReviews.filter(r => r.type === 'user_feedback' && r.rating > 0);
      const avgRatingEl = document.getElementById('avgRatingValue');
      const totalRatingsEl = document.getElementById('totalRatingsCount');
      if (avgRatingEl && totalRatingsEl) {
        if (ratingEntries.length > 0) {
          const avg = ratingEntries.reduce((sum, r) => sum + r.rating, 0) / ratingEntries.length;
          avgRatingEl.textContent = `${avg.toFixed(1)} / 5`;
        } else {
          avgRatingEl.textContent = '—';
        }
        totalRatingsEl.textContent = ratingEntries.length;
      }

      // Populate the tool filter dynamically from what's actually in the data
      const tools = [...new Set(allReviews.map(r => r.tool))].sort();
      const currentTool = filterReviewTool.value;
      filterReviewTool.innerHTML = '<option value="">All Tools</option>';
      tools.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        filterReviewTool.appendChild(opt);
      });
      filterReviewTool.value = currentTool;

      reviewsLoading.classList.remove('show');
      isLoadingReviews = false;
      applyReviewFilters();
      updateReviewBadge();

    } catch (error) {
      console.error('Error loading reviews:', error);
      reviewsLoading.classList.remove('show');
      isLoadingReviews = false;
      showToast('Error loading reviews. Please refresh.', 'error');
    }
  }

  function applyReviewFilters() {
    const search = reviewSearch.value.toLowerCase().trim();
    const type = filterReviewType.value;
    const tool = filterReviewTool.value;
    const status = filterReviewStatus.value;
    const sort = sortReviews.value;

    filteredReviews = allReviews.filter(r => {
      if (search) {
        const toolMatch = r.tool.toLowerCase().includes(search);
        const contextMatch = r.context.toLowerCase().includes(search);
        const emailMatch = r.userEmail.toLowerCase().includes(search);
        const feedbackMatch = (r.feedback || '').toLowerCase().includes(search);
        const nameMatch = (r.userName || '').toLowerCase().includes(search);
        if (!toolMatch && !contextMatch && !emailMatch && !feedbackMatch && !nameMatch) return false;
      }
      if (type && r.type !== type) return false;
      if (tool && r.tool !== tool) return false;
      if (status === 'resolved' && !r.resolved) return false;
      if (status === 'unresolved' && r.resolved) return false;
      return true;
    });

    filteredReviews.sort((a, b) => sort === 'oldest' ? a.timestamp - b.timestamp : b.timestamp - a.timestamp);

    renderReviewsTable();
  }

  function renderReviewsTable() {
    if (!reviewTableBody) return;

    if (filteredReviews.length === 0) {
      reviewTableBody.innerHTML = '';
      reviewsEmpty.classList.add('show');
      return;
    }
    reviewsEmpty.classList.remove('show');

    let html = '';
    filteredReviews.forEach(r => {
      const rowClass = r.resolved ? 'resolved-row' : '';
      const isFeedback = r.type === 'user_feedback';
      const typeLabel = isFeedback ? 'User Rating' : (r.type === 'insufficient_funds' ? 'Insufficient Funds' : 'API Error');
      const dateStr = r.timestamp ? new Date(r.timestamp).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : 'Unknown';

      const starsHtml = isFeedback
        ? `<span class="review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(Math.max(0, 5 - r.rating))}</span> ${r.emoji || ''}`
        : '';
      const contextLine = isFeedback
        ? (r.feedback ? escapeHtml(r.feedback) : 'No written feedback')
        : escapeHtml(r.context || r.detail || 'No description provided');
      const metaLine = isFeedback
        ? `${escapeHtml(r.userName || 'Anonymous')}${r.userEmail ? ' · ' + escapeHtml(r.userEmail) : ''} · ${dateStr}`
        : `${r.userEmail ? escapeHtml(r.userEmail) : 'No user on file'} · ${dateStr}`;

      html += `
        <tr class="${rowClass}" data-key="${r.key}">
          <td>
            <div class="review-cell" data-key="${r.key}">
              <div class="review-cell-top">
                <span class="badge-review-type ${r.type}">${typeLabel}</span>
                ${r.resolved ? '<span class="badge-review-resolved">Resolved</span>' : ''}
                ${isFeedback ? starsHtml : `<span class="review-cell-meta">${escapeHtml(r.tool)}${r.status ? ' · HTTP ' + r.status : ''}</span>`}
              </div>
              <span class="review-cell-context">${contextLine}</span>
              <span class="review-cell-meta">${metaLine}</span>
            </div>
          </td>
          <td>
            <div class="table-cell-actions">
              <button class="action-menu-btn" data-key="${r.key}" title="Actions">⋮</button>
              <div class="action-dropdown" data-key="${r.key}">
                <button class="action-dropdown-item" data-action="detail">
                  <span class="action-icon">👁️</span>
                  <span class="action-label">View Details</span>
                </button>
                <button class="action-dropdown-item" data-action="email">
                  <span class="action-icon">✉️</span>
                  <span class="action-label">Contact via Email</span>
                </button>
                <button class="action-dropdown-item" data-action="whatsapp">
                  <span class="action-icon">💬</span>
                  <span class="action-label">Contact via WhatsApp</span>
                </button>
                <button class="action-dropdown-item" data-action="resolve">
                  <span class="action-icon">${r.resolved ? '↩️' : '✅'}</span>
                  <span class="action-label">${r.resolved ? 'Mark Unresolved' : 'Mark Resolved'}</span>
                </button>
                <button class="action-dropdown-item danger" data-action="delete">
                  <span class="action-icon">🗑️</span>
                  <span class="action-label">Delete</span>
                </button>
              </div>
            </div>
          </td>
        </tr>
      `;
    });

    reviewTableBody.innerHTML = html;

    reviewTableBody.querySelectorAll('.review-cell').forEach(cell => {
      cell.addEventListener('click', () => openReviewDetail(cell.dataset.key));
    });

    reviewTableBody.querySelectorAll('.action-menu-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = btn.dataset.key;
        const dropdown = document.querySelector(`#reviewTableBody .action-dropdown[data-key="${key}"]`);

        document.querySelectorAll('.action-dropdown.show').forEach(d => {
          if (d !== dropdown) d.classList.remove('show');
        });

        dropdown.classList.toggle('show');
      });
    });

    reviewTableBody.querySelectorAll('.action-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = item.dataset.action;
        const dropdown = item.closest('.action-dropdown');
        const key = dropdown.dataset.key;
        dropdown.classList.remove('show');
        handleReviewAction(action, key);
      });
    });
  }

  function handleReviewAction(action, key) {
    const review = allReviews.find(r => r.key === key);
    if (!review) {
      showToast('Review not found.', 'error');
      return;
    }

    switch (action) {
      case 'detail':
        openReviewDetail(key);
        break;
      case 'email':
        if (!review.userEmail) {
          showToast('No email on file for this review.', 'warning');
          return;
        }
        openContact({
          email: review.userEmail,
          phone: '',
          label: `Review · ${review.tool}`,
          kind: 'review',
          refId: key
        });
        break;
      case 'whatsapp':
        openContact({
          email: review.userEmail || '',
          phone: '',
          label: `Review · ${review.tool}`,
          kind: 'review',
          refId: key
        });
        // Nudge the admin straight to the WhatsApp field/button since that's why they clicked this action.
        setTimeout(() => document.getElementById('contactPhone')?.focus(), 50);
        break;
      case 'resolve':
        toggleReviewResolved(key);
        break;
      case 'delete':
        confirmDeleteReview(key);
        break;
    }
  }

  async function toggleReviewResolved(key) {
    const review = allReviews.find(r => r.key === key);
    if (!review) return;
    try {
      await database.ref(`reviews/${key}/resolved`).set(!review.resolved);
      showToast(review.resolved ? 'Marked as unresolved.' : 'Marked as resolved.');
      loadReviews(true);
    } catch (error) {
      console.error('Error updating review:', error);
      showToast('Error updating review.', 'error');
    }
  }

  function confirmDeleteReview(key) {
    confirmAction = 'deleteReview';
    confirmData = key;
    document.getElementById('confirmTitle').textContent = 'Delete Review';
    document.getElementById('confirmMessage').textContent = 'Are you sure you want to permanently delete this review? This cannot be undone.';
    confirmModal.classList.add('show');
  }

  // ==============================================================
  // REVIEW DETAIL MODAL
  // ==============================================================
  function openReviewDetail(key) {
    const review = allReviews.find(r => r.key === key);
    if (!review) {
      showToast('Review not found.', 'error');
      return;
    }

    selectedReviewKey = key;
    const dateStr = review.timestamp ? new Date(review.timestamp).toLocaleString() : 'Unknown';
    const body = document.getElementById('reviewDetailBody');

    if (review.type === 'user_feedback') {
      const stars = '★'.repeat(review.rating) + '☆'.repeat(Math.max(0, 5 - review.rating));
      body.innerHTML = `
        <div class="review-detail-row"><span class="review-detail-label">Type</span><span class="review-detail-value">User Rating</span></div>
        <div class="review-detail-row"><span class="review-detail-label">Rating</span><span class="review-detail-value review-stars">${stars} (${review.rating}/5) ${review.emoji || ''}</span></div>
        <div class="review-detail-row"><span class="review-detail-label">Feedback</span><span class="review-detail-value">${escapeHtml(review.feedback || 'No written feedback')}</span></div>
        <div class="review-detail-row"><span class="review-detail-label">User</span><span class="review-detail-value">${escapeHtml(review.userName || 'Anonymous')}</span></div>
        <div class="review-detail-row"><span class="review-detail-label">User Email</span><span class="review-detail-value">${escapeHtml(review.userEmail || 'Not signed in')}</span></div>
        <div class="review-detail-row"><span class="review-detail-label">Submitted</span><span class="review-detail-value">${dateStr}</span></div>
      `;
    } else {
      const typeLabel = review.type === 'insufficient_funds' ? 'Insufficient Funds' : 'Other API Error';
      body.innerHTML = `
        <div class="review-detail-row"><span class="review-detail-label">Type</span><span class="review-detail-value">${escapeHtml(typeLabel)}</span></div>
        <div class="review-detail-row"><span class="review-detail-label">Tool</span><span class="review-detail-value">${escapeHtml(review.tool)}</span></div>
        <div class="review-detail-row"><span class="review-detail-label">Context</span><span class="review-detail-value">${escapeHtml(review.context || '—')}</span></div>
        <div class="review-detail-row"><span class="review-detail-label">HTTP Status</span><span class="review-detail-value">${review.status ?? '—'}</span></div>
        <div class="review-detail-row"><span class="review-detail-label">Detail</span><span class="review-detail-value mono">${escapeHtml(review.detail || '—')}</span></div>
        <div class="review-detail-row"><span class="review-detail-label">User Comment</span><span class="review-detail-value">${escapeHtml(review.comment || '—')}</span></div>
        <div class="review-detail-row"><span class="review-detail-label">User Email</span><span class="review-detail-value">${escapeHtml(review.userEmail || 'Not signed in')}</span></div>
        <div class="review-detail-row"><span class="review-detail-label">Page</span><span class="review-detail-value mono">${escapeHtml(review.page || '—')}</span></div>
        <div class="review-detail-row"><span class="review-detail-label">Browser</span><span class="review-detail-value mono">${escapeHtml(review.userAgent || '—')}</span></div>
        <div class="review-detail-row"><span class="review-detail-label">Reported</span><span class="review-detail-value">${dateStr}</span></div>
      `;
    }

    const resolveBtn = document.getElementById('reviewDetailResolveBtn');
    resolveBtn.textContent = review.resolved ? 'Mark Unresolved' : 'Mark Resolved';
    resolveBtn.onclick = () => {
      toggleReviewResolved(key);
      reviewDetailModal.classList.remove('show');
    };

    reviewDetailModal.classList.add('show');
  }

  if (refreshReviewsBtn) {
    refreshReviewsBtn.addEventListener('click', () => loadReviews(true));
  }
  [reviewSearch, filterReviewType, filterReviewTool, filterReviewStatus, sortReviews].forEach(el => {
    if (el) el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', applyReviewFilters);
  });

  // ==============================================================
  // REHABLIX PARTNERS
  // ==============================================================
  let isLoadingPartners = false;

  async function updatePartnerBadge() {
    try {
      const snapshot = await database.ref('partners').once('value');
      const data = snapshot.val() || {};
      const pendingCount = Object.values(data).filter(p => p.status === 'pending').length;
      if (partnerCountBadge) partnerCountBadge.textContent = pendingCount;
    } catch (error) {
      console.error('Error updating partner badge:', error);
    }
  }

  async function loadPartners(force = false) {
    if (isLoadingPartners && !force) return;
    if (!viewPartners || viewPartners.style.display === 'none') return;

    try {
      isLoadingPartners = true;
      partnersLoading.classList.add('show');
      partnersEmpty.classList.remove('show');
      partnerTableBody.innerHTML = '';

      const snapshot = await database.ref('partners').once('value');
      const partners = snapshot.val() || {};

      allPartners = Object.keys(partners).map(uid => {
        const p = partners[uid];
        const referrals = p.referrals || {};
        const earnings = p.earnings || {};
        return {
          uid,
          name: p.name || 'Unknown',
          email: p.email || '',
          code: p.code || '',
          status: p.status || 'pending',
          audience: p.audience || '',
          payoutMethod: p.payoutMethod || '',
          payoutDetails: p.payoutDetails || '',
          note: p.note || '',
          appliedAt: p.appliedAt || '',
          approvedAt: p.approvedAt || '',
          rejectionReason: p.rejectionReason || '',
          referralCount: Object.keys(referrals).length,
          earningsTotal: Number(earnings.total) || 0,
          earningsPending: Number(earnings.pending) || 0,
          earningsCount: Number(earnings.count) || 0
        };
      });

      partnersLoading.classList.remove('show');
      isLoadingPartners = false;
      applyPartnerFilters();
      updatePartnerBadge();

    } catch (error) {
      console.error('Error loading partners:', error);
      partnersLoading.classList.remove('show');
      isLoadingPartners = false;
      showToast('Error loading partners. Please refresh.', 'error');
    }
  }

  function applyPartnerFilters() {
    const search = partnerSearch.value.toLowerCase().trim();
    const status = filterPartnerStatus.value;
    const sort = sortPartners.value;

    filteredPartners = allPartners.filter(p => {
      if (search) {
        const nameMatch = p.name.toLowerCase().includes(search);
        const emailMatch = p.email.toLowerCase().includes(search);
        const codeMatch = p.code.toLowerCase().includes(search);
        if (!nameMatch && !emailMatch && !codeMatch) return false;
      }
      if (status && p.status !== status) return false;
      return true;
    });

    filteredPartners.sort((a, b) => {
      if (sort === 'earnings') return b.earningsTotal - a.earningsTotal;
      const aT = Date.parse(a.appliedAt) || 0;
      const bT = Date.parse(b.appliedAt) || 0;
      return sort === 'oldest' ? aT - bT : bT - aT;
    });

    renderPartnersTable();
  }

  function partnerStatusBadge(status) {
    if (status === 'approved') return '<span class="badge-success">Approved</span>';
    if (status === 'rejected') return '<span class="badge-warning">Rejected</span>';
    return '<span class="badge-review-type insufficient_funds">Pending Review</span>';
  }

  function renderPartnersTable() {
    if (!partnerTableBody) return;

    if (filteredPartners.length === 0) {
      partnerTableBody.innerHTML = '';
      partnersEmpty.classList.add('show');
      return;
    }
    partnersEmpty.classList.remove('show');

    let html = '';
    filteredPartners.forEach(p => {
      const appliedStr = p.appliedAt ? new Date(p.appliedAt).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric'
      }) : 'Unknown';

      html += `
        <tr data-uid="${p.uid}">
          <td>
            <div class="review-cell" data-uid="${p.uid}">
              <div class="review-cell-top">
                ${partnerStatusBadge(p.status)}
                <span class="review-cell-meta">Code: ${escapeHtml(p.code)}</span>
              </div>
              <span class="review-cell-context">${escapeHtml(p.name)} · ${escapeHtml(p.email)}</span>
              <span class="review-cell-meta partner-stat-mini">
                ${p.referralCount} referral${p.referralCount === 1 ? '' : 's'} ·
                $${p.earningsTotal.toFixed(2)} earned ·
                Applied ${appliedStr}
              </span>
            </div>
          </td>
          <td>
            <div class="table-cell-actions">
              <button class="action-menu-btn" data-uid="${p.uid}" title="Actions">⋮</button>
              <div class="action-dropdown" data-uid="${p.uid}">
                <button class="action-dropdown-item" data-action="detail">
                  <span class="action-icon">👁️</span>
                  <span class="action-label">View Application</span>
                </button>
                ${p.status !== 'approved' ? `
                <button class="action-dropdown-item" data-action="approve">
                  <span class="action-icon">✅</span>
                  <span class="action-label">Approve</span>
                </button>` : ''}
                ${p.status !== 'rejected' ? `
                <button class="action-dropdown-item danger" data-action="reject">
                  <span class="action-icon">🚫</span>
                  <span class="action-label">${p.status === 'approved' ? 'Revoke' : 'Reject'}</span>
                </button>` : ''}
                <button class="action-dropdown-item" data-action="email">
                  <span class="action-icon">✉️</span>
                  <span class="action-label">Contact via Email</span>
                </button>
              </div>
            </div>
          </td>
        </tr>
      `;
    });

    partnerTableBody.innerHTML = html;

    partnerTableBody.querySelectorAll('.review-cell').forEach(cell => {
      cell.addEventListener('click', () => openPartnerDetail(cell.dataset.uid));
    });

    partnerTableBody.querySelectorAll('.action-menu-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const uid = btn.dataset.uid;
        const dropdown = document.querySelector(`#partnerTableBody .action-dropdown[data-uid="${uid}"]`);

        document.querySelectorAll('.action-dropdown.show').forEach(d => {
          if (d !== dropdown) d.classList.remove('show');
        });

        dropdown.classList.toggle('show');
      });
    });

    partnerTableBody.querySelectorAll('.action-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = item.dataset.action;
        const dropdown = item.closest('.action-dropdown');
        const uid = dropdown.dataset.uid;
        dropdown.classList.remove('show');
        handlePartnerAction(action, uid);
      });
    });
  }

  function handlePartnerAction(action, uid) {
    const partner = allPartners.find(p => p.uid === uid);
    if (!partner) {
      showToast('Partner not found.', 'error');
      return;
    }

    switch (action) {
      case 'detail':
        openPartnerDetail(uid);
        break;
      case 'approve':
        approvePartner(uid);
        break;
      case 'reject':
        openRejectReasonModal(uid);
        break;
      case 'email':
        if (!partner.email) {
          showToast('No email on file for this partner.', 'warning');
          return;
        }
        openContact({
          email: partner.email,
          phone: '',
          label: `Partner · ${partner.name}`,
          kind: 'partner',
          refId: uid
        });
        break;
    }
  }

  async function approvePartner(uid) {
    const partner = allPartners.find(p => p.uid === uid);
    if (!partner) return;

    try {
      const now = new Date().toISOString();
      await database.ref(`partners/${uid}`).update({ status: 'approved', approvedAt: now, rejectionReason: null });
      await database.ref(`users/${uid}/partner`).update({ status: 'approved', approvedAt: now });
      showToast(`✅ ${partner.name} approved as a Rehablix Partner.`);
      partnerDetailModal.classList.remove('show');
      await sendPartnerStatusEmail(partner, 'approved', '');
      loadPartners(true);
    } catch (error) {
      console.error('Error approving partner:', error);
      showToast('Error approving partner.', 'error');
    }
  }

  function openRejectReasonModal(uid) {
    pendingRejectUid = uid;
    const input = document.getElementById('rejectReasonInput');
    if (input) input.value = '';
    rejectReasonModal.classList.add('show');
  }

  document.getElementById('confirmRejectBtn')?.addEventListener('click', async () => {
    if (!pendingRejectUid) return;
    const partner = allPartners.find(p => p.uid === pendingRejectUid);
    if (!partner) return;

    const reason = document.getElementById('rejectReasonInput').value.trim();

    try {
      const now = new Date().toISOString();
      await database.ref(`partners/${pendingRejectUid}`).update({
        status: 'rejected',
        rejectedAt: now,
        rejectionReason: reason
      });
      await database.ref(`users/${pendingRejectUid}/partner`).update({ status: 'rejected' });
      showToast(`Application from ${partner.name} rejected.`);
      rejectReasonModal.classList.remove('show');
      partnerDetailModal.classList.remove('show');
      await sendPartnerStatusEmail(partner, 'rejected', reason);
      pendingRejectUid = null;
      loadPartners(true);
    } catch (error) {
      console.error('Error rejecting partner:', error);
      showToast('Error rejecting partner.', 'error');
    }
  });

  function openPartnerDetail(uid) {
    const partner = allPartners.find(p => p.uid === uid);
    if (!partner) {
      showToast('Partner not found.', 'error');
      return;
    }

    selectedPartnerUid = uid;
    const appliedStr = partner.appliedAt ? new Date(partner.appliedAt).toLocaleString() : 'Unknown';

    const body = document.getElementById('partnerDetailBody');
    body.innerHTML = `
      <div class="review-detail-row"><span class="review-detail-label">Status</span><span class="review-detail-value">${partnerStatusBadge(partner.status)}</span></div>
      <div class="review-detail-row"><span class="review-detail-label">Name</span><span class="review-detail-value">${escapeHtml(partner.name)}</span></div>
      <div class="review-detail-row"><span class="review-detail-label">Email</span><span class="review-detail-value">${escapeHtml(partner.email)}</span></div>
      <div class="review-detail-row"><span class="review-detail-label">Referral Code</span><span class="review-detail-value mono">${escapeHtml(partner.code)}</span></div>
      <div class="review-detail-row"><span class="review-detail-label">How They'll Share</span><span class="review-detail-value">${escapeHtml(partner.audience || '—')}</span></div>
      <div class="review-detail-row"><span class="review-detail-label">Payout Method</span><span class="review-detail-value">${escapeHtml(partner.payoutMethod || '—')}</span></div>
      <div class="review-detail-row"><span class="review-detail-label">Payout Details</span><span class="review-detail-value mono">${escapeHtml(partner.payoutDetails || '—')}</span></div>
      <div class="review-detail-row"><span class="review-detail-label">Note</span><span class="review-detail-value">${escapeHtml(partner.note || '—')}</span></div>
      <div class="review-detail-row"><span class="review-detail-label">Referrals</span><span class="review-detail-value">${partner.referralCount}</span></div>
      <div class="review-detail-row"><span class="review-detail-label">Total Earned</span><span class="review-detail-value">$${partner.earningsTotal.toFixed(2)}</span></div>
      <div class="review-detail-row"><span class="review-detail-label">Pending Payout</span><span class="review-detail-value">$${partner.earningsPending.toFixed(2)}</span></div>
      <div class="review-detail-row"><span class="review-detail-label">Applied</span><span class="review-detail-value">${appliedStr}</span></div>
      ${partner.status === 'rejected' && partner.rejectionReason ? `<div class="review-detail-row"><span class="review-detail-label">Rejection Reason</span><span class="review-detail-value">${escapeHtml(partner.rejectionReason)}</span></div>` : ''}
    `;

    const approveBtn = document.getElementById('partnerApproveBtn');
    const rejectBtn = document.getElementById('partnerRejectBtn');

    approveBtn.style.display = partner.status !== 'approved' ? 'inline-flex' : 'none';
    approveBtn.onclick = () => approvePartner(uid);

    if (partner.status === 'approved') {
      rejectBtn.textContent = 'Revoke Access';
      rejectBtn.onclick = () => {
        confirmAction = 'revokePartner';
        confirmData = uid;
        document.getElementById('confirmTitle').textContent = 'Revoke Partner Access';
        document.getElementById('confirmMessage').textContent = `Revoke ${partner.name}'s partner access? They will stop earning commissions on new subscriptions.`;
        confirmModal.classList.add('show');
      };
    } else {
      rejectBtn.textContent = 'Reject';
      rejectBtn.onclick = () => openRejectReasonModal(uid);
    }

    partnerDetailModal.classList.add('show');
  }

  if (refreshPartnersBtn) {
    refreshPartnersBtn.addEventListener('click', () => loadPartners(true));
  }
  [partnerSearch, filterPartnerStatus, sortPartners].forEach(el => {
    if (el) el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', applyPartnerFilters);
  });

  // ==============================================================
  // USER DETAIL MODAL
  // ==============================================================
  function openUserDetail(uid) {
    const user = allUsers.find(u => u.uid === uid);
    if (!user) {
      showToast('User not found.', 'error');
      return;
    }

    selectedUserId = uid;
    const body = document.getElementById('detailBody');
    const title = document.getElementById('detailUserName');

    title.textContent = user.name;

    const planBadge = user.plan === 'student' ? 'Student' : user.plan === 'pro' ? 'Pro' : 'Free';

    body.innerHTML = `
      <div class="detail-row"><span class="label">UID</span><span class="value">${user.uid}</span></div>
      <div class="detail-row"><span class="label">Name</span><span class="value">${escapeHtml(user.name)}</span></div>
      <div class="detail-row"><span class="label">Email</span><span class="value">${escapeHtml(user.email)}</span></div>
      <div class="detail-row"><span class="label">Specialization</span><span class="value">${escapeHtml(user.specialization)}</span></div>
      <div class="detail-row"><span class="label">Plan</span><span class="value"><span class="badge-plan ${user.plan}">${planBadge}</span></span></div>
      <div class="detail-row"><span class="label">Provider</span><span class="value"><span class="badge-provider ${user.provider}">${user.provider}</span></span></div>
      <div class="detail-row"><span class="label">Status</span><span class="value">${user.isBanned ? '🚫 Banned' : '✅ Active'}</span></div>
      <div class="detail-row"><span class="label">Last Visit</span><span class="value">${user.lastVisit}</span></div>
      <div class="detail-row"><span class="label">Last Page</span><span class="value">${escapeHtml(user.lastPage)}</span></div>
      <div class="detail-row"><span class="label">Joined</span><span class="value">${user.joined}</span></div>
    `;

    userDetailModal.classList.add('show');
  }

  // ==============================================================
  // CHANGE PLAN MODAL
  // ==============================================================
  function openChangePlan(uid) {
    const user = allUsers.find(u => u.uid === uid);
    if (!user) return;

    selectedUserId = uid;
    document.getElementById('planUserEmail').textContent = user.email;
    document.getElementById('newPlanSelect').value = user.plan;

    const expiryInput = document.getElementById('planExpiryDateInput');
    const now = new Date();
    const oneYear = new Date(now);
    oneYear.setFullYear(oneYear.getFullYear() + 1);
    expiryInput.value = oneYear.toISOString().split('T')[0];

    document.getElementById('planChangeMsg').textContent = '';
    document.getElementById('planChangeMsg').className = 'form-msg';
    changePlanModal.classList.add('show');
  }

  document.getElementById('confirmPlanChangeBtn').addEventListener('click', async () => {
    if (!selectedUserId) return;

    const newPlan = document.getElementById('newPlanSelect').value;
    const expiryDate = document.getElementById('planExpiryDateInput').value;
    const msgEl = document.getElementById('planChangeMsg');

    try {
      const updates = {
        [`users/${selectedUserId}/subscription/plan`]: newPlan,
        [`users/${selectedUserId}/subscription/updatedAt`]: new Date().toISOString()
      };

      if (expiryDate) {
        updates[`users/${selectedUserId}/subscription/ends`] = new Date(expiryDate).toISOString();
      } else {
        const oneYear = new Date();
        oneYear.setFullYear(oneYear.getFullYear() + 1);
        updates[`users/${selectedUserId}/subscription/ends`] = oneYear.toISOString();
      }

      await database.ref().update(updates);

      msgEl.textContent = '✅ Plan updated successfully!';
      msgEl.className = 'form-msg success';
      showToast('Plan updated successfully!');

      setTimeout(() => {
        changePlanModal.classList.remove('show');
        loadUsers(true);
        updateDashboardStats();
      }, 800);

    } catch (error) {
      console.error('Error updating plan:', error);
      msgEl.textContent = '❌ Error updating plan. Please try again.';
      msgEl.className = 'form-msg error';
    }
  });

  // ==============================================================
  // CONTACT MODAL (Email + WhatsApp) - shared by Users and Reviews
  // ==============================================================
  function openContact(context) {
    contactContext = context;

    document.getElementById('contactModalTitle').textContent =
      context.kind === 'review' ? 'Contact About Review' : context.kind === 'partner' ? 'Contact Partner' : 'Contact User';
    document.getElementById('contactUserEmail').textContent = context.email || 'No email on file';
    document.getElementById('contactPhone').value = context.phone || '';
    document.getElementById('contactSubject').value = context.kind === 'review'
      ? `Regarding your rehablix issue report (${context.label || ''})`
      : context.kind === 'partner'
        ? `Regarding your Rehablix Partners application`
        : '';
    document.getElementById('contactMessage').value = '';
    document.getElementById('contactMsg').textContent = '';
    document.getElementById('contactMsg').className = 'form-msg';

    const emailBtn = document.getElementById('sendContactBtn');
    if (emailBtn) emailBtn.disabled = !context.email;

    contactModal.classList.add('show');
  }

  document.getElementById('sendContactBtn').addEventListener('click', () => {
    if (!contactContext || !contactContext.email) {
      showToast('No email address available for this contact.', 'warning');
      return;
    }

    const subject = document.getElementById('contactSubject').value.trim();
    const message = document.getElementById('contactMessage').value.trim();
    const msgEl = document.getElementById('contactMsg');

    if (!subject || !message) {
      msgEl.textContent = '❌ Please fill in both subject and message.';
      msgEl.className = 'form-msg error';
      return;
    }

    const mailto = `mailto:${contactContext.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    window.open(mailto, '_blank');

    msgEl.textContent = '✅ Email client opened.';
    msgEl.className = 'form-msg success';
    showToast('Email client opened.');

    setTimeout(() => {
      contactModal.classList.remove('show');
    }, 1000);
  });

  document.getElementById('sendWhatsAppBtn').addEventListener('click', () => {
    const msgEl = document.getElementById('contactMsg');
    const message = document.getElementById('contactMessage').value.trim();
    const rawPhone = document.getElementById('contactPhone').value.trim();

    if (!message) {
      msgEl.textContent = '❌ Please write a message first.';
      msgEl.className = 'form-msg error';
      return;
    }

    const digitsOnly = rawPhone.replace(/[^\d]/g, '');
    const text = encodeURIComponent(message);

    // With a phone number on file, open a direct chat. Otherwise fall back
    // to WhatsApp's own share sheet so the admin can pick a contact manually.
    const url = digitsOnly ? `https://wa.me/${digitsOnly}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');

    msgEl.textContent = digitsOnly ? '✅ WhatsApp opened.' : '✅ WhatsApp share opened — choose a recipient.';
    msgEl.className = 'form-msg success';
    showToast('WhatsApp opened.');

    setTimeout(() => {
      contactModal.classList.remove('show');
    }, 1000);
  });

  // ==============================================================
  // BAN / UNBAN
  // ==============================================================
  async function toggleBan(uid) {
    const user = allUsers.find(u => u.uid === uid);
    if (!user) return;

    const actionText = user.isBanned ? 'unban' : 'ban';

    document.getElementById('confirmTitle').textContent = `${actionText.charAt(0).toUpperCase() + actionText.slice(1)} User`;
    document.getElementById('confirmMessage').textContent = `Are you sure you want to ${actionText} ${user.name}?`;
    document.getElementById('confirmModal').classList.add('show');

    confirmAction = 'ban';
    confirmData = { uid, action: user.isBanned ? 'unban' : 'ban' };
  }

  // ==============================================================
  // DELETE USER
  // ==============================================================
  function confirmDelete(uid) {
    const user = allUsers.find(u => u.uid === uid);
    if (!user) return;

    document.getElementById('confirmTitle').textContent = 'Delete User';
    document.getElementById('confirmMessage').textContent = `Are you sure you want to permanently delete ${user.name}? This action cannot be undone.`;
    document.getElementById('confirmModal').classList.add('show');

    confirmAction = 'delete';
    confirmData = { uid };
  }

  // ==============================================================
  // CONFIRM ACTION HANDLER
  // ==============================================================
  document.getElementById('confirmActionBtn').addEventListener('click', async () => {
    const modal = document.getElementById('confirmModal');

    if (confirmAction === 'ban' && confirmData) {
      const { uid, action } = confirmData;
      const isBanned = action === 'ban';

      try {
        await database.ref(`users/${uid}/banned`).set(isBanned);
        showToast(`✅ User ${isBanned ? 'banned' : 'unbanned'} successfully.`);
        modal.classList.remove('show');
        loadUsers(true);
        updateDashboardStats();
      } catch (error) {
        console.error('Error updating ban status:', error);
        showToast('Error updating user status.', 'error');
      }
    }

    if (confirmAction === 'delete' && confirmData) {
      const { uid } = confirmData;

      try {
        await database.ref(`users/${uid}`).remove();
        showToast('✅ User deleted successfully.');
        modal.classList.remove('show');
        loadUsers(true);
        updateDashboardStats();
      } catch (error) {
        console.error('Error deleting user:', error);
        showToast('Error deleting user.', 'error');
      }
    }

    if (confirmAction === 'deleteReview' && confirmData) {
      const key = confirmData;

      try {
        await database.ref(`reviews/${key}`).remove();
        showToast('✅ Review deleted successfully.');
        modal.classList.remove('show');
        loadReviews(true);
      } catch (error) {
        console.error('Error deleting review:', error);
        showToast('Error deleting review.', 'error');
      }
    }

    if (confirmAction === 'revokePartner' && confirmData) {
      const uid = confirmData;
      try {
        await database.ref(`partners/${uid}/status`).set('rejected');
        await database.ref(`partners/${uid}/revokedAt`).set(new Date().toISOString());
        await database.ref(`users/${uid}/partner/status`).set('rejected');
        showToast('✅ Partner access revoked.');
        modal.classList.remove('show');
        loadPartners(true);
        updatePartnerBadge();
      } catch (error) {
        console.error('Error revoking partner:', error);
        showToast('Error revoking partner access.', 'error');
      }
    }

    confirmAction = null;
    confirmData = null;
  });

  // ==============================================================
  // MODAL CLOSE HANDLERS
  // ==============================================================
  document.querySelectorAll('.modal-close, [data-modal]').forEach(el => {
    el.addEventListener('click', () => {
      const modalId = el.dataset.modal;
      const modal = document.getElementById(modalId);
      if (modal) modal.classList.remove('show');

      if (modalId === 'confirmModal') {
        confirmAction = null;
        confirmData = null;
      }
    });
  });

  document.querySelectorAll('.admin-modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('show');
        if (modal.id === 'confirmModal') {
          confirmAction = null;
          confirmData = null;
        }
      }
    });
  });

  // ==============================================================
  // SETTINGS - CHANGE PASSWORD (Master Admin only)
  // ==============================================================
  if (changeAdminPassBtn) {
    changeAdminPassBtn.addEventListener('click', async () => {
      if (!isMasterAdmin) {
        settingsMsg.textContent = '❌ Only the master admin can change the password.';
        settingsMsg.className = 'settings-msg error';
        return;
      }

      const pass = newAdminPass.value.trim();
      const confirm = newAdminPassConfirm.value.trim();

      if (!pass || pass.length < 4) {
        settingsMsg.textContent = 'Password must be at least 4 characters.';
        settingsMsg.className = 'settings-msg error';
        return;
      }

      if (pass !== confirm) {
        settingsMsg.textContent = 'Passwords do not match.';
        settingsMsg.className = 'settings-msg error';
        return;
      }

      try {
        await database.ref('admin/pass').set(pass);
        settingsMsg.textContent = '✅ Admin password updated successfully!';
        settingsMsg.className = 'settings-msg success';
        newAdminPass.value = '';
        newAdminPassConfirm.value = '';
        showToast('Password updated successfully!');
      } catch (error) {
        console.error('Error updating password:', error);
        settingsMsg.textContent = '❌ Error updating password. Please try again.';
        settingsMsg.className = 'settings-msg error';
      }
    });
  }

  // ==============================================================
  // SETTINGS - ADMIN ACCESS MANAGEMENT (Master Admin only)
  // ==============================================================
  async function loadAccessList() {
    try {
      const snapshot = await database.ref(ADMIN_ACCESS_PATH).once('value');
      const data = snapshot.val() || {};
      const entries = Object.entries(data);

      if (accessList) {
        if (entries.length === 0) {
          accessList.innerHTML = `<div style="color:var(--text-secondary);font-size:0.9rem;padding:0.5rem 0;">No additional admins. Only the master admin has access.</div>`;
          return;
        }

        let html = '';
        entries.forEach(([key, email]) => {
          const isMaster = email === MASTER_ADMIN_EMAIL;
          html += `
            <div class="access-item">
              <span class="email">${escapeHtml(email)} ${isMaster ? '⭐' : ''}</span>
              ${!isMaster && isMasterAdmin ? `<button class="remove-access" data-key="${key}">✕</button>` : ''}
            </div>
          `;
        });
        accessList.innerHTML = html;

        if (isMasterAdmin) {
          accessList.querySelectorAll('.remove-access').forEach(btn => {
            btn.addEventListener('click', async () => {
              const key = btn.dataset.key;
              if (confirm('Remove this user from admin access?')) {
                try {
                  await database.ref(`${ADMIN_ACCESS_PATH}/${key}`).remove();
                  showToast('✅ Access removed.');
                  loadAccessList();
                } catch (error) {
                  console.error('Error removing access:', error);
                  showToast('Error removing access.', 'error');
                }
              }
            });
          });
        }
      }
    } catch (error) {
      console.error('Error loading access list:', error);
    }
  }

  if (addAccessBtn) {
    addAccessBtn.addEventListener('click', async () => {
      if (!isMasterAdmin) {
        accessMsg.textContent = '❌ Only the master admin can grant access.';
        accessMsg.className = 'access-msg error';
        return;
      }

      const email = addAccessEmail.value.trim();

      if (!email || !email.includes('@')) {
        accessMsg.textContent = '❌ Please enter a valid email address.';
        accessMsg.className = 'access-msg error';
        return;
      }

      if (email === MASTER_ADMIN_EMAIL) {
        accessMsg.textContent = '❌ The master admin already has access.';
        accessMsg.className = 'access-msg error';
        return;
      }

      try {
        const snapshot = await database.ref(ADMIN_ACCESS_PATH).once('value');
        const data = snapshot.val() || {};
        const exists = Object.values(data).includes(email);

        if (exists) {
          accessMsg.textContent = '❌ This user already has admin access.';
          accessMsg.className = 'access-msg error';
          return;
        }

        const newKey = `admin_${Date.now()}`;
        await database.ref(`${ADMIN_ACCESS_PATH}/${newKey}`).set(email);
        accessMsg.textContent = '✅ Admin access granted successfully!';
        accessMsg.className = 'access-msg success';
        addAccessEmail.value = '';
        loadAccessList();
        showToast('✅ Admin access granted!');

      } catch (error) {
        console.error('Error granting access:', error);
        accessMsg.textContent = '❌ Error granting access. Please try again.';
        accessMsg.className = 'access-msg error';
      }
    });
  }

  if (addAccessEmail) {
    addAccessEmail.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addAccessBtn.click();
    });
  }

  // ==============================================================
  // SETTINGS - CLEAR VISIT DATA
  // ==============================================================
  if (clearVisitsBtn) {
    clearVisitsBtn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to clear all visit data? This cannot be undone.')) return;

      try {
        const snapshot = await database.ref('users').once('value');
        const users = snapshot.val() || {};
        const updates = {};

        Object.keys(users).forEach(key => {
          if (users[key].visits) {
            updates[`users/${key}/visits`] = null;
          }
          if (users[key].lastVisit) {
            updates[`users/${key}/lastVisit`] = null;
          }
          if (users[key].lastPage) {
            updates[`users/${key}/lastPage`] = null;
          }
        });

        // Also clear anonymous visits
        await database.ref('anonymous-visits').remove();
        await database.ref('anonymous-stats').remove();

        await database.ref().update(updates);
        showToast('✅ Visit data cleared successfully.');
        updateDashboardStats();
        loadUsers(true);
        updateVisitChart(currentChartRange);
      } catch (error) {
        console.error('Error clearing visits:', error);
        showToast('Error clearing visit data.', 'error');
      }
    });
  }

  // ==============================================================
  // FILTER / SEARCH HANDLERS
  // ==============================================================
  if (userSearch) {
    userSearch.addEventListener('input', () => {
      clearTimeout(loadUsersTimeout);
      loadUsersTimeout = setTimeout(applyFilters, 300);
    });
  }
  if (filterSpecialization) filterSpecialization.addEventListener('change', applyFilters);
  if (filterPlan) filterPlan.addEventListener('change', applyFilters);
  if (filterProvider) filterProvider.addEventListener('change', applyFilters);
  if (filterAccountType) filterAccountType.addEventListener('change', applyFilters);
  if (sortUsers) sortUsers.addEventListener('change', applyFilters);

  if (refreshUsersBtn) {
    refreshUsersBtn.addEventListener('click', () => {
      loadUsers(true);
      showToast('Users refreshed.');
    });
  }

  // ==============================================================
  // UTILITY FUNCTIONS
  // ==============================================================

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function stringToColor(str) {
    if (!str) return 'var(--accent)';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = ['#009688', '#14b8a6', '#0d9488', '#10b981', '#059669', '#0284c7', '#2563eb', '#7c3aed', '#8b5cf6'];
    return colors[Math.abs(hash) % colors.length];
  }

  // ==============================================================
  // AUTO-REFRESH (disabled to prevent disruption)
  // ==============================================================
  // No auto-refresh to prevent UX disruption. Users can manually refresh.

  // ==============================================================
  // INITIALIZATION
  // ==============================================================
  async function init() {
    await checkAdminPassword();
    console.log('Admin.js ready');
  }

  init();

  console.log('Admin.js ready');
});