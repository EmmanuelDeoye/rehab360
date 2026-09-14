// js/plan.js – Feature gating based on subscription plan

(function () {
  const database = firebase.database();
  const auth = firebase.auth();

  // Minimum plan required for each feature
  const featureMinPlans = {
    assessment: 'free',
    standardized: 'free',
    documentation: 'free',
    rom: 'free',        // free with limited usage (1/mo)
    gait: 'student',    // student gets 5/mo, pro unlimited
    presentation: 'pro',
    assignment: 'student',
    project: 'student',
    study: 'student',
    exam: 'student',
  };

  // Numeric level for comparison
  const planLevel = { free: 0, student: 1, pro: 2 };

  let currentPlan = null; // 'free' | 'student' | 'pro' | null
  let currentSubscription = null; // full record: {plan, starts, ends, renewal, ...}

  // Check whether a feature is allowed
  function isFeatureAllowed(feature) {
    if (!currentPlan) return false;
    const required = featureMinPlans[feature];
    if (!required) return false;
    return (planLevel[currentPlan] || 0) >= (planLevel[required] || 0);
  }

  // Expose current plan
  function getCurrentPlan() {
    return currentPlan;
  }

  // Fetch and cache user's subscription
  async function loadSubscription(user) {
    if (!user) {
      currentPlan = null;
      currentSubscription = null;
      dispatchUpdate();
      return;
    }
    try {
      const ref = database.ref(`users/${user.uid}/subscription`);
      const snap = await ref.once('value');
      const sub = snap.val();

      if (sub && sub.plan && planLevel[sub.plan] !== undefined) {
        // A paid plan that has passed its "ends" date is no longer valid —
        // this is the check that was missing, which let expired Pro/Student
        // subscriptions keep working forever. Free plans use a far-future
        // "ends" date on purpose, so they never trip this.
        const isExpired = sub.plan !== 'free' && sub.ends && new Date(sub.ends).getTime() < Date.now();

        if (isExpired) {
          const downgraded = {
            plan: 'free',
            starts: new Date().toISOString(),
            ends: new Date(2099, 11, 31).toISOString(),
            renewal: 'manual',
            downgradedFrom: sub.plan,
            downgradedAt: new Date().toISOString()
          };
          await ref.set(downgraded);
          currentPlan = 'free';
          currentSubscription = downgraded;
          // Let pages show a "your plan expired" notice if they want to,
          // without forcing every page that loads plan.js to handle it.
          document.dispatchEvent(new CustomEvent('planExpired', { detail: { previousPlan: sub.plan } }));
        } else {
          currentPlan = sub.plan;
          currentSubscription = sub;
        }
      } else {
        // No subscription → treat as free & persist it
        const fresh = {
          plan: 'free',
          starts: new Date().toISOString(),
          ends: new Date(2099, 11, 31).toISOString(),
          renewal: 'manual',
        };
        await ref.set(fresh);
        currentPlan = 'free';
        currentSubscription = fresh;
      }
    } catch (error) {
      console.error('[plan.js] Subscription fetch failed:', error);
      currentPlan = 'free'; // fallback
      currentSubscription = null;
    }
    dispatchUpdate();
  }

  // Days left until the current paid plan expires (null if free or unknown)
  function daysUntilExpiry() {
    if (!currentSubscription || currentPlan === 'free' || !currentSubscription.ends) return null;
    const ms = new Date(currentSubscription.ends).getTime() - Date.now();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  }

  // Fire custom event so pages can react
  function dispatchUpdate() {
    document.dispatchEvent(
      new CustomEvent('planUpdated', { detail: { plan: currentPlan } })
    );
  }

  // Listen to auth changes and load subscription
  auth.onAuthStateChanged((user) => loadSubscription(user));

  // Expose public API
  window.rehabPlans = {
    isFeatureAllowed,
    getCurrentPlan,
    getSubscription: () => currentSubscription,
    daysUntilExpiry,
    planLevel,
    featureMinPlans,

    // Default upgrade prompt (can be overridden by page)
    showUpgradePrompt(feature) {
      const required = featureMinPlans[feature] || 'pro';
      const names = { free: 'Free', student: 'Student', pro: 'Pro' };
      const msg = `This feature requires the ${names[required]} plan. Please upgrade to continue.`;
      // Use a toast if available, otherwise alert
      if (typeof showToast === 'function') {
        showToast(msg, 'error', 5000);
      } else {
        alert(msg);
      }
    },
  };
})();