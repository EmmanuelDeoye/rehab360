// js/upgrade.js – Country-specific fixed pricing with "slashed price" illusion, multi-gateway payments

document.addEventListener('DOMContentLoaded', async () => {

  // ===== DOM Elements (with null safety) =====
  const getEl = (id) => document.getElementById(id);
  
  const plansGrid = getEl('plansGrid');
  const paymentModal = getEl('paymentModal');
  const closePaymentModal = getEl('closePaymentModal');
  const paymentMethodsContainer = getEl('paymentMethods');
  const paymentPlanBadge = getEl('paymentPlanBadge');
  const paymentCurrency = getEl('paymentCurrency');
  const paymentAmount = getEl('paymentAmount');
  const paymentPeriod = getEl('paymentPeriod');
  const paymentBilling = getEl('paymentBilling');
  const billingToggle = getEl('billingToggle');
  const locationFlag = getEl('locationFlag');
  const locationText = getEl('locationText');
  const currencyCode = getEl('currencyCode');
  const currencyNotice = getEl('currencyNotice');
  const toastContainer = getEl('toast-container');

  // ===== State =====
  let currentUser = null;
  let currentPlan = 'free';
  let selectedPlan = null;
  let isYearly = false;
  let userCountry = 'US';
  let userCurrency = 'USD';
  let countrySymbol = '$';
  let paymentGateways = [];

  const database = firebase.database();
  const auth = firebase.auth();

  // ===== Country-Specific Fixed Prices with "slashed original" illusion =====
  // "original" = crossed-out price shown for discount illusion
  // "current" = actual price user pays
  const COUNTRY_PRICING = {
    // Nigeria (NGN ₦)
    NG: {
      currency: 'NGN', symbol: '₦', flag: '🇳🇬', name: 'Nigeria',
      gateways: ['paystack', 'gpay'],
      student: { 
        monthly: { original: 3699, current: 1999 }, 
        yearly: { original: 36999, current: 18599 } 
      },
      pro: { 
        monthly: { original: 6499, current: 3499 }, 
        yearly: { original: 64999, current: 34499 } 
      }
    },
    // Ghana (GHS GH₵)
    GH: {
      currency: 'GHS', symbol: 'GH₵', flag: '🇬🇭', name: 'Ghana',
      gateways: ['paystack', 'gpay'],
      student: { 
        monthly: { original: 54.99, current: 29.99 }, 
        yearly: { original: 539.99, current: 289.99 } 
      },
      pro: { 
        monthly: { original: 269.99, current: 149.99 }, 
        yearly: { original: 2649.99, current: 1479.99 } 
      }
    },
    // Kenya (KES KSh)
    KE: {
      currency: 'KES', symbol: 'KSh', flag: '🇰🇪', name: 'Kenya',
      gateways: ['flutterwave'],
      student: { 
        monthly: { original: 749, current: 399 }, 
        yearly: { original: 7299, current: 3899 } 
      },
      pro: { 
        monthly: { original: 3699, current: 1999 }, 
        yearly: { original: 35999, current: 19599 } 
      }
    },
    // South Africa (ZAR R)
    ZA: {
      currency: 'ZAR', symbol: 'R', flag: '🇿🇦', name: 'South Africa',
      gateways: ['paystack', 'flutterwave'],
      student: { 
        monthly: { original: 89.99, current: 49.99 }, 
        yearly: { original: 879.99, current: 479.99 } 
      },
      pro: { 
        monthly: { original: 449.99, current: 249.99 }, 
        yearly: { original: 4399.99, current: 2459.99 } 
      }
    },
    // Tanzania (TZS TSh)
    TZ: {
      currency: 'TZS', symbol: 'TSh', flag: '🇹🇿', name: 'Tanzania',
      gateways: ['flutterwave'],
      student: { 
        monthly: { original: 12999, current: 6999 }, 
        yearly: { original: 127999, current: 68999 } 
      },
      pro: { 
        monthly: { original: 64999, current: 34999 }, 
        yearly: { original: 639999, current: 345999 } 
      }
    },
    // Uganda (UGX USh)
    UG: {
      currency: 'UGX', symbol: 'USh', flag: '🇺🇬', name: 'Uganda',
      gateways: ['flutterwave'],
      student: { 
        monthly: { original: 19999, current: 10999 }, 
        yearly: { original: 195999, current: 107999 } 
      },
      pro: { 
        monthly: { original: 99999, current: 54999 }, 
        yearly: { original: 979999, current: 539999 } 
      }
    },
    // Rwanda (RWF RF)
    RW: {
      currency: 'RWF', symbol: 'RF', flag: '🇷🇼', name: 'Rwanda',
      gateways: ['flutterwave'],
      student: { 
        monthly: { original: 6499, current: 3499 }, 
        yearly: { original: 62999, current: 33999 } 
      },
      pro: { 
        monthly: { original: 32499, current: 17499 }, 
        yearly: { original: 317999, current: 171999 } 
      }
    },
    // Cameroon (XAF FCFA)
    CM: {
      currency: 'XAF', symbol: 'FCFA', flag: '🇨🇲', name: 'Cameroon',
      gateways: ['flutterwave'],
      student: { 
        monthly: { original: 3299, current: 1799 }, 
        yearly: { original: 31999, current: 17499 } 
      },
      pro: { 
        monthly: { original: 16499, current: 8999 }, 
        yearly: { original: 160999, current: 87999 } 
      }
    },
    // Côte d'Ivoire (XOF CFA)
    CI: {
      currency: 'XOF', symbol: 'CFA', flag: '🇨🇮', name: "Côte d'Ivoire",
      gateways: ['flutterwave'],
      student: { 
        monthly: { original: 3299, current: 1799 }, 
        yearly: { original: 31999, current: 17499 } 
      },
      pro: { 
        monthly: { original: 16499, current: 8999 }, 
        yearly: { original: 160999, current: 87999 } 
      }
    },
    // Senegal (XOF CFA)
    SN: {
      currency: 'XOF', symbol: 'CFA', flag: '🇸🇳', name: 'Senegal',
      gateways: ['flutterwave'],
      student: { 
        monthly: { original: 3299, current: 1799 }, 
        yearly: { original: 31999, current: 17499 } 
      },
      pro: { 
        monthly: { original: 16499, current: 8999 }, 
        yearly: { original: 160999, current: 87999 } 
      }
    },
    // India (INR ₹)
    IN: {
      currency: 'INR', symbol: '₹', flag: '🇮🇳', name: 'India',
      gateways: ['paystack','gpay'],
      student: { 
        monthly: { original: 549, current: 299 }, 
        yearly: { original: 5399, current: 2899 } 
      },
      pro: { 
        monthly: { original: 1849, current: 999 }, 
        yearly: { original: 17999, current: 9799 } 
      }
    },
    // United States (USD $)
    US: {
      currency: 'USD', symbol: '$', flag: '🇺🇸', name: 'United States',
      gateways: ['gpay'],
      student: { 
        monthly: { original: 5.99, current: 2.99 }, 
        yearly: { original: 59.99, current: 28.99 } 
      },
      pro: { 
        monthly: { original: 19.99, current: 9.99 }, 
        yearly: { original: 199.99, current: 99.99 } 
      }
    },
    // United Kingdom (GBP £)
    GB: {
      currency: 'GBP', symbol: '£', flag: '🇬🇧', name: 'United Kingdom',
      gateways: ['gpay'],
      student: { 
        monthly: { original: 4.99, current: 2.49 }, 
        yearly: { original: 48.99, current: 23.99 } 
      },
      pro: { 
        monthly: { original: 15.99, current: 7.99 }, 
        yearly: { original: 156.99, current: 78.99 } 
      }
    },
    // Canada (CAD CA$)
    CA: {
      currency: 'CAD', symbol: 'CA$', flag: '🇨🇦', name: 'Canada',
      gateways: ['gpay'],
      student: { 
        monthly: { original: 7.99, current: 3.99 }, 
        yearly: { original: 77.99, current: 38.99 } 
      },
      pro: { 
        monthly: { original: 24.99, current: 12.99 }, 
        yearly: { original: 249.99, current: 127.99 } 
      }
    },
    // Australia (AUD A$)
    AU: {
      currency: 'AUD', symbol: 'A$', flag: '🇦🇺', name: 'Australia',
      gateways: ['gpay'],
      student: { 
        monthly: { original: 8.99, current: 4.49 }, 
        yearly: { original: 87.99, current: 43.99 } 
      },
      pro: { 
        monthly: { original: 29.99, current: 14.99 }, 
        yearly: { original: 294.99, current: 147.99 } 
      }
    },
    // Germany (EUR €)
    DE: {
      currency: 'EUR', symbol: '€', flag: '🇩🇪', name: 'Germany',
      gateways: ['gpay'],
      student: { 
        monthly: { original: 5.99, current: 2.99 }, 
        yearly: { original: 57.99, current: 28.99 } 
      },
      pro: { 
        monthly: { original: 18.99, current: 9.49 }, 
        yearly: { original: 184.99, current: 92.99 } 
      }
    },
    // France (EUR €)
    FR: {
      currency: 'EUR', symbol: '€', flag: '🇫🇷', name: 'France',
      gateways: ['gpay'],
      student: { 
        monthly: { original: 5.99, current: 2.99 }, 
        yearly: { original: 57.99, current: 28.99 } 
      },
      pro: { 
        monthly: { original: 18.99, current: 9.49 }, 
        yearly: { original: 184.99, current: 92.99 } 
      }
    },
    // Brazil (BRL R$)
    BR: {
      currency: 'BRL', symbol: 'R$', flag: '🇧🇷', name: 'Brazil',
      gateways: ['gpay'],
      student: { 
        monthly: { original: 29.99, current: 14.99 }, 
        yearly: { original: 289.99, current: 144.99 } 
      },
      pro: { 
        monthly: { original: 99.99, current: 49.99 }, 
        yearly: { original: 979.99, current: 489.99 } 
      }
    },
  };

  // Default/fallback pricing (USD)
  const DEFAULT_PRICING = {
    currency: 'USD', symbol: '$', flag: '🌍', name: 'International',
    gateways: ['gpay'],
    student: { 
      monthly: { original: 5.99, current: 2.99 }, 
      yearly: { original: 59.99, current: 28.99 } 
    },
    pro: { 
      monthly: { original: 19.99, current: 9.99 }, 
      yearly: { original: 199.99, current: 99.99 } 
    }
  };

  // ===== Payment Gateway Keys =====
  // Paystack: this is a live key (pk_live_...) — correct for production.
  const PAYSTACK_PUBLIC_KEY = 'pk_live_1fd1c3c6380edae5c08ca9f1e69db8d717534af2';
  // ⚠️ FLUTTERWAVE: this was a TEST key (FLWPUBK_TEST-...), which means every
  // Flutterwave-only country (Kenya, Tanzania, Uganda, Rwanda, Cameroon,
  // Côte d'Ivoire, Senegal) was running in sandbox mode — no real money was
  // ever charged, but users were still being granted paid access. Replace
  // this with your LIVE Flutterwave public key (starts with FLWPUBK-, no
  // "_TEST") from your Flutterwave dashboard before going live.
  const FLUTTERWAVE_PUBLIC_KEY = 'FLWPUBK-a433c420ff08c5ffe8d0edb484e5b6bc-X';

  // ===== Helpers =====
  function showToast(message, type = 'success', duration = 3500) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  function getCountryPricing(countryCode) {
    return COUNTRY_PRICING[countryCode] || DEFAULT_PRICING;
  }

  function formatPrice(price, symbol) {
    if (price === 0) return `${symbol}0`;
    if (price % 1 !== 0) return `${symbol}${price.toFixed(2)}`;
    return `${symbol}${price.toLocaleString()}`;
  }

  // ===== Get previous page URL for redirect =====
  function getPreviousPage() {
    const referrer = document.referrer;
    // If came from rehablix site, go back there; otherwise go to index
    if (referrer && (referrer.includes('rehablix') || referrer.includes('127.0.0.1') || referrer.includes('localhost'))) {
      return referrer;
    }
    return 'index.html';
  }

  // ===== Detect Location =====
  async function detectLocation() {
    try {
      const response = await fetch('https://ipapi.co/json/');
      const data = await response.json();
      userCountry = data.country_code || 'US';
      const pricing = getCountryPricing(userCountry);
      userCurrency = pricing.currency;
      countrySymbol = pricing.symbol;
      paymentGateways = pricing.gateways;
      
      if (locationFlag) locationFlag.textContent = pricing.flag;
      if (locationText) locationText.textContent = `Prices in ${pricing.name} (${pricing.currency})`;
      if (currencyCode) currencyCode.textContent = pricing.currency;
      if (currencyNotice) currencyNotice.style.display = 'flex';
      
      return pricing;
    } catch (error) {
      console.error('Location detection failed:', error);
      userCountry = 'US';
      const pricing = DEFAULT_PRICING;
      userCurrency = pricing.currency;
      countrySymbol = pricing.symbol;
      paymentGateways = pricing.gateways;
      
      if (locationFlag) locationFlag.textContent = pricing.flag;
      if (locationText) locationText.textContent = `Prices in USD (International)`;
      if (currencyCode) currencyCode.textContent = 'USD';
      if (currencyNotice) currencyNotice.style.display = 'flex';
      
      return pricing;
    }
  }

  // ===== Update Plan Prices with Slashed Original Price & Discount Badge =====
  function updatePlanPrices(pricing) {
    const symbol = pricing.symbol;
    
    const freeCurrencyEl = getEl('freeCurrency');
    const studentCurrencyEl = getEl('studentCurrency');
    const proCurrencyEl = getEl('proCurrency');
    const studentPriceEl = getEl('studentPrice');
    const proPriceEl = getEl('proPrice');
    
    // Update currency symbols
    if (freeCurrencyEl) freeCurrencyEl.textContent = symbol;
    if (studentCurrencyEl) studentCurrencyEl.textContent = symbol;
    if (proCurrencyEl) proCurrencyEl.textContent = symbol;
    
    // Get prices for current billing period
    const studentPricing = isYearly ? pricing.student.yearly : pricing.student.monthly;
    const proPricing = isYearly ? pricing.pro.yearly : pricing.pro.monthly;
    
    // Update Student price card
    if (studentPriceEl) {
      const studentCard = studentPriceEl.closest('.plan-price');
      
      // Remove existing slashed p&& rice and discount badge
      const existingSlash = studentCard?.querySelector('.slashed-price');
      if (existingSlash) existingSlash.remove();
      const existingBadge = studentCard?.querySelector('.discount-badge');
      if (existingBadge) existingBadge.remove();
      
      if (studentCard) {
        // Add slashed original price above current price
        const slashSpan = document.createElement('span');
        slashSpan.className = 'slashed-price';
        slashSpan.textContent = formatPrice(studentPricing.original, symbol);
        slashSpan.style.cssText = `
          text-decoration: line-through;
          color: #dc2626;
          font-size: 1.5rem;
          font-weight: 500;
          opacity: 0.7;
          display: block;
          margin-bottom: -0.2rem;
        `;
        studentCard.insertBefore(slashSpan, studentPriceEl);
        
        // Add discount badge
        const discountPercent = Math.round((1 - studentPricing.current / studentPricing.original) * 100);
        const badge = document.createElement('span');
        badge.className = 'discount-badge';
        badge.textContent = `-${discountPercent}%`;
        badge.style.cssText = `
          background: #10b981;
          color: white;
          padding: 0.15rem 0.5rem;
          border-radius: 1rem;
          font-size: 0.65rem;
          font-weight: 700;
          margin-left: 0.4rem;
          vertical-align: middle;
          animation: badgePop 0.3s ease;
        `;
        studentPriceEl.parentNode.appendChild(badge);
      }
      
      // Update current price
      studentPriceEl.textContent = studentPricing.current % 1 !== 0 ? studentPricing.current.toFixed(2) : studentPricing.current.toLocaleString();
    }
    
    // Update Pro price card
    if (proPriceEl) {
      const proCard = proPriceEl.closest('.plan-price');
      
      // Remove existing slashed price and discount badge
      const existingSlash = proCard?.querySelector('.slashed-price');
      if (existingSlash) existingSlash.remove();
      const existingBadge = proCard?.querySelector('.discount-badge');
      if (existingBadge) existingBadge.remove();
      
      if (proCard) {
        // Add slashed original price above current price
        const slashSpan = document.createElement('span');
        slashSpan.className = 'slashed-price';
        slashSpan.textContent = formatPrice(proPricing.original, symbol);
        slashSpan.style.cssText = `
          text-decoration: line-through;
          color: #dc2626;
          font-size: 1.5rem;
          font-weight: 500;
          opacity: 0.7;
          display: block;
          margin-bottom: -0.2rem;
        `;
        proCard.insertBefore(slashSpan, proPriceEl);
        
        // Add discount badge
        const discountPercent = Math.round((1 - proPricing.current / proPricing.original) * 100);
        const badge = document.createElement('span');
        badge.className = 'discount-badge';
        badge.textContent = `-${discountPercent}%`;
        badge.style.cssText = `
          background: #10b981;
          color: white;
          padding: 0.15rem 0.5rem;
          border-radius: 1rem;
          font-size: 0.65rem;
          font-weight: 700;
          margin-left: 0.4rem;
          vertical-align: middle;
          animation: badgePop 0.3s ease;
        `;
        proPriceEl.parentNode.appendChild(badge);
      }
      
      // Update current price
      proPriceEl.textContent = proPricing.current % 1 !== 0 ? proPricing.current.toFixed(2) : proPricing.current.toLocaleString();
    }
    
    // Update period labels
    document.querySelectorAll('.period').forEach(el => {
      el.textContent = isYearly ? '/year' : '/month';
    });
  }

  // ===== Billing Toggle =====
  if (billingToggle) {
    billingToggle.addEventListener('change', () => {
      isYearly = billingToggle.checked;
      const pricing = getCountryPricing(userCountry);
      updatePlanPrices(pricing);
      document.querySelectorAll('.toggle-label').forEach(label => {
        label.classList.toggle('active', label.dataset.billing === (isYearly ? 'yearly' : 'monthly'));
      });
    });
  }

  document.querySelectorAll('.toggle-label').forEach(label => {
    label.addEventListener('click', () => {
      const billing = label.dataset.billing;
      isYearly = billing === 'yearly';
      if (billingToggle) billingToggle.checked = isYearly;
      const pricing = getCountryPricing(userCountry);
      updatePlanPrices(pricing);
      document.querySelectorAll('.toggle-label').forEach(l => {
        l.classList.toggle('active', l.dataset.billing === billing);
      });
    });
  });

  // ===== Plan Selection =====
  function attachPlanButtonListeners() {
    document.querySelectorAll('.plan-btn:not(.current-plan)').forEach(btn => {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);

      newBtn.addEventListener('click', () => {
        const plan = newBtn.dataset.plan;
        if (!plan || plan === 'free') return;

        if (!currentUser) {
          showToast('Please log in to subscribe', 'error', 4000);
          
          const loginBtn = getEl('loginBtn');
          const authModal = getEl('authModal');
          
          if (loginBtn && loginBtn.style.display !== 'none' && loginBtn.offsetParent !== null) {
            loginBtn.click();
          } else if (authModal) {
            authModal.classList.add('show');
            document.body.style.overflow = 'hidden';
            
            const loginTab = getEl('loginTab');
            const registerTab = getEl('registerTab');
            const loginForm = getEl('loginForm');
            const registerForm = getEl('registerForm');
            
            if (loginTab && registerTab && loginForm && registerForm) {
              loginTab.classList.add('active');
              registerTab.classList.remove('active');
              loginForm.classList.add('active');
              registerForm.classList.remove('active');
            }
          } else {
            showToast('Redirecting to login page...', 'info', 2000);
            setTimeout(() => { window.location.href = 'index.html'; }, 1500);
          }
          return;
        }

        selectedPlan = plan;
        openPaymentModal(plan);
      });
    });
  }

  attachPlanButtonListeners();

  // ===== Payment Modal =====
  function openPaymentModal(plan) {
    if (!paymentModal) return;
    
    const pricing = getCountryPricing(userCountry);
    const priceData = isYearly ? pricing[plan].yearly : pricing[plan].monthly;
    const discountPercent = Math.round((1 - priceData.current / priceData.original) * 100);
    
    if (paymentPlanBadge) paymentPlanBadge.textContent = plan === 'student' ? '🎓 Student Plan' : '💎 Pro Plan';
    if (paymentCurrency) paymentCurrency.textContent = pricing.symbol;
    if (paymentAmount) paymentAmount.textContent = priceData.current % 1 !== 0 ? priceData.current.toFixed(2) : priceData.current.toLocaleString();
    if (paymentPeriod) paymentPeriod.textContent = isYearly ? '/year' : '/month';
    if (paymentBilling) {
      paymentBilling.textContent = isYearly 
        ? `Billed yearly (save ${discountPercent}%)` 
        : 'Billed monthly';
    }
    
    // Add slashed original price in payment modal
    const paymentPriceDisplay = paymentAmount?.closest('.payment-price-display');
    if (paymentPriceDisplay) {
      // Remove existing slashed price
      const existingSlash = paymentPriceDisplay.querySelector('.payment-slashed-price');
      if (existingSlash) existingSlash.remove();
      
      // Add new slashed price above the current price
      const slashSpan = document.createElement('span');
      slashSpan.className = 'payment-slashed-price';
      slashSpan.textContent = formatPrice(priceData.original, pricing.symbol);
      slashSpan.style.cssText = `
        text-decoration: line-through;
        color: #dc2626;
        font-size: 1rem;
        font-weight: 500;
        opacity: 0.6;
        display: block;
        margin-bottom: -0.3rem;
      `;
      paymentPriceDisplay.insertBefore(slashSpan, paymentPriceDisplay.firstChild);
    }
    
    renderPaymentMethods(pricing);
    
    paymentModal.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function renderPaymentMethods(pricing) {
    if (!paymentMethodsContainer) return;
    paymentMethodsContainer.innerHTML = '';
    
    pricing.gateways.forEach(gateway => {
      let iconClass, name, desc, icon;
      switch (gateway) {
        case 'paystack':
          iconClass = 'paystack';
          name = 'Paystack';
          desc = 'Card, Bank Transfer, USSD';
          icon = 'P';
          break;
        case 'flutterwave':
          iconClass = 'flutterwave';
          name = 'Flutterwave';
          desc = 'Card, Bank, Mobile Money';
          icon = 'F';
          break;
        case 'gpay':
          iconClass = 'gpay';
          name = 'Google Pay';
          desc = 'Fast checkout with Google Pay';
          icon = 'G';
          break;
      }
      
      const btn = document.createElement('button');
      btn.className = 'payment-method-btn';
      btn.dataset.gateway = gateway;
      btn.innerHTML = `
        <div class="payment-method-icon ${iconClass}">${icon}</div>
        <div class="payment-method-info">
          <div class="payment-method-name">${name}</div>
          <div class="payment-method-desc">${desc}</div>
        </div>
      `;
      
      btn.addEventListener('click', () => initiatePayment(gateway));
      paymentMethodsContainer.appendChild(btn);
    });
  }

  // ===== Initiate Payment =====
  function initiatePayment(gateway) {
    if (!selectedPlan || !currentUser) return;
    
    const pricing = getCountryPricing(userCountry);
    const priceData = isYearly ? pricing[selectedPlan].yearly : pricing[selectedPlan].monthly;
    
    switch (gateway) {
      case 'paystack':
        initPaystack(priceData.current, pricing);
        break;
      case 'flutterwave':
        initFlutterwave(priceData.current, pricing);
        break;
      case 'gpay':
        initGooglePay(priceData.current, pricing);
        break;
    }
  }

  // ===== Paystack =====
  function initPaystack(amount, pricing) {
    // Convert to kobo (smallest unit) for Paystack
    const amountInSmallest = Math.round(amount * 100);
    
    const handler = PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email: currentUser.email,
      amount: amountInSmallest,
      currency: pricing.currency,
      ref: `rehab_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      metadata: {
        plan: selectedPlan,
        billing: isYearly ? 'yearly' : 'monthly',
        user_id: currentUser.uid,
        country: userCountry
      },
      callback: (response) => handlePaymentSuccess('paystack', response, amount),
      onClose: () => showToast('Payment cancelled', 'warning', 2000)
    });
    handler.openIframe();
  }

  // ===== Flutterwave =====
  function initFlutterwave(amount, pricing) {
    FlutterwaveCheckout({
      public_key: FLUTTERWAVE_PUBLIC_KEY,
      tx_ref: `rehab_${Date.now()}`,
      amount: amount,
      currency: pricing.currency,
      payment_options: 'card,banktransfer,ussd,mobilemoney',
      customer: {
        email: currentUser.email,
        name: currentUser.displayName || 'User'
      },
      meta: {
        plan: selectedPlan,
        billing: isYearly ? 'yearly' : 'monthly',
        user_id: currentUser.uid,
        country: userCountry
      },
      customizations: {
        title: 'rehablix',
        description: `${selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)} Plan - ${isYearly ? 'Yearly' : 'Monthly'}`
      },
      callback: (data) => {
        if (data.status === 'successful') {
          handlePaymentSuccess('flutterwave', data, amount);
        }
      },
      onclose: () => showToast('Payment cancelled', 'warning', 2000)
    });
  }

  // ===== Google Pay =====
  // FIX (was broken): this used to call Google's raw
  // `google.payments.api.PaymentsClient` directly with
  // `gateway: 'example'` (a placeholder Google only accepts in their own
  // demos) and `environment: 'PRODUCTION'`. Neither of those can ever work
  // for a real merchant: 'example' isn't a real payment processor, so
  // Google rejects/silently no-ops the tokenization, and 'PRODUCTION' mode
  // requires a fully Business-Console-verified Google Pay merchant account
  // or it just reports Google Pay as "not available" — which, since GPay
  // was the ONLY gateway configured for US/UK/CA/AU/DE/FR/BR, meant every
  // customer in those countries hit a dead end (or, in earlier test-mode
  // versions, got "successful" callbacks without ever being charged).
  //
  // Real fix: this static, backend-less site has no way to run its own
  // Google Pay <-> processor tokenization exchange (that requires a
  // Google-approved PSP integration id, which only an actual payment
  // processor can issue you). Flutterwave is already wired up above and
  // has first-class Google Pay support built into its own checkout
  // (Flutterwave takes care of the Google Wallet handshake, card
  // tokenization, and settlement) — so "Google Pay" in the UI now opens
  // the Flutterwave checkout pre-configured to show only the Google Pay
  // option. This is a fully working integration once you:
  //   1. Set FLUTTERWAVE_PUBLIC_KEY above to your real live key.
  //   2. In the Flutterwave dashboard -> Settings -> Checkout, enable the
  //      "Google Pay" payment option for your account (it's opt-in).
  function initGooglePay(amount, pricing) {
    if (typeof FlutterwaveCheckout !== 'function') {
      showToast('Google Pay is temporarily unavailable. Please try another payment method.', 'error');
      return;
    }

    FlutterwaveCheckout({
      public_key: FLUTTERWAVE_PUBLIC_KEY,
      tx_ref: `rehab_gpay_${Date.now()}`,
      amount: amount,
      currency: pricing.currency,
      payment_options: 'googlepay',
      customer: {
        email: currentUser.email,
        name: currentUser.displayName || 'User'
      },
      meta: {
        plan: selectedPlan,
        billing: isYearly ? 'yearly' : 'monthly',
        user_id: currentUser.uid,
        country: userCountry,
        method: 'googlepay'
      },
      customizations: {
        title: 'rehablix',
        description: `${selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)} Plan - Google Pay`
      },
      callback: (data) => {
        if (data.status === 'successful') {
          handlePaymentSuccess('gpay', data, amount);
        }
      },
      onclose: () => showToast('Payment cancelled', 'warning', 2000)
    });
  }

  // ===== Payment Success Handler =====
  async function handlePaymentSuccess(gateway, response, amount) {
    if (!currentUser || !selectedPlan) return;

    // Minimal sanity check on the transaction reference before we grant
    // access. This does NOT replace real server-side verification (see
    // note below) — it only catches obviously broken/empty callbacks.
    const transactionRef = response.reference || response.tx_ref || response.paymentMethodData?.token || '';
    if (!transactionRef) {
      showToast('Payment could not be confirmed — no transaction reference received. You have not been charged (or if you were, contact support with your bank statement).', 'error', 7000);
      return;
    }

    // ⚠️ IMPORTANT: this app has no backend, so this is trusting the
    // gateway's browser-side callback directly — there is no server-side
    // verification of `transactionRef` against Paystack/Flutterwave's API.
    // A technically determined user could fabricate a success callback in
    // devtools and grant themselves a paid plan without paying. Closing
    // this gap for real requires a server (webhook receiver + API
    // verification call), which is outside what a static/backend-less
    // site can do. Flagging this clearly rather than pretending otherwise.

    const endDate = new Date();
    if (isYearly) {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }
    
    try {
      // Update subscription in Firebase
      await database.ref(`users/${currentUser.uid}/subscription`).set({
        plan: selectedPlan,
        billing: isYearly ? 'yearly' : 'monthly',
        starts: new Date().toISOString(),
        ends: endDate.toISOString(),
        gateway: gateway,
        transactionRef: transactionRef,
        country: userCountry,
        currency: userCurrency,
        amount: amount
      });
      
      closePaymentModalHandler();
      
      // Force plan.js to reload the subscription by dispatching event
      document.dispatchEvent(new CustomEvent('planUpdated', { detail: { plan: selectedPlan } }));

      showSuccessCelebration(selectedPlan, endDate);

      // Rehablix Partners: credit the referring partner's 20% commission,
      // if this user was referred by one. Never let this block/undo the
      // subscription the user just paid for — failures here are swallowed
      // and logged rather than surfaced as a payment error.
      creditPartnerCommission(gateway, transactionRef, amount).catch(err => {
        console.error('Partner commission crediting failed:', err);
      });
      
    } catch (error) {
      console.error('Subscription update failed:', error);
      showToast('Payment successful but subscription update failed. Please contact support.', 'error', 5000);
    }
  }

  // ===== Rehablix Partners: Referral Commission =====
  const PARTNER_COMMISSION_RATE = 0.20; // 20% of every subscription payment

  async function creditPartnerCommission(gateway, transactionRef, amount) {
    if (!currentUser) return;

    const userSnap = await database.ref(`users/${currentUser.uid}/referredBy`).once('value');
    const referrerUid = userSnap.val();
    if (!referrerUid || referrerUid === currentUser.uid) return; // not referred / self-referral guard

    const partnerRef = database.ref(`partners/${referrerUid}`);
    const partnerSnap = await partnerRef.once('value');
    const partner = partnerSnap.val();
    if (!partner || partner.status !== 'approved') return; // only approved partners earn

    const commission = Math.round(amount * PARTNER_COMMISSION_RATE * 100) / 100;

    // Log the transaction
    await partnerRef.child('transactions').push({
      referredUid: currentUser.uid,
      referredName: currentUser.displayName || currentUser.email,
      referredEmail: currentUser.email,
      plan: selectedPlan,
      billing: isYearly ? 'yearly' : 'monthly',
      amount: amount,
      currency: userCurrency,
      commissionRate: PARTNER_COMMISSION_RATE,
      commission: commission,
      gateway: gateway,
      transactionRef: transactionRef,
      date: new Date().toISOString()
    });

    // Atomically increment running totals so concurrent payments never clobber each other
    await partnerRef.child('earnings/total').transaction(v => (v || 0) + commission);
    await partnerRef.child('earnings/pending').transaction(v => (v || 0) + commission);
    await partnerRef.child('earnings/count').transaction(v => (v || 0) + 1);
  }

  // ===== Success Celebration Modal =====
  function showSuccessCelebration(plan, endDate) {
    const planNames = { student: 'Student', pro: 'Pro' };
    const planIcons = { student: '🎓', pro: '💎' };
    const overlay = document.createElement('div');
    overlay.className = 'sub-success-overlay';
    overlay.innerHTML = `
      <div class="sub-success-card">
        <div class="sub-success-check">
          <svg viewBox="0 0 52 52"><circle class="sub-success-check-circle" cx="26" cy="26" r="24" fill="none"/><path class="sub-success-check-mark" fill="none" d="M14 27l7 7 17-17"/></svg>
        </div>
        <div class="sub-success-icon">${planIcons[plan] || '🎉'}</div>
        <h2>Welcome to ${planNames[plan] || plan}!</h2>
        <p>Your subscription is active. Renews/expires on <strong>${endDate.toLocaleDateString()}</strong>.</p>
        <button class="btn-primary sub-success-continue" id="subSuccessContinue">Continue</button>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    const goBack = () => {
      overlay.classList.remove('show');
      setTimeout(() => {
        overlay.remove();
        window.location.href = getPreviousPage();
      }, 250);
    };
    overlay.querySelector('#subSuccessContinue').addEventListener('click', goBack);
    setTimeout(goBack, 4500); // auto-continue if they don't click
  }

  function closePaymentModalHandler() {
    if (paymentModal) {
      paymentModal.classList.remove('show');
      document.body.style.overflow = '';
    }
    selectedPlan = null;
  }

  if (closePaymentModal) closePaymentModal.addEventListener('click', closePaymentModalHandler);
  if (paymentModal) {
    paymentModal.addEventListener('click', (e) => {
      if (e.target === paymentModal) closePaymentModalHandler();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && paymentModal && paymentModal.classList.contains('show')) {
      closePaymentModalHandler();
    }
  });

  // ===== Update Current Plan UI =====
  function updateCurrentPlanUI(plan) {
    document.querySelectorAll('.plan-card').forEach(card => {
      const cardPlan = card.dataset.plan;
      const btn = card.querySelector('.plan-btn');
      if (btn) {
        if (cardPlan === plan) {
          btn.textContent = 'Current Plan';
          btn.classList.add('current-plan');
          btn.disabled = true;
        } else {
          btn.textContent = 'Get Started';
          btn.classList.remove('current-plan');
          btn.disabled = false;
        }
      }
    });
    // Re-attach listeners after UI update
    attachPlanButtonListeners();
    renderRenewalBanner();
  }

  // ===== Renewal Reminder Banner =====
  // Since true zero-touch automatic re-billing needs a backend (to charge
  // the card while the user isn't on the site), the practical alternative
  // here is to warn paid users before they lose access, so nothing is a
  // surprise and they can manually renew in time.
  function renderRenewalBanner() {
    const existing = document.getElementById('renewalBanner');
    if (existing) existing.remove();
    if (!window.rehabPlans) return;

    const plan = window.rehabPlans.getCurrentPlan();
    const days = window.rehabPlans.daysUntilExpiry();
    if (!plan || plan === 'free' || days === null || days > 5) return;

    const banner = document.createElement('div');
    banner.id = 'renewalBanner';
    banner.className = 'renewal-banner';
    banner.innerHTML = days > 0
      ? `<i class="fas fa-clock"></i> Your ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan expires in ${days} day${days === 1 ? '' : 's'}. Renew below to avoid losing access.`
      : `<i class="fas fa-exclamation-circle"></i> Your ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan expires today. Renew below to keep your access.`;
    const header = document.querySelector('.sub-header');
    if (header) header.insertAdjacentElement('afterend', banner);
  }

  // ===== Auth / Plan Listener =====
  // plan.js is the single source of truth for the user's current plan
  // (it also handles expiry/auto-downgrade) — this page just reflects it,
  // instead of re-reading the subscription from Firebase a second time.
  auth.onAuthStateChanged((user) => {
    currentUser = user;
    attachPlanButtonListeners();
  });

  document.addEventListener('planUpdated', (e) => {
    currentPlan = e.detail.plan || 'free';
    updateCurrentPlanUI(currentPlan);
  });

  document.addEventListener('planExpired', (e) => {
    showToast(`Your ${e.detail.previousPlan} plan has expired and you've been moved to the Free plan.`, 'warning', 6000);
  });

  // ===== Theme Toggle =====
  const themeToggle = getEl('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const html = document.documentElement;
      const current = html.getAttribute('data-theme');
      const newTheme = current === 'light' ? 'dark' : 'light';
      html.setAttribute('data-theme', newTheme);
      localStorage.setItem('rehab-theme', newTheme);
    });
  }

  // ===== Initialize =====
  async function initialize() {
    const pricing = await detectLocation();
    updatePlanPrices(pricing);
    
    // Load initial plan
    if (window.rehabPlans) {
      currentPlan = window.rehabPlans.getCurrentPlan() || 'free';
      updateCurrentPlanUI(currentPlan);
    }
  }

  initialize();
});
