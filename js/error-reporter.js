// js/error-reporter.js
// Shared handler for AI API failures across all tools.
//
// Usage (in any tool's catch block, after an AI fetch call fails):
//   window.reportApiError({ status: response.status, bodyText: rawResponseText, tool: 'rom', context: 'analyze image' });
//
// Behavior:
// - If the failure looks like an insufficient-funds/quota error, it is logged to
//   Firebase `reviews` automatically. No user interaction.
// - For any other failure, a lightweight modal asks "Let us know about this issue?"
//   with no required comment. A "Don't show this again" checkbox persists via localStorage.

(function () {
  const DISMISS_KEY = 'rehablix_hide_api_issue_modal';

  function isInsufficientFundsError(status, bodyText) {
    if (status === 402) return true; // Payment Required
    if (status === 429) {
      // 429 is also used for plain rate-limiting, so only treat it as a
      // funding issue if the message itself says so.
      const text = (bodyText || '').toLowerCase();
      return text.includes('quota') || text.includes('insufficient') || text.includes('billing');
    }
    const text = (bodyText || '').toLowerCase();
    return (
      text.includes('insufficient_quota') ||
      text.includes('insufficient quota') ||
      text.includes('insufficient balance') ||   // DeepSeek wording
      text.includes('insufficient funds') ||
      text.includes('exceeded your current quota') ||
      text.includes('billing_hard_limit') ||
      text.includes('you exceeded your current')
    );
  }

  async function logReview(payload) {
    try {
      if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) {
        console.warn('Firebase not available; could not log review.');
        return;
      }
      const db = firebase.database();
      const entry = {
        type: payload.type,
        tool: payload.tool || 'unknown',
        context: payload.context || '',
        status: payload.status ?? null,
        detail: (payload.bodyText || '').slice(0, 500),
        comment: payload.comment || '',
        page: window.location.pathname,
        userAgent: navigator.userAgent,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      };
      const user = firebase.auth && firebase.auth().currentUser;
      if (user) {
        entry.userId = user.uid;
        entry.userEmail = user.email || null;
      }
      await db.ref('reviews').push(entry);
    } catch (e) {
      console.error('Failed to log review:', e);
    }
  }

  function ensureStyles() {
    if (document.getElementById('apiIssueModalStyles')) return;
    const link = document.createElement('link');
    link.id = 'apiIssueModalStyles';
    link.rel = 'stylesheet';
    link.href = 'css/error-reporter.css';
    document.head.appendChild(link);
  }

  function buildModal() {
    let overlay = document.getElementById('apiIssueModal');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'apiIssueModal';
    overlay.className = 'api-issue-overlay';
    overlay.innerHTML = `
      <div class="api-issue-modal" role="dialog" aria-modal="true" aria-labelledby="apiIssueModalTitle">
        <p id="apiIssueModalTitle" class="api-issue-text">Let us know about this issue?</p>
        <label class="api-issue-checkbox">
          <input type="checkbox" id="apiIssueDontShow">
          <span>Don't show this again</span>
        </label>
        <div class="api-issue-actions">
          <button type="button" id="apiIssueDismiss" class="api-issue-btn api-issue-btn-secondary">Not now</button>
          <button type="button" id="apiIssueSubmit" class="api-issue-btn api-issue-btn-primary">Send</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function showIssueModal(payload) {
    if (localStorage.getItem(DISMISS_KEY) === 'true') return;

    ensureStyles();
    const overlay = buildModal();
    overlay.classList.add('visible');

    const dontShow = overlay.querySelector('#apiIssueDontShow');
    const dismissBtn = overlay.querySelector('#apiIssueDismiss');
    const submitBtn = overlay.querySelector('#apiIssueSubmit');

    function close() {
      if (dontShow.checked) {
        localStorage.setItem(DISMISS_KEY, 'true');
      }
      overlay.classList.remove('visible');
      dismissBtn.onclick = null;
      submitBtn.onclick = null;
    }

    dismissBtn.onclick = close;
    submitBtn.onclick = async () => {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';
      await logReview(payload);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send';
      close();
    };
  }

  /**
   * Main entry point. Call this from any AI-call catch block.
   * @param {Object} opts
   * @param {number} [opts.status] - HTTP status code from the failed response, if available
   * @param {string} [opts.bodyText] - Raw response body / error message text
   * @param {string} [opts.tool] - Which tool/page this happened in, e.g. 'rom', 'gait', 'ask'
   * @param {string} [opts.context] - Short description of what was being attempted
   */
  window.reportApiError = function (opts) {
    const { status, bodyText, tool, context } = opts || {};
    const fundingIssue = isInsufficientFundsError(status, bodyText);

    const payload = {
      type: fundingIssue ? 'insufficient_funds' : 'api_error',
      status,
      bodyText,
      tool,
      context
    };

    if (fundingIssue) {
      // Silent, automatic — no user interaction needed.
      logReview(payload);
    } else {
      showIssueModal(payload);
    }
  };
})();
