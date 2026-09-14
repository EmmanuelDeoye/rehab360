// js/format.js - Complete Assessment Format Generator with Subscription Check
// Updated with modal popup and plan-based history saving

// Global variables
let githubToken = '';
let apiEndpoint = '';
let currentUser = null;
let historyItems = [];
let currentPlan = 'free';

// Cost control: free-plan users are capped at a monthly generation limit,
// mirroring the pattern already used on the presentation tool. Student/Pro
// are unlimited.
const FREE_MONTHLY_LIMIT = 8;
const FREE_LIMIT_DAYS = 30;
const PLAN_STORAGE_KEY = 'rehab_format_generation_data';
let generationCount = 0;
let generationResetDate = null;

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
  console.log('Format.js loaded with subscription integration');
  
  // DOM elements - Form
  const form = document.getElementById('assessmentForm');
  const generateBtn = document.getElementById('generateBtn');
  const clearBtn = document.getElementById('clearBtn');
  const toast = document.getElementById('toast');
  
  // DOM elements - History Drawer
  const historyNavBtn = document.getElementById('historyNavBtn');
  const historyDrawer = document.getElementById('historyDrawer');
  const closeDrawer = document.getElementById('closeDrawer');
  const historyList = document.getElementById('historyList');
  const historySearch = document.getElementById('historySearch');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const totalCountSpan = document.getElementById('totalCount');
  const latestDateSpan = document.getElementById('latestDate');
  
  // DOM elements - Download Modal
  const downloadModal = document.getElementById('downloadModal');
  const downloadWordOption = document.getElementById('downloadWordOption');
  const downloadPdfOption = document.getElementById('downloadPdfOption');
  const cancelDownload = document.getElementById('cancelDownload');
  
  // DOM elements - Delete Confirmation
  const deleteConfirmModal = document.getElementById('deleteConfirmModal');
  const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
  let itemToDelete = null;

  // ===== LOCALSTORAGE PERSISTENCE FUNCTIONS =====
  
  // Form field IDs to persist (extended with new fields)
  const formFields = [
    'patientName',
    'patientAge',
    'patientGender',
    'referralSource',
    'clinicalSetting',
    'diagnosisCategory',
    'patientDiagnosis',
    'precautions',
    'functionalGoals',
    'assessmentType',
    'categorySelect',
    'deptSelect',
    'pageCount',
    'clinicalNotes',
    'includeStandardSections'
  ];

  function loadFormFromStorage() {
    try {
      const savedData = localStorage.getItem('rehab_assessment_form');
      if (savedData) {
        const formData = JSON.parse(savedData);
        
        formFields.forEach(fieldId => {
          const element = document.getElementById(fieldId);
          if (element && formData[fieldId] !== undefined) {
            if (element.type === 'checkbox') {
              element.checked = formData[fieldId];
            } else {
              element.value = formData[fieldId];
            }
          }
        });
        
        // Restore diagnosis picker if category was saved
        const catEl = document.getElementById('diagnosisCategory');
        if (catEl && catEl.value && typeof updateDiagnosisList === 'function') {
          updateDiagnosisList();
        }

        const pageVal = document.getElementById('pageVal');
        if (pageVal && formData.pageCount) {
          pageVal.textContent = formData.pageCount;
        }
        
        console.log('Form data loaded from localStorage');
      }
    } catch (error) {
      console.error('Error loading form from localStorage:', error);
    }
  }

  function saveFormToStorage() {
    try {
      const formData = {};
      
      formFields.forEach(fieldId => {
        const element = document.getElementById(fieldId);
        if (element) {
          if (element.type === 'checkbox') {
            formData[fieldId] = element.checked;
          } else {
            formData[fieldId] = element.value;
          }
        }
      });
      
      localStorage.setItem('rehab_assessment_form', JSON.stringify(formData));
    } catch (error) {
      console.error('Error saving form to localStorage:', error);
    }
  }

  function clearFormStorage() {
    localStorage.removeItem('rehab_assessment_form');
  }

  // Auto-save on any form input change
  formFields.forEach(fieldId => {
    const element = document.getElementById(fieldId);
    if (element) {
      element.addEventListener('input', saveFormToStorage);
      element.addEventListener('change', saveFormToStorage);
    }
  });

  // Load saved data on page load
  loadFormFromStorage();

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

  const tokens = await fetchTokens();
  if (tokens) {
    githubToken = tokens.token;
    apiEndpoint = tokens.endpoint;
    console.log('API credentials loaded');
  } else {
    showToast('Failed to load API credentials. Please try again.', true);
  }

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

  // ===== Helper Functions =====
  
  function showToast(message, isError = false, duration = 3000) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    toast.style.background = isError ? '#dc2626' : 'var(--accent)';
    
    setTimeout(() => {
      toast.classList.add('hidden');
    }, duration);
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

  function cleanHtml(html) {
    html = html.replace(/```html?/g, '').replace(/```/g, '');
    html = html.trim();
    return html;
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async function checkPlanAccess() {
    return !!currentUser;
  }

  // ===== PREVIEW MODAL =====
  function showPreviewModal(html, formData, assessmentId, hasHistoryAccess) {
    const existingModal = document.querySelector('.preview-modal');
    if (existingModal) existingModal.remove();

    const previewModal = document.createElement('div');
    previewModal.className = 'preview-modal';
    
    const viewAction = assessmentId 
      ? `window.open('formatresult.html?id=${assessmentId}', '_blank'); document.querySelector('.preview-modal').remove();`
      : `(function() {
           const w = window.open('', '_blank');
           w.document.write(decodeURIComponent('${encodeURIComponent(html)}'));
           w.document.close();
           document.querySelector('.preview-modal').remove();
         })();`;

    let historyMessage = '';
    if (hasHistoryAccess && assessmentId) {
      historyMessage = `
        <div style="margin-top: 16px; padding: 10px 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px;">
          <p style="color: #15803d; margin: 0; font-size: 0.8rem;">
            ✅ This assessment has been saved to your history.
          </p>
        </div>
      `;
    } else if (!currentUser) {
      historyMessage = `
        <div style="margin-top: 16px; padding: 12px 16px; background: #fefce8; border: 1px solid #fef08a; border-radius: 12px; display: flex; align-items: flex-start; gap: 10px;">
          <span style="font-size: 1.2rem; flex-shrink: 0;">💡</span>
          <div>
            <p style="color: #854d0e; margin: 0 0 4px 0; font-size: 0.85rem; font-weight: 600;">
              Login to Save History
            </p>
            <p style="color: #a16207; margin: 0; font-size: 0.8rem; line-height: 1.4;">
              Sign in to automatically save, retrieve, and download your assessments anytime.
            </p>
          </div>
        </div>
      `;
    } else {
      historyMessage = `
        <div style="margin-top: 16px; padding: 10px 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px;">
          <p style="color: #15803d; margin: 0; font-size: 0.8rem;">
            ✅ Assessment generated successfully.
          </p>
        </div>
      `;
    }

    previewModal.innerHTML = `
      <div class="preview-overlay"></div>
      <div class="preview-card">
        <div class="preview-card-header">
          <div class="preview-icon">📄</div>
          <h3>Assessment Generated</h3>
          <button class="preview-close">&times;</button>
        </div>
        <div class="preview-card-body">
          <div class="preview-info">
            <span class="preview-badge">✅ Ready to view</span>
            <span class="preview-date">${new Date().toLocaleString()}</span>
          </div>
          <p class="preview-description">
            Your <strong>${escapeHtml(formData.assessmentType)}</strong> for 
            <strong>${escapeHtml(formData.name)}</strong> has been generated successfully.
          </p>
          <div class="preview-actions">
            <button class="preview-btn primary" id="viewFullAssessmentBtn"
                    onclick="${viewAction}">
              📖 View Full Assessment
            </button>
            <button class="preview-btn secondary" id="closePreviewBtn">
              Close
            </button>
          </div>
          ${historyMessage}
          <div class="preview-note">
            <small>💡 The assessment opens in a new tab for printing or saving as PDF.</small>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(previewModal);

    const closeBtn = previewModal.querySelector('.preview-close');
    const closeActionBtn = previewModal.querySelector('#closePreviewBtn');
    const overlay = previewModal.querySelector('.preview-overlay');
    const closeModal = () => previewModal.remove();

    closeBtn.addEventListener('click', closeModal);
    if (closeActionBtn) closeActionBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', closeModal);

    const escHandler = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  // ===== BUILD PROMPT (extended with new fields) =====
  function buildPrompt(data) {
    const sections = data.includeSections
      ? "SOAP notes may be included if clinically relevant."
      : "";

    const precautionsLine = data.precautions
      ? `- Precautions / Contraindications: ${data.precautions}`
      : '';
    const goalsLine = data.functionalGoals
      ? `- Functional Goals: ${data.functionalGoals}`
      : '';
    const referralLine = data.referralSource
      ? `- Referral Source: ${data.referralSource}`
      : '';
    const settingLine = data.clinicalSetting
      ? `- Clinical Setting: ${data.clinicalSetting}`
      : '';

    return `Generate a professional PRINTABLE medical assessment form.

CONTEXT:
- Patient: ${data.name} (${data.age} years, ${data.gender})
- Diagnosis: ${data.diagnosis || "Not specified"}
- Assessment Type: ${data.assessmentType}
- Department: ${data.department}
- Category: ${data.category}
${referralLine}
${settingLine}
${precautionsLine}
${goalsLine}
- Clinical Notes: ${data.notes || "None"}

REQUIREMENTS:
1. Return ONLY pure HTML. No markdown, no code fences.
2. The form MUST be PRINT-FRIENDLY (A4 layout).
3. DO NOT use interactive elements like select, radio, or contenteditable.

4. CRITICAL: TEXTAREA STRUCTURE - NO LABELS
   - Textareas MUST NOT have visible labels or placeholders above, inside or beside them
   - Example: <textarea rows="7"></textarea>
   - Do NOT write: <label>Psychiatric History:</label> <textarea></textarea>
   - The heading/subheading serves as the label, textarea is directly below it

5. CRITICAL: AUTO-EXPANDING TEXTAREAS
   - ALL textareas must have the following attributes and JavaScript for auto-expansion:
     - Add: oninput="this.style.height = ''; this.style.height = Math.min(this.scrollHeight, 400) + 'px'"
     - Set initial rows="10" but allow growth up to max-height
   - Full textarea code example:
     <textarea rows="7" 
               style="width:100%; resize:vertical; min-height:150px; max-height:500px; overflow-y:auto;" 
               placeholder="Enter observations here..."
               oninput="this.style.height = ''; this.style.height = Math.min(this.scrollHeight, 400) + 'px'"></textarea>

6. HISTORY SECTION FORMAT - SUBHEADINGS WITH AUTO-EXPAND TEXTAREAS:
   - Each history category must be a subheading (<h4> or <strong>) with a textarea directly below
   - No labels, only placeholder text
   - Format history sections like this:
     <h4>Psychiatric History</h4>
     <textarea rows="4" style="width:100%; resize:vertical; min-height:80px; max-height:400px; overflow-y:auto;" 
               placeholder="Enter psychiatric history, including diagnoses, hospitalizations, medications..."
               oninput="this.style.height = ''; this.style.height = Math.min(this.scrollHeight, 400) + 'px'"></textarea>

7. STANDARD SECTIONS - ALL WITH AUTO-EXPAND TEXTAREAS (as before):
   Include: Presenting Complaint & Referral Reason, Clinical Observations, Assessment Findings, Treatment Plan & Recommendations

${precautionsLine ? `8a. PRECAUTIONS SECTION:
   Include a clearly highlighted precautions/contraindications box near the top of the form:
   <div style="border: 2px solid #dc2626; border-radius: 8px; padding: 12px 16px; margin: 16px 0; background: #fef2f2;">
     <strong style="color: #dc2626;">⚠️ Precautions / Contraindications</strong>
     <p style="margin: 4px 0 0; color: #333;">${data.precautions}</p>
   </div>` : ''}

${goalsLine ? `8b. FUNCTIONAL GOALS SECTION:
   Include a goals section near the top highlighting: "${data.functionalGoals}"
   Present this as a structured goal-setting area with space to note short-term and long-term goals.` : ''}

8. USE TABLES ONLY FOR STRUCTURED DATA:
   - Tables should ONLY be used for numerical/structured data like:
     * Range of Motion (ROM) measurements
     * Muscle strength grading
     * Standardized test scores
   - Do NOT use tables for narrative content or history sections

9. Department-specific guidance:
${getPrintableDepartmentContent(data.department, data.category)}

10. Final Section - Standardized Assessment Tools:
    List 5 REAL standardized assessment tools relevant to "${data.diagnosis}" with:
    - Tool name (as heading)
    - Short clinical purpose (small text)
    - Clickable link (<a href="" target="_blank">)
    - Space for score/result (use auto-expand textarea with placeholder "Score/Result")

11. DESIGN RULES:
    - Clean black-and-white professional layout
    - Proper spacing, alignment, and margins
    - Avoid clutter
    - Ensure readability when printed
    - All textareas should be full width (width:100%)

12. PRINT STYLING:
    - Use CSS with @media print
    - Avoid page breaks inside sections
    - Ensure margins are print-safe

13. CLINICAL INTELLIGENCE:
    - Be flexible and adaptive
    - Do NOT follow a rigid template
    - Tailor the form to the specific clinical scenario
    - Make it feel like a real-world hospital assessment document

${sections}

Return ONLY the HTML.`;
  }

  function getPrintableDepartmentContent(department, category) {
    switch(department) {
      case 'Occupational Therapy':
        return `
- Include areas related to functional performance and independence.
- ADLs may be presented using checkboxes with space for comments.
- Provide space to document motor skills (fine/gross), coordination, and functional use.
- Include sensory processing observations where relevant (e.g., tactile, vestibular, proprioceptive).
- Allow space for cognitive and perceptual observations.
`;
      case 'Physiotherapy':
        return `
- Include musculoskeletal and functional assessment components.
- Range of Motion (ROM) can be presented in table format with space for values and remarks.
- Muscle strength or performance may be documented in structured form.
- Include observational areas such as posture, gait, and mobility.
- Provide space for special tests and clinical interpretation.
`;
      case 'Speech Therapy':
        return `
- Include communication and speech-related components.
- Provide space for expressive and receptive language observations.
- Oral motor structure and function can be documented in a simple table or listed format.
- Include areas for voice, fluency, and articulation where relevant.
- Provide space for swallowing/feeding observations if applicable.
`;
      case 'Clinical Psychology':
        return `
- Include mental and behavioral assessment components.
- Provide structured areas for mental status observations (appearance, mood, thought, cognition).
- Include space for emotional and behavioral observations.
- Risk-related observations may be included where relevant.
- Allow room for narrative clinical impressions.
`;
      case 'Paediatric':
        return `
- Include developmental and functional assessment areas.
- Developmental milestones can be documented in a flexible table or notes format.
- Include caregiver concerns and observational notes.
- Provide space for play, social interaction, and learning-related observations.
- Ensure the structure is adaptable to different age groups.
`;
      default:
        return `
- Include general clinical assessment areas relevant to the case.
- Provide space for observations, findings, and interpretation.
- Include structured areas where necessary, but keep flexibility.
- Allow room for clinical judgment and notes.
`;
    }
  }

  // ===== History Functions =====
  
  async function loadUserHistory() {
    if (!currentUser) return;
    
    try {
      const snapshot = await database.ref(`history/${currentUser.uid}/formats`).once('value');
      const data = snapshot.val();
      
      historyItems = [];
      if (data) {
        historyItems = Object.entries(data).map(([id, item]) => ({
          id: id,
          ...item
        })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      }
      
      updateHistoryUI();
    } catch (error) {
      console.error('Error loading history:', error);
      showToast('Failed to load history', true);
    }
  }

  async function saveToHistory(assessmentData, generatedHtml) {
    if (!currentUser) {
      showToast('Please login to save history', true);
      return null;
    }

    try {
      const historyItem = {
        patientName: assessmentData.name,
        patientAge: assessmentData.age,
        patientGender: assessmentData.gender,
        diagnosis: assessmentData.diagnosis || '',
        referralSource: assessmentData.referralSource || '',
        clinicalSetting: assessmentData.clinicalSetting || '',
        precautions: assessmentData.precautions || '',
        functionalGoals: assessmentData.functionalGoals || '',
        assessmentType: assessmentData.assessmentType,
        category: assessmentData.category,
        department: assessmentData.department,
        pageCount: assessmentData.pageCount,
        notes: assessmentData.notes || '',
        includeSections: assessmentData.includeSections,
        generatedText: generatedHtml,
        preview: generatedHtml.replace(/<[^>]*>/g, ' ').substring(0, 150).replace(/\n/g, ' '),
        timestamp: new Date().toISOString(),
        userId: currentUser.uid
      };

      const newHistoryRef = database.ref(`history/${currentUser.uid}/formats`).push();
      await newHistoryRef.set(historyItem);
      const newId = newHistoryRef.key;
      
      historyItems.unshift({
        id: newId,
        ...historyItem
      });
      
      updateHistoryUI();
      showToast('Assessment saved to history');
      return newId;
      
    } catch (error) {
      console.error('Error saving to history:', error);
      showToast('Failed to save to history', true);
      return null;
    }
  }

  async function deleteHistoryItem(itemId) {
    if (!currentUser || !itemId) return;
    
    try {
      await database.ref(`history/${currentUser.uid}/formats/${itemId}`).remove();
      historyItems = historyItems.filter(item => item.id !== itemId);
      updateHistoryUI();
      showToast('Item deleted from history');
    } catch (error) {
      console.error('Error deleting history item:', error);
      showToast('Failed to delete item', true);
    }
  }

  async function clearAllHistory() {
    if (!currentUser) return;
    
    try {
      await database.ref(`history/${currentUser.uid}/formats`).remove();
      historyItems = [];
      updateHistoryUI();
      showToast('All history cleared');
      deleteConfirmModal.classList.remove('show');
    } catch (error) {
      console.error('Error clearing history:', error);
      showToast('Failed to clear history', true);
    }
  }

  function retrieveHistoryItem(item) {
    window.open(`formatresult.html?id=${item.id}`, '_blank');
  }

  function updateHistoryUI(searchTerm = '') {
    if (!historyList) return;
    
    if (totalCountSpan) {
      totalCountSpan.textContent = historyItems.length;
    }
    
    if (latestDateSpan && historyItems.length > 0) {
      const latest = new Date(historyItems[0].timestamp);
      latestDateSpan.textContent = latest.toLocaleDateString();
    } else if (latestDateSpan) {
      latestDateSpan.textContent = '-';
    }
    
    let filteredItems = historyItems;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filteredItems = historyItems.filter(item => 
        item.patientName?.toLowerCase().includes(term) ||
        item.assessmentType?.toLowerCase().includes(term) ||
        item.department?.toLowerCase().includes(term) ||
        item.category?.toLowerCase().includes(term) ||
        item.diagnosis?.toLowerCase().includes(term) ||
        item.preview?.toLowerCase().includes(term)
      );
    }
    
    if (filteredItems.length === 0) {
      historyList.innerHTML = `
        <div class="empty-history">
          <p>${searchTerm ? 'No matching history items' : 'No history yet'}</p>
          <small>${searchTerm ? 'Try a different search term' : 'Generate your first assessment to see it here'}</small>
        </div>
      `;
      return;
    }
    
    historyList.innerHTML = filteredItems.map(item => {
      const date = new Date(item.timestamp);
      const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
      
      return `
        <div class="history-item" data-id="${item.id}">
          <div class="history-item-header">
            <span class="history-item-title">${escapeHtml(item.patientName || 'Unknown Patient')}</span>
            <span class="history-item-date">${formattedDate}</span>
          </div>
          <div class="history-item-details">
            <span class="history-item-badge">${escapeHtml(item.assessmentType || 'Assessment')}</span>
            ${item.clinicalSetting ? `<span class="history-item-badge">${escapeHtml(item.clinicalSetting)}</span>` : ''}
          </div>
          <div class="history-item-actions">
            <button class="history-item-btn retrieve" onclick="window.retrieveItem('${item.id}')">
              <span>📂</span> Retrieve
            </button>
            <button class="history-item-btn delete" onclick="window.deleteItem('${item.id}')">
              <span>🗑️</span> Delete
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  window.retrieveItem = (itemId) => {
    const item = historyItems.find(i => i.id === itemId);
    if (item) retrieveHistoryItem(item);
  };

  window.deleteItem = (itemId) => {
    itemToDelete = itemId;
    deleteConfirmModal.classList.add('show');
  };

  // ===== Form Submission =====
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!currentUser) {
      showToast('Please log in to generate an assessment.', true);
      document.getElementById('loginBtn')?.click();
      return;
    }

    if (!canGenerateMore()) {
      const daysLeft = getDaysUntilReset();
      showToast(`⚠️ You've reached your ${FREE_MONTHLY_LIMIT} generation limit for this month. Upgrade to Student or Pro for unlimited access. Resets in ${daysLeft} days.`, true, 6000);
      return;
    }

    if (!githubToken || !apiEndpoint) {
      showToast('API credentials not loaded. Please refresh and try again.', true);
      return;
    }

    // Collect form data (extended)
    const formData = {
      name: document.getElementById('patientName').value.trim(),
      age: document.getElementById('patientAge').value,
      gender: document.getElementById('patientGender').value,
      referralSource: document.getElementById('referralSource')?.value || '',
      clinicalSetting: document.getElementById('clinicalSetting')?.value || '',
      diagnosis: document.getElementById('patientDiagnosis')?.value.trim() || '',
      precautions: document.getElementById('precautions')?.value.trim() || '',
      functionalGoals: document.getElementById('functionalGoals')?.value.trim() || '',
      assessmentType: document.getElementById('assessmentType').value,
      category: document.getElementById('categorySelect').value,
      department: document.getElementById('deptSelect').value,
      pageCount: document.getElementById('pageCount').value,
      notes: document.getElementById('clinicalNotes').value.trim(),
      includeSections: document.getElementById('includeStandardSections').checked
    };

    // Validate required fields
    if (!formData.name || !formData.age || !formData.gender || !formData.assessmentType || !formData.department || !formData.pageCount) {
      showToast('Please fill in all required fields.', true);
      return;
    }

    if (!formData.diagnosis) {
      showToast('Please enter a diagnosis or chief complaint.', true);
      return;
    }

    if (formData.age <= 0 || formData.age > 150) {
      showToast('Please enter a valid age.', true);
      return;
    }

    generateBtn.disabled = true;
    const btnText = generateBtn.querySelector('.btn-text');
    const spinner = generateBtn.querySelector('.loading-spinner-small');
    btnText.textContent = 'Generating...';
    spinner.style.display = 'inline-block';

    try {
      const prompt = buildPrompt(formData);
      const html = await callAIWithValidation(prompt, 1);

      window.currentGeneratedText = html;
      window.currentFormData = formData;

      let assessmentId = null;
      let hasHistoryAccess = false;

      if (currentUser) {
        hasHistoryAccess = await checkPlanAccess();

        if (hasHistoryAccess) {
          assessmentId = await saveToHistory(formData, html);
          if (assessmentId) {
            window.currentAssessmentId = assessmentId;
          }
        }
      } else {
        showToast('Assessment generated! Login to save to history.', false, 4000);
      }

      incrementGenerationCount();
      showPreviewModal(html, formData, assessmentId, hasHistoryAccess);
      
    } catch (error) {
      console.error('Generation error:', error);
      showToast(error.message || 'Failed to generate. Please try again.', true);
    } finally {
      generateBtn.disabled = false;
      btnText.textContent = 'Generate Format';
      spinner.style.display = 'none';
    }
  });

  // Validated, auto-retrying AI call — mirrors the fix applied to the
  // presentation tool. A 200 OK with empty/near-empty content (content
  // filter tripping on clinical wording, or truncation before real content
  // was written) used to get saved and shown as-is. This now retries once
  // with more token headroom, and reports genuinely failed attempts via
  // error-reporter.js so they're visible in the admin Reviews tab.
  async function callAIWithValidation(prompt, attempt) {
    const response = await fetch(`${apiEndpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${githubToken}`
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: 'You are a senior rehabilitation therapist. You always return clean, printable HTML forms. Never use Markdown or code fences.' },
          { role: 'user', content: prompt }
        ],
        model: 'gpt-4.1',
        temperature: 0.7,
        max_tokens: attempt === 1 ? 4000 : 5500
      })
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      if (window.reportApiError) {
        window.reportApiError({
          status: response.status,
          bodyText: errBody,
          tool: 'format',
          context: `generate formatted document (attempt ${attempt})`
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
    const html = cleanHtml(rawContent);

    if (finishReason === 'content_filter') {
      if (window.reportApiError) {
        window.reportApiError({ status: 200, bodyText: `content_filter (attempt ${attempt})`, tool: 'format', context: 'generate formatted document' });
      }
      throw new Error('The AI declined to generate this content, most likely due to sensitive wording in the notes. Try rephrasing and generate again.');
    }

    if (html.length < 20) {
      if (attempt < 2) {
        console.warn(`[format] Empty/short response (finish_reason=${finishReason}). Retrying…`);
        return callAIWithValidation(prompt, attempt + 1);
      }
      if (window.reportApiError) {
        window.reportApiError({ status: 200, bodyText: `Empty response after ${attempt} attempts, finish_reason=${finishReason}`, tool: 'format', context: 'generate formatted document' });
      }
      throw new Error('The AI returned an empty response after two attempts. Please try again.');
    }

    if (finishReason === 'length') {
      showToast('⚠️ Output may be cut short — consider reducing the page count for a complete document.', false, 6000);
    }

    return html;
  }

  // ===== Download Functions =====
  
  if (downloadWordOption) {
    downloadWordOption.addEventListener('click', () => {
      downloadModal.classList.remove('show');
      if (!window.currentGeneratedText || !window.currentFormData) {
        showToast('No assessment to download', true);
        return;
      }
      downloadAsWord(window.currentGeneratedText, window.currentFormData);
    });
  }

  if (downloadPdfOption) {
    downloadPdfOption.addEventListener('click', () => {
      downloadModal.classList.remove('show');
      if (!window.currentGeneratedText || !window.currentFormData) {
        showToast('No assessment to download', true);
        return;
      }
      downloadAsPdf(window.currentGeneratedText, window.currentFormData);
    });
  }

  function downloadAsWord(html, formData) {
    const fullHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Assessment - ${formData.name}</title>
  <style>
    body { font-family: 'Arial', 'Helvetica', sans-serif; line-height: 1.6; padding: 2rem; max-width: 1200px; margin: 0 auto; }
    h1, h2, h3 { color: #00695c; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
    th { background-color: #f5f5f5; }
    textarea { width: 100%; min-height: 100px; margin: 0.5rem 0; padding: 8px; }
    @media print { body { padding: 0.5in; } textarea { border: 1px solid #ccc; } }
  </style>
</head>
<body>
  <div style="text-align: center; margin-bottom: 2rem;">
    <h1>rehablix Assessment</h1>
    <p>Generated: ${new Date().toLocaleString()}</p>
    <hr>
  </div>
  ${html}
  <hr>
  <p style="font-size: 0.8rem; color: #666;">Generated by rehablix - Intelligent Rehabilitation Tools</p>
</body>
</html>`;
    
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `assessment_${formData.name}_${new Date().toISOString().slice(0,10)}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Word document downloaded successfully!');
  }

  function downloadAsPdf(html, formData) {
    const fullHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Assessment - ${formData.name}</title>
  <style>
    body { font-family: 'Arial', 'Helvetica', sans-serif; line-height: 1.6; padding: 2rem; max-width: 1200px; margin: 0 auto; }
    h1, h2, h3 { color: #00695c; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
    th { background-color: #f5f5f5; }
    textarea { width: 100%; min-height: 100px; margin: 0.5rem 0; padding: 8px; }
    @media print { body { padding: 0.5in; } textarea { border: 1px solid #ccc; } }
  </style>
</head>
<body>
  <div style="text-align: center; margin-bottom: 2rem;">
    <h1>rehablix Assessment</h1>
    <p>Generated: ${new Date().toLocaleString()}</p>
    <hr>
  </div>
  ${html}
  <hr>
  <p style="font-size: 0.8rem; color: #666;">Generated by rehablix - Intelligent Rehabilitation Tools</p>
</body>
</html>`;

    const win = window.open('', '_blank');
    win.document.write(fullHtml);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  if (cancelDownload) {
    cancelDownload.addEventListener('click', () => {
      downloadModal.classList.remove('show');
    });
  }

  // ===== Clear Form =====
  
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      form.reset();
      const pageVal = document.getElementById('pageVal');
      if (pageVal) pageVal.textContent = '2';
      
      // Hide diagnosis picker on clear
      const pickerGroup = document.getElementById('diagnosisPickerGroup');
      if (pickerGroup) pickerGroup.style.display = 'none';
      
      clearFormStorage();
      
      delete window.currentGeneratedText;
      delete window.currentFormData;
      delete window.currentAssessmentId;
      showToast('Form cleared');
    });
  }

  // ===== History Drawer Controls =====
  
  if (historyNavBtn) {
    historyNavBtn.addEventListener('click', () => {
      if (!currentUser) {
        showToast('Please login to view history', true);
        return;
      }
      loadUserHistory();
      historyDrawer.classList.add('open');
      document.body.style.overflow = 'hidden';
    });
  }

  if (closeDrawer) {
    closeDrawer.addEventListener('click', () => {
      historyDrawer.classList.remove('open');
      document.body.style.overflow = '';
    });
  }

  document.addEventListener('click', (e) => {
    if (historyDrawer && historyNavBtn && 
        !historyDrawer.contains(e.target) && 
        !historyNavBtn.contains(e.target) && 
        historyDrawer.classList.contains('open')) {
      historyDrawer.classList.remove('open');
      document.body.style.overflow = '';
    }
  });

  if (historySearch) {
    historySearch.addEventListener('input', (e) => {
      updateHistoryUI(e.target.value);
    });
  }

  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', () => {
      if (historyItems.length === 0) {
        showToast('No history to clear', true);
        return;
      }
      itemToDelete = 'all';
      deleteConfirmModal.classList.add('show');
    });
  }

  // ===== Delete Confirmation =====
  
  if (cancelDeleteBtn) {
    cancelDeleteBtn.addEventListener('click', () => {
      deleteConfirmModal.classList.remove('show');
      itemToDelete = null;
    });
  }

  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', async () => {
      if (itemToDelete === 'all') {
        await clearAllHistory();
      } else if (itemToDelete) {
        await deleteHistoryItem(itemToDelete);
      }
      deleteConfirmModal.classList.remove('show');
      itemToDelete = null;
    });
  }

  [downloadModal, deleteConfirmModal].forEach(modal => {
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('show');
          if (modal === deleteConfirmModal) itemToDelete = null;
        }
      });
    }
  });

  // ===== Range Slider =====
  const pageCount = document.getElementById('pageCount');
  const pageVal = document.getElementById('pageVal');
  if (pageCount && pageVal) {
    pageCount.addEventListener('input', () => {
      pageVal.textContent = pageCount.value;
      saveFormToStorage();
    });
  }

  // ===== Keyboard Shortcuts =====
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (historyDrawer && historyDrawer.classList.contains('open')) {
        historyDrawer.classList.remove('open');
        document.body.style.overflow = '';
      }
      if (downloadModal && downloadModal.classList.contains('show')) {
        downloadModal.classList.remove('show');
      }
      if (deleteConfirmModal && deleteConfirmModal.classList.contains('show')) {
        deleteConfirmModal.classList.remove('show');
        itemToDelete = null;
      }
    }
  });

  if (form) {
    form.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        form.dispatchEvent(new Event('submit'));
      }
    });
  }

  console.log('Format.js fully initialized with free history saving for all users');
});
