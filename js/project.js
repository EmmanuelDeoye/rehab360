// js/project.js – Academic Project Maker v3.2
// Independent scrolling, improved supervisor, floating button, auto word count, typing indicator

if (typeof marked !== 'undefined') {
  marked.setOptions({ breaks: true, gfm: true, headerIds: false, mangle: false });
}

document.addEventListener('DOMContentLoaded', async () => {

  // ===== DOM Elements =====
  const chaptersList = document.getElementById('chaptersList');
  const sectionEditor = document.getElementById('sectionEditor');
  const currentSectionTitle = document.getElementById('currentSectionTitle');
  const aiGenerateSectionBtn = document.getElementById('aiGenerateSectionBtn');
  const aiGenerateChapterBtn = document.getElementById('aiGenerateChapterBtn');
  const chapterGenBtnText = document.getElementById('chapterGenBtnText');
  const aiChatMessages = document.getElementById('aiChatMessages');
  const aiMessageInput = document.getElementById('aiMessageInput');
  const aiSendBtn = document.getElementById('aiSendBtn');
  const saveSectionBtn = document.getElementById('saveSectionBtn');
  const exportWordBtn = document.getElementById('exportWordBtn');
  const exportPdfBtn = document.getElementById('exportPdfBtn');
  const toggleChaptersBtn = document.getElementById('toggleChaptersBtn');
  const toggleAIPanelBtn = document.getElementById('toggleAIPanelBtn');
  const chaptersSidebar = document.getElementById('chaptersSidebar');
  const aiPanel = document.getElementById('aiPanel');
  const closeChaptersBtn = document.getElementById('closeChaptersBtn');
  const closeAIPanelBtn = document.getElementById('closeAIPanelBtn');
  const projectModal = document.getElementById('projectModal');
  const closeProjectModalBtn = document.getElementById('closeProjectModal');
  const createProjectBtn = document.getElementById('createProjectBtn');
  const nextToOutlineBtn = document.getElementById('nextToOutlineBtn');
  const backToStep1Btn = document.getElementById('backToStep1Btn');
  const projectTitleInput = document.getElementById('projectTitle');
  const projectTypeSelect = document.getElementById('projectType');
  const projectDeptSelect = document.getElementById('projectDept');
  const projectApproachSelect = document.getElementById('projectApproach');
  const projectOutlineType = document.getElementById('projectOutlineType');
  const customOutlineInput = document.getElementById('customOutlineInput');
  const historyDrawer = document.getElementById('historyDrawer');
  const historyNavBtn = document.getElementById('historyNavBtn');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  const historyList = document.getElementById('historyList');
  const createNewProjectFromDrawer = document.getElementById('createNewProjectFromDrawer');
  const currentProjectSelect = document.getElementById('currentProjectSelect');
  const newProjectBtn = document.getElementById('newProjectBtn');
  const aiProgressModal = document.getElementById('aiProgressModal');
  const cancelGenerateBtn = document.getElementById('cancelGenerateBtn');
  const closeProgressModal = document.getElementById('closeProgressModal');
  const progressStage = document.getElementById('progressStage');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressDetail = document.getElementById('progressDetail');
  const aiToneSelect = document.getElementById('aiToneSelect');
  const humanizeCheckbox = document.getElementById('humanizeCheckbox');
  const humanizeWarningModal = document.getElementById('humanizeWarningModal');
  const closeHumanizeWarning = document.getElementById('closeHumanizeWarning');
  const confirmHumanizeBtn = document.getElementById('confirmHumanizeBtn');
  const cancelHumanizeBtn = document.getElementById('cancelHumanizeBtn');
  const modificationInput = document.getElementById('modificationInput');
  const modificationArea = document.getElementById('modificationArea');
  const writingProfileSelect = document.getElementById('writingProfileSelect');
  const saveVersionBtn = document.getElementById('saveVersionBtn');
  const versionList = document.getElementById('versionList');
  const aiScoreDisplay = document.getElementById('aiScoreDisplay');
  const humanizationScoreEl = document.getElementById('humanizationScore');
  const scoreFillEl = document.getElementById('scoreFill');
  const scoreSentenceVarEl = document.getElementById('scoreSentenceVar');
  const scorePredictabilityEl = document.getElementById('scorePredictability');
  const scoreAILikelyEl = document.getElementById('scoreAILikely');
  const scorePlanBadge = document.getElementById('scorePlanBadge');
  const badgeFree = scorePlanBadge ? scorePlanBadge.querySelector('.badge-free') : null;
  const badgePremium = scorePlanBadge ? scorePlanBadge.querySelector('.badge-premium') : null;
  const toastContainer = document.getElementById('toast-container');
  const unsavedOverlay = document.getElementById('unsavedOverlay');
  const saveNowBtn = document.getElementById('saveNowBtn');
  const resourceFileInput = document.getElementById('resourceFileInput');
  const uploadStatus = document.getElementById('uploadStatus');
  const resourceList = document.getElementById('resourceList');
  const supervisorStrictness = document.getElementById('supervisorStrictness');
  const supervisorProfession = document.getElementById('supervisorProfession');
  const resourceToggleBtn = document.getElementById('resourceToggleBtn');
  const resourcesPanel = document.getElementById('resourcesPanel');
  const backToChaptersBtn = document.getElementById('backToChaptersBtn');
  const floatingScrollBtn = document.getElementById('floatingScrollBtn');
  const defaultPromptsBar = document.getElementById('defaultPromptsBar');
  const defaultPromptsScroll = document.getElementById('defaultPromptsScroll');

  // Generation options
  const wordCountSelect = document.getElementById('wordCountSelect');
  const customWordCountInput = document.getElementById('customWordCount');
  const referenceStyleSelect = document.getElementById('referenceStyleSelect');
  const exportScopeSelect = document.getElementById('exportScopeSelect');

  // Rich text formatting buttons
  const formatBtns = document.querySelectorAll('.format-btn');
  const fontFamilySelect = document.getElementById('fontFamilySelect');
  const fontSizeSelect = document.getElementById('fontSizeSelect');

  // ===== State =====
  let currentUser = null;
  let scopeUid = null;
  let projects = {};
  let currentProjectId = null;
  let currentProject = null;
  let currentChapter = null;
  let currentSection = null;
  let humanizeMode = false;
  let resources = [];
  let supervisorPersonality = { strictness: 'moderate', profession: 'Academic Supervisor' };
  let aiConfig = { token: null, endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-v4-flash' };
  let aiAbortController = null;
  let autoSaveTimer = null;
  let unsavedChanges = false;
  let chapterGenerationActive = false;
  let typingIndicator = null;
  const database = firebase.database();

  // Plan gating state
  let currentPlan = 'free';
  let projectCreationCount = 0;
  let creationResetDate = null;
  const FREE_PROJECT_LIMIT = 1;
  const LIMIT_DAYS = 30;

  // =========================================================================
  // NATURAL PUNCTUATION RULES
  // =========================================================================
  const PUNCTUATION_RULES = `PUNCTUATION RULES - STRICT ENFORCEMENT:
1. Use ONLY natural punctuation: periods (.), commas (,), colons (:), semicolons (;), question marks (?), exclamation marks (!), parentheses (), quotation marks (""), and apostrophes (').
2. NEVER use em dashes or en dashes or any special dash characters. Use commas or semicolons instead.
3. NEVER use ellipsis characters. Use three periods (...) if absolutely necessary, but prefer complete sentences.
4. Use commas naturally, as a human would when pausing in speech. Do not overuse them.
5. Use periods to end sentences. Keep sentences at a natural length, not too short, not too long.
6. Use question marks only for actual questions, not rhetorical ones unless they fit naturally.
7. Colons should introduce lists or explanations. Semicolons should connect related independent clauses sparingly.
8. Avoid excessive punctuation of any kind. If a sentence works without a comma, leave it out.
9. Write as a human would type, natural, flowing, with occasional minor imperfections in punctuation that make it feel real.
10. Parentheses should be used sparingly for brief clarifications only.`;

  // =========================================================================
  // ERROR REPORTER
  // =========================================================================
  function reportError(error, context) {
    context = context || '';
    const timestamp = new Date().toISOString();
    const errorDetails = {
      message: error.message || String(error),
      stack: error.stack || 'No stack trace',
      context: context,
      timestamp: timestamp,
      user: currentUser ? currentUser.email : 'anonymous',
      projectId: currentProjectId || 'none'
    };
    
    console.error('[ERROR][' + timestamp + '] ' + context + ':', errorDetails);
    
    if (currentUser && scopeUid) {
      try {
        database.ref('errorLogs/' + scopeUid).push({
          message: errorDetails.message,
          stack: errorDetails.stack,
          context: errorDetails.context,
          timestamp: errorDetails.timestamp,
          userAgent: navigator.userAgent
        }).catch(function() {});
      } catch (e) {
        console.warn('Could not log error to Firebase:', e);
      }
    }
    
    if (!error.message || !error.message.includes('AbortError')) {
      const userMessage = getErrorMessage(error, context);
      showToast(userMessage, 'error', 5000);
    }
  }

  function getErrorMessage(error, context) {
    const msg = (error.message || '').toLowerCase();
    
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')) {
      return 'Network error. Please check your connection and try again.';
    }
    if (msg.includes('permission') || msg.includes('unauthorized')) {
      return 'You do not have permission to perform this action.';
    }
    if (msg.includes('quota') || msg.includes('rate limit')) {
      return 'Too many requests. Please wait a moment and try again.';
    }
    if (msg.includes('api') || msg.includes('token')) {
      return 'AI service temporarily unavailable. Please try again later.';
    }
    if (context.includes('save')) {
      return 'Failed to save your work. Please try again.';
    }
    if (context.includes('generate')) {
      return 'Content generation failed. Please try again.';
    }
    
    return 'An error occurred' + (context ? ' during ' + context : '') + '. Please try again.';
  }

  // =========================================================================
  // PLAN GATING FUNCTIONS
  // =========================================================================
  function loadPlanData() {
    try {
      const data = JSON.parse(localStorage.getItem('rehab_project_plan_data') || '{}');
      projectCreationCount = data.count || 0;
      creationResetDate = data.resetDate ? new Date(data.resetDate) : null;
      const now = new Date();
      if (!creationResetDate || (now - creationResetDate) >= LIMIT_DAYS * 86400000) {
        projectCreationCount = 0;
        creationResetDate = now;
        savePlanData();
      }
    } catch (e) {
      projectCreationCount = 0;
      creationResetDate = new Date();
      savePlanData();
    }
  }

  function savePlanData() {
    localStorage.setItem('rehab_project_plan_data', JSON.stringify({
      count: projectCreationCount,
      resetDate: creationResetDate ? creationResetDate.toISOString() : new Date().toISOString()
    }));
  }

  function canCreateProject() {
    if (currentPlan === 'student' || currentPlan === 'pro') return true;
    loadPlanData();
    const now = new Date();
    if (!creationResetDate || (now - creationResetDate) >= LIMIT_DAYS * 86400000) {
      projectCreationCount = 0;
      creationResetDate = now;
      savePlanData();
      return true;
    }
    return projectCreationCount < FREE_PROJECT_LIMIT;
  }

  function incrementProjectCount() {
    if (currentPlan === 'student' || currentPlan === 'pro') return;
    projectCreationCount++;
    savePlanData();
    updatePlanUI();
  }

  function canAccessAISupervisor() {
    return currentPlan === 'student' || currentPlan === 'pro';
  }

  function canGenerateChapter(chapterKey) {
    if (currentPlan === 'student' || currentPlan === 'pro') return true;
    return chapterKey === 'chapter1';
  }

  function canRegenerate() {
    return currentPlan === 'student' || currentPlan === 'pro';
  }

  function canAccessResources() {
    return currentPlan === 'student' || currentPlan === 'pro';
  }

  function canAccessDeepScan() {
    return currentPlan === 'student' || currentPlan === 'pro';
  }

  function canUseCustomOutline() {
    return currentPlan === 'student' || currentPlan === 'pro';
  }

  function getDaysUntilReset() {
    if (!creationResetDate) return 0;
    const now = new Date();
    const diffTime = LIMIT_DAYS * 86400000 - (now - creationResetDate);
    return Math.max(0, Math.ceil(diffTime / 86400000));
  }

  function goToSubscription() {
    window.location.href = 'sub.html';
  }

  // =========================================================================
  // PLAN UI
  // =========================================================================
  function updatePlanUI() {
    updateChapterGenButton();

    if (badgeFree && badgePremium) {
      if (canAccessDeepScan()) {
        badgeFree.style.display = 'none';
        badgePremium.style.display = 'inline-flex';
      } else {
        badgeFree.style.display = 'inline-block';
        badgePremium.style.display = 'none';
      }
    }

    updateSupervisorAccess();

    const existingNotice = document.getElementById('projectPlanNotice');
    if (existingNotice) existingNotice.remove();

    if (currentPlan !== 'student' && currentPlan !== 'pro') {
      const notice = document.createElement('div');
      notice.id = 'projectPlanNotice';
      const remaining = FREE_PROJECT_LIMIT - projectCreationCount;
      const daysLeft = getDaysUntilReset();

      notice.style.cssText = 'background: #fef3c7; border: 2px solid #fbbf24; border-radius: 1rem; padding: 0.8rem 1rem; margin: 0 0 0.75rem 0; text-align: center; font-size: 0.82rem; color: #92400e; animation: fadeIn 0.4s ease;';

      notice.innerHTML = '<div style="font-weight: 600; font-size: 0.9rem; margin-bottom: 0.25rem;">Free Plan</div>' +
        '<div style="margin-bottom: 0.25rem; font-size: 0.78rem;"><strong>' + FREE_PROJECT_LIMIT + '</strong> project/month, Chapter 1 only, No AI Supervisor</div>' +
        (remaining <= 0 ? '<div style="color: #dc2626; font-size: 0.75rem; margin-bottom: 0.3rem;">Resets in <strong>' + daysLeft + '</strong> days</div>' : '') +
        '<button id="upgradeProjectBtn" style="margin-top: 0.3rem; padding: 0.4rem 1.2rem; border-radius: 2rem; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; cursor: pointer; font-weight: 600; font-size: 0.8rem; transition: all 0.2s ease; font-family: inherit;">Upgrade for Full Access</button>';

      const historyContent = document.getElementById('historyList');
      if (historyContent && historyContent.parentElement) {
        historyContent.parentElement.insertBefore(notice, historyContent);
      }

      const upgradeBtn = document.getElementById('upgradeProjectBtn');
      if (upgradeBtn) {
        upgradeBtn.addEventListener('click', goToSubscription);
      }
    }
  }

  // =========================================================================
  // HELPERS
  // =========================================================================
  function showToast(message, type, duration) {
    type = type || 'success';
    duration = duration || 3500;
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(function() {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(function() { toast.remove(); }, 300);
    }, duration);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
      return m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;';
    });
  }

  async function fetchTokens() {
    try {
      const snap = await database.ref('tokens/deepseek').once('value');
      const data = snap.val();
      if (data && data.api_key) {
        aiConfig.token = data.api_key;
        console.log('DeepSeek API loaded');
        return true;
      }
      console.warn('DeepSeek API key missing');
      return false;
    } catch (error) {
      reportError(error, 'token fetch');
      return false;
    }
  }

  function extractPlainText(html) {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }

  function extractKeyTerms(text) {
    const terms = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) || [];
    const unique = [...new Set(terms)].filter(function(t) { return t.length > 10 && t.length < 80; });
    return unique.slice(0, 8);
  }

  async function readFileAsText(file) {
    return new Promise(function(resolve, reject) {
      const reader = new FileReader();
      reader.onload = function(e) { resolve(e.target.result); };
      reader.onerror = function(e) { reject(new Error('File read failed')); };
      
      if (file.type === 'application/pdf') {
        resolve('[PDF file: ' + file.name + ' - Full text extraction requires server-side processing. Basic metadata only.]');
      } else {
        reader.readAsText(file);
      }
    });
  }

  // =========================================================================
  // RICH TEXT FORMATTING
  // =========================================================================
  function execFormatCmd(command, value) {
    if (value === undefined) value = null;
    document.execCommand(command, false, value);
    sectionEditor.focus();
  }

  formatBtns.forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      const cmd = btn.dataset.command;
      if (cmd === 'createLink') {
        const url = prompt('Enter URL:', 'https://');
        if (url) execFormatCmd('createLink', url);
      } else if (cmd === 'unlink') {
        execFormatCmd('unlink');
      } else if (cmd === 'undo') {
        document.execCommand('undo');
        sectionEditor.focus();
      } else if (cmd === 'redo') {
        document.execCommand('redo');
        sectionEditor.focus();
      } else {
        execFormatCmd(cmd);
      }
    });
  });

  if (fontFamilySelect) fontFamilySelect.addEventListener('change', function() { execFormatCmd('fontName', fontFamilySelect.value); });
  if (fontSizeSelect) fontSizeSelect.addEventListener('change', function() { execFormatCmd('fontSize', fontSizeSelect.value); });

  // =========================================================================
  // CONTEXT MEMORY
  // =========================================================================
  function buildResourceContext() {
    if (!resources || resources.length === 0) return '';
    
    return '\n\nUPLOADED RESOURCES (Use these as authoritative sources):\n' + 
      resources.map(function(r, i) { 
        return 'RESOURCE ' + (i + 1) + ' - "' + r.name + '":\n' + r.analysis + '\n';
      }).join('\n');
  }

  function buildContextSummary() {
    const summary = [];

    if (currentProject) {
      summary.push('PROJECT TITLE: "' + currentProject.title + '"');
      summary.push('DEPARTMENT: ' + (currentProject.department || 'Healthcare'));
      summary.push('PROJECT TYPE: ' + (currentProject.type || 'Academic Project'));
      summary.push('RESEARCH APPROACH: ' + (currentProject.approach === 'qualitative' ? 'Qualitative (Case Study)' : 'Quantitative'));
      summary.push('WRITING PROFILE: ' + (currentProject.writingProfile || 'undergraduate'));
    }

    if (!currentProject || !currentProject.chapters) return summary.join('\n');

    const ch1 = currentProject.chapters.chapter1;
    if (ch1) {
      const background = extractPlainText(ch1.sections ? ch1.sections[0] : '');
      const statement = extractPlainText(ch1.sections ? ch1.sections[1] : '');
      const objectives = extractPlainText(ch1.sections ? ch1.sections[2] : '');
      const questions = extractPlainText(ch1.sections ? ch1.sections[3] : '');
      const significance = extractPlainText(ch1.sections ? ch1.sections[4] : '');
      if (background) summary.push('BACKGROUND: ' + background.substring(0, 800));
      if (statement) summary.push('PROBLEM STATEMENT: ' + statement.substring(0, 600));
      if (objectives) summary.push('AIM & OBJECTIVES: ' + objectives.substring(0, 600));
      if (questions) summary.push('RESEARCH QUESTIONS: ' + questions.substring(0, 500));
      if (significance) summary.push('SIGNIFICANCE: ' + significance.substring(0, 400));
    }

    const ch2 = currentProject.chapters.chapter2;
    if (ch2) {
      const framework = extractPlainText(ch2.sections ? ch2.sections[0] : '');
      const empirical = extractPlainText(ch2.sections ? ch2.sections[1] : '');
      const conceptual = extractPlainText(ch2.sections ? ch2.sections[2] : '');
      if (framework) summary.push('THEORETICAL FRAMEWORK: ' + framework.substring(0, 600));
      if (empirical) summary.push('EMPIRICAL REVIEW KEY POINTS: ' + empirical.substring(0, 500));
      if (conceptual) summary.push('CONCEPTUAL FRAMEWORK: ' + conceptual.substring(0, 400));
    }

    const ch3 = currentProject.chapters.chapter3;
    if (ch3) {
      const design = extractPlainText(ch3.sections ? ch3.sections[0] : '');
      const population = extractPlainText(ch3.sections ? ch3.sections[1] : '');
      const sampling = extractPlainText(ch3.sections ? ch3.sections[2] : '');
      const instrument = extractPlainText(ch3.sections ? ch3.sections[3] : '');
      const dataCollect = extractPlainText(ch3.sections ? ch3.sections[4] : '');
      const dataAnalysis = extractPlainText(ch3.sections ? ch3.sections[5] : '');
      if (design) summary.push('RESEARCH DESIGN (MUST MATCH IN ALL CHAPTERS): ' + design.substring(0, 500));
      if (population) summary.push('POPULATION & SAMPLE SIZE (USE THESE EXACT NUMBERS IN CHAPTERS 4 & 5): ' + population.substring(0, 600));
      if (sampling) summary.push('SAMPLING TECHNIQUE: ' + sampling.substring(0, 400));
      if (instrument) summary.push('INSTRUMENTS/TOOLS (MUST MATCH IN RESULTS & DISCUSSION): ' + instrument.substring(0, 500));
      if (dataCollect) summary.push('DATA COLLECTION PROCEDURE: ' + dataCollect.substring(0, 400));
      if (dataAnalysis) summary.push('DATA ANALYSIS METHOD: ' + dataAnalysis.substring(0, 400));
    }

    const ch4 = currentProject.chapters.chapter4;
    if (ch4) {
      const dataPres = extractPlainText(ch4.sections ? ch4.sections[0] : (ch4.content || ''));
      const analysis = extractPlainText(ch4.sections ? ch4.sections[1] : '');
      const interp = extractPlainText(ch4.sections ? ch4.sections[2] : '');
      if (dataPres) summary.push('RESULTS - DATA PRESENTATION (must be consistent with Discussion): ' + dataPres.substring(0, 700));
      if (analysis) summary.push('RESULTS - ANALYSIS (do not contradict these findings): ' + analysis.substring(0, 500));
      if (interp) summary.push('RESULTS - INTERPRETATION: ' + interp.substring(0, 400));
    }

    const allText = extractPlainText(JSON.stringify(currentProject.chapters));
    const numberPatterns = allText.match(/\bn\s*=\s*\d+|\d+\s*participants?|\d+\s*patients?|\d+\.\d+\s*\(SD[\s=]*[\d.]+\)|\bp\s*[<=>]\s*[\d.]+|mean\s*(?:score\s*)?(?:was|of|=)\s*[\d.]+/gi) || [];
    const uniqueNumbers = [...new Set(numberPatterns.map(function(s) { return s.trim(); }))].slice(0, 15);
    if (uniqueNumbers.length > 0) {
      summary.push('CONSISTENCY CRITICAL - USE THESE EXACT FIGURES (do not invent or change any): ' + uniqueNumbers.join(' | '));
    }

    const keyTerms = extractKeyTerms(allText);
    if (keyTerms.length > 0) {
      summary.push('KEY TERMS (use consistently, same spelling throughout): ' + keyTerms.join(', '));
    }

    const resourceContext = buildResourceContext();
    if (resourceContext) {
      summary.push(resourceContext);
    }

    return summary.join('\n\n');
  }

  // =========================================================================
  // CONSISTENCY CHECKER
  // =========================================================================
  function checkConsistency() {
    if (!currentProject || !currentProject.chapters) return;

    const allText = extractPlainText(JSON.stringify(currentProject.chapters));
    const sampleMatches = allText.match(/\bn\s*=\s*(\d+)/gi) || [];
    const sizes = [...new Set(sampleMatches.map(function(m) { return m.replace(/\s/g, '').toLowerCase(); }))];
    if (sizes.length > 1) {
      showToast('Sample size conflict detected: ' + sizes.join(', ') + ' found across chapters. Fix before submission.', 'warning', 7000);
    }

    const participantMatches = allText.match(/(\d+)\s*participants?/gi) || [];
    const pCounts = [...new Set(participantMatches.map(function(m) { return m.replace(/\s/g, '').toLowerCase(); }))];
    if (pCounts.length > 1) {
      showToast('Participant count conflict: ' + pCounts.join(', ') + ' found. Ensure all chapters use the same number.', 'warning', 7000);
    }
  }

  // =========================================================================
  // HUMANIZATION ENGINE
  // =========================================================================
  function buildHumanizationPrompt() {
    return 'HUMANIZATION REQUIREMENTS - READ ALL CAREFULLY:\n\n' +
      '1. SENTENCE VARIETY (most important signal of human writing):\n' +
      '   - Mix sentence lengths naturally: some short (under 10 words), most medium (15-25 words), occasional long (30+).\n' +
      '   - Do NOT start consecutive sentences with the same word or phrase.\n' +
      '   - Vary paragraph length: some only 2 sentences, some up to 6.\n' +
      '   - Occasionally use a question to transition between ideas.\n\n' +
      '2. VOCABULARY:\n' +
      '   - Use natural clinical language, how a healthcare professional actually talks, not how a textbook reads.\n' +
      '   - BANNED words/phrases (never use these): moreover, furthermore, notably, consequently, thus, hence, therein, hereby, whereby, aforementioned, it is imperative, it should be noted that, it is worth mentioning, the findings revealed that, the results indicated that, it can be argued that, it is evident that, needless to say, it must be emphasized.\n' +
      '   - Prefer direct simple verbs: "shows" not "demonstrates", "helps" not "facilitates", "used" not "utilized", "about" not "pertaining to", "end" not "culminate".\n\n' +
      '3. STUDENT VOICE - SPECIFIC PERSONAL TOUCHES:\n' +
      '   - Include 1-2 genuine personal reflections grounded in a SPECIFIC clinical detail.\n' +
      '   - Each reflection must be DIFFERENT in phrasing and situation, never reuse the same opener.\n' +
      '   - Good examples: "At LUTH, I remember a patient who...", "One thing that surprised me during my clinicals was...", "My supervisor once pointed out that...", "A patient I worked with during my rotation..."\n' +
      '   - BAD (never use these exact phrases): "I found this particularly relevant because in my clinical experience", "But there is more to it than that", "What this means is" (as a paragraph opener, more than once), "It is hard to say for sure, but", "Basically," more than once.\n\n' +
      '4. CRITICAL - ZERO REPETITIVE TEMPLATES:\n' +
      '   - If a transitional phrase appears once, it must NOT appear again in the same document.\n' +
      '   - Do not end multiple paragraphs with summary-style sentences that restate the paragraph.\n' +
      '   - Do not begin multiple paragraphs with "So," or "So what does this mean?"\n' +
      '   - Each paragraph must open differently from the previous one.\n\n' +
      '5. NATURAL IMPERFECTION (subtle, not mechanical):\n' +
      '   - One slightly informal sentence per 4-5 paragraphs is fine.\n' +
      '   - One genuine digression that comes back to the point adds authenticity.\n' +
      '   - Do NOT inject imperfections artificially on every paragraph, that pattern is itself an AI tell.\n\n' +
      '6. NIGERIAN HEALTHCARE CONTEXT (where relevant):\n' +
      '   - Reference local settings and challenges naturally, not as a box-ticking exercise.\n' +
      '   - Only mention Nigerian context where it genuinely adds meaning to the argument.\n\n' +
      PUNCTUATION_RULES;
  }

  // =========================================================================
  // STUDENT WRITING PROFILES
  // =========================================================================
  function getProfileGuidance(profile) {
    const profiles = {
      undergraduate: '- Vocabulary: Basic to intermediate clinical terminology\n- Sentence complexity: Moderate, mix of simple and compound sentences\n- Tone: Curious, still learning, occasionally uncertain\n- Style: Explains concepts as if still understanding them\n- Occasional minor errors in advanced terminology are acceptable',
      final_year: '- Vocabulary: Solid clinical terminology, some advanced concepts\n- Sentence complexity: Good variety, occasional complex sentences\n- Tone: Confident but not expert-level\n- Style: Demonstrates growing clinical reasoning\n- Shows integration of theory and practice',
      msc: '- Vocabulary: Advanced clinical and research terminology\n- Sentence complexity: Sophisticated with clear logical flow\n- Tone: Confident, analytical\n- Style: Evidence-based reasoning, critical analysis\n- Demonstrates deep understanding of research methodology',
      phd: '- Vocabulary: Expert-level, specialized terminology\n- Sentence complexity: Highly sophisticated, nuanced argumentation\n- Tone: Scholarly, authoritative\n- Style: Original critical thinking, theoretical depth\n- Demonstrates contribution to knowledge',
      nigerian_ug: '- Vocabulary: Nigerian English academic style\n- Sentence complexity: Moderate, with local academic expressions\n- Tone: Respectful, slightly formal with local flavor\n- Style: Nigerian undergraduate writing patterns\n- May include references to Nigerian healthcare system\n- Uses expressions like "in the Nigerian context", "our healthcare system"\n- Occasional British English spellings (colour, organise)'
    };
    return profiles[profile] || profiles.undergraduate;
  }

  // =========================================================================
  // AI DETECTION SCORING
  // =========================================================================
  function calculateHumanizationScore(htmlContent) {
    const text = extractPlainText(htmlContent);
    if (!text || text.length < 100) return null;

    const sentences = text.split(/[.!?]+/).filter(function(s) { return s.trim().length > 5; });
    if (sentences.length < 5) return null;

    const lengths = sentences.map(function(s) { return s.trim().split(/\s+/).length; });
    const avgLength = lengths.reduce(function(a, b) { return a + b; }, 0) / lengths.length;
    const variance = lengths.reduce(function(sum, len) { return sum + Math.pow(len - avgLength, 2); }, 0) / lengths.length;
    const stdDev = Math.sqrt(variance);
    const variationScore = Math.min(100, Math.round((stdDev / (avgLength || 1)) * 100));

    const bannedPhrases = [
      'moreover', 'furthermore', 'notably', 'consequently', 'thus', 'hence',
      'therein', 'hereby', 'whereby', 'aforementioned', 'heretofore',
      'in conclusion', 'it is imperative to note', 'it is worth mentioning',
      'it should be noted that', 'as previously stated', 'in summary',
      'the findings revealed that', 'the results indicated that',
      'it can be argued that', 'it is evident that', 'needless to say',
      'but there is more to it than that',
      'i found this particularly relevant',
      'what this means is',
      'it is hard to say for sure'
    ];

    let predictablePatterns = 0;
    const totalSentences = sentences.length;

    bannedPhrases.forEach(function(phrase) {
      const regex = new RegExp(phrase, 'gi');
      const matches = text.match(regex);
      if (matches) predictablePatterns += matches.length;
    });

    const starts = sentences.map(function(s) { return s.trim().split(/\s+/).slice(0, 2).join(' ').toLowerCase(); });
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
      /but there is more to it than that/gi,
      /i found this particularly relevant/gi
    ];

    let aiIndicatorCount = 0;
    aiIndicators.forEach(function(pattern) {
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

  function deepScanContent(html) {
    const text = extractPlainText(html);
    if (!text || text.length < 200) return null;

    const sentences = text.split(/[.!?]+/).filter(function(s) { return s.trim().length > 5; });
    const words = text.split(/\s+/).filter(function(w) { return w.length > 1; });
    const uniqueWords = new Set(words.map(function(w) { return w.toLowerCase().replace(/[^a-z]/g, ''); }));
    
    const lengths = sentences.map(function(s) { return s.length; });
    const meanLen = lengths.reduce(function(a, b) { return a + b; }, 0) / lengths.length;
    const variance = lengths.reduce(function(s, l) { return s + Math.pow(l - meanLen, 2); }, 0) / lengths.length;
    const burstiness = meanLen > 0 ? Math.sqrt(variance) / meanLen : 0;

    const freqMap = {};
    words.forEach(function(w) { 
      const c = w.toLowerCase().replace(/[^a-z]/g, '');
      if (c.length > 1) freqMap[c] = (freqMap[c] || 0) + 1; 
    });
    const sortedFreqs = Object.values(freqMap).sort(function(a, b) { return b - a; });
    let rankSum = 0;
    let wordCount = 0;
    words.forEach(function(w) {
      const c = w.toLowerCase().replace(/[^a-z]/g, '');
      if (c.length > 1 && freqMap[c]) {
        const rank = sortedFreqs.indexOf(freqMap[c]) + 1;
        rankSum += rank;
        wordCount++;
      }
    });
    const avgRank = wordCount > 0 ? rankSum / wordCount : 500;

    const ttr = words.length > 0 ? uniqueWords.size / words.length : 0;

    const aiPhrases = /(moreover|furthermore|consequently|thus|hence|it is important to note|it is worth mentioning|the results indicated that|in conclusion|as previously stated|it can be argued that|it is evident that|in light of the foregoing|first and foremost|last but not least|it should be noted|it must be emphasized|as a matter of fact|in other words|to put it simply)/gi;
    const aiCount = (text.match(aiPhrases) || []).length;

    const starters = sentences.map(function(s) {
      const words = s.trim().split(/\s+/).slice(0, 2).join(' ').toLowerCase();
      return words;
    });
    const uniqueStarters = new Set(starters).size;
    const starterVariety = sentences.length > 0 ? uniqueStarters / sentences.length : 0;

    const humanScore = Math.min(100, Math.round(
      (1 - Math.min(burstiness, 1.5) / 1.5) * 20 +
      (ttr > 0.75 ? 25 : ttr * 33) +
      (1 - Math.min(avgRank / 1500, 1)) * 15 +
      (starterVariety > 0.6 ? 20 : starterVariety * 33) +
      (1 - Math.min(aiCount / Math.max(sentences.length, 1), 1)) * 20
    ));

    return {
      score: Math.max(0, humanScore),
      details: {
        burstiness: Math.round(burstiness * 100) / 100,
        ttr: Math.round(ttr * 100) / 100,
        avgRank: Math.round(avgRank),
        aiCount: aiCount,
        starterVariety: Math.round(starterVariety * 100) / 100,
        sentenceCount: sentences.length
      }
    };
  }

  function displayHumanizationScore() {
    if (!aiScoreDisplay) return;

    if (canAccessDeepScan()) {
      const deep = deepScanContent(sectionEditor.innerHTML);
      if (deep && deep.details.sentenceCount >= 5) {
        aiScoreDisplay.style.display = 'block';
        if (humanizationScoreEl) humanizationScoreEl.textContent = deep.score + '%';
        if (scoreFillEl) {
          scoreFillEl.style.width = deep.score + '%';
          scoreFillEl.style.background = deep.score >= 70 ? '#10b981' : deep.score >= 50 ? '#f59e0b' : '#dc2626';
        }
        if (scoreSentenceVarEl) scoreSentenceVarEl.textContent = 'Burstiness: ' + deep.details.burstiness;
        if (scorePredictabilityEl) scorePredictabilityEl.textContent = 'Vocabulary: ' + deep.details.ttr;
        if (scoreAILikelyEl) scoreAILikelyEl.textContent = 'AI Patterns: ' + deep.details.aiCount;
        if (badgeFree) badgeFree.style.display = 'none';
        if (badgePremium) badgePremium.style.display = 'inline-flex';
      } else {
        aiScoreDisplay.style.display = 'none';
      }
    } else {
      const score = calculateHumanizationScore(sectionEditor.innerHTML);
      if (score && score.sentenceCount >= 5) {
        aiScoreDisplay.style.display = 'block';
        if (humanizationScoreEl) humanizationScoreEl.textContent = score.overall + '%';
        if (scoreFillEl) {
          scoreFillEl.style.width = score.overall + '%';
          scoreFillEl.style.background = score.overall >= 70 ? '#10b981' : score.overall >= 50 ? '#f59e0b' : '#dc2626';
        }
        if (scoreSentenceVarEl) scoreSentenceVarEl.textContent = 'Sentence Variation: ' + score.variation + '%';
        if (scorePredictabilityEl) scorePredictabilityEl.textContent = 'Predictability: ' + score.predictability + '%';
        if (scoreAILikelyEl) scoreAILikelyEl.textContent = 'AI-Likelihood: ' + score.aiLikelihood + '%';
        if (badgeFree) badgeFree.style.display = 'inline-block';
        if (badgePremium) badgePremium.style.display = 'none';
      } else {
        aiScoreDisplay.style.display = 'none';
      }
    }
  }

  // =========================================================================
  // VERSION HISTORY
  // =========================================================================
  const MAX_VERSIONS = 10;

  async function saveVersion() {
    if (!currentProject || !currentChapter) return;

    saveCurrentSection();

    const ch = getChaptersStructure()[currentChapter];
    const content = ch && ch.sections && ch.sections.length > 0
      ? currentProject.chapters[currentChapter].sections[currentSection]
      : currentProject.chapters[currentChapter].content;

    if (!content || content.trim().length < 50) return;

    if (!currentProject._versions) currentProject._versions = {};
    if (!currentProject._versions[currentChapter]) currentProject._versions[currentChapter] = {};
    if (!currentProject._versions[currentChapter][currentSection]) {
      currentProject._versions[currentChapter][currentSection] = [];
    }

    const versions = currentProject._versions[currentChapter][currentSection];

    if (versions.length > 0 && versions[0].content === content) return;

    versions.unshift({
      content: content,
      timestamp: Date.now(),
      date: new Date().toLocaleString()
    });

    if (versions.length > MAX_VERSIONS) versions.length = MAX_VERSIONS;

    await saveToFirebase();
    updateVersionList();
  }

  function updateVersionList() {
    if (!versionList || !currentProject || !currentProject._versions) return;

    const versions = (currentProject._versions[currentChapter] || {})[currentSection] || [];

    if (versions.length === 0) {
      versionList.innerHTML = '<small style="color:var(--text-secondary);">No previous versions</small>';
      return;
    }

    versionList.innerHTML = versions.map(function(v, i) {
      return '<div class="version-item"><span>' + v.date + '</span><button class="restore-version-btn" data-index="' + i + '">Restore</button></div>';
    }).join('');

    document.querySelectorAll('.restore-version-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        const index = parseInt(e.target.dataset.index);
        restoreVersion(index);
      });
    });
  }

  function restoreVersion(index) {
    const versions = currentProject && currentProject._versions ? (currentProject._versions[currentChapter] || {})[currentSection] : null;
    if (!versions || !versions[index]) return;

    if (!confirm('Restore this version? Current content will be saved as a new version first.')) return;

    saveVersion();

    sectionEditor.innerHTML = versions[index].content;
    saveCurrentSection();
    saveToFirebase();
    displayHumanizationScore();
    updateVersionList();
    showToast('Version restored', 'success');
  }

  if (saveVersionBtn) {
    saveVersionBtn.addEventListener('click', function() {
      saveVersion();
      showToast('Version saved', 'success');
    });
  }

  // =========================================================================
  // HUMANIZE CHECKBOX & MODAL
  // =========================================================================
  if (humanizeCheckbox) {
    humanizeCheckbox.addEventListener('change', function(e) {
      if (e.target.checked) {
        humanizeWarningModal.classList.add('active');
        humanizeCheckbox.checked = false;
      } else {
        humanizeMode = false;
        showToast('Humanization disabled', 'info', 2000);
      }
    });
  }

  if (closeHumanizeWarning) closeHumanizeWarning.addEventListener('click', function() { humanizeWarningModal.classList.remove('active'); });
  if (cancelHumanizeBtn) cancelHumanizeBtn.addEventListener('click', function() { humanizeWarningModal.classList.remove('active'); });
  
  if (confirmHumanizeBtn) {
    confirmHumanizeBtn.addEventListener('click', function() {
      humanizeMode = true;
      humanizeCheckbox.checked = true;
      humanizeWarningModal.classList.remove('active');
      showToast('Humanization enabled. Use at your own risk.', 'warning', 4000);
    });
  }

  // =========================================================================
  // SUPERVISOR PERSONALITY
  // =========================================================================
  if (supervisorStrictness) {
    supervisorStrictness.addEventListener('change', function(e) {
      supervisorPersonality.strictness = e.target.value;
      if (currentProject) {
        currentProject._supervisorPersonality = supervisorPersonality;
        saveToFirebase();
      }
    });
  }

  if (supervisorProfession) {
    supervisorProfession.addEventListener('input', function(e) {
      supervisorPersonality.profession = e.target.value || 'Academic Supervisor';
      if (currentProject) {
        currentProject._supervisorPersonality = supervisorPersonality;
        saveToFirebase();
      }
    });
  }

  // =========================================================================
  // MODIFICATION AREA TOGGLE
  // =========================================================================
  function updateModificationArea() {
    if (!currentProject || !currentChapter) {
      if (modificationArea) modificationArea.style.display = 'none';
      return;
    }

    const ch = getChaptersStructure()[currentChapter];
    let hasContent = false;

    if (ch && ch.sections && ch.sections.length > 0) {
      hasContent = currentProject.chapters && currentProject.chapters[currentChapter] && 
                   currentProject.chapters[currentChapter].sections && 
                   (currentProject.chapters[currentChapter].sections[currentSection] || '').trim().length > 0;
    } else if (ch) {
      hasContent = currentProject.chapters && currentProject.chapters[currentChapter] && 
                   (currentProject.chapters[currentChapter].content || '').trim().length > 0;
    }

    if (modificationArea) {
      modificationArea.style.display = hasContent ? 'block' : 'none';
    }

    if (aiGenerateSectionBtn) {
      aiGenerateSectionBtn.innerHTML = hasContent
        ? '<i class="fas fa-redo"></i> Regenerate Section'
        : '<i class="fas fa-magic"></i> AI Generate This Section';
    }
  }

  function updateChapterGenButton() {
    if (!aiGenerateChapterBtn) return;
    
    if (!canAccessResources()) {
      aiGenerateChapterBtn.style.display = 'none';
      return;
    }
    
    if (!currentProject || !currentChapter) {
      aiGenerateChapterBtn.style.display = 'none';
      return;
    }
    
    const ch = getChaptersStructure()[currentChapter];
    if (!ch || !ch.sections || ch.sections.length === 0) {
      aiGenerateChapterBtn.style.display = 'none';
      return;
    }
    
    const allFilled = ch.sections.every(function(_, i) {
      return currentProject.chapters && currentProject.chapters[currentChapter] && 
             currentProject.chapters[currentChapter].sections && 
             (currentProject.chapters[currentChapter].sections[i] || '').trim().length > 0;
    });
    
    aiGenerateChapterBtn.style.display = 'inline-flex';
    if (chapterGenBtnText) {
      chapterGenBtnText.textContent = allFilled ? 'Regenerate Entire Chapter' : 'Generate Entire Chapter';
    }
  }

  // =========================================================================
  // GENERATION OPTIONS: Word Count + Reference Style
  // =========================================================================
  if (wordCountSelect) {
    wordCountSelect.addEventListener('change', function() {
      if (wordCountSelect.value === 'custom') {
        customWordCountInput.style.display = 'inline-block';
        customWordCountInput.focus();
      } else {
        customWordCountInput.style.display = 'none';
      }
      if (currentProject) {
        currentProject.wordCountPref = wordCountSelect.value;
        if (wordCountSelect.value === 'custom') {
          currentProject.customWordCount = parseInt(customWordCountInput.value) || 500;
        }
        saveToFirebase();
      }
    });
  }

  if (customWordCountInput) {
    customWordCountInput.addEventListener('change', function() {
      if (currentProject) {
        currentProject.customWordCount = parseInt(customWordCountInput.value) || 500;
        saveToFirebase();
      }
    });
  }

  if (referenceStyleSelect) {
    referenceStyleSelect.addEventListener('change', function() {
      if (currentProject) {
        currentProject.referenceStyle = referenceStyleSelect.value;
        saveToFirebase();
      }
    });
  }

  function getTargetWordCount() {
    if (wordCountSelect.value === 'auto') return null;
    if (wordCountSelect.value === 'custom') {
      const custom = parseInt(customWordCountInput ? customWordCountInput.value : 0, 10);
      if (custom && custom >= 100 && custom <= 5000) return custom;
    }
    return parseInt(wordCountSelect.value, 10) || 500;
  }

  function getReferenceStyle() {
    return referenceStyleSelect ? referenceStyleSelect.value : 'APA 7th';
  }

  // =========================================================================
  // PROJECT MANAGEMENT
  // =========================================================================
  async function loadProjects() {
    if (!currentUser) return;

    try {
      const snap = await database.ref('history/' + scopeUid + '/projects').once('value');
      projects = snap.val() || {};
      renderHistoryList();
      updateProjectSelector();
    } catch (error) {
      reportError(error, 'project load');
    }
  }

  function renderHistoryList() {
    if (!historyList) return;

    const entries = Object.entries(projects).sort(function(a, b) {
      return (b[1].updatedAt || b[1].createdAt || 0) - (a[1].updatedAt || a[1].createdAt || 0);
    });

    if (entries.length === 0) {
      historyList.innerHTML = '<div class="empty-state"><i class="bx bx-folder-open"></i><p>No projects yet</p><small>Create your first academic project</small></div>';
      return;
    }

    historyList.innerHTML = entries.map(function(entry) {
      const id = entry[0];
      const proj = entry[1];
      const date = proj.createdAt ? new Date(proj.createdAt).toLocaleDateString() : 'Unknown date';
      const chStruct = proj._customOutline || (proj.approach === 'qualitative' ? qualitativeChapters : quantitativeChapters);
      let totalSections = 0;
      let completedSections = 0;

      if (proj.chapters) {
        for (const key in chStruct) {
          if (!chStruct.hasOwnProperty(key)) continue;
          const ch = chStruct[key];
          if (ch.sections && ch.sections.length > 0) {
            ch.sections.forEach(function(_, i) {
              totalSections++;
              if (proj.chapters[key] && proj.chapters[key].sections && proj.chapters[key].sections[i] && proj.chapters[key].sections[i].trim().length > 0) completedSections++;
            });
          } else {
            totalSections++;
            if (proj.chapters[key] && proj.chapters[key].content && proj.chapters[key].content.trim().length > 0) completedSections++;
          }
        }
      }

      const progress = totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0;
      const approachLabel = proj.approach === 'qualitative' ? 'Qualitative' : 'Quantitative';
      const hasResources = proj.resources && Object.keys(proj.resources).length > 0;

      return '<div class="history-item" data-id="' + id + '">' +
        '<button class="delete-btn" data-id="' + id + '" title="Delete project"><i class="fas fa-trash-alt"></i></button>' +
        '<span class="history-title">' + (hasResources ? '<i class="fas fa-paperclip" style="font-size:0.7rem; color: var(--project-accent);"></i> ' : '') + escapeHtml(proj.title || 'Untitled Project') + '</span>' +
        '<div class="history-meta">' +
        '<span><i class="far fa-calendar-alt"></i> ' + date + '</span>' +
        '<span>' + escapeHtml(proj.type || 'N/A') + '</span>' +
        '<span>' + approachLabel + '</span>' +
        '<span>' + escapeHtml(proj.department || 'N/A') + '</span>' +
        '</div>' +
        '<div class="progress-bar-mini" style="margin-top: 0.5rem;"><div class="progress-fill" style="width: ' + progress + '%; background: var(--project-accent);"></div></div>' +
        '<small style="color: var(--text-secondary); font-size: 0.7rem;">' + progress + '% complete</small>' +
        '</div>';
    }).join('');

    document.querySelectorAll('.history-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        if (e.target.closest('.delete-btn')) return;
        const id = item.dataset.id;
        switchToProject(id);
        historyDrawer.classList.remove('active');
        document.body.style.overflow = '';
      });
    });

    document.querySelectorAll('.delete-btn').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        e.preventDefault();
        const id = btn.dataset.id;
        if (confirm('Permanently delete this project? This cannot be undone.')) {
          try {
            await database.ref('history/' + scopeUid + '/projects/' + id).remove();
            delete projects[id];

            if (currentProjectId === id) {
              currentProjectId = null;
              currentProject = null;
              sectionEditor.innerHTML = '';
              chaptersList.innerHTML = '';
              currentSectionTitle.textContent = 'Select a section';
              if (modificationArea) modificationArea.style.display = 'none';
              if (aiScoreDisplay) aiScoreDisplay.style.display = 'none';
            }

            renderHistoryList();
            updateProjectSelector();
            showToast('Project deleted', 'success');
          } catch (error) {
            reportError(error, 'project delete');
          }
        }
      });
    });
  }

  function updateProjectSelector() {
    if (!currentProjectSelect) return;

    const ids = Object.keys(projects);
    if (ids.length === 0) {
      currentProjectSelect.innerHTML = '<option value="">No projects</option>';
      return;
    }

    currentProjectSelect.innerHTML = ids.map(function(id) {
      const p = projects[id];
      return '<option value="' + id + '"' + (id === currentProjectId ? ' selected' : '') + '>' + escapeHtml(p.title || 'Untitled') + '</option>';
    }).join('');
  }

  async function switchToProject(id) {
    if (!projects[id]) {
      showToast('Project not found', 'error');
      return;
    }

    if (currentProjectId && currentProject) {
      saveCurrentSection();
      await saveToFirebase();
    }

    currentProjectId = id;
    currentProject = projects[id];
    currentChapter = 'chapter1';
    currentSection = 0;

    if (currentProject._supervisorPersonality) {
      supervisorPersonality = currentProject._supervisorPersonality;
      if (supervisorStrictness) supervisorStrictness.value = supervisorPersonality.strictness;
      if (supervisorProfession) supervisorProfession.value = supervisorPersonality.profession;
    }

    resources = [];
    if (currentProject.resources) {
      for (const rid in currentProject.resources) {
        if (currentProject.resources.hasOwnProperty(rid)) {
          const r = currentProject.resources[rid];
          resources.push({ id: rid, name: r.name, analysis: r.analysis, uploadedAt: r.uploadedAt, size: r.size });
        }
      }
    }
    renderResourceList();

    if (currentProject.wordCountPref && wordCountSelect) {
      wordCountSelect.value = currentProject.wordCountPref;
      if (currentProject.wordCountPref === 'custom') {
        customWordCountInput.style.display = 'inline-block';
        customWordCountInput.value = currentProject.customWordCount || 500;
      } else {
        customWordCountInput.style.display = 'none';
      }
    }
    if (currentProject.referenceStyle && referenceStyleSelect) {
      referenceStyleSelect.value = currentProject.referenceStyle;
    }

    renderChapters();
    loadSectionContent();
    updateProjectSelector();
    updateModificationArea();
    updateVersionList();

    const hasChatHistory = await loadChatHistory();
    if (!hasChatHistory) {
      clearChatHistory();
    }

    showToast('Switched to "' + currentProject.title + '"', 'info');
  }

  async function createNewProject() {
    if (!canCreateProject()) {
      const daysLeft = getDaysUntilReset();
      showToast('Free plan: 1 project/month. You have used yours. Resets in ' + daysLeft + ' days. Upgrade for unlimited.', 'error', 6000);
      goToSubscription();
      return;
    }

    document.getElementById('projectCreateStep1').style.display = 'block';
    document.getElementById('projectCreateStep2').style.display = 'none';
    projectModal.classList.add('active');
    if (projectTitleInput) projectTitleInput.value = '';
    if (projectTypeSelect) projectTypeSelect.selectedIndex = 0;
    if (projectDeptSelect) projectDeptSelect.selectedIndex = 0;
    if (projectApproachSelect) projectApproachSelect.value = 'quantitative';
    if (projectOutlineType) projectOutlineType.value = 'default';
    if (customOutlineInput) customOutlineInput.value = '';
    if (projectTitleInput) projectTitleInput.focus();
  }

  if (nextToOutlineBtn) {
    nextToOutlineBtn.addEventListener('click', function() {
      const title = projectTitleInput ? projectTitleInput.value.trim() : '';
      if (!title) {
        showToast('Please enter a project title', 'error');
        return;
      }

      if (projectOutlineType && projectOutlineType.value === 'custom') {
        if (!canUseCustomOutline()) {
          showToast('Custom outline requires Student plan or higher.', 'error');
          goToSubscription();
          return;
        }
        document.getElementById('projectCreateStep1').style.display = 'none';
        document.getElementById('projectCreateStep2').style.display = 'block';
        
        const approach = projectApproachSelect ? projectApproachSelect.value : 'quantitative';
        const defaultStruct = approach === 'qualitative' ? qualitativeChapters : quantitativeChapters;
        let outlineText = '';
        for (const key in defaultStruct) {
          if (!defaultStruct.hasOwnProperty(key)) continue;
          const ch = defaultStruct[key];
          outlineText += ch.title + '\n';
          if (ch.sections) {
            ch.sections.forEach(function(s) { outlineText += '- ' + s + '\n'; });
          }
          outlineText += '\n';
        }
        customOutlineInput.value = outlineText.trim();
      } else {
        createProjectFromForm();
      }
    });
  }

  if (backToStep1Btn) {
    backToStep1Btn.addEventListener('click', function() {
      document.getElementById('projectCreateStep1').style.display = 'block';
      document.getElementById('projectCreateStep2').style.display = 'none';
    });
  }

  function parseCustomOutline(text) {
    const chapters = {};
    let currentChapterKey = null;
    let chapterIndex = 0;
    
    const lines = text.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;
      
      if (!trimmed.startsWith('-') && !trimmed.startsWith('*')) {
        chapterIndex++;
        currentChapterKey = 'chapter' + chapterIndex;
        chapters[currentChapterKey] = { title: trimmed, sections: [] };
      } else if (currentChapterKey && (trimmed.startsWith('-') || trimmed.startsWith('*'))) {
        const sectionName = trimmed.replace(/^[-*]\s*/, '').trim();
        if (sectionName) {
          chapters[currentChapterKey].sections.push(sectionName);
        }
      }
    }
    
    return Object.keys(chapters).length > 0 ? chapters : null;
  }

  async function createProjectFromForm() {
    const title = projectTitleInput ? projectTitleInput.value.trim() : '';
    if (!title) {
      showToast('Please enter a project title', 'error');
      return;
    }

    const newProject = {
      title: title,
      type: projectTypeSelect ? projectTypeSelect.value : 'Undergraduate Project',
      department: projectDeptSelect ? projectDeptSelect.value : 'Occupational Therapy',
      approach: projectApproachSelect ? projectApproachSelect.value : 'quantitative',
      writingProfile: 'undergraduate',
      wordCountPref: 'auto',
      customWordCount: 500,
      referenceStyle: 'APA 7th',
      chapters: {},
      _versions: {},
      _supervisorPersonality: supervisorPersonality,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    };

    if (projectOutlineType && projectOutlineType.value === 'custom') {
      const customText = customOutlineInput ? customOutlineInput.value.trim() : '';
      if (customText) {
        const parsed = parseCustomOutline(customText);
        if (parsed) {
          newProject._customOutline = parsed;
        }
      }
    }

    try {
      const ref = await database.ref('history/' + scopeUid + '/projects').push(newProject);
      const id = ref.key;
      newProject.id = id;
      projects[id] = newProject;

      if (window.RehablixCenter) {
        window.RehablixCenter.logActivity('project', 'Created project', newProject.title || 'Untitled project').catch(function() {});
      }

      currentProjectId = id;
      currentProject = newProject;
      currentChapter = 'chapter1';
      currentSection = 0;

      incrementProjectCount();

      projectModal.classList.remove('active');
      renderChapters();
      loadSectionContent();
      renderHistoryList();
      updateProjectSelector();
      updateModificationArea();
      clearChatHistory();

      showToast('Project created successfully. Start writing.', 'success');
    } catch (error) {
      reportError(error, 'project creation');
    }
  }

  createProjectBtn.addEventListener('click', createProjectFromForm);
  if (closeProjectModalBtn) closeProjectModalBtn.addEventListener('click', function() { projectModal.classList.remove('active'); });
  if (createNewProjectFromDrawer) createNewProjectFromDrawer.addEventListener('click', function() { historyDrawer.classList.remove('active'); document.body.style.overflow = ''; createNewProject(); });
  if (newProjectBtn) newProjectBtn.addEventListener('click', createNewProject);
  if (currentProjectSelect) currentProjectSelect.addEventListener('change', function(e) { if (e.target.value && e.target.value !== currentProjectId) switchToProject(e.target.value); });
  if (projectModal) projectModal.addEventListener('click', function(e) { if (e.target === projectModal) projectModal.classList.remove('active'); });

  // =========================================================================
  // RESOURCE UPLOAD & MANAGEMENT
  // =========================================================================
  if (resourceFileInput) {
    resourceFileInput.addEventListener('change', async function() {
      if (!canAccessResources()) {
        showToast('Resource upload requires Student plan or higher.', 'error');
        goToSubscription();
        return;
      }
      
      const files = resourceFileInput.files;
      if (!files.length) return;

      if (uploadStatus) uploadStatus.textContent = 'Processing...';

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const text = await readFileAsText(file);
          const analysis = await analyzeResource(text, file.name);
          
          const resourceData = {
            name: file.name,
            analysis: analysis,
            uploadedAt: Date.now(),
            size: file.size
          };

          const ref = await database.ref('history/' + scopeUid + '/projects/' + currentProjectId + '/resources').push(resourceData);
          const resourceId = ref.key;
          
          resources.push({ id: resourceId, name: resourceData.name, analysis: resourceData.analysis, uploadedAt: resourceData.uploadedAt, size: resourceData.size });
          
          if (!currentProject.resources) currentProject.resources = {};
          currentProject.resources[resourceId] = resourceData;
          
        } catch (error) {
          reportError(error, 'resource upload');
          showToast('Failed to process ' + file.name, 'error');
        }
      }

      if (uploadStatus) uploadStatus.textContent = 'Uploaded ' + resources.length + ' resource(s)';
      renderResourceList();
      showToast('Resources processed successfully', 'success');
    });
  }

  async function analyzeResource(text, fileName) {
    if (!aiConfig.token) {
      await fetchTokens();
    }

    const systemPrompt = 'You are an academic research analyzer. Analyze the following document and extract:\n' +
      '1. Key findings and conclusions\n2. Methodology used (if applicable)\n3. Important statistics, numbers, and data points\n' +
      '4. Theoretical frameworks referenced\n5. Key authors and citations\n6. Relevance to healthcare/medical research\n' +
      'Provide a detailed, structured summary that can be used as reference for academic writing.';

    try {
      const response = await fetch(aiConfig.endpoint + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + aiConfig.token },
        body: JSON.stringify({
          model: aiConfig.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: 'Document: ' + fileName + '\n\nContent: ' + text.substring(0, 8000) }
          ],
          max_tokens: 1500,
          temperature: 0.4
        })
      });

      if (!response.ok) throw new Error('Analysis API error');
      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.warn('AI analysis failed, using basic extraction:', error);
      return 'Document: ' + fileName + '\nLength: ' + text.length + ' characters\nFirst 500 chars: ' + text.substring(0, 500) + '...';
    }
  }

  function renderResourceList() {
    if (!resourceList) return;

    if (resources.length === 0) {
      resourceList.innerHTML = '<div class="empty-state" style="padding:1.5rem;"><i class="bx bx-cloud-upload"></i><p style="font-size:0.85rem;">No resources uploaded</p><small>Upload articles, journals, or past projects for AI reference</small></div>';
      return;
    }

    resourceList.innerHTML = resources.map(function(r, i) {
      return '<div class="resource-item">' +
        '<div class="file-icon"><i class="fas fa-file-alt"></i></div>' +
        '<div class="file-info"><div class="file-name">' + escapeHtml(r.name) + '</div><div class="file-date">' + new Date(r.uploadedAt).toLocaleDateString() + '</div></div>' +
        '<button class="delete-resource-btn" data-index="' + i + '" title="Remove resource"><i class="fas fa-times"></i></button>' +
        '</div>';
    }).join('');

    document.querySelectorAll('.delete-resource-btn').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        const index = parseInt(e.target.closest('.delete-resource-btn').dataset.index);
        const resource = resources[index];
        
        if (confirm('Remove "' + resource.name + '"?')) {
          try {
            if (resource.id) {
              await database.ref('history/' + scopeUid + '/projects/' + currentProjectId + '/resources/' + resource.id).remove();
              if (currentProject && currentProject.resources) {
                delete currentProject.resources[resource.id];
              }
            }
            resources.splice(index, 1);
            renderResourceList();
            showToast('Resource removed', 'success');
          } catch (error) {
            reportError(error, 'resource delete');
          }
        }
      });
    });
  }

  // =========================================================================
  // RESOURCES TOGGLE IN SIDEBAR
  // =========================================================================
  if (resourceToggleBtn) {
    resourceToggleBtn.addEventListener('click', function() {
      if (!canAccessResources()) {
        showToast('Resources require Student plan or higher.', 'error');
        goToSubscription();
        return;
      }
      chaptersList.style.display = 'none';
      resourcesPanel.style.display = 'flex';
      document.getElementById('projectSelector').style.display = 'none';
    });
  }

  if (backToChaptersBtn) {
    backToChaptersBtn.addEventListener('click', function() {
      resourcesPanel.style.display = 'none';
      chaptersList.style.display = '';
      document.getElementById('projectSelector').style.display = '';
    });
  }

  // =========================================================================
  // CHAPTERS & SECTIONS (with inline editing)
  // =========================================================================
  function renderChapters() {
    if (!currentProject || !chaptersList) return;

    const chStruct = getChaptersStructure();
    let html = '';

    for (const key in chStruct) {
      if (!chStruct.hasOwnProperty(key)) continue;
      const ch = chStruct[key];
      
      html += '<div class="chapter-item' + (currentChapter === key ? ' active' : '') + '" data-chapter="' + key + '">' +
        '<i class="fas fa-' + (currentChapter === key ? 'folder-open' : 'folder') + '"></i>' +
        '<span class="chapter-title-text">' + escapeHtml(ch.title) + '</span>' +
        '<div class="edit-controls">' +
        '<button class="edit-outline-btn" data-action="rename-chapter" data-chapter="' + key + '" title="Rename"><i class="fas fa-pencil-alt"></i></button>' +
        '<button class="edit-outline-btn" data-action="delete-chapter" data-chapter="' + key + '" title="Delete"><i class="fas fa-trash"></i></button>' +
        '</div>' +
        '</div>';

      if (currentChapter === key && ch.sections && ch.sections.length > 0) {
        ch.sections.forEach(function(sec, i) {
          const hasContent = currentProject.chapters && currentProject.chapters[key] && 
                             currentProject.chapters[key].sections && 
                             currentProject.chapters[key].sections[i] && 
                             currentProject.chapters[key].sections[i].trim().length > 0;
          html += '<div class="section-item' + (currentSection === i ? ' active' : '') + '" data-section="' + i + '" data-chapter="' + key + '">' +
            '<i class="fas fa-' + (hasContent ? 'check-circle' : 'circle') + '" style="font-size: 0.6rem; opacity: ' + (hasContent ? '1' : '0.3') + ';"></i>' +
            '<span class="section-title-text">' + escapeHtml(sec) + '</span>' +
            '<div class="edit-controls">' +
            '<button class="edit-outline-btn" data-action="rename-section" data-chapter="' + key + '" data-section="' + i + '" title="Rename"><i class="fas fa-pencil-alt"></i></button>' +
            '<button class="edit-outline-btn" data-action="delete-section" data-chapter="' + key + '" data-section="' + i + '" title="Delete"><i class="fas fa-trash"></i></button>' +
            '</div>' +
            '</div>';
        });
        
        html += '<div class="section-item add-section-item" data-action="add-section" data-chapter="' + key + '">' +
          '<i class="fas fa-plus-circle" style="color: var(--project-accent);"></i> Add Section</div>';
      } else if (currentChapter === key) {
        const hasContent = currentProject.chapters && currentProject.chapters[key] && 
                           currentProject.chapters[key].content && 
                           currentProject.chapters[key].content.trim().length > 0;
        html += '<div class="section-item active" data-section="0" data-chapter="' + key + '">' +
          '<i class="fas fa-' + (hasContent ? 'check-circle' : 'circle') + '" style="font-size: 0.6rem; opacity: ' + (hasContent ? '1' : '0.3') + ';"></i> Content</div>';
      }
    }

    chaptersList.innerHTML = html;

    // Chapter click handlers
    document.querySelectorAll('.chapter-item').forEach(function(el) {
      el.addEventListener('click', function(e) {
        if (e.target.closest('.edit-outline-btn') || e.target.closest('.edit-controls')) return;
        const ch = e.target.closest('.chapter-item').dataset.chapter;
        if (currentChapter === ch) return;
        saveCurrentSection();
        saveToFirebase();
        currentChapter = ch;
        currentSection = 0;
        loadSectionContent();
        renderChapters();
        updateModificationArea();
        updateVersionList();
        updateChapterGenButton();
      });
    });

    // Section click handlers
    document.querySelectorAll('.section-item:not(.add-section-item)').forEach(function(el) {
      el.addEventListener('click', function(e) {
        if (e.target.closest('.edit-outline-btn') || e.target.closest('.edit-controls')) return;
        const sec = parseInt(e.target.closest('.section-item').dataset.section);
        if (currentSection === sec) return;
        saveCurrentSection();
        saveToFirebase();
        currentSection = sec;
        loadSectionContent();
        renderChapters();
        updateModificationArea();
        updateVersionList();
        
        // Close sidebar on mobile
        if (window.innerWidth < 992) {
          chaptersSidebar.classList.remove('open');
        }
      });
    });

    updateChapterGenButton();
  }

  // =========================================================================
  // INLINE OUTLINE EDITING
  // =========================================================================
  chaptersList.addEventListener('click', async function(e) {
    const btn = e.target.closest('.edit-outline-btn');
    if (!btn && !e.target.closest('.add-section-item')) return;
    
    if (e.target.closest('.add-section-item')) {
      const addChKey = e.target.closest('.add-section-item').dataset.chapter;
      const newName = prompt('New section name:');
      if (newName && newName.trim()) {
        ensureCustomOutline();
        currentProject._customOutline[addChKey].sections.push(newName.trim());
        await saveToFirebase();
        renderChapters();
        showToast('Section added', 'success');
      }
      return;
    }
    
    const action = btn.dataset.action;
    const chKey = btn.dataset.chapter;
    const secIndex = btn.dataset.section ? parseInt(btn.dataset.section) : null;

    if (action === 'rename-chapter') {
      const ch = getChaptersStructure()[chKey];
      const newTitle = prompt('Rename chapter:', ch ? ch.title : '');
      if (newTitle && newTitle.trim()) {
        ensureCustomOutline();
        currentProject._customOutline[chKey].title = newTitle.trim();
        await saveToFirebase();
        renderChapters();
        showToast('Chapter renamed', 'success');
      }
    } else if (action === 'delete-chapter') {
      const ch = getChaptersStructure()[chKey];
      if (confirm('Delete chapter "' + (ch ? ch.title : '') + '" and all its content?')) {
        ensureCustomOutline();
        delete currentProject._customOutline[chKey];
        if (currentProject.chapters && currentProject.chapters[chKey]) delete currentProject.chapters[chKey];
        await saveToFirebase();
        const keys = Object.keys(getChaptersStructure());
        if (currentChapter === chKey) currentChapter = keys[0] || 'chapter1';
        currentSection = 0;
        renderChapters();
        loadSectionContent();
        showToast('Chapter deleted', 'success');
      }
    } else if (action === 'rename-section') {
      const ch = getChaptersStructure()[chKey];
      const newName = prompt('Rename section:', ch ? ch.sections[secIndex] : '');
      if (newName && newName.trim()) {
        ensureCustomOutline();
        currentProject._customOutline[chKey].sections[secIndex] = newName.trim();
        await saveToFirebase();
        renderChapters();
        showToast('Section renamed', 'success');
      }
    } else if (action === 'delete-section') {
      if (confirm('Delete this section and its content?')) {
        ensureCustomOutline();
        currentProject._customOutline[chKey].sections.splice(secIndex, 1);
        if (currentProject.chapters && currentProject.chapters[chKey] && currentProject.chapters[chKey].sections) {
          currentProject.chapters[chKey].sections.splice(secIndex, 1);
        }
        await saveToFirebase();
        if (currentSection >= currentProject._customOutline[chKey].sections.length) {
          currentSection = Math.max(0, currentProject._customOutline[chKey].sections.length - 1);
        }
        renderChapters();
        loadSectionContent();
        showToast('Section deleted', 'success');
      }
    }
  });

  function ensureCustomOutline() {
    if (!currentProject._customOutline) {
      currentProject._customOutline = JSON.parse(JSON.stringify(getChaptersStructure()));
    }
  }

  function loadSectionContent() {
    if (!currentProject || !currentChapter) return;

    const ch = getChaptersStructure()[currentChapter];

    if (ch && ch.sections && ch.sections.length > 0) {
      currentSectionTitle.textContent = ch.sections[currentSection] || ch.title;
      sectionEditor.innerHTML = (currentProject.chapters && currentProject.chapters[currentChapter] && 
                                  currentProject.chapters[currentChapter].sections) ? 
                                  (currentProject.chapters[currentChapter].sections[currentSection] || '') : '';
    } else if (ch) {
      currentSectionTitle.textContent = ch.title;
      sectionEditor.innerHTML = (currentProject.chapters && currentProject.chapters[currentChapter]) ? 
                                  (currentProject.chapters[currentChapter].content || '') : '';
    }

    sectionEditor.focus();
    updateModificationArea();
    updateVersionList();
    setTimeout(displayHumanizationScore, 300);

    if (writingProfileSelect && currentProject && currentProject.writingProfile) {
      writingProfileSelect.value = currentProject.writingProfile;
    }
  }

  function saveCurrentSection() {
    if (!currentProject || !currentChapter) return;

    if (!currentProject.chapters) currentProject.chapters = {};
    if (!currentProject.chapters[currentChapter]) {
      currentProject.chapters[currentChapter] = { sections: {} };
    }

    const ch = getChaptersStructure()[currentChapter];
    if (ch && ch.sections && ch.sections.length > 0) {
      if (!currentProject.chapters[currentChapter].sections) {
        currentProject.chapters[currentChapter].sections = {};
      }
      currentProject.chapters[currentChapter].sections[currentSection] = sectionEditor.innerHTML;
    } else if (ch) {
      currentProject.chapters[currentChapter].content = sectionEditor.innerHTML;
    }

    currentProject.updatedAt = firebase.database.ServerValue.TIMESTAMP;
    unsavedChanges = false;
    updateUnsavedIndicator();
  }

  async function saveToFirebase() {
    if (!currentUser || !currentProjectId || !currentProject) return;

    try {
      const updateData = {
        chapters: currentProject.chapters,
        _versions: currentProject._versions || {},
        writingProfile: currentProject.writingProfile || 'undergraduate',
        wordCountPref: currentProject.wordCountPref || 'auto',
        customWordCount: currentProject.customWordCount || 500,
        referenceStyle: currentProject.referenceStyle || 'APA 7th',
        _supervisorPersonality: supervisorPersonality,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      };
      
      if (currentProject._customOutline) {
        updateData._customOutline = currentProject._customOutline;
      }
      
      await database.ref('history/' + scopeUid + '/projects/' + currentProjectId).update(updateData);
      projects[currentProjectId] = JSON.parse(JSON.stringify(currentProject));
      unsavedChanges = false;
      updateUnsavedIndicator();
    } catch (error) {
      reportError(error, 'save');
    }
  }

  // =========================================================================
  // AUTOSAVE & UNSAVED CHANGES
  // =========================================================================
  sectionEditor.addEventListener('input', function() {
    unsavedChanges = true;
    updateUnsavedIndicator();
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async function() {
      saveCurrentSection();
      await saveToFirebase();
      displayHumanizationScore();
    }, 3000);
  });

  sectionEditor.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveCurrentSection();
      saveToFirebase();
      showToast('Saved', 'success', 1500);
    }
  });

  function updateUnsavedIndicator() {
    if (unsavedOverlay) {
      unsavedOverlay.style.display = unsavedChanges ? 'block' : 'none';
    }
  }

  if (saveNowBtn) {
    saveNowBtn.addEventListener('click', async function() {
      saveCurrentSection();
      await saveToFirebase();
      showToast('Saved successfully', 'success');
    });
  }

  window.addEventListener('beforeunload', function(e) {
    if (unsavedChanges) {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      return e.returnValue;
    }
  });

  // =========================================================================
  // AI GENERATION
  // =========================================================================
  function updateProgressStage(message, detail) {
    if (progressStage) progressStage.textContent = message;
    if (progressDetail) progressDetail.textContent = detail || '';
  }

  function updateProgressBar(percent) {
    if (progressBarFill) progressBarFill.style.width = Math.min(100, Math.max(0, percent)) + '%';
  }

  async function callAIWithCancel(systemPrompt, userPrompt, maxTokens, temp, topP, freqPenalty, presPenalty) {
    const response = await fetch(aiConfig.endpoint + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + aiConfig.token },
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
      signal: aiAbortController.signal
    });

    if (!response.ok) {
      const errData = await response.json().catch(function() { return {}; });
      throw new Error((errData.error && errData.error.message) || 'API error (' + response.status + ')');
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

  async function generateSection(sectionName, chapterKey, sectionIndex) {
    if (!aiConfig.token) {
      const ok = await fetchTokens();
      if (!ok) throw new Error('AI service not configured');
    }

    const tone = aiToneSelect ? aiToneSelect.value : 'imperfect';
    const modification = modificationInput ? modificationInput.value.trim() : '';
    const approach = currentProject.approach === 'qualitative'
      ? 'qualitative (single case study / small sample / interview-based)'
      : 'quantitative (multiple cases / statistics / questionnaires)';
    const profile = currentProject.writingProfile || 'undergraduate';
    const contextSummary = buildContextSummary();
    const profileGuidance = getProfileGuidance(profile);
    const humanizationRules = buildHumanizationPrompt();
    const targetWordCount = getTargetWordCount();
    const referenceStyle = getReferenceStyle();

    // Token budget scaling
    const tokenMap = { 300: 3000, 500: 4500, 1000: 7000, 2000: 12000, 5000: 18000 };
    let maxTokensPass1 = 10000; // Default for auto
    if (targetWordCount) {
      maxTokensPass1 = tokenMap[targetWordCount] || Math.max(2500, Math.min(18000, Math.round(targetWordCount * 4)));
    }

    let wordInstruction = '';
    if (targetWordCount) {
      wordInstruction = 'TARGET LENGTH: approximately ' + targetWordCount + ' words.';
    } else {
      wordInstruction = 'Determine the appropriate length based on the section and context. Write as much as needed to thoroughly cover the topic. No strict word limit.';
    }

    let content = '';

    // ===== PASS 1: Academic Draft =====
    const pass1SystemPrompt = 'You are a knowledgeable academic writer specializing in healthcare education.\n' +
      'Write well-structured academic content with proper HTML formatting and ' + referenceStyle + ' citations.\n' +
      'You MUST stay strictly on the provided project topic and use ONLY the facts, numbers, and methodology details provided in the context.\n' +
      'NEVER invent sample sizes, participant counts, statistics, or instruments not mentioned in the context.\n' +
      (resources.length > 0 ? 'Use the uploaded resources as authoritative sources. Cite them where relevant.\n' : '') +
      PUNCTUATION_RULES + '\n' +
      'Use ONLY standard punctuation: periods, commas, colons, semicolons, question marks. Never use dashes or special characters.';

    const pass1UserPrompt = 'CONSISTENCY RULES - NON-NEGOTIABLE:\n' +
      '- The project title is "' + currentProject.title + '". Every sentence must relate to THIS specific topic.\n' +
      '- Use ONLY the sample sizes, participant counts, and statistics stated in the context below. Do not invent new ones.\n' +
      '- If Chapter 3 context specifies a sample of n=X participants, ALL results and discussion must use n=X.\n' +
      '- Do not introduce new research instruments, designs, or theoretical frameworks not already established.\n' +
      '- Maintain exactly the same research approach (' + approach + ') throughout.\n\n' +
      'Write the "' + sectionName + '" section for:\n' +
      'PROJECT: "' + currentProject.title + '"\n' +
      'DEPARTMENT: ' + currentProject.department + '\n\n' +
      'FULL PROJECT CONTEXT (all established facts, follow exactly):\n' + contextSummary + '\n\n' +
      'RESEARCH APPROACH: ' + approach + '\n' +
      'REFERENCE STYLE: ' + referenceStyle + ', use proper in-text citations throughout.\n' +
      wordInstruction + '\n' +
      (modification ? '\nSPECIAL INSTRUCTIONS FROM STUDENT: ' + modification + '\n' : '') +
      '\nWrite comprehensive, well-argued academic content using HTML structure (h2/h3 headings, paragraphs, lists).\n' +
      'Return ONLY the HTML. No markdown fences. No preamble. Do not leave the response empty.';

    let attempts = 0;
    while (attempts < 3) {
      const pass1Response = await callAIWithCancel(pass1SystemPrompt, pass1UserPrompt, maxTokensPass1, 0.6, 0.9, 0.1, 0.1);
      content = cleanAIResponse(pass1Response.choices[0].message.content);
      if (content && content.length > 100 && /<\/?p[ >]/.test(content)) break;
      attempts++;
      console.warn('Pass 1 attempt ' + attempts + ' returned empty/invalid, retrying...');
    }
    if (!content || content.length < 50) {
      throw new Error('AI failed to generate a valid draft after 3 attempts. Please try again.');
    }

    let previousContent = content;

    // ===== PASS 2: Humanization (only if humanizeMode) =====
    if (humanizeMode) {
      const pass2SystemPrompt = 'You are an expert at rewriting academic text to sound naturally human-written.\n' +
        'Your job is to change STYLE and VOICE only, never change facts, numbers, sample sizes, statistics, or citations.\n' +
        'Write in first-person student voice.\n' + PUNCTUATION_RULES;

      const pass2UserPrompt = 'REWRITE the text below to sound like a real ' + profile + ' healthcare student wrote it.\n' +
        'The project is about: "' + currentProject.title + '"\n\n' +
        'STRICT RULES:\n- Change ONLY the writing style, voice, and phrasing.\n' +
        '- Do NOT change any numbers, statistics, sample sizes, participant counts, or citations.\n' +
        '- Preserve all ' + referenceStyle + ' citations exactly as written.\n\n' +
        'WRITING PROFILE:\n' + profileGuidance + '\n\n' +
        'WRITING TONE: ' + tone + '\n' + wordInstruction + '\n\n' +
        humanizationRules + '\n\n' +
        'TEXT TO REWRITE:\n' + previousContent.substring(0, 4000) + '\n\n' +
        'Return ONLY the rewritten HTML. No markdown fences. If you see the text is empty, respond with "EMPTY_SOURCE".';

      const pass2Response = await callAIWithCancel(pass2SystemPrompt, pass2UserPrompt, maxTokensPass1 + 1000, 0.75, 0.92, 0.25, 0.2);
      const newContent = cleanAIResponse(pass2Response.choices[0].message.content);
      if (!newContent || newContent.includes('EMPTY_SOURCE') || newContent.includes('source text') || newContent.length < 100) {
        console.warn('Pass 2 produced low-quality output, keeping Pass 1 draft.');
      } else {
        content = newContent;
        previousContent = content;
      }
    }

    // ===== PASS 3: Polish =====
    const pass3SystemPrompt = 'You are a careful academic editor. Polish text for quality while preserving all facts, numbers, and the natural human voice.\n' +
      PUNCTUATION_RULES + '\nEnsure all punctuation is natural. Remove any dashes or special characters.';

    const pass3UserPrompt = 'POLISH the text below. Fix grammar and formatting. Preserve all facts and tone.\n\n' +
      'RULES:\n- Fix any awkward sentences or unclear transitions.\n' +
      '- Ensure proper HTML heading structure (h2 for main sections, h3 for subsections).\n' +
      '- Do NOT increase formality.\n- Do NOT change any numbers, sample sizes, statistics, or citations.\n' +
      '- Remove any repeated phrases.\n- Use only natural punctuation.\n' +
      wordInstruction + '\n- All ' + referenceStyle + ' citations must be correctly formatted.\n\n' +
      'TEXT TO POLISH:\n' + previousContent + '\n\n' +
      'Return ONLY the polished HTML. If the text appears empty, reply with "EMPTY_SOURCE".';

    const pass3Response = await callAIWithCancel(pass3SystemPrompt, pass3UserPrompt, 2000, 0.4, 0.9, 0.1, 0.1);
    let finalContent = cleanAIResponse(pass3Response.choices[0].message.content);
    if (!finalContent || finalContent.includes('EMPTY_SOURCE') || finalContent.includes('source text') || finalContent.length < 100) {
      console.warn('Pass 3 returned invalid, keeping previous draft.');
      finalContent = previousContent;
    }

    return finalContent;
  }

  // Single section generation
  aiGenerateSectionBtn.addEventListener('click', async function() {
    if (!currentProject || !currentChapter) {
      showToast('Select a chapter and section first', 'error');
      return;
    }

    if (!canGenerateChapter(currentChapter)) {
      showToast('Free plan: Only Chapter 1 generation is available. Upgrade for full access.', 'error', 5000);
      goToSubscription();
      return;
    }

    const ch = getChaptersStructure()[currentChapter];
    const hasContent = ch && ch.sections && ch.sections.length > 0
      ? (currentProject.chapters && currentProject.chapters[currentChapter] && 
         currentProject.chapters[currentChapter].sections && 
         (currentProject.chapters[currentChapter].sections[currentSection] || '').trim().length > 0)
      : (currentProject.chapters && currentProject.chapters[currentChapter] && 
         (currentProject.chapters[currentChapter].content || '').trim().length > 0);
    
    if (hasContent && !canRegenerate()) {
      showToast('Regeneration requires Student or Pro plan. Upgrade for full access.', 'error', 5000);
      goToSubscription();
      return;
    }

    if (!aiConfig.token) {
      const ok = await fetchTokens();
      if (!ok) {
        showToast('AI service not configured', 'error');
        return;
      }
    }

    await saveVersion();

    const sectionName = ch && ch.sections && ch.sections.length > 0
      ? ch.sections[currentSection]
      : (ch ? ch.title : 'Section');

    aiProgressModal.classList.add('active');
    aiGenerateSectionBtn.disabled = true;
    aiAbortController = new AbortController();
    updateProgressBar(0);

    try {
      updateProgressStage('Pass 1/3: Generating academic draft...', '');
      updateProgressBar(20);
      
      const content = await generateSection(sectionName, currentChapter, currentSection);
      
      updateProgressBar(90);
      updateProgressStage('Finalizing...', 'Inserting content into editor');
      
      sectionEditor.innerHTML = content;
      saveCurrentSection();
      await saveToFirebase();

      if (modificationInput) modificationInput.value = '';

      updateProgressBar(100);
      showToast('Section generated successfully', 'success');
      renderChapters();
      updateModificationArea();
      displayHumanizationScore();
      updateVersionList();
      updateChapterGenButton();

      setTimeout(checkConsistency, 500);

    } catch (err) {
      if (err.name === 'AbortError') {
        showToast('Generation cancelled', 'info');
      } else {
        reportError(err, 'section generation');
        showToast('Generation failed: ' + (err.message || 'Unknown error'), 'error', 5000);
      }
    } finally {
      aiProgressModal.classList.remove('active');
      aiGenerateSectionBtn.disabled = false;
      aiAbortController = null;
      updateProgressBar(0);
    }
  });

  // Generate entire chapter
  if (aiGenerateChapterBtn) {
    aiGenerateChapterBtn.addEventListener('click', async function() {
      if (!canAccessResources()) {
        showToast('Chapter generation requires Student plan or higher.', 'error');
        goToSubscription();
        return;
      }
      
      if (!currentProject || !currentChapter) return;

      const useCustom = confirm('Would you like to provide a custom outline for this chapter?\n\nClick OK to enter a custom outline, or Cancel to use the default sections.');
      let customSections = null;
      
      if (useCustom) {
        const outlineText = prompt('Enter section titles, one per line:', '');
        if (outlineText && outlineText.trim()) {
          customSections = outlineText.split('\n').filter(function(l) { return l.trim(); });
        }
      }

      const ch = getChaptersStructure()[currentChapter];
      const sections = customSections || ch.sections || [ch.title];
      
      if (customSections) {
        ensureCustomOutline();
        currentProject._customOutline[currentChapter] = { title: ch.title, sections: customSections };
      }

      aiProgressModal.classList.add('active');
      aiAbortController = new AbortController();
      chapterGenerationActive = true;
      updateProgressBar(0);

      try {
        for (let i = 0; i < sections.length; i++) {
          if (!chapterGenerationActive) break;
          
          currentSection = i;
          const percent = Math.round((i / sections.length) * 100);
          updateProgressBar(percent);
          updateProgressStage('Generating section ' + (i + 1) + '/' + sections.length, sections[i]);
          
          const content = await generateSection(sections[i], currentChapter, i);
          
          if (!currentProject.chapters) currentProject.chapters = {};
          if (!currentProject.chapters[currentChapter]) currentProject.chapters[currentChapter] = { sections: {} };
          if (!currentProject.chapters[currentChapter].sections) currentProject.chapters[currentChapter].sections = {};
          currentProject.chapters[currentChapter].sections[i] = content;
          await saveToFirebase();
        }

        updateProgressBar(100);
        sectionEditor.innerHTML = (currentProject.chapters[currentChapter].sections && currentProject.chapters[currentChapter].sections[0]) || '';
        currentSection = 0;
        renderChapters();
        loadSectionContent();
        showToast('Chapter generated successfully', 'success');
        updateModificationArea();
        displayHumanizationScore();
        updateChapterGenButton();

      } catch (err) {
        if (err.name === 'AbortError') {
          showToast('Chapter generation cancelled', 'info');
        } else {
          reportError(err, 'chapter generation');
          showToast('Chapter generation failed: ' + (err.message || 'Unknown error'), 'error');
        }
      } finally {
        aiProgressModal.classList.remove('active');
        aiAbortController = null;
        chapterGenerationActive = false;
        updateProgressBar(0);
        
        if (customSections) {
          delete currentProject._customOutline[currentChapter];
          if (Object.keys(currentProject._customOutline).length === 0) {
            delete currentProject._customOutline;
          }
        }
      }
    });
  }

  if (cancelGenerateBtn) {
    cancelGenerateBtn.addEventListener('click', function() {
      chapterGenerationActive = false;
      if (aiAbortController) aiAbortController.abort();
    });
  }

  if (closeProgressModal) {
    closeProgressModal.addEventListener('click', function() {
      chapterGenerationActive = false;
      if (aiAbortController) aiAbortController.abort();
      aiProgressModal.classList.remove('active');
    });
  }

  // =========================================================================
  // WRITING PROFILE SELECTOR
  // =========================================================================
  if (writingProfileSelect) {
    writingProfileSelect.addEventListener('change', function() {
      if (currentProject) {
        currentProject.writingProfile = writingProfileSelect.value;
        saveToFirebase();
      }
    });
  }

  // =========================================================================
  // AI SUPERVISOR CHAT (improved)
  // =========================================================================
  function showTypingIndicator() {
    if (typingIndicator) return;
    typingIndicator = document.createElement('div');
    typingIndicator.className = 'typing-indicator';
    typingIndicator.innerHTML = '<span></span><span></span><span></span>';
    aiChatMessages.appendChild(typingIndicator);
    typingIndicator.scrollIntoView({ behavior: 'smooth' });
  }

  function hideTypingIndicator() {
    if (typingIndicator) {
      typingIndicator.remove();
      typingIndicator = null;
    }
  }

  function updateDefaultPromptsBar() {
    const hasMessages = aiChatMessages.querySelectorAll('.ai-message').length > 0;
    if (hasMessages) {
      defaultPromptsBar.style.display = 'block';
      if (defaultPromptsScroll.children.length === 0) {
        const prompts = [
          'Review my current section for clarity',
          'Suggest improvements for this chapter',
          'Help me with my methodology approach',
          'What key points should I cover in this section?'
        ];
        defaultPromptsScroll.innerHTML = prompts.map(function(t) {
          return '<span class="suggested-prompt-chip">' + t + '</span>';
        }).join('');
        defaultPromptsScroll.querySelectorAll('.suggested-prompt-chip').forEach(function(chip) {
          chip.addEventListener('click', function() {
            aiMessageInput.value = chip.textContent;
            aiSendBtn.click();
          });
        });
      }
    } else {
      defaultPromptsBar.style.display = 'none';
    }
  }

  function clearChatHistory() {
    aiChatMessages.innerHTML = '<div class="ai-empty-state"><i class="fas fa-robot"></i><p>Your AI supervisor is ready</p><small>Ask for guidance, corrections, or suggestions about your project</small></div>';
    updateDefaultPromptsBar();
  }

  async function loadChatHistory() {
    if (!currentUser || !currentProjectId) return false;
    
    try {
      const snap = await database.ref('history/' + scopeUid + '/projects/' + currentProjectId + '/chatHistory').once('value');
      const data = snap.val();
      
      if (data && data.messages && data.messages.length > 0) {
        aiChatMessages.innerHTML = '';
        
        data.messages.forEach(function(msg) {
          const div = document.createElement('div');
          div.className = 'ai-message ' + msg.role;
          div.innerHTML = msg.role === 'assistant' ? marked.parse(msg.content) : msg.content;
          
          const time = document.createElement('div');
          time.style.cssText = 'font-size: 0.65rem; color: var(--text-secondary); margin-top: 0.2rem;';
          time.textContent = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          div.appendChild(time);
          
          aiChatMessages.appendChild(div);
        });
        
        aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
        updateDefaultPromptsBar();
        return true;
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    }
    return false;
  }

  async function saveChatHistory() {
    if (!currentUser || !currentProjectId) return;
    
    try {
      const messages = [];
      aiChatMessages.querySelectorAll('.ai-message').forEach(function(el) {
        const isUser = el.classList.contains('user');
        const clone = el.cloneNode(true);
        const timeEl = clone.querySelector('div[style*="font-size: 0.65rem"]');
        if (timeEl) timeEl.remove();
        
        messages.push({
          role: isUser ? 'user' : 'assistant',
          content: clone.innerHTML || clone.textContent,
          timestamp: Date.now()
        });
      });
      
      if (messages.length > 0 && !aiChatMessages.querySelector('.ai-empty-state')) {
        await database.ref('history/' + scopeUid + '/projects/' + currentProjectId + '/chatHistory').set({
          messages: messages.slice(-100),
          updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
      }
    } catch (error) {
      console.error('Error saving chat history:', error);
    }
  }

  aiSendBtn.addEventListener('click', async function() {
    if (!canAccessAISupervisor()) {
      showToast('AI Supervisor requires Student or Pro plan. Upgrade for full access.', 'error', 5000);
      goToSubscription();
      return;
    }

    const text = aiMessageInput.value.trim();
    if (!text) return;

    // Remove empty state if present
    const emptyState = aiChatMessages.querySelector('.ai-empty-state');
    if (emptyState) emptyState.remove();

    // Add user message
    const userDiv = document.createElement('div');
    userDiv.className = 'ai-message user';
    userDiv.textContent = text;
    const userTime = document.createElement('div');
    userTime.style.cssText = 'font-size: 0.65rem; color: var(--text-secondary); margin-top: 0.2rem;';
    userTime.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    userDiv.appendChild(userTime);
    aiChatMessages.appendChild(userDiv);
    userDiv.scrollIntoView({ behavior: 'smooth' });

    aiMessageInput.value = '';
    aiMessageInput.style.height = 'auto';
    updateDefaultPromptsBar();

    showTypingIndicator();

    try {
      const reply = await callAISupervisor(text);
      hideTypingIndicator();

      const assistDiv = document.createElement('div');
      assistDiv.className = 'ai-message assistant';
      assistDiv.innerHTML = marked.parse(reply);
      const assistTime = document.createElement('div');
      assistTime.style.cssText = 'font-size: 0.65rem; color: var(--text-secondary); margin-top: 0.2rem;';
      assistTime.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      assistDiv.appendChild(assistTime);
      aiChatMessages.appendChild(assistDiv);
      assistDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
      saveChatHistory();
      updateDefaultPromptsBar();
    } catch (err) {
      hideTypingIndicator();
      reportError(err, 'supervisor chat');
      const errDiv = document.createElement('div');
      errDiv.className = 'ai-message assistant';
      errDiv.textContent = 'Sorry, I encountered an error. Please try again.';
      aiChatMessages.appendChild(errDiv);
    }
  });

  aiMessageInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      aiSendBtn.click();
    }
  });

  aiMessageInput.addEventListener('input', function() {
    aiMessageInput.style.height = 'auto';
    aiMessageInput.style.height = Math.min(aiMessageInput.scrollHeight, 120) + 'px';
  });

  function getSectionContent(chKey, secIndex) {
    const chStruct = getChaptersStructure();
    if (chStruct[chKey] && chStruct[chKey].sections && chStruct[chKey].sections.length) {
      return (currentProject && currentProject.chapters && currentProject.chapters[chKey] && currentProject.chapters[chKey].sections) ? 
             (currentProject.chapters[chKey].sections[secIndex] || '') : '';
    } else {
      return (currentProject && currentProject.chapters && currentProject.chapters[chKey]) ? 
             (currentProject.chapters[chKey].content || '') : '';
    }
  }

  function buildFullProjectSummary() {
    let summary = buildContextSummary();
    
    const chStruct = getChaptersStructure();
    for (const key in chStruct) {
      if (!chStruct.hasOwnProperty(key)) continue;
      const ch = chStruct[key];
      if (ch.sections && ch.sections.length > 0) {
        ch.sections.forEach(function(sec, i) {
          const content = getSectionContent(key, i);
          if (content && content.trim().length > 50) {
            summary += '\n\n[' + ch.title + ' - ' + sec + ']:\n' + extractPlainText(content).substring(0, 500);
          }
        });
      } else if (ch) {
        const content = getSectionContent(key, 0);
        if (content && content.trim().length > 50) {
          summary += '\n\n[' + ch.title + ']:\n' + extractPlainText(content).substring(0, 500);
        }
      }
    }
    
    return summary;
  }

  async function callAISupervisor(userMessage) {
    if (!aiConfig.token) {
      const ok = await fetchTokens();
      if (!ok) throw new Error('AI not configured');
    }

    const fullContext = buildFullProjectSummary();
    const strictnessGuides = {
      easy: 'Be supportive and encouraging. Offer gentle suggestions. Focus on strengths while nudging toward improvement.',
      moderate: 'Provide balanced feedback. Acknowledge strengths but clearly point out areas that need work. Be direct but constructive.',
      strict: 'Be rigorous and demanding. Hold the student to high academic standards. Point out all weaknesses, inconsistencies, and gaps. Challenge their thinking.'
    };

    const systemPrompt = 'You are ' + supervisorPersonality.profession + ', an experienced academic supervisor.\n' +
      'Project: ' + (currentProject ? currentProject.title : 'N/A') + '\n' +
      'Department: ' + (currentProject ? currentProject.department : 'N/A') + '\n' +
      'Approach: ' + (currentProject && currentProject.approach === 'qualitative' ? 'Qualitative' : 'Quantitative') + '\n\n' +
      'Your strictness: ' + strictnessGuides[supervisorPersonality.strictness] + '\n\n' +
      'FULL PROJECT CONTENT (all chapters and sections):\n' + fullContext.substring(0, 8000) + '\n\n' +
      'RULES:\n' +
      '1. Give concise, direct answers using key points. Keep it short and sweet.\n' +
      '2. Read through all project content to accurately judge and vet.\n' +
      '3. Reference specific chapters, sections, or lines as needed.\n' +
      '4. Flag inconsistencies immediately.\n' +
      '5. Never include suggested follow-up questions.\n' +
      '6. Use simple language. Reply in key points format.\n' +
      '7. Be thorough but brief. Do not cut off responses.';

    const response = await fetch(aiConfig.endpoint + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + aiConfig.token },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        max_tokens: 1500,
        temperature: 0.7
      })
    });

    if (!response.ok) throw new Error('API error');
    const data = await response.json();
    return data.choices[0].message.content;
  }

  // =========================================================================
  // PROFESSIONAL EXPORT
  // =========================================================================
  function buildExportHtml(scope) {
    const title = currentProject ? currentProject.title : 'Academic Project';
    const department = currentProject ? currentProject.department : '';
    const type = currentProject ? currentProject.type : '';
    const approach = currentProject && currentProject.approach === 'qualitative' ? 'Qualitative Study' : 'Quantitative Study';
    const refStyle = currentProject ? currentProject.referenceStyle || 'APA 7th' : 'APA 7th';
    const chStruct = getChaptersStructure();

    let bodyHtml = '';
    let tocHtml = '';
    let chapterTitle = '';

    if (scope === 'section') {
      const ch = chStruct[currentChapter];
      const secName = ch && ch.sections ? ch.sections[currentSection] : (ch ? ch.title : '');
      chapterTitle = ch ? ch.title : '';
      bodyHtml = '<h2>' + escapeHtml(secName) + '</h2>\n' + getSectionContent(currentChapter, currentSection);

    } else if (scope === 'chapter') {
      const ch = chStruct[currentChapter];
      chapterTitle = ch ? ch.title : '';
      bodyHtml = '<h2>' + escapeHtml(chapterTitle) + '</h2>\n';
      if (ch && ch.sections && ch.sections.length) {
        ch.sections.forEach(function(sec, i) {
          const content = getSectionContent(currentChapter, i);
          if (content && content.trim().length > 10) {
            bodyHtml += '<h3>' + escapeHtml(sec) + '</h3>\n' + content + '\n';
          }
        });
      } else {
        bodyHtml += getSectionContent(currentChapter, 0);
      }
      tocHtml = '<h2>Table of Contents</h2><ol><li><strong>' + escapeHtml(chapterTitle) + '</strong></li>';
      if (ch && ch.sections && ch.sections.length) {
        tocHtml += '<ul>';
        ch.sections.forEach(function(sec) { tocHtml += '<li>' + escapeHtml(sec) + '</li>'; });
        tocHtml += '</ul>';
      }
      tocHtml += '</ol>';

    } else {
      for (const key in chStruct) {
        if (!chStruct.hasOwnProperty(key)) continue;
        const ch = chStruct[key];
        if (!ch.sections || !ch.sections.length) {
          const content = getSectionContent(key, 0);
          if (content && content.trim().length > 10) {
            bodyHtml += '<h2>' + escapeHtml(ch.title) + '</h2>\n' + content + '\n';
          }
        } else {
          let hasContent = false;
          let sectionHtml = '';
          ch.sections.forEach(function(sec, i) {
            const content = getSectionContent(key, i);
            if (content && content.trim().length > 10) {
              sectionHtml += '<h3>' + escapeHtml(sec) + '</h3>\n' + content + '\n';
              hasContent = true;
            }
          });
          if (hasContent) {
            bodyHtml += '<h2>' + escapeHtml(ch.title) + '</h2>\n' + sectionHtml;
          }
        }
      }
      tocHtml = '<h2>Table of Contents</h2><ol>';
      for (const key in chStruct) {
        if (!chStruct.hasOwnProperty(key)) continue;
        const ch = chStruct[key];
        tocHtml += '<li><strong>' + escapeHtml(ch.title) + '</strong>';
        if (ch.sections && ch.sections.length) {
          tocHtml += '<ul>';
          ch.sections.forEach(function(sec) { tocHtml += '<li>' + escapeHtml(sec) + '</li>'; });
          tocHtml += '</ul>';
        }
        tocHtml += '</li>';
      }
      tocHtml += '</ol>';
    }

    return '<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8">\n  <title>' + escapeHtml(title) + '</title>\n  <style>\n    @page { size: A4; margin: 2.5cm 2cm 2.5cm 2cm; @bottom-center { content: "Page " counter(page); font-size: 9pt; color: #666; } }\n    body { font-family: "Times New Roman", Georgia, serif; line-height: 1.8; font-size: 12pt; color: #222; counter-reset: page; }\n    .cover-page { text-align: center; padding-top: 30%; page-break-after: always; }\n    .cover-page h1 { font-size: 22pt; color: #00695c; margin-bottom: 0.5rem; }\n    .cover-page .subtitle { font-size: 14pt; color: #555; margin-bottom: 2rem; }\n    .cover-page .meta { font-size: 11pt; color: #777; line-height: 2; }\n    .toc-page { page-break-after: always; }\n    .toc-page h2 { color: #00695c; border-bottom: 2px solid #00695c; padding-bottom: 0.3rem; }\n    .content-page { page-break-before: ' + (scope === 'section' ? 'auto' : 'always') + '; }\n    h1, h2, h3 { color: #00695c; }\n    h2 { border-bottom: 1px solid #ddd; padding-bottom: 0.3rem; margin-top: 2rem; }\n    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }\n    th, td { border: 1px solid #666; padding: 8px; text-align: left; }\n    th { background: #f0f0f0; }\n    .reference-note { font-size: 10pt; color: #666; font-style: italic; margin-top: 0.5rem; border-top: 1px solid #ddd; padding-top: 0.5rem; }\n    .resources-note { font-size: 10pt; color: #666; margin-top: 0.5rem; padding: 0.5rem; background: #f9f9f9; border-radius: 0.25rem; }\n    @media print { body { margin: 0; } .no-print { display: none; } }\n  </style>\n</head>\n<body>\n' +
      (scope === 'project' ? '\n  <div class="cover-page">\n    <h1>' + escapeHtml(title) + '</h1>\n    <p class="subtitle">' + escapeHtml(approach) + '</p>\n    <div class="meta">\n      <p><strong>Department:</strong> ' + escapeHtml(department) + '</p>\n      <p><strong>Type:</strong> ' + escapeHtml(type) + '</p>\n      <p><strong>Date:</strong> ' + new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }) + '</p>\n      <p><strong>Reference Style:</strong> ' + escapeHtml(refStyle) + '</p>\n      <p style="margin-top: 3rem;"><em>Generated by rehablix Academic Project Maker</em></p>\n    </div>\n  </div>\n  <div class="toc-page">' + tocHtml + '</div>\n  ' : (scope === 'chapter' ? '\n  <div class="toc-page">' + tocHtml + '</div>\n  ' : '')) +
      '\n  <div class="content-page">\n    ' + (scope === 'chapter' ? '<h1>' + escapeHtml(chapterTitle) + '</h1>\n    ' : '') + bodyHtml + '\n    ' + (resources.length > 0 ? '<div class="resources-note"><strong>Resources Referenced:</strong> ' + resources.map(function(r) { return r.name; }).join(', ') + '</div>' : '') + '\n    ' + (scope === 'section' ? '<p class="reference-note">Reference Style: ' + escapeHtml(refStyle) + '</p>' : '') + '\n  </div>\n</body>\n</html>';
  }

  // Save button
  saveSectionBtn.addEventListener('click', async function() {
    saveCurrentSection();
    await saveToFirebase();
    showToast('Saved successfully', 'success');
  });

  // Word export
  exportWordBtn.addEventListener('click', async function() {
    saveCurrentSection();
    await saveToFirebase();

    const scope = exportScopeSelect ? exportScopeSelect.value : 'section';
    const title = currentProject ? currentProject.title : 'Academic Project';
    const fullHtml = buildExportHtml(scope);

    const blob = new Blob([fullHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    a.download = safeName + '_' + scope + '.doc';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const scopeLabel = scope === 'section' ? 'Section' : scope === 'chapter' ? 'Chapter' : 'Project';
    showToast(scopeLabel + ' exported as Word', 'success');
  });

  // PDF export
  exportPdfBtn.addEventListener('click', function() {
    saveCurrentSection();
    saveToFirebase();

    const scope = exportScopeSelect ? exportScopeSelect.value : 'section';
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow.document.write(buildExportHtml(scope));
    printWindow.document.close();
    printWindow.focus();

    setTimeout(function() {
      printWindow.print();
      printWindow.onafterprint = function() { printWindow.close(); };
    }, 500);
  });

  // =========================================================================
  // FLOATING SCROLL BUTTON
  // =========================================================================
  const aiControlsEl = document.querySelector('.ai-controls');
  if (floatingScrollBtn && aiControlsEl) {
    const observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          floatingScrollBtn.querySelector('i').className = 'fas fa-chevron-up';
        } else {
          floatingScrollBtn.querySelector('i').className = 'fas fa-chevron-down';
        }
      });
    }, { threshold: 0.1 });
    observer.observe(aiControlsEl);

    floatingScrollBtn.addEventListener('click', function() {
      if (floatingScrollBtn.querySelector('.fa-chevron-up')) {
        document.querySelector('.editor-area').scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        aiControlsEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  // =========================================================================
  // MOBILE TOGGLES
  // =========================================================================
  if (toggleChaptersBtn) toggleChaptersBtn.addEventListener('click', function() { chaptersSidebar.classList.toggle('open'); });
  if (toggleAIPanelBtn) toggleAIPanelBtn.addEventListener('click', function() { aiPanel.classList.toggle('open'); });
  if (closeChaptersBtn) closeChaptersBtn.addEventListener('click', function() { chaptersSidebar.classList.remove('open'); });
  if (closeAIPanelBtn) closeAIPanelBtn.addEventListener('click', function() { aiPanel.classList.remove('open'); });

  // =========================================================================
  // HISTORY DRAWER
  // =========================================================================
  if (historyNavBtn) {
    historyNavBtn.addEventListener('click', function() {
      if (!currentUser) {
        showToast('Please log in to view your projects', 'error');
        return;
      }
      historyDrawer.classList.add('active');
      document.body.style.overflow = 'hidden';
      loadProjects();
    });
  }

  if (closeDrawerBtn) {
    closeDrawerBtn.addEventListener('click', function() {
      historyDrawer.classList.remove('active');
      document.body.style.overflow = '';
    });
  }

  document.addEventListener('click', function(e) {
    if (historyDrawer && historyDrawer.classList.contains('active') &&
        !historyDrawer.contains(e.target) &&
        e.target !== historyNavBtn &&
        !(historyNavBtn && historyNavBtn.contains(e.target))) {
      historyDrawer.classList.remove('active');
      document.body.style.overflow = '';
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && historyDrawer && historyDrawer.classList.contains('active')) {
      historyDrawer.classList.remove('active');
      document.body.style.overflow = '';
    }
  });

  // =========================================================================
  // PLAN UPDATE LISTENER
  // =========================================================================
  document.addEventListener('planUpdated', function(e) {
    const newPlan = (e.detail && e.detail.plan) || 'free';
    if (newPlan !== currentPlan) {
      currentPlan = newPlan;
      console.log('[PROJECT] Plan updated to:', currentPlan);
      loadPlanData();
      updatePlanUI();
    }
  });

  if (window.rehabPlans) {
    currentPlan = window.rehabPlans.getCurrentPlan() || 'free';
    console.log('[PROJECT] Initial plan:', currentPlan);
  }

  function updateSupervisorAccess() {
    if (aiMessageInput && aiSendBtn) {
      const access = canAccessAISupervisor();
      aiMessageInput.disabled = !access;
      aiSendBtn.disabled = !access;
      if (!access) {
        aiMessageInput.placeholder = 'Upgrade to Student or Pro for AI Supervisor';
      } else {
        aiMessageInput.placeholder = 'Ask your supervisor...';
      }
    }
  }

  // =========================================================================
  // CHAPTER STRUCTURES
  // =========================================================================
  const quantitativeChapters = {
    chapter1: { title: 'Chapter 1: Introduction', sections: ['Background of Study', 'Statement of Problem', 'Aim & Objectives', 'Research Questions', 'Significance of Study', 'Scope of Study', 'Operational Definitions'] },
    chapter2: { title: 'Chapter 2: Literature Review', sections: ['Theoretical Framework', 'Empirical Review', 'Conceptual Framework', 'Summary of Literature'] },
    chapter3: { title: 'Chapter 3: Methodology', sections: ['Research Design', 'Population of Study', 'Sample & Sampling Technique', 'Instrumentation', 'Data Collection Procedure', 'Data Analysis'] },
    chapter4: { title: 'Chapter 4: Results', sections: ['Data Presentation', 'Analysis of Results', 'Interpretation of Findings'] },
    chapter5: { title: 'Chapter 5: Discussion & Conclusion', sections: ['Discussion of Findings', 'Conclusion', 'Recommendations', 'Limitations of Study'] },
    references: { title: 'References', sections: [] },
    questionnaire: { title: 'Questionnaire', sections: [] },
    abstract: { title: 'Abstract', sections: [] },
    appendix: { title: 'Appendix', sections: [] },
    defense_prep: { title: 'Defense Preparation', sections: [] }
  };

  const qualitativeChapters = {
    chapter1: { title: 'Chapter 1: Introduction', sections: ['Background of Study', 'Statement of Problem', 'Aim & Objectives', 'Research Questions', 'Significance of Study', 'Scope of Study'] },
    chapter2: { title: 'Chapter 2: Literature Review', sections: ['Theoretical Framework', 'Review of Related Studies', 'Conceptual Framework', 'Summary'] },
    chapter3: { title: 'Chapter 3: Methodology', sections: ['Research Design', 'Case Selection / Participant Profile', 'Data Collection Methods', 'Data Analysis Approach', 'Ethical Considerations'] },
    chapter4: { title: 'Chapter 4: Findings', sections: ['Case Presentation', 'Thematic Analysis', 'Interpretation of Findings'] },
    chapter5: { title: 'Chapter 5: Discussion & Conclusion', sections: ['Discussion of Findings', 'Conclusion', 'Recommendations', 'Limitations of Study'] },
    references: { title: 'References', sections: [] },
    abstract: { title: 'Abstract', sections: [] },
    appendix: { title: 'Appendix', sections: [] },
    defense_prep: { title: 'Defense Preparation', sections: [] }
  };

  function getChaptersStructure() {
    if (!currentProject) return quantitativeChapters;
    if (currentProject._customOutline) return currentProject._customOutline;
    return currentProject.approach === 'qualitative' ? qualitativeChapters : quantitativeChapters;
  }

  // =========================================================================
  // AUTH & INIT
  // =========================================================================
  firebase.auth().onAuthStateChanged(async function(user) {
    currentUser = user;

    if (user) {
      console.log('[AUTH] User logged in:', user.email);
      if (historyNavBtn) historyNavBtn.style.display = 'block';

      if (window.RehablixCenter && typeof window.RehablixCenter.getEffectiveScopeUid === 'function') {
        try { scopeUid = await window.RehablixCenter.getEffectiveScopeUid('project'); }
        catch (err) { scopeUid = user.uid; }
      } else {
        scopeUid = user.uid;
      }
      if (scopeUid === null) {
        showToast('Your access to Projects has been turned off by your center admin.', 'error', 6000);
        return;
      } else if (scopeUid !== user.uid) {
        showToast('Working on your center shared projects', 'info', 3000);
      }

      await fetchTokens();
      await loadProjects();

      const keys = Object.keys(projects);
      if (keys.length > 0 && !currentProjectId) {
        const sorted = keys.sort(function(a, b) {
          return (projects[b].updatedAt || projects[b].createdAt || 0) - (projects[a].updatedAt || projects[a].createdAt || 0);
        });
        switchToProject(sorted[0]);
      } else if (keys.length === 0 && !currentProjectId && currentPlan !== 'free') {
        createNewProject();
      }
    } else {
      console.log('[AUTH] User logged out');
      if (historyNavBtn) historyNavBtn.style.display = 'none';
      currentProjectId = null;
      currentProject = null;
      if (chaptersList) chaptersList.innerHTML = '';
      if (sectionEditor) sectionEditor.innerHTML = '';
      if (currentSectionTitle) currentSectionTitle.textContent = 'Select a section';
      if (modificationArea) modificationArea.style.display = 'none';
      if (aiScoreDisplay) aiScoreDisplay.style.display = 'none';
    }
  });

  async function initialize() {
    console.log('[INIT] Academic Project Maker v3.2 starting...');

    loadPlanData();
    updatePlanUI();
    updateDefaultPromptsBar();

    console.log('[INIT] Ready - Plan:', currentPlan);
    console.log('[INIT] Features:', {
      humanizeMode: humanizeMode,
      deepScan: canAccessDeepScan(),
      resources: canAccessResources(),
      supervisor: canAccessAISupervisor(),
      chapterGen: canAccessResources(),
      customOutline: canUseCustomOutline(),
      autoWordCount: true
    });
  }

  initialize();

  console.log('Academic Project Maker v3.2 initialized');
});