// js/sub.js – location‑aware subscription system
document.addEventListener('DOMContentLoaded', function() {
  console.log('✨ Subscription module loaded');

  const database = firebase.database();
  const auth = firebase.auth();

  // ---------- Payment Gateway Keys ----------
  const PAYSTACK_PUBLIC_KEY = 'pk_test_fa4c2f591a02152bf21c30f8f9359b4a7be241d4';
  const FLUTTERWAVE_PUBLIC_KEY = 'FLWPUBK_TEST-b879ba7c16b007a6b9abc7253b739730-X';

  // ---------- Base Prices in USD ----------
  const BASE_USD_PRICES = {
    free: 0,
    student: 4.99,
    pro: 14.99
  };

  // ---------- Plan Definitions (benefits in English) ----------
  const planTemplates = [
    {
      id: 'free',
      name: 'Free',
      icon: '🚀',
      popular: false,
      benefits: [
        'Assessment Format Generator',
        'Standardized Tools (limited)',
        'Basic documentation',
        '1 ROM analysis/month',
        'Community support'
      ]
    },
    {
      id: 'student',
      name: 'Student',
      icon: '🎓',
      popular: false,
      benefits: [
        'Everything in Free',
        'Unlimited ROM Analyzer',
        '50 documentation sessions',
        '5 Gait analyses/month',
        'Assignment & Project Maker',
        'Study Buddy & Exam Simulator',
        'Email support'
      ]
    },
    {
      id: 'pro',
      name: 'Pro',
      icon: '💎',
      popular: true,
      benefits: [
        'Everything in Student',
        'Unlimited Gait Monitor',
        'Presentation Maker + export',
        'Unlimited cloud storage',
        'Priority AI processing',
        'Team dashboard',
        '24/7 support'
      ]
    }
  ];

  // ---------- Global State ----------
  let userCurrency = 'USD';            // fallback
  let exchangeRate = 1;                // USD to local
  let plans = [];                      // populated after location + exchange rate
  let selectedPlan = null;
  let currentlyExpandedCard = null;

  // ---------- Helper: Fetch Exchange Rate ----------
  async function fetchExchangeRate(targetCurrency) {
    try {
      const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const data = await res.json();
      return data.rates[targetCurrency] || 1;
    } catch (err) {
      console.error('Exchange rate fetch failed, using USD', err);
      return 1;
    }
  }

  // ---------- Helper: Detect User Location ----------
  async function detectLocation() {
    try {
      const res = await fetch('https://ipapi.co/json/');
      const data = await res.json();
      // Standardise country code
      const country = data.country_code || 'NG';
      const currencyMap = {
        NG: 'NGN',
        GH: 'GHS',
        KE: 'KES',
        US: 'USD',
        GB: 'GBP',
        IN: 'INR',
        EU: 'EUR',   // ipapi returns 'EU' for some? fallback to EUR
        // add more as needed
      };
      // For simplicity, if country not in map, use USD
      const currency = currencyMap[country] || 'USD';
      return { country, currency };
    } catch (err) {
      console.error('Location detection failed, using USD', err);
      return { country: 'NG', currency: 'NGN' };
    }
  }

  // ---------- Build Plans with local prices ----------
  function buildPlans() {
    return planTemplates.map(tpl => ({
      ...tpl,
      price: Math.round(BASE_USD_PRICES[tpl.id] * exchangeRate * 100) / 100,  // 2 decimals
      period: 'month'
    }));
  }

  // ---------- Get currency symbol ----------
  function getCurrencySymbol(currencyCode) {
    const symbols = {
      USD: '$',
      NGN: '₦',
      GHS: 'GH₵',
      KES: 'KSh',
      GBP: '£',
      INR: '₹',
      EUR: '€'
    };
    return symbols[currencyCode] || '$';
  }

  // ---------- Render Plan Cards ----------
  function renderPlans() {
    const grid = document.getElementById('plansGrid');
    if (!grid) return;

    const symbol = getCurrencySymbol(userCurrency);
    grid.innerHTML = plans.map((plan, index) => `
      <div class="plan-card ${plan.popular ? 'popular' : ''}" 
           data-plan="${plan.id}"
           style="animation: faqFadeSlide 0.6s cubic-bezier(0.23, 1, 0.32, 1) forwards; animation-delay: ${index * 0.1}s; opacity: 0;">
        
        <div class="plan-card-left">
          <div class="plan-icon-wrapper">${plan.icon}</div>
          <div class="plan-info">
            <h3 class="plan-name">
              ${plan.name}
              ${plan.popular ? '<span class="popular-badge-inline">POPULAR</span>' : ''}
            </h3>
          </div>
        </div>

        <div class="plan-card-right">
          <div class="plan-price-horizontal">
            <span class="currency">${symbol}</span>
            <span class="amount">${plan.price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
            <span class="period">/${plan.period}</span>
          </div>
          <div class="expand-indicator">
            <span class="expand-icon">▼</span>
          </div>
        </div>

        <div class="plan-expanded-content">
          <ul class="plan-benefits-expanded">
            ${plan.benefits.map(benefit => `
              <li><span class="benefit-dot"></span>${benefit}</li>
            `).join('')}
          </ul>
          <button class="plan-subscribe-btn ${plan.id === 'free' ? 'current-plan' : ''}" 
                  data-plan="${plan.id}"
                  data-action="subscribe">
            ${plan.id === 'free' ? 'Current Plan' : 'Get Started'}
          </button>
        </div>
      </div>
    `).join('');

    // Make subscription section visible (it's hidden by default)
    const section = document.getElementById('subscriptionPlans');
    if (section) section.style.display = 'block';

    // Attach click handlers
    document.querySelectorAll('.plan-card').forEach(card => {
      card.addEventListener('click', function(e) {
        if (e.target.closest('[data-action="subscribe"]')) return;
        toggleCardExpansion(this);
      });
    });

    document.querySelectorAll('[data-action="subscribe"]').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        handlePlanSelection(this);
      });
    });
  }

  // ---------- Card Expansion ----------
  function toggleCardExpansion(card) {
    const isCurrentlyExpanded = card.classList.contains('expanded');
    if (currentlyExpandedCard && currentlyExpandedCard !== card) {
      currentlyExpandedCard.classList.remove('expanded');
    }
    if (isCurrentlyExpanded) {
      card.classList.remove('expanded');
      currentlyExpandedCard = null;
    } else {
      card.classList.add('expanded');
      currentlyExpandedCard = card;
      setTimeout(() => {
        const rect = card.getBoundingClientRect();
        if (rect.bottom > window.innerHeight - 100) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }

  // ---------- Plan Selection ----------
  function handlePlanSelection(button) {
    const card = button.closest('.plan-card');
    const planId = card.getAttribute('data-plan');
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;

    const user = auth.currentUser;
    if (!user) {
      showToast('Please log in to subscribe', 3000, true);
      return;
    }

    if (plan.id === 'free') {
      activateFreePlan(user);
      return;
    }

    // Check if user's currency is supported for payment (only NGN for now)
    if (userCurrency !== 'NGN') {
      showToast('Payment in ' + userCurrency + ' is coming soon. For now, only Nigerian Naira is supported.', 4000, true);
      return;
    }

    selectedPlan = plan;
    openPremiumPaymentModal(plan);
  }

  // ---------- Activate Free Plan ----------
  function activateFreePlan(user) {
    database.ref(`users/${user.uid}/subscription`).update({
      plan: 'free',
      starts: new Date().toISOString(),
      ends: new Date(2099, 11, 31).toISOString(),
      renewal: 'manual'
    })
    .then(() => {
      showToast('✅ Free plan activated!');
      updateCurrentPlanUI('free');
      if (currentlyExpandedCard) {
        currentlyExpandedCard.classList.remove('expanded');
        currentlyExpandedCard = null;
      }
    })
    .catch(() => showToast('Failed to activate plan', 3000, true));
  }

  // ---------- Premium Payment Modal ----------
  function openPremiumPaymentModal(plan) {
    const modal = document.getElementById('subscriptionModal');
    const content = document.getElementById('subscriptionModalContent');
    if (!modal || !content) return;

    const symbol = getCurrencySymbol(userCurrency);
    content.innerHTML = `
      <button class="modal-close" id="closeSubModal">✕</button>
      <div class="payment-modal-header">
        <span class="payment-plan-badge">${plan.icon} ${plan.name} Plan</span>
        <h3 class="payment-modal-title">Confirm Subscription</h3>
        <div class="payment-price-display">
          <span class="currency">${symbol}</span>
          <span class="amount">${plan.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
          <span class="period">/${plan.period}</span>
        </div>
      </div>
      <div class="payment-divider"><span>Payment Method</span></div>
      <div class="payment-methods">
        <button class="payment-method-btn" id="paystackBtn">
          <div class="payment-method-icon paystack">P</div>
          <div class="payment-method-info">
            <div class="payment-method-name">Paystack</div>
            <div class="payment-method-desc">Card, Bank, USSD</div>
          </div>
        </button>
        <button class="payment-method-btn" id="flutterwaveBtn">
          <div class="payment-method-icon flutterwave">F</div>
          <div class="payment-method-info">
            <div class="payment-method-name">Flutterwave</div>
            <div class="payment-method-desc">Card, Bank, USSD</div>
          </div>
        </button>
      </div>
      <div class="secure-badge">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        Secured with 256-bit encryption
      </div>
    `;

    modal.classList.add('show');
    document.body.style.overflow = 'hidden';

    document.getElementById('closeSubModal').addEventListener('click', closePaymentModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closePaymentModal(); });
    document.getElementById('paystackBtn').addEventListener('click', initPaystackPayment);
    document.getElementById('flutterwaveBtn').addEventListener('click', initFlutterwavePayment);
  }

  function closePaymentModal() {
    const modal = document.getElementById('subscriptionModal');
    if (modal) {
      modal.classList.remove('show');
      document.body.style.overflow = '';
    }
    selectedPlan = null;
  }

  // ---------- Paystack ----------
  function initPaystackPayment() {
    const user = auth.currentUser;
    if (!user || !selectedPlan) return;
    const amountInKobo = selectedPlan.price * 100;  // Paystack expects kobo

    const handler = PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email: user.email,
      amount: amountInKobo,
      currency: 'NGN',
      ref: `rehab_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      metadata: { plan: selectedPlan.id, user_id: user.uid },
      callback: (response) => updateSubscriptionAfterPayment('paystack', response),
      onClose: () => showToast('Payment cancelled', 2000)
    });
    handler.openIframe();
  }

  // ---------- Flutterwave ----------
  function initFlutterwavePayment() {
    const user = auth.currentUser;
    if (!user || !selectedPlan) return;

    FlutterwaveCheckout({
      public_key: FLUTTERWAVE_PUBLIC_KEY,
      tx_ref: `rehab_${Date.now()}`,
      amount: selectedPlan.price,
      currency: 'NGN',
      payment_options: 'card,banktransfer,ussd',
      customer: { email: user.email, name: user.displayName || 'User' },
      meta: { plan: selectedPlan.id },
      customizations: { title: 'rehablix', description: `${selectedPlan.name} Plan` },
      callback: (data) => {
        if (data.status === 'successful') updateSubscriptionAfterPayment('flutterwave', data);
      },
      onclose: () => showToast('Payment cancelled', 2000)
    });
  }

  // ---------- Update Firebase after payment ----------
  function updateSubscriptionAfterPayment(gateway, response) {
    const user = auth.currentUser;
    if (!user || !selectedPlan) return;

    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);

    database.ref(`users/${user.uid}/subscription`).set({
      plan: selectedPlan.id,
      starts: new Date().toISOString(),
      ends: endDate.toISOString(),
      renewal: 'manual',
      gateway: gateway,
      transactionRef: response.reference || response.tx_ref || ''
    })
    .then(() => {
      showToast(`🎉 Subscribed to ${selectedPlan.name}!`);
      closePaymentModal();
      updateCurrentPlanUI(selectedPlan.id);
      if (currentlyExpandedCard) {
        currentlyExpandedCard.classList.remove('expanded');
        currentlyExpandedCard = null;
      }
    })
    .catch(() => showToast('Update failed. Contact support.', 5000, true));
  }

  // ---------- Highlight Current Plan ----------
  function updateCurrentPlanUI(planId) {
    document.querySelectorAll('.plan-card').forEach(card => {
      const cardPlanId = card.getAttribute('data-plan');
      const btn = card.querySelector('.plan-subscribe-btn');
      if (!btn) return;
      if (cardPlanId === planId) {
        btn.textContent = 'Current Plan';
        btn.classList.add('current-plan');
        btn.disabled = true;
      } else {
        btn.textContent = 'Get Started';
        btn.classList.remove('current-plan');
        btn.disabled = false;
      }
    });
  }

  // ---------- Toast ----------
  function showToast(message, duration = 3000, isError = false) {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.background = isError ? '#ef4444' : 'var(--accent)';
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), duration);
  }

  // ---------- Initialisation ----------
  async function initSubscription() {
    // 1. detect location
    const loc = await detectLocation();
    userCurrency = loc.currency;
    console.log('User location:', loc.country, userCurrency);

    // 2. fetch exchange rate (USD → local)
    exchangeRate = await fetchExchangeRate(userCurrency);
    console.log('Exchange rate (USD to ' + userCurrency + '):', exchangeRate);

    // 3. build plans with local prices
    plans = buildPlans();
    console.log('Plans:', plans);

    // 4. render the cards
    renderPlans();

    // 5. load existing subscription if user logged in
    auth.onAuthStateChanged(user => {
      if (user) {
        database.ref(`users/${user.uid}/subscription`).once('value')
          .then(snapshot => {
            const sub = snapshot.val();
            if (sub && sub.plan) {
              updateCurrentPlanUI(sub.plan);
            } else {
              // auto-activate free if no subscription
              activateFreePlan(user);
            }
          });
      }
    });
  }

  // Kick off everything
  initSubscription().catch(err => {
    console.error('Subscription init failed:', err);
    // fallback to USD and show plans
    plans = buildPlans();   // exchangeRate = 1
    renderPlans();
  });
});
