// js/assign.js – Assignment Maker with Subscription Gating
// Free: 5 assignments/30 days | Student & Pro: Unlimited

if (typeof marked !== 'undefined') {
  marked.setOptions({ breaks: true, gfm: true, headerIds: false, mangle: false });
}

document.addEventListener('DOMContentLoaded', async () => {

  // ===== DOM Elements =====
  const topicInput = document.getElementById('topicInput');
  const attachBtn = document.getElementById('attachBtn');
  const fileInput = document.getElementById('fileInput');
  const cameraInput = document.getElementById('cameraInput');
  const fileInfo = document.getElementById('fileInfo');
  const courseInput = document.getElementById('courseInput');
  const assignmentType = document.getElementById('assignmentType');
  const volumeCount = document.getElementById('volumeCount');
  const volumeType = document.getElementById('volumeType');
  const toneSelect = document.getElementById('toneSelect');
  const instructionsInput = document.getElementById('instructionsInput');
  const generateBtn = document.getElementById('generateBtn');

  // Outline
  const hasOutlineCheckbox = document.getElementById('hasOutline');
  const outlineInput = document.getElementById('outlineInput');
  const outlineHint = document.getElementById('outlineHint');

  // Upload Modal
  const uploadModal = document.getElementById('uploadModal');
  const closeUploadModalBtn = document.getElementById('closeUploadModal');
  const uploadOptions = document.querySelectorAll('.upload-option');

  // Results loading
  const resultsLoading = document.getElementById('resultsLoading');

  // Preview Modal
  const previewModal = document.getElementById('previewModal');
  const previewClose = document.getElementById('previewClose');
  const previewCloseBtn = document.getElementById('previewCloseBtn');
  const previewDate = document.getElementById('previewDate');
  const previewTopic = document.getElementById('previewTopic');
  const previewCourse = document.getElementById('previewCourse');
  const previewOutlineBadge = document.getElementById('previewOutlineBadge');
  const viewFullAssignmentBtn = document.getElementById('viewFullAssignmentBtn');

  // History
  const historyDrawer = document.getElementById('historyDrawer');
  const historyNavBtn = document.getElementById('historyNavBtn');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  const historyList = document.getElementById('historyList');
  const historySearchInput = document.getElementById('historySearchInput');

  // Toast
  const toastContainer = document.getElementById('toast-container');

  // ===== State =====
  let currentUser = null;
  let aiConfig = { token: null, endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-v4-flash' };
  let uploadedFileText = '';
  let uploadedFileName = '';
  let generatedHtml = '';
  let currentHistoryId = null;
  let isGenerating = false;
  let aiAbortController = null;

  // Plan gating
  let currentPlan = 'free';
  let generationCount = 0;
  let generationResetDate = null;
  const FREE_LIMIT = 5;
  const LIMIT_DAYS = 30;

  const database = firebase.database();

  // =========================================================================
  // PLAN GATING FUNCTIONS
  // =========================================================================
  function loadGenerationData() {
    try {
      const data = JSON.parse(localStorage.getItem('rehab_assign_gen_data') || '{}');
      generationCount = data.count || 0;
      generationResetDate = data.resetDate ? new Date(data.resetDate) : null;
      
      const now = new Date();
      if (!generationResetDate || (now - generationResetDate) >= (LIMIT_DAYS * 24 * 60 * 60 * 1000)) {
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
    localStorage.setItem('rehab_assign_gen_data', JSON.stringify({
      count: generationCount,
      resetDate: generationResetDate ? generationResetDate.toISOString() : new Date().toISOString()
    }));
  }

  function canGenerateMore() {
    if (currentPlan === 'student' || currentPlan === 'pro') return true;
    
    const now = new Date();
    if (!generationResetDate || (now - generationResetDate) >= (LIMIT_DAYS * 24 * 60 * 60 * 1000)) {
      generationCount = 0;
      generationResetDate = now;
      saveGenerationData();
      return true;
    }
    
    return generationCount < FREE_LIMIT;
  }

  function getRemaining() {
    if (currentPlan === 'student' || currentPlan === 'pro') return Infinity;
    return Math.max(0, FREE_LIMIT - generationCount);
  }

  function getDaysUntilReset() {
    if (!generationResetDate) return 0;
    const now = new Date();
    const diffTime = (LIMIT_DAYS * 24 * 60 * 60 * 1000) - (now - generationResetDate);
    return Math.max(0, Math.ceil(diffTime / (24 * 60 * 60 * 1000)));
  }

  function incrementGenerationCount() {
    if (currentPlan === 'student' || currentPlan === 'pro') return;
    generationCount++;
    saveGenerationData();
    updatePlanUI();
  }

  function goToSubscription() {
    window.location.href = 'sub.html';
  }

  // =========================================================================
  // PLAN UI
  // =========================================================================
  function updatePlanUI() {
    const existingNotice = document.getElementById('planNoticeAssign');
    if (existingNotice) existingNotice.remove();

    if (currentPlan === 'student' || currentPlan === 'pro') return;

    const notice = document.createElement('div');
    notice.id = 'planNoticeAssign';
    
    const remaining = getRemaining();
    const daysLeft = getDaysUntilReset();
    
    notice.style.cssText = `
      background: #fef3c7;
      border: 2px solid #fbbf24;
      border-radius: 1rem;
      padding: 0.9rem 1.1rem;
      margin: 1rem 0;
      font-size: 0.85rem;
      text-align: center;
      color: #92400e;
      animation: fadeSlideDown 0.4s ease;
    `;

    let remainingHTML = '';
    if (remaining <= 0) {
      remainingHTML = `<strong style="color: #dc2626;">Limit reached!</strong>`;
    } else {
      remainingHTML = `<strong>${remaining}</strong> remaining`;
    }

    notice.innerHTML = `
      <div style="font-weight: 600; font-size: 0.95rem; margin-bottom: 0.3rem;">Free Plan</div>
      <div style="margin-bottom: 0.3rem;">
        ${remainingHTML} · <strong>${FREE_LIMIT}</strong> assignments/month
      </div>
      ${remaining <= 0 ? `<div style="color: #dc2626; font-size: 0.8rem; margin-bottom: 0.4rem;">Resets in <strong>${daysLeft}</strong> days</div>` : 
        daysLeft > 0 ? `<div style="font-size: 0.75rem; opacity: 0.7;">Resets in ${daysLeft} days</div>` : ''}
      <button id="upgradeAssignBtn" style="
        margin-top: 0.5rem;
        padding: 0.5rem 1.5rem;
        border-radius: 2rem;
        background: linear-gradient(135deg, #f59e0b, #d97706);
        color: white;
        border: none;
        cursor: pointer;
        font-weight: 600;
        font-size: 0.85rem;
        transition: all 0.2s ease;
        font-family: inherit;
      " onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 12px rgba(245,158,11,0.4)';"
         onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='none';">
        ⚡ Upgrade for Unlimited
      </button>
    `;

    // Insert after the generate button
    generateBtn.insertAdjacentElement('afterend', notice);

    const upgradeBtn = document.getElementById('upgradeAssignBtn');
    if (upgradeBtn) {
      upgradeBtn.addEventListener('click', goToSubscription);
    }
  }

  // =========================================================================
  // HUMANIZATION ENGINE v2 — no hardcoded repetitive templates
  // =========================================================================

  const BANNED_AI_PHRASES = [
    'moreover', 'furthermore', 'notably', 'consequently', 'thus', 'hence',
    'therein', 'hereby', 'whereby', 'aforementioned', 'heretofore',
    'in conclusion', 'it is imperative to note', 'it is worth mentioning',
    'it should be noted that', 'as previously stated', 'in summary',
    'the findings revealed that', 'the results indicated that',
    'it can be argued that', 'it is evident that', 'needless to say',
    'it is important to highlight', 'it must be emphasized',
    'it is crucial to understand', 'without a doubt', 'undoubtedly',
    'but there is more to it than that',
    'this is where it gets interesting',
    'i found this particularly relevant',
    'during my placement, i noticed',
    'what this means in practice is',
    'looking at this practically'
  ];

  function buildHumanizationPrompt(topic, course, outline) {
    const outlineReminder = outline
      ? `\n⚠️ OUTLINE PRESERVATION: The assignment MUST follow this exact structure throughout:\n${outline}\nDo not add, remove, or reorder sections.`
      : '';

    return `
HUMANIZATION REQUIREMENTS — APPLY ALL:

1. SENTENCE VARIETY (the single biggest signal of human writing):
   - Mix lengths naturally: some short (under 10 words), most medium (15-25 words), a few long (30+).
   - Never start two consecutive sentences with the same word.
   - Vary paragraph size: some 2 sentences, some 5-6. Not all the same length.
   - Use a question to transition between ideas occasionally — but no more than twice per assignment.

2. VOCABULARY — PLAIN AND DIRECT:
   - Use natural everyday academic language. How a smart student talks to their lecturer, not how a textbook reads.
   - NEVER use any of these phrases: ${BANNED_AI_PHRASES.slice(0, 14).join(', ')}.
   - Prefer simple direct verbs: "shows" not "demonstrates", "uses" not "utilizes",
     "helps" not "facilitates", "about" not "pertaining to", "end" not "culminate".
   - Contractions are fine: don't, it's, that's, I've, there's, wouldn't, couldn't.

3. PERSONAL VOICE — SPECIFIC, NOT GENERIC:
   - Include 1-2 personal observations or reflections.
   - Each reflection must be SPECIFIC and DIFFERENT in phrasing — reference a real clinical situation,
     a specific patient type, a particular setting, or something the student observed.
   - NEVER use identical opener phrases across reflections. Vary them completely.

4. CRITICAL — ZERO REPETITIVE TEMPLATES:
   - No transitional phrase may appear more than once in the entire assignment.
   - No two paragraph openers may be the same or near-identical.
   - Do not end every paragraph with a summary sentence that restates what was just said.
   - Do not open multiple paragraphs with "So," or "What this means is."

5. NATURAL IMPERFECTION — SUBTLE, NOT MECHANICAL:
   - One slightly informal sentence per 4-5 paragraphs is authentic. More than that is a pattern.
   - One genuine side-thought that comes back to the main point adds credibility.
   - A slightly longer-than-ideal sentence once or twice is fine — do not force imperfections artificially.

6. NIGERIAN CONTEXT (only where genuinely relevant to the topic):
   - Reference local healthcare settings or academic context where it adds real meaning.
   - Do not force Nigerian references into topics where they don't naturally fit.
${outlineReminder}

The final text must read like a specific, thoughtful student wrote it for this specific course — not a generic AI template.`;
  }

  // =========================================================================
  // AI DETECTION SCORING
  // =========================================================================
  function extractPlainText(html) {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }

  function calculateHumanizationScore(htmlContent) {
    const text = extractPlainText(htmlContent);
    if (!text || text.length < 100) return null;

    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
    if (sentences.length < 5) return null;

    const lengths = sentences.map(s => s.trim().split(/\s+/).length);
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / lengths.length;
    const stdDev = Math.sqrt(variance);
    const variationScore = Math.min(100, Math.round((stdDev / (avgLength || 1)) * 100));

    let predictablePatterns = 0;
    const totalSentences = sentences.length;

    BANNED_AI_PHRASES.forEach(phrase => {
      const regex = new RegExp(phrase, 'gi');
      const matches = text.match(regex);
      if (matches) predictablePatterns += matches.length;
    });

    const starts = sentences.map(s => s.trim().split(/\s+/).slice(0, 2).join(' ').toLowerCase());
    const uniqueStarts = new Set(starts);
    const startVariety = uniqueStarts.size / totalSentences;

    const predictabilityScore = Math.max(0, Math.round(
      (predictablePatterns / totalSentences) * 50 + (1 - startVariety) * 50
    ));

    const aiIndicators = [
      /it is (important|essential|crucial|necessary) to/gi,
      /(moreover|furthermore|consequently|thus|hence)/gi,
      /in (conclusion|summary|essence)/gi,
      /the (findings|results) (revealed|indicated|demonstrated|showed) that/gi,
      /it (can|could|should|must) be (noted|argued|stated|mentioned)/gi,
      /(significant|substantial|considerable) (impact|effect|influence|role)/gi,
      /plays? a (vital|crucial|critical|key|important|significant) role/gi,
      /has (revolutionized|transformed|changed) the (way|field|landscape)/gi,
      /but there is more to it than that/gi,
      /i found this particularly relevant/gi,
      /this is where it gets interesting/gi
    ];

    let aiIndicatorCount = 0;
    aiIndicators.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) aiIndicatorCount += matches.length;
    });

    const aiLikelihoodScore = Math.min(100, Math.round(
      (aiIndicatorCount / totalSentences) * 40 +
      (predictablePatterns / totalSentences) * 30 +
      (1 - startVariety) * 30
    ));

    const overallScore = Math.round(
      (variationScore * 0.3) +
      ((100 - predictabilityScore) * 0.35) +
      ((100 - aiLikelihoodScore) * 0.35)
    );

    return {
      overall: Math.min(100, Math.max(0, overallScore)),
      variation: variationScore,
      predictability: predictabilityScore,
      aiLikelihood: aiLikelihoodScore,
      sentenceCount: totalSentences
    };
  }

  function checkForAITells(htmlContent) {
    const text = extractPlainText(htmlContent).toLowerCase();
    const found = BANNED_AI_PHRASES.filter(phrase => text.includes(phrase.toLowerCase()));
    if (found.length > 0) {
      showToast(
        `⚠️ AI-sounding phrases detected (${found.slice(0, 3).join(', ')}…). Consider regenerating or editing manually.`,
        'warning',
        7000
      );
    }
  }

  // =========================================================================
  // HELPERS
  // =========================================================================
  function showToast(message, type = 'success', duration = 3500) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i><span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
  }

  async function fetchTokens() {
    try {
      const snapshot = await database.ref('tokens/deepseek').once('value');
      const data = snapshot.val();
      if (data?.api_key) {
        aiConfig.token = data.api_key;
        console.log('DeepSeek API loaded');
        return true;
      }
      console.warn('DeepSeek API key missing');
      return false;
    } catch (error) {
      console.error('Token fetch error:', error);
      return false;
    }
  }

  // ===== Form Validation =====
  function validateForm() {
    const hasTopic = topicInput.value.trim() !== '';
    const hasCourse = courseInput.value.trim() !== '';
    generateBtn.disabled = !(hasTopic && hasCourse) || isGenerating;
  }

  topicInput.addEventListener('input', validateForm);
  courseInput.addEventListener('input', validateForm);

  // ===== Outline Toggle =====
  hasOutlineCheckbox.addEventListener('change', () => {
    const show = hasOutlineCheckbox.checked;
    outlineInput.style.display = show ? 'block' : 'none';
    outlineHint.style.display = show ? 'flex' : 'none';
    if (show) outlineInput.focus();
  });

  // ===== Upload Modal =====
  function openUploadModal() {
    uploadModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeUploadModalFn() {
    uploadModal.classList.remove('active');
    document.body.style.overflow = '';
  }

  attachBtn.addEventListener('click', (e) => {
    e.preventDefault();
    openUploadModal();
  });

  closeUploadModalBtn.addEventListener('click', closeUploadModalFn);
  document.querySelector('.upload-modal-overlay')?.addEventListener('click', closeUploadModalFn);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && uploadModal.classList.contains('active')) {
      closeUploadModalFn();
    }
  });

  uploadOptions.forEach(option => {
    option.addEventListener('click', () => {
      const action = option.dataset.action;
      closeUploadModalFn();
      if (action === 'camera') {
        cameraInput.click();
      } else if (action === 'photo') {
        fileInput.accept = 'image/*';
        fileInput.click();
      } else if (action === 'document') {
        fileInput.accept = '.pdf,.docx,.txt,.doc';
        fileInput.click();
      }
    });
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) handleFileUpload(fileInput.files[0]);
    fileInput.value = '';
  });

  cameraInput.addEventListener('change', () => {
    if (cameraInput.files.length) handleFileUpload(cameraInput.files[0]);
    cameraInput.value = '';
  });

  async function handleFileUpload(file) {
    if (!file) return;
    attachBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    attachBtn.disabled = true;
    try {
      const text = await extractText(file);
      uploadedFileText = text.substring(0, 15000);
      uploadedFileName = file.name;
      showFileChip(file.name);
      showToast('Reference document attached', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      attachBtn.innerHTML = '<i class="fas fa-plus"></i>';
      attachBtn.disabled = false;
    }
  }

  function showFileChip(name) {
    fileInfo.style.display = 'inline-flex';
    fileInfo.innerHTML = `
      <i class="fas fa-paperclip"></i>
      <span>${escapeHtml(name.length > 30 ? name.substring(0, 30) + '…' : name)}</span>
      <button class="remove-file" id="removeFile">&times;</button>`;
    document.getElementById('removeFile').addEventListener('click', () => {
      uploadedFileText = '';
      uploadedFileName = '';
      fileInfo.style.display = 'none';
    });
  }

  async function extractText(file) {
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'txt') {
      const reader = new FileReader();
      return new Promise((resolve, reject) => {
        reader.onload = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Could not read the text file.'));
        reader.readAsText(file);
      });
    }

    if (ext === 'pdf') {
      try {
        const pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs');
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        const maxPages = Math.min(pdf.numPages, 20);
        for (let i = 1; i <= maxPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          fullText += content.items.map(item => item.str).join(' ') + '\n';
        }
        if (pdf.numPages > maxPages) {
          fullText += `\n[Note: Document has ${pdf.numPages} pages, only first ${maxPages} processed.]`;
        }
        return fullText;
      } catch (err) {
        throw new Error('Could not read this PDF. It may be encrypted or damaged.');
      }
    }

    if (ext === 'docx') {
      try {
        const mammoth = await loadMammoth();
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value;
      } catch (err) {
        throw new Error('Could not read this Word document. Please ensure it is not corrupted.');
      }
    }

    if (ext === 'doc') {
      throw new Error('Old .doc files are not supported. Please save as .docx or convert to PDF.');
    }

    if (file.type.startsWith('image/')) {
      return `[Image attached: ${file.name} - OCR not available]`;
    }

    throw new Error('Unsupported file type. Please upload PDF, DOCX, TXT, or an image.');
  }

  async function loadMammoth() {
    if (window.mammoth) return window.mammoth;
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
      script.onload = () => resolve(window.mammoth);
      script.onerror = () => reject(new Error('Failed to load document converter.'));
      document.head.appendChild(script);
    });
  }

  // =========================================================================
  // MULTI-PASS AI GENERATION v2.1
  // =========================================================================
  async function callAIWithCancel(systemPrompt, userPrompt, maxTokens, temp, topP, freqPenalty, presPenalty) {
    const response = await fetch(`${aiConfig.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiConfig.token}`
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: maxTokens,
        temperature: temp,
        top_p: topP,
        frequency_penalty: freqPenalty,
        presence_penalty: presPenalty
      }),
      signal: aiAbortController?.signal
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `API error (${response.status})`);
    }

    return response.json();
  }

  function cleanAIResponse(raw) {
    let cleaned = raw.replace(/```html?/g, '').replace(/```/g, '').trim();
    if (cleaned.includes('##') || cleaned.includes('**') || cleaned.includes('- ')) {
      cleaned = marked.parse(cleaned);
    }
    return cleaned;
  }

  // ===== Generate Assignment =====
  generateBtn.addEventListener('click', async () => {
    if (isGenerating) return;

    // Check generation limit
    if (!canGenerateMore()) {
      const daysLeft = getDaysUntilReset();
      showToast(`⚠️ You've reached your ${FREE_LIMIT} assignment limit. Upgrade to Student or Pro for unlimited access. Resets in ${daysLeft} days.`, 'error', 6000);
      goToSubscription();
      return;
    }

    if (hasOutlineCheckbox.checked && !outlineInput.value.trim()) {
      showToast('Please paste your outline or uncheck the outline option', 'error');
      outlineInput.focus();
      return;
    }

    if (!aiConfig.token) {
      const ok = await fetchTokens();
      if (!ok) {
        showToast('AI service not configured. Please try again later.', 'error');
        return;
      }
    }

    isGenerating = true;
    generateBtn.disabled = true;
    const originalBtnHtml = generateBtn.innerHTML;
    generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Generating…</span>';

    resultsLoading.style.display = 'block';
    resultsLoading.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const topic        = topicInput.value.trim();
    const course       = courseInput.value.trim();
    const type         = assignmentType.options[assignmentType.selectedIndex].text;
    const volume       = volumeCount.value;
    const unit         = volumeType.value === 'pages' ? 'pages' : 'words';
    const tone         = toneSelect.options[toneSelect.selectedIndex].text;
    const instructions = instructionsInput.value.trim();
    const fileContent  = uploadedFileText ? `\n\nReference material:\n${uploadedFileText}` : '';
    const outline      = hasOutlineCheckbox.checked ? outlineInput.value.trim() : '';
    const humanRules   = buildHumanizationPrompt(topic, course, outline);

    aiAbortController = new AbortController();

    try {
      const startTime = Date.now();

      // ===== PASS 1: Academic Draft =====
      const pass1System = `You are a knowledgeable academic writer. Write comprehensive, well-structured academic content with proper HTML formatting. Stay strictly on the provided topic and follow the outline exactly if one is provided.`;

      const pass1User = `Write a well-structured student assignment on: "${topic}"
Course: ${course}
Type: ${type}
Length: approximately ${volume} ${unit}
Tone: ${tone}
${instructions ? `Additional instructions: ${instructions}` : ''}
${outline ? `⚠️ CRITICAL — Follow this EXACT outline. Do not add, skip, or reorder any section:\n${outline}` : ''}
${fileContent ? `Reference material (background only — do NOT copy directly):\n${fileContent}` : ''}

FORMATTING:
- Title as a level-1 heading.
- Main sections as h2 headings, subsections as h3.
- Use bullet points and numbered lists where appropriate.
- Use <strong> for key terms.
- Proper paragraph breaks throughout.

Return ONLY the HTML. No markdown fences. No preamble.`;

      const pass1Res = await callAIWithCancel(pass1System, pass1User, 3000, 0.6, 0.9, 0.1, 0.1);
      let content = cleanAIResponse(pass1Res.choices[0].message.content);

      // ===== PASS 2: Humanization =====
      const pass2System = `You are an expert at rewriting academic text to sound naturally human-written.
Your job is to change STYLE and VOICE only.
Never change the factual content, the assignment structure, or any statistics.
${outline ? `The assignment MUST maintain this exact section structure:\n${outline}` : ''}`;

      const pass2User = `REWRITE the assignment below to sound like a real student wrote it.
Topic: "${topic}" | Course: ${course} | Tone: ${tone}

⚠️ STRICT RULES:
- Change ONLY the writing style, sentence structure, and phrasing.
- Do NOT change any facts, claims, or the order of sections.
- Do NOT remove or add any sections.
- Preserve all headings and their hierarchy (h1/h2/h3).
${outline ? `- CRITICAL: The section structure must exactly match the outline provided. Do not deviate.` : ''}

${humanRules}

ASSIGNMENT TO REWRITE:
${content.substring(0, 3500)}

Return ONLY the rewritten HTML. No markdown fences.`;

      const pass2Res = await callAIWithCancel(pass2System, pass2User, 3500, 0.75, 0.92, 0.25, 0.2);
      content = cleanAIResponse(pass2Res.choices[0].message.content);

      // ===== PASS 3: Polish =====
      const pass3System = `You are a careful academic editor. Polish text for quality while preserving all facts and the natural human voice.`;

      const pass3User = `POLISH the assignment below about "${topic}".

RULES:
- Fix grammar and awkward phrasing.
- Ensure proper HTML heading structure (h1 title, h2 sections, h3 subsections).
- Preserve the natural student voice — do NOT increase formality.
- If ANY transitional phrase appears more than once, remove the duplicates and replace with a different natural transition.
- If ANY paragraph opener is used twice, vary one of them.
- Do NOT change facts, statistics, or section order.
${outline ? `- Confirm the section structure still matches this outline:\n${outline}` : ''}

ASSIGNMENT:
${content}

Return ONLY the polished HTML. No markdown fences.`;

      const pass3Res = await callAIWithCancel(pass3System, pass3User, 2000, 0.4, 0.9, 0.1, 0.1);
      content = cleanAIResponse(pass3Res.choices[0].message.content);

      generatedHtml = content;

      // Score the output
      const score = calculateHumanizationScore(generatedHtml);
      console.log('[SCORE] Humanization score:', score?.overall + '%', score);

      resultsLoading.style.display = 'none';

      // Increment generation count for free plan
      incrementGenerationCount();

      // Save to history if logged in
      if (currentUser) {
        currentHistoryId = await saveToHistory(generatedHtml, '');
      }

      // Store in localStorage
      const assignmentData = {
        topic, course, type, typeLabel: type, tone, toneLabel: tone,
        volume, volumeUnit: unit,
        hasOutline: hasOutlineCheckbox.checked,
        outline: outline,
        html: generatedHtml,
        markdown: '',
        historyId: currentHistoryId,
        generatedAt: new Date().toISOString(),
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        humanizationScore: score?.overall || null
      };
      localStorage.setItem('rehab_assignment_current', JSON.stringify(assignmentData));

      // Show preview
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      showPreviewModal();

      const scoreMsg = score ? ` | Human Score: ${score.overall}%` : '';
      showToast(`Generated in ${elapsed}s${scoreMsg}`, 'success');

      // Warn about any AI tells that slipped through
      setTimeout(() => checkForAITells(generatedHtml), 600);

    } catch (err) {
      console.error('[GENERATE] Error:', err);

      let errorMessage = err.message;
      if (err.name === 'AbortError') {
        errorMessage = 'Generation cancelled.';
      } else if (errorMessage.includes('API key') || errorMessage.includes('token')) {
        errorMessage = 'The AI service is not configured correctly. Please contact support.';
      } else if (errorMessage.toLowerCase().includes('rate')) {
        errorMessage = 'Too many requests. Please wait a moment and try again.';
      } else if (errorMessage.includes('busy') || errorMessage.includes('503')) {
        errorMessage = 'The service is temporarily busy. Please try again in a few minutes.';
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        errorMessage = 'Network error. Please check your internet connection.';
      }

      showToast(`Error: ${errorMessage}`, 'error', 5000);
      resultsLoading.style.display = 'none';

    } finally {
      isGenerating = false;
      generateBtn.disabled = false;
      generateBtn.innerHTML = originalBtnHtml;
      aiAbortController = null;
      validateForm();
    }
  });

  // ===== Preview Modal =====
  function showPreviewModal() {
    previewTopic.textContent = topicInput.value.trim();
    previewCourse.textContent = courseInput.value.trim();
    previewDate.textContent = new Date().toLocaleString();

    if (hasOutlineCheckbox.checked && outlineInput.value.trim()) {
      previewOutlineBadge.style.display = 'block';
    } else {
      previewOutlineBadge.style.display = 'none';
    }

    previewModal.style.display = 'flex';
    previewModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closePreviewModal() {
    previewModal.style.display = 'none';
    previewModal.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (previewClose) previewClose.addEventListener('click', closePreviewModal);
  if (previewCloseBtn) previewCloseBtn.addEventListener('click', closePreviewModal);

  const previewOverlay = document.querySelector('.preview-overlay');
  if (previewOverlay) previewOverlay.addEventListener('click', closePreviewModal);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && previewModal.classList.contains('active')) {
      closePreviewModal();
    }
  });

  if (viewFullAssignmentBtn) {
    viewFullAssignmentBtn.addEventListener('click', () => {
      closePreviewModal();
      if (currentHistoryId) {
        window.open(`result.html?type=answer&id=${currentHistoryId}`, '_blank');
      } else {
        window.open('result.html?type=answer', '_blank');
      }
    });
  }

  // ===== Save to History =====
  async function saveToHistory(html, markdown) {
    if (!currentUser) return null;
    try {
      const ref = await database.ref(`history/${currentUser.uid}/assignments`).push({
        topic: topicInput.value.trim(),
        course: courseInput.value.trim(),
        type: assignmentType.value,
        typeLabel: assignmentType.options[assignmentType.selectedIndex].text,
        tone: toneSelect.value,
        toneLabel: toneSelect.options[toneSelect.selectedIndex].text,
        volume: volumeCount.value,
        volumeUnit: volumeType.value,
        hasOutline: hasOutlineCheckbox.checked,
        outline: hasOutlineCheckbox.checked ? outlineInput.value.trim() : '',
        instructions: instructionsInput.value.trim(),
        html: html,
        markdown: markdown,
        plainPreview: html.replace(/<[^>]*>/g, '').substring(0, 200),
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString()
      });
      return ref.key;
    } catch (error) {
      console.error('Error saving to history:', error);
      return null;
    }
  }

  // ===== History =====
  function loadHistoryList() {
    if (!currentUser) return;

    database.ref(`history/${currentUser.uid}/assignments`)
      .orderByChild('timestamp')
      .on('value', snap => {
        const data = snap.val();
        if (!historyList) return;

        historyList.innerHTML = '';

        if (!data) {
          historyList.innerHTML = `
            <div class="empty-state">
              <i class='bx bx-folder-open'></i>
              <p>No assignments yet</p>
              <small>Generated assignments will appear here</small>
            </div>`;
          return;
        }

        const entries = Object.entries(data)
          .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));

        const searchTerm = historySearchInput?.value.toLowerCase().trim() || '';
        const filtered = entries.filter(([_, item]) => {
          if (!searchTerm) return true;
          return (item.topic || '').toLowerCase().includes(searchTerm) ||
                 (item.course || '').toLowerCase().includes(searchTerm) ||
                 (item.typeLabel || '').toLowerCase().includes(searchTerm);
        });

        if (filtered.length === 0) {
          historyList.innerHTML = `
            <div class="empty-state">
              <i class='bx bx-search'></i>
              <p>No matching assignments</p>
            </div>`;
          return;
        }

        filtered.forEach(([id, item]) => {
          const div = document.createElement('div');
          div.className = 'history-item';

          const outlineIndicator = item.hasOutline
            ? '<span style="font-size:0.65rem;background:#e0f2f1;color:#00695c;padding:2px 6px;border-radius:4px;margin-left:6px;">outline</span>'
            : '';

          div.innerHTML = `
            <button class="delete-btn" data-id="${id}" title="Delete assignment">
              <i class="fas fa-trash-alt"></i>
            </button>
            <span class="history-title">${escapeHtml(item.topic || 'Untitled')}${outlineIndicator}</span>
            <div class="history-meta">
              <span><i class="far fa-calendar-alt"></i> ${escapeHtml(item.date || '')}</span>
              <span><i class="far fa-clock"></i> ${escapeHtml(item.time || '')}</span>
              <span>${escapeHtml(item.course || '')}</span>
              <span>${escapeHtml(item.toneLabel || '')}</span>
            </div>
            <div style="margin-top:0.5rem;">
              <button class="retrieve-btn" data-id="${id}">📂 Open in Editor</button>
            </div>`;

          div.addEventListener('click', (e) => {
            if (e.target.closest('.delete-btn') || e.target.closest('.retrieve-btn')) return;
            localStorage.setItem('rehab_assignment_current_id', id);
            window.open(`result.html?type=answer&id=${id}`, '_blank');
            historyDrawer.classList.remove('active');
            document.body.style.overflow = '';
          });

          div.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            deleteAssignment(id);
          });

          div.querySelector('.retrieve-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            localStorage.setItem('rehab_assignment_current_id', id);
            window.open(`result.html?type=answer&id=${id}`, '_blank');
            historyDrawer.classList.remove('active');
            document.body.style.overflow = '';
          });

          historyList.appendChild(div);
        });
      }, error => {
        console.error('History load error:', error);
        if (historyList) {
          historyList.innerHTML = `
            <div class="empty-state">
              <i class='bx bx-error'></i>
              <p>Failed to load history</p>
            </div>`;
        }
      });
  }

  async function deleteAssignment(id) {
    if (!currentUser) return;
    if (!confirm('Permanently delete this assignment?')) return;
    try {
      await database.ref(`history/${currentUser.uid}/assignments/${id}`).remove();
      try { await database.ref(`publicAssignments/${id}`).remove(); } catch (e) { /* ignore */ }
      showToast('Assignment deleted', 'success');
    } catch (error) {
      console.error('Delete error:', error);
      showToast('Failed to delete assignment', 'error');
    }
  }

  // ===== History Drawer Controls =====
  if (historyNavBtn) {
    historyNavBtn.addEventListener('click', () => {
      if (!currentUser) {
        showToast('Please log in to view history', 'error');
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) loginBtn.click();
        return;
      }
      historyDrawer.classList.add('active');
      document.body.style.overflow = 'hidden';
      loadHistoryList();
    });
  }

  if (closeDrawerBtn) {
    closeDrawerBtn.addEventListener('click', () => {
      historyDrawer.classList.remove('active');
      document.body.style.overflow = '';
    });
  }

  document.addEventListener('click', (e) => {
    if (historyDrawer?.classList.contains('active') &&
        !historyDrawer.contains(e.target) &&
        e.target !== historyNavBtn &&
        !historyNavBtn?.contains(e.target)) {
      historyDrawer.classList.remove('active');
      document.body.style.overflow = '';
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && historyDrawer?.classList.contains('active')) {
      historyDrawer.classList.remove('active');
      document.body.style.overflow = '';
    }
  });

  if (historySearchInput) {
    historySearchInput.addEventListener('input', () => {
      const term = historySearchInput.value.toLowerCase().trim();
      const items = document.querySelectorAll('.history-item');
      items.forEach(item => {
        const title = item.querySelector('.history-title')?.textContent.toLowerCase() || '';
        const meta  = item.querySelector('.history-meta')?.textContent.toLowerCase() || '';
        item.style.display = (!term || title.includes(term) || meta.includes(term)) ? '' : 'none';
      });
    });
  }

  // =========================================================================
  // PLAN UPDATE LISTENER
  // =========================================================================
  document.addEventListener('planUpdated', (e) => {
    const newPlan = e.detail?.plan || 'free';
    if (newPlan !== currentPlan) {
      currentPlan = newPlan;
      console.log('[ASSIGN] Plan updated to:', currentPlan);
      loadGenerationData();
      updatePlanUI();
    }
  });

  if (window.rehabPlans) {
    currentPlan = window.rehabPlans.getCurrentPlan() || 'free';
    console.log('[ASSIGN] Initial plan:', currentPlan);
  }

  // ===== Auth =====
  firebase.auth().onAuthStateChanged(user => {
    currentUser = user;
    if (user) {
      console.log('[AUTH] User logged in:', user.email);
      if (historyNavBtn) historyNavBtn.style.display = 'block';
      loadHistoryList();
    } else {
      console.log('[AUTH] User logged out');
      if (historyNavBtn) historyNavBtn.style.display = 'none';
      currentHistoryId = null;
    }
  });

  // ===== Init =====
  async function initialize() {
    console.log('[INIT] Assignment Maker starting...');
    loadGenerationData();
    await fetchTokens();
    validateForm();
    updatePlanUI();
    console.log('[INIT] Ready - Plan:', currentPlan, '| Gen count:', generationCount);
  }

  initialize();
});