// js/standardized.js - Updated with preview card and PDF viewer
//
// Wrapped in an IIFE (this round's refactor) so its top-level state
// variables (githubToken, currentUser, etc.) don't collide with other
// tool scripts if they're ever loaded on the same page together — e.g.
// index.html, which now loads this file directly so Lixa can call its
// generation logic in-process instead of through an iframe embed. This
// wrapping changes nothing about how the file behaves on its own page.
(function () {
'use strict';

// Global variables
let githubToken = '';
let apiEndpoint = '';
let currentUser = null;
let generatedContent = '';
let generatedToolName = '';
let generatedHtmlContent = '';
let historyItems = [];
let currentPlan = 'free';

// Cost control: free-plan users are capped at a monthly generation limit,
// mirroring the pattern used on the presentation and format tools.
const FREE_MONTHLY_LIMIT = 8;
const FREE_LIMIT_DAYS = 30;
const PLAN_STORAGE_KEY = 'rehab_standardized_generation_data';
let generationCount = 0;
let generationResetDate = null;

// Phase 11: when this page is running inside Lixa's inline result card
// (?embed=1), tell the parent what actually happened — the previous
// "result ready" signal was just the iframe's own `load` event, which
// fires once this PAGE loads, not once generation (an async AI call
// that happens after load) actually finishes or fails. Silent failures
// here (not logged in, monthly limit reached) were easy to miss inside
// a small embedded frame; this surfaces them in the Lixa conversation
// itself instead. No-op outside the embedded/iframe context.
function notifyLixaInlineStatus(status, extra) {
  if (window.parent === window) return; // not embedded, nothing to notify
  try {
    window.parent.postMessage(Object.assign({
      source: 'rehablix-inline-tool',
      page: 'standardized.html',
      status
    }, extra || {}), window.location.origin);
  } catch (e) { /* best-effort only */ }
}

function loadGenerationData() {
  try {
    const data = JSON.parse(localStorage.getItem(PLAN_STORAGE_KEY) || '{}');
    generationCount = data.count || 0;
    generationResetDate = data.resetDate ? new Date(data.resetDate) : null;

    const now = new Date();
    if (!generationResetDate || (now - generationResetDate) >= (FREE_LIMIT_DAYS * 24 * 60 * 60 * 1000)) {
      generationCount = 0;
      generationResetDate = now;
      saveGenerationData();
    }
  } catch (e) {
    generationCount = 0;
    generationResetDate = new Date();
    saveGenerationData();
  }
}

function saveGenerationData() {
  localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify({
    count: generationCount,
    resetDate: generationResetDate ? generationResetDate.toISOString() : new Date().toISOString()
  }));
}

function incrementGenerationCount() {
  generationCount++;
  saveGenerationData();
}

function canGenerateMore() {
  if (currentPlan === 'student' || currentPlan === 'pro') return true;
  const now = new Date();
  if (!generationResetDate || (now - generationResetDate) >= (FREE_LIMIT_DAYS * 24 * 60 * 60 * 1000)) {
    generationCount = 0;
    generationResetDate = now;
    saveGenerationData();
    return true;
  }
  return generationCount < FREE_MONTHLY_LIMIT;
}

function getDaysUntilReset() {
  if (!generationResetDate) return 0;
  const diffTime = (FREE_LIMIT_DAYS * 24 * 60 * 60 * 1000) - (new Date() - generationResetDate);
  return Math.max(0, Math.ceil(diffTime / (24 * 60 * 60 * 1000)));
}

document.addEventListener('planUpdated', (e) => {
  currentPlan = e.detail?.plan || 'free';
});

document.addEventListener('DOMContentLoaded', async function() {
  console.log('Standardized.js loaded');

  // Expose the reusable generator API immediately (this round's
  // refactor) — deliberately the very first statement in this
  // callback. Function DECLARATIONS below (generateForLixa,
  // performGeneration, openInPDFViewer, etc.) are hoisted within this
  // async function's scope, so they're already valid references here
  // even though their bodies appear later in the file. Placing this
  // first matters because when this script runs on index.html (Lixa),
  // most of what follows assumes standardized.html's own DOM elements
  // exist and will throw once it hits the first one that's missing —
  // this line has already run and completed by then, so that later
  // crash (harmless in the Lixa context; page-DOM code just isn't used
  // there) can never prevent Lixa from getting a working reference.
  window.RehablixGenerators = window.RehablixGenerators || {};
  window.RehablixGenerators.standardized = {
    generate: generateForLixa,
    exportToPdf: openInPDFViewer
  };

  // DOM elements
  const form = document.getElementById('toolForm');
  const generateBtn = document.getElementById('generateBtn');
  const clearBtn = document.getElementById('clearBtn');
  const toolNameInput = document.getElementById('toolName');
  const includeGuidesCheck = document.getElementById('includeGuides');
  const resultCard = document.getElementById('resultCard');
  const resultContent = document.getElementById('resultContent');
  const downloadPdfBtn = document.getElementById('downloadPdfBtn');
  const toast = document.getElementById('toast');
  
  // History elements
  const historySection = document.getElementById('historySection');
  const historyList = document.getElementById('historyList');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const totalCountSpan = document.getElementById('totalCount');
  const latestDateSpan = document.getElementById('latestDate');

  // Check Firebase
  if (typeof firebase === 'undefined') {
    console.error('Firebase SDK not loaded!');
    showToast('Firebase not initialized. Please check your connection.', true);
    return;
  }

  const database = firebase.database();

  loadGenerationData();
  if (window.rehabPlans) {
    currentPlan = window.rehabPlans.getCurrentPlan() || 'free';
  }

  // Fetch tokens
  const tokens = await fetchTokens();
  if (tokens) {
    githubToken = tokens.token;
    apiEndpoint = tokens.endpoint;
    console.log('API credentials loaded');
  } else {
    showToast('Failed to load API credentials. Please try again.', true);
  }

  // Auth state
  firebase.auth().onAuthStateChanged((user) => {
    currentUser = user;
    if (user) {
      console.log('User logged in:', user.email);
      loadUserHistory();
    } else {
      console.log('User logged out');
      historyItems = [];
      updateHistoryUI();
    }
  });

  // Toast helper
  function showToast(message, isError = false) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    toast.style.background = isError ? '#dc2626' : 'var(--accent)';
    setTimeout(() => toast.classList.add('hidden'), 3000);
  }

  async function fetchTokens() {
    try {
      const snapshot = await database.ref('tokens/open_ai').once('value');
      const data = snapshot.val();
      if (data && data.api_key) {
        return {
          token: data.api_key,
          endpoint: 'https://api.openai.com/v1'
        };
      }
      return null;
    } catch (error) {
      console.error("Credential Error:", error);
      return null;
    }
  }

  // ===== NEW FUNCTION: Create and open PDF in viewer =====
  function openInPDFViewer(htmlContent, toolName) {
    // Create a full HTML document with print styling
    const fullHtml = `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${toolName} - rehab.ai</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
          padding: 40px 20px;
          background: white;
          color: #1f2933;
          line-height: 1.6;
        }
        
        .container {
          max-width: 1200px;
          margin: 0 auto;
          background: white;
        }
        
        /* Print styles */
        @media print {
          body {
            padding: 0;
          }
          
          .no-print {
            display: none !important;
          }
          
          .print-header {
            margin-bottom: 20px;
            border-bottom: 2px solid #009688;
            padding-bottom: 10px;
          }
        }
        
        /* Table styles */
        table {
          border-collapse: collapse;
          width: 100%;
          margin: 20px 0;
          background: white;
        }
        
        th {
          background: #009688;
          color: white;
          padding: 12px;
          text-align: left;
          font-weight: 600;
        }
        
        td {
          border: 1px solid #ddd;
          padding: 10px;
          vertical-align: top;
        }
        
        tr:nth-child(even) {
          background-color: #f9f9f9;
        }
        
        /* Content styles */
        h1 {
          color: #009688;
          margin-bottom: 20px;
          font-size: 28px;
        }
        
        h2 {
          margin-top: 30px;
          margin-bottom: 15px;
          color: #2c3e50;
          font-size: 24px;
        }
        
        h3 {
          margin-top: 20px;
          margin-bottom: 10px;
          color: #34495e;
          font-size: 20px;
        }
        
        p {
          margin-bottom: 15px;
        }
        
        ul, ol {
          margin: 15px 0;
          padding-left: 30px;
        }
        
        li {
          margin: 5px 0;
        }
        
        /* Print button */
        .print-btn {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: #009688;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 50px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          transition: all 0.3s ease;
          z-index: 1000;
        }
        
        .print-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0,0,0,0.2);
        }
        
        .download-btn {
          position: fixed;
          bottom: 20px;
          right: 160px;
          background: #2c3e50;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 50px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          transition: all 0.3s ease;
          z-index: 1000;
        }
        
        .download-btn:hover {
          transform: translateY(-2px);
          background: #1a2632;
        }
        
        @media (max-width: 768px) {
          .print-btn, .download-btn {
            padding: 8px 16px;
            font-size: 14px;
          }
          
          .download-btn {
            right: 120px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="print-header no-print">
          <h1>${toolName}</h1>
          <p>Generated by rehab.ai • ${new Date().toLocaleString()}</p>
        </div>
        ${htmlContent}
      </div>
      
      <button class="print-btn no-print" onclick="window.print()">
        🖨️ Print / Save as PDF
      </button>
      <button class="download-btn no-print" onclick="downloadAsPDF()">
        ⬇️ Download PDF
      </button>
      
      <script>
        function downloadAsPDF() {
          // Trigger print dialog which allows saving as PDF
          window.print();
        }
        
        // Auto-trigger print dialog (optional - uncomment if you want auto open)
        // setTimeout(() => window.print(), 500);
      </script>
    </body>
    </html>`;
    
    // Create a blob and open in new window
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const newWindow = window.open(url, '_blank');
    
    // Clean up after a delay
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
    
    return newWindow;
  }

  // ===== NEW FUNCTION: Show preview card =====
  function showPreviewCard(toolName, includeGuides, content, options = {}) {
    const { fromHistory = false, historyId = null } = options;

    // Create preview modal/card
    const previewModal = document.createElement('div');
    previewModal.className = 'preview-modal';
    previewModal.innerHTML = `
      <div class="preview-overlay"></div>
      <div class="preview-card">
        <div class="preview-card-header">
          <div class="preview-icon">📄</div>
          <h3>${escapeHtml(toolName)}</h3>
          <button class="preview-close" onclick="this.closest('.preview-modal').remove()">&times;</button>
        </div>
        <div class="preview-card-body">
          <div class="preview-info">
            <span class="preview-badge">${fromHistory ? '📁 From your history' : '✅ Ready to view'}</span>
            <span class="preview-date">${new Date().toLocaleString()}</span>
          </div>
          <p class="preview-description">
            ${fromHistory
              ? `This is the saved copy of ${escapeHtml(toolName)} from your history — no AI tokens were used to show it.`
              : `Your ${escapeHtml(toolName)} assessment has been generated successfully.`}
            Click below to open it in your device's PDF viewer.
          </p>
          <div class="preview-actions">
            <button class="preview-btn primary" id="openPdfBtn">
              📖 Open in PDF Viewer
            </button>
            ${fromHistory ? `
            <button class="preview-btn secondary" id="regenerateBtn">
              🔄 Generate Fresh Copy
            </button>` : ''}
          </div>
          <div class="preview-note">
            <small>💡 Tip: Use your browser's print dialog to save as PDF</small>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(previewModal);
    
    // Add styles for preview modal
    const style = document.createElement('style');
    style.textContent = `
      .preview-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.3s ease;
      }
      
      .preview-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
      }
      
      .preview-card {
        position: relative;
        background: var(--surface, white);
        border-radius: 24px;
        max-width: 500px;
        width: 90%;
        margin: 20px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        animation: slideUp 0.3s ease;
        overflow: hidden;
      }
      
      .preview-card-header {
        background: linear-gradient(135deg, var(--accent, #009688), #00695c);
        padding: 20px 24px;
        display: flex;
        align-items: center;
        gap: 12px;
        color: white;
      }
      
      .preview-icon {
        font-size: 32px;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
      }
      
      .preview-card-header h3 {
        margin: 0;
        flex: 1;
        font-size: 1.25rem;
        font-weight: 600;
      }
      
      .preview-close {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        font-size: 28px;
        cursor: pointer;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }
      
      .preview-close:hover {
        background: rgba(255,255,255,0.3);
        transform: scale(1.1);
      }
      
      .preview-card-body {
        padding: 24px;
      }
      
      .preview-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        flex-wrap: wrap;
        gap: 12px;
      }
      
      .preview-badge {
        background: var(--accent-soft, #e0f2f1);
        color: var(--accent, #009688);
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 0.85rem;
        font-weight: 600;
      }
      
      .preview-date {
        font-size: 0.8rem;
        color: var(--text-secondary, #666);
      }
      
      .preview-description {
        margin-bottom: 24px;
        line-height: 1.6;
        color: var(--text-primary, #333);
      }
      
      .preview-actions {
        display: flex;
        gap: 12px;
        margin-bottom: 16px;
      }
      
      .preview-btn {
        flex: 1;
        padding: 12px 20px;
        border-radius: 40px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        border: none;
      }
      
      .preview-btn.primary {
        background: var(--accent, #009688);
        color: white;
      }
      
      .preview-btn.primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(0, 150, 136, 0.3);
      }
      
      .preview-btn.secondary {
        background: var(--surface, #f0f0f0);
        color: var(--text-primary, #333);
        border: 1px solid var(--border-light, #ddd);
      }
      
      .preview-btn.secondary:hover {
        background: var(--border-light, #e0e0e0);
      }
      
      .preview-note {
        text-align: center;
        color: var(--text-secondary, #666);
        font-size: 0.8rem;
      }
      
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateY(30px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      [data-theme="dark"] .preview-card {
        background: #1e2a32;
      }
      
      [data-theme="dark"] .preview-btn.secondary {
        background: #2e3b45;
        color: #eef2f6;
        border-color: #3e4b55;
      }
    `;
    
    document.head.appendChild(style);
    
    // Handle open PDF button
    const openPdfBtn = previewModal.querySelector('#openPdfBtn');
    openPdfBtn.addEventListener('click', () => {
      openInPDFViewer(content, toolName);
      previewModal.remove();
    });

    // Handle "Generate Fresh Copy" (only present when shown from history) —
    // warns the user this replaces/deletes the saved entry before
    // spending AI tokens on a new one.
    const regenerateBtn = previewModal.querySelector('#regenerateBtn');
    if (regenerateBtn) {
      regenerateBtn.addEventListener('click', () => {
        const confirmed = confirm(
          `Generating a new version of "${toolName}" will replace and delete the existing saved copy in your history. Continue?`
        );
        if (!confirmed) return;

        if (!canGenerateMore()) {
          const daysLeft = getDaysUntilReset();
          showToast(`⚠️ You've reached your ${FREE_MONTHLY_LIMIT} generation limit for this month. Resets in ${daysLeft} days.`, true);
          return;
        }

        previewModal.remove();
        performGeneration(toolName, includeGuides, historyId);
      });
    }
    
    // Handle close button
    const closePreviewBtn = previewModal.querySelector('#closePreviewBtn');
    if (closePreviewBtn) {
      closePreviewBtn.addEventListener('click', () => previewModal.remove());
    }
    
    // Close on overlay click
    const overlay = previewModal.querySelector('.preview-overlay');
    overlay.addEventListener('click', () => previewModal.remove());
  }
  
  // Helper to escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ===== FIREBASE HISTORY FUNCTIONS =====
  // Migrated from localStorage: history now lives in
  // history/{uid}/standardizedTools, so it syncs across devices, survives
  // cleared browser data, and (like every other tool) is visible to admin
  // monitoring instead of being invisible/device-local.

  async function loadUserHistory() {
    if (!currentUser) {
      historyItems = [];
      updateHistoryUI();
      return;
    }
    try {
      const snapshot = await database.ref(`history/${currentUser.uid}/standardizedTools`).once('value');
      const data = snapshot.val();
      historyItems = data
        ? Object.entries(data).map(([id, item]) => ({ id, ...item }))
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        : [];
      updateHistoryUI();
    } catch (error) {
      console.error('Error loading history:', error);
      showToast('Failed to load history', true);
    }
  }

  // Case/whitespace-insensitive match — used both to auto-retrieve a
  // previously generated tool (saving AI tokens) and to warn before
  // replacing it.
  function findExistingHistoryItem(toolName) {
    const normalized = toolName.trim().toLowerCase();
    return historyItems.find(item => (item.toolName || '').trim().toLowerCase() === normalized) || null;
  }

  async function addToHistory(toolName, includeGuides, content, replaceId = null) {
    if (!currentUser) return null;

    const historyItem = {
      toolName,
      includeGuides,
      generatedContent: content,
      preview: content.replace(/<[^>]*>/g, '').substring(0, 150),
      timestamp: new Date().toISOString(),
      userId: currentUser.uid
    };

    try {
      if (replaceId) {
        // Delete the old entry and push a fresh one, per the "replaced"
        // behavior the user is warned about before regenerating.
        await database.ref(`history/${currentUser.uid}/standardizedTools/${replaceId}`).remove();
        historyItems = historyItems.filter(item => item.id !== replaceId);
      }

      const newRef = database.ref(`history/${currentUser.uid}/standardizedTools`).push();
      await newRef.set(historyItem);
      const newItem = { id: newRef.key, ...historyItem };
      historyItems.unshift(newItem);
      updateHistoryUI();
      return newItem.id;
    } catch (error) {
      console.error('Error saving to history:', error);
      showToast('Generated successfully, but saving to history failed.', true);
      return null;
    }
  }

  async function removeFromHistory(id) {
    if (!currentUser) return;
    try {
      await database.ref(`history/${currentUser.uid}/standardizedTools/${id}`).remove();
      historyItems = historyItems.filter(item => item.id !== id);
      updateHistoryUI();
    } catch (error) {
      console.error('Error removing history item:', error);
      showToast('Failed to delete item', true);
    }
  }

  async function clearAllHistory() {
    if (historyItems.length === 0) {
      showToast('No history to clear', true);
      return;
    }
    if (!confirm('Are you sure you want to clear all history?')) return;

    try {
      await database.ref(`history/${currentUser.uid}/standardizedTools`).remove();
      historyItems = [];
      updateHistoryUI();
      showToast('All history cleared');
    } catch (error) {
      console.error('Error clearing history:', error);
      showToast('Failed to clear history', true);
    }
  }

  function retrieveFromHistory(id) {
    const item = historyItems.find(item => item.id === id);
    if (item) {
      // Show preview card instead of direct display
      showPreviewCard(item.toolName, item.includeGuides, item.generatedContent, { fromHistory: true, historyId: item.id });

      // Fill form with the tool name (optional)
      toolNameInput.value = item.toolName;
      includeGuidesCheck.checked = item.includeGuides;
      
      showToast(`Opened: ${item.toolName}`);
    }
  }

  function updateHistoryUI() {
    if (!historyList) return;
    
    // Update stats
    if (totalCountSpan) {
      totalCountSpan.textContent = historyItems.length;
    }
    
    if (latestDateSpan && historyItems.length > 0) {
      const latest = new Date(historyItems[0].timestamp);
      latestDateSpan.textContent = latest.toLocaleDateString();
    } else if (latestDateSpan) {
      latestDateSpan.textContent = '-';
    }
    
    if (historyItems.length === 0) {
      historyList.innerHTML = currentUser ? `
        <div class="empty-history">
          <p>No history yet</p>
          <small>Generate your first standardized tool to see it here</small>
        </div>
      ` : `
        <div class="empty-history">
          <p>Log in to see your history</p>
          <small>Your generated tools sync across all your devices once you're logged in</small>
        </div>
      `;
      return;
    }
    
    // Render history items
    historyList.innerHTML = historyItems.map(item => {
      const date = new Date(item.timestamp);
      const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
      
      return `
        <div class="history-item" data-id="${item.id}">
          <div class="history-item-header">
            <span class="history-item-title">${escapeHtml(item.toolName || 'Unknown Tool')}</span>
            <span class="history-item-date">${formattedDate}</span>
          </div>
          <div class="history-item-actions">
            <button class="history-item-btn retrieve" onclick="window.retrieveHistoryItem('${item.id}')">
              <span>📖</span> View PDF
            </button>
            <button class="history-item-btn delete" onclick="window.deleteHistoryItem('${item.id}')">
              <span>🗑️</span> Delete
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Make functions globally available for history buttons
  window.retrieveHistoryItem = (id) => {
    retrieveFromHistory(id);
  };

  window.deleteHistoryItem = async (id) => {
    if (confirm('Delete this item from history?')) {
      await removeFromHistory(id);
      showToast('Item deleted');
    }
  };

  // Build prompt for the AI
  function buildPrompt(toolName, includeGuides) {
    const guides = includeGuides 
      ? "Include detailed administration instructions and interpretation guidelines in separate sections."
      : "Provide only the assessment items and scoring criteria.";

    return `You are an expert in standardized clinical assessments.

Generate the complete content for the **${toolName}** assessment tool as a **self-contained HTML document**.

Requirements:
- Use proper HTML structure with <h2>, <h3>, <p>, <ul>, <ol>.
- Present any tables as proper HTML <table> with borders and alternating row colors for readability.
- Include the full name of the tool and its purpose at the top.
- List all items/questions exactly as they appear in the original tool.
- Include scoring instructions and interpretation (if available).
- If the tool has subscales, present them clearly.
- Use a clean, professional style suitable for printing.
- Do NOT include any extra commentary outside the tool content.
- Return ONLY the HTML (no markdown, no explanations).`;
  }

  // Handle form submission - checks history first (token savings), then
  // requires login/quota before hitting the AI.
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const toolName = toolNameInput.value.trim();
    if (!toolName) {
      showToast('Please enter a tool name', true);
      return;
    }

    if (!currentUser) {
      showToast('Please log in to generate a standardized tool.', true);
      document.getElementById('loginBtn')?.click();
      notifyLixaInlineStatus('auth-required', { toolName });
      return;
    }

    // Token-saving check: if this exact tool is already in the user's
    // history, show it straight from history instead of calling the AI
    // again. The user can still force a fresh generation from the preview
    // card, with a clear warning that it replaces the saved copy.
    const existing = findExistingHistoryItem(toolName);
    if (existing) {
      showToast(`📁 "${existing.toolName}" is already in your history — showing the saved version.`);
      showPreviewCard(existing.toolName, existing.includeGuides, existing.generatedContent, {
        fromHistory: true,
        historyId: existing.id
      });
      notifyLixaInlineStatus('success', { toolName: existing.toolName, fromHistory: true });
      return;
    }

    if (!canGenerateMore()) {
      const daysLeft = getDaysUntilReset();
      showToast(`⚠️ You've reached your ${FREE_MONTHLY_LIMIT} generation limit for this month. Upgrade to Student or Pro for unlimited access. Resets in ${daysLeft} days.`, true);
      notifyLixaInlineStatus('limit-reached', { toolName, daysLeft });
      return;
    }

    await performGeneration(toolName, includeGuidesCheck.checked, null);
  });

  // Does the actual AI call + save. Separated from the submit handler so
  // the "generate fresh copy, replacing the saved one" flow (triggered
  // from inside the preview card) can call it directly without
  // re-running the history-lookup/quota checks tied to the form.
  //
  // `opts.silent` (this round's refactor): when true, skips every
  // page-specific UI side effect (button/spinner state, the preview
  // modal, toasts) and just returns the result instead — this is what
  // makes the function genuinely reusable by Lixa, which has no
  // `#generateBtn`/`#resultCard`/preview modal of its own. The actual
  // generation (buildPrompt/callAIWithValidation) and the history
  // save are identical either way — nothing about the generator itself
  // was rebuilt, only whether this function also touches this page's UI.
  async function performGeneration(toolName, includeGuides, replaceId, opts = {}) {
    const silent = !!opts.silent;
    if (!silent) {
      generateBtn.disabled = true;
      var btnText = generateBtn.querySelector('.btn-text');
      var spinner = generateBtn.querySelector('.loading-spinner-small');
      btnText.textContent = 'Generating...';
      spinner.style.display = 'inline-block';
    }

    try {
      if (!githubToken || !apiEndpoint) {
        throw new Error('API credentials not loaded');
      }

      const prompt = buildPrompt(toolName, includeGuides);
      const content = await callAIWithValidation(prompt, toolName, 1);

      // Store generated content
      generatedContent = content;
      generatedToolName = toolName;
      generatedHtmlContent = content;

      if (!silent) {
        // Hide the result card (we're using preview card instead)
        resultCard.style.display = 'none';
        // Show preview card instead of direct display
        showPreviewCard(toolName, includeGuides, content);
      }

      // Save to Firebase history (replacing the old entry if this was a
      // forced regeneration of an already-saved tool)
      await addToHistory(toolName, includeGuides, content, replaceId);
      incrementGenerationCount();

      if (!silent) showToast(`${toolName} generated successfully!`);
      notifyLixaInlineStatus('success', { toolName });
      return { status: 'success', toolName, content };
    } catch (error) {
      console.error('Generation error:', error);
      if (!silent) showToast(error.message || 'Failed to generate. Please try again.', true);
      notifyLixaInlineStatus('error', { toolName, message: error.message });
      return { status: 'error', toolName, message: error.message };
    } finally {
      if (!silent) {
        generateBtn.disabled = false;
        generateBtn.querySelector('.btn-text').textContent = 'Generate Tool';
        generateBtn.querySelector('.loading-spinner-small').style.display = 'none';
      }
    }
  }

  // Reusable entry point for Lixa (this round's refactor): the SAME
  // auth/history/quota checks the form's submit handler already does,
  // then delegates the actual work to the exact same performGeneration()
  // above in silent mode — no generation logic is duplicated here, only
  // the routing checks, so both paths stay in sync by construction.
  async function generateForLixa(toolName, includeGuides) {
    toolName = (toolName || '').trim();
    if (!toolName) return { status: 'error', message: 'No tool name provided.' };

    // Safety net for a real race: this file's own token fetch (on
    // index.html) and Lixa's own AI reply are two independent async
    // operations. In practice Lixa's reply (a full chat-completion call)
    // takes far longer than this single realtime-DB read, so tokens are
    // almost always ready first — but if they're not, fetch once more
    // rather than fail a otherwise-valid request on a timing accident.
    if (!githubToken || !apiEndpoint) {
      const tokens = await fetchTokens();
      if (tokens) { githubToken = tokens.token; apiEndpoint = tokens.endpoint; }
    }

    if (!currentUser) {
      notifyLixaInlineStatus('auth-required', { toolName });
      return { status: 'auth-required', toolName };
    }

    const existing = findExistingHistoryItem(toolName);
    if (existing) {
      notifyLixaInlineStatus('success', { toolName: existing.toolName, fromHistory: true });
      return { status: 'success', toolName: existing.toolName, content: existing.generatedContent, fromHistory: true };
    }

    if (!canGenerateMore()) {
      const daysLeft = getDaysUntilReset();
      notifyLixaInlineStatus('limit-reached', { toolName, daysLeft });
      return { status: 'limit-reached', toolName, daysLeft };
    }

    return performGeneration(toolName, !!includeGuides, null, { silent: true });
  }

  // Validated, auto-retrying AI call — same fix applied to the presentation
  // and format tools. A 200 OK with empty/near-empty content (content
  // filter tripping, or truncation before real content was written) used
  // to sail through unnoticed. This retries once with more token headroom
  // and reports genuine failures via error-reporter.js.
  async function callAIWithValidation(prompt, toolName, attempt) {
    const response = await fetch(`${apiEndpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${githubToken}`
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: 'You output clean HTML with proper tables. No extra text.' },
          { role: 'user', content: prompt }
        ],
        model: 'gpt-4.1',
        temperature: 0.3,
        max_tokens: attempt === 1 ? 4000 : 5500
      })
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      if (window.reportApiError) {
        window.reportApiError({
          status: response.status,
          bodyText: errBody,
          tool: 'standardized',
          context: `generate "${toolName}" (attempt ${attempt})`
        });
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const choice = data.choices && data.choices[0];
    const finishReason = choice ? choice.finish_reason : null;
    const rawContent = (choice && choice.message && typeof choice.message.content === 'string')
      ? choice.message.content
      : '';
    const content = rawContent.replace(/```html|```/g, '').trim();

    if (finishReason === 'content_filter') {
      if (window.reportApiError) {
        window.reportApiError({ status: 200, bodyText: `content_filter (attempt ${attempt})`, tool: 'standardized', context: `generate "${toolName}"` });
      }
      throw new Error('The AI declined to generate this content. Try again, or check the tool name for sensitive wording.');
    }

    if (content.length < 20) {
      if (attempt < 2) {
        console.warn(`[standardized] Empty/short response (finish_reason=${finishReason}). Retrying…`);
        return callAIWithValidation(prompt, toolName, attempt + 1);
      }
      if (window.reportApiError) {
        window.reportApiError({ status: 200, bodyText: `Empty response after ${attempt} attempts, finish_reason=${finishReason}`, tool: 'standardized', context: `generate "${toolName}"` });
      }
      throw new Error('The AI returned an empty response after two attempts. Please try again.');
    }

    if (finishReason === 'length') {
      showToast('⚠️ Output may be cut short for a very long/detailed tool.', false);
    }

    return content;
  }

  // Build prompt for the AI
  function buildPrompt(toolName, includeGuides) {
    const guides = includeGuides 
      ? "Include detailed administration instructions and interpretation guidelines in separate sections."
      : "Provide only the assessment items and scoring criteria.";

    return `You are an expert in standardized clinical assessments.

Generate the complete content for the **${toolName}** assessment tool as a **self-contained HTML document**.

Requirements:
- Use proper HTML structure with <h2>, <h3>, <p>, <ul>, <ol>.
- Present any tables as proper HTML <table> with borders and alternating row colors for readability.
- Include the full name of the tool and its purpose at the top.
- List all items/questions exactly as they appear in the original tool.
- Include scoring instructions and interpretation (if available).
- If the tool has subscales, present them clearly.
- Use a clean, professional style suitable for printing.
- Do NOT include any extra commentary outside the tool content.
- Return ONLY the HTML (no markdown, no explanations).`;
  }

  clearBtn.addEventListener('click', () => {
    toolNameInput.value = '';
    includeGuidesCheck.checked = false;
    resultCard.style.display = 'none';
    resultContent.innerHTML = '';
    generatedContent = '';
    generatedToolName = '';
    generatedHtmlContent = '';
    
    showToast('Form cleared');
  });

  // Clear history button
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', clearAllHistory);
  }

  // Optional: Keep download button for backward compatibility
  if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener('click', () => {
      if (!generatedContent) {
        showToast('No content to download', true);
        return;
      }
      openInPDFViewer(generatedContent, generatedToolName || 'Assessment');
    });
  }

  // Keyboard shortcut (Ctrl+Enter)
  form.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      form.dispatchEvent(new Event('submit'));
    }
  });

  // History is loaded from Firebase via the onAuthStateChanged listener
  // above once we know whether/who is logged in.

  console.log('Standardized.js fully initialized with preview card and PDF viewer');
});
})();
