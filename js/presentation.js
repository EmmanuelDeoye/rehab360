// js/presentation.js – Multi‑mode (Presentation/Report/Documentation), Multi‑file, Camera, DOCX, OCR
// Updated with Tiered Plan Access: Free (basic), Student (advanced), Pro (full)

// Marked configuration
if (typeof marked !== 'undefined') {
    marked.setOptions({
        breaks: true,
        gfm: true,
        headerIds: false,
        mangle: false
    });
}

document.addEventListener('DOMContentLoaded', async () => {

    // Expose the reusable generator API immediately (this round's
    // refactor), before anything DOM-dependent below can throw when
    // this file runs on index.html instead of presentation.html — see
    // js/standardized.js for the full reasoning (same pattern here).
    // The actual token-fetch/auth-listener setup this needs is added
    // just after `database` is declared below (fetchTokens() needs it)
    // — see the comment there for why it has to be that early too.
    window.RehablixGenerators = window.RehablixGenerators || {};
    window.RehablixGenerators.presentation = {
        generate: (text) => generateForLixa(text),
        // No separate export function to call — the actual PPTX/export
        // UI already lives in result.html (the same universal result
        // viewer used by ask/gait/assign/rom), so "download" for this
        // tool means opening that, not reimplementing export here.
        viewUrl: (historyId) => `result.html?type=case&id=${historyId}`
    };

    // =========================================================================
    // DOM Elements
    // =========================================================================
    const textInput = document.getElementById('textInput');
    const textWordCount = document.getElementById('textWordCount');
    const clearTextBtn = document.getElementById('clearTextBtn');

    const multiDropZone = document.getElementById('multiDropZone');
    const multiFileInput = document.getElementById('multiFileInput');
    const cameraInput = document.getElementById('cameraInput');
    const attachmentsList = document.getElementById('attachmentsList');

    // Upload Modal
    const uploadModal = document.getElementById('uploadModal');
    const closeUploadModalBtn = document.getElementById('closeUploadModal');
    const uploadModalOverlay = document.querySelector('.upload-modal-overlay');
    const uploadOptions = document.querySelectorAll('.upload-option');

    // Patient form
    const patientName = document.getElementById('patientName');
    const patientAge = document.getElementById('patientAge');
    const patientGender = document.getElementById('patientGender');
    const patientMRN = document.getElementById('patientMRN');
    const patientDiagnosis = document.getElementById('patientDiagnosis');
    const professionSelect = document.getElementById('professionSelect');

    // Mode tabs
    const modeTabs = document.querySelectorAll('.mode-tab');
    
    // Config sections (mode-dependent)
    const configSections = document.querySelectorAll('.config-mode-section');
    
    // Outline radio groups for each mode
    const outlineRadiosPresentation = document.querySelectorAll('input[name="outlinePresentation"]');
    const outlineRadiosReport = document.querySelectorAll('input[name="outlineReport"]');
    const outlineRadiosDocumentation = document.querySelectorAll('input[name="outlineDocumentation"]');
    
    // Custom outline textareas and hints for each mode
    const customOutlinePresentation = document.getElementById('customOutlinePresentation');
    const customOutlineHintPresentation = document.getElementById('customOutlineHintPresentation');
    const customOutlineReport = document.getElementById('customOutlineReport');
    const customOutlineHintReport = document.getElementById('customOutlineHintReport');
    const customOutlineDocumentation = document.getElementById('customOutlineDocumentation');
    const customOutlineHintDocumentation = document.getElementById('customOutlineHintDocumentation');

    // Additional
    const additionalInstructions = document.getElementById('additionalInstructions');
    const generateBtn = document.getElementById('generateBtn');
    const generateBtnText = document.getElementById('generateBtnText');

    // Suggested instruction chips
    const suggestionChips = document.getElementById('suggestionChips');

    // Output size radios
    const outputSizeRadios = document.getElementsByName('outputSize');

    // Content fidelity radios
    const contentFidelityRadios = document.getElementsByName('contentFidelity');

    // Hidden history ID
    const currentHistoryIdInput = document.getElementById('currentHistoryId');

    // History drawer
    const historyDrawer = document.getElementById('historyDrawer');
    const historyNavBtn = document.getElementById('historyNavBtn');
    const closeDrawerBtn = document.getElementById('closeDrawerBtn');
    const historyList = document.getElementById('historyList');
    const historySearchInput = document.getElementById('historySearchInput');

    // Toast
    const toastContainer = document.getElementById('toast-container');

    // =========================================================================
    // State & helpers
    // =========================================================================
    let currentUser = null;
    let scopeUid = null; // center owner's uid for center members, so shared case history is used
    let aiConfig = { token: null, endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-v4-flash' };
    let attachments = [];
    let isRestoring = false;
    let saveTimeout = null;
    let currentMode = 'presentation';
    let currentPlan = 'free';  // 'free' | 'student' | 'pro'
    let generationCount = 0;  // Track generations for free plan
    let generationResetDate = null;  // 30-day reset date
    const STORAGE_KEY = 'rehab_presentation_state_v5';
    const PLAN_STORAGE_KEY = 'rehab_plan_generation_data';

    const database = firebase.database();

    // IMPORTANT: this file's own token-fetch and auth-listener
    // registration normally happen very late (near the bottom, via
    // initialize()/onAuthStateChanged) — well after several
    // unconditional `someElement.addEventListener(...)` calls on
    // presentation.html-specific elements that don't exist on
    // index.html and WILL throw there, aborting the rest of this
    // callback before those ever run. So generateForLixa's own
    // auth/token state would otherwise never get set when this file
    // loads on index.html. Minimal, duplicate-but-harmless early setup
    // here (Firebase supports multiple onAuthStateChanged listeners
    // fine, and fetchTokens() is idempotent) guarantees generate() has
    // what it needs regardless of whether the rest of this callback
    // below completes or crashes. Has to be here rather than right at
    // the top of the callback because fetchTokens() needs `database`,
    // just declared above.
    fetchTokens();
    firebase.auth().onAuthStateChanged(async (user) => {
        currentUser = user;
        if (user) {
            if (window.RehablixCenter && typeof window.RehablixCenter.getEffectiveScopeUid === 'function') {
                try { scopeUid = await window.RehablixCenter.getEffectiveScopeUid('presentation'); }
                catch (err) { scopeUid = user.uid; }
            } else {
                scopeUid = user.uid;
            }
        }
    });


    // Plan-based limits
    const FREE_MONTHLY_LIMIT = 5;
    const FREE_LIMIT_DAYS = 30;

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

    function updateWordCount() {
        if (textInput) {
            const words = textInput.value.trim().split(/\s+/).filter(w => w.length > 0).length;
            textWordCount.textContent = `${words} word${words !== 1 ? 's' : ''}`;
        }
    }

    // =========================================================================
    // Generation Tracking (Free Plan Limit)
    // =========================================================================
    function loadGenerationData() {
        try {
            const data = JSON.parse(localStorage.getItem(PLAN_STORAGE_KEY) || '{}');
            generationCount = data.count || 0;
            generationResetDate = data.resetDate ? new Date(data.resetDate) : null;
            
            // Check if 30 days have passed since last reset
            const now = new Date();
            if (!generationResetDate || (now - generationResetDate) >= (FREE_LIMIT_DAYS * 24 * 60 * 60 * 1000)) {
                // Reset counter
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
        const data = {
            count: generationCount,
            resetDate: generationResetDate ? generationResetDate.toISOString() : new Date().toISOString()
        };
        localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(data));
    }

    function incrementGenerationCount() {
        generationCount++;
        saveGenerationData();
        updateGenerationCounterUI();
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

    function getRemainingGenerations() {
        if (currentPlan === 'student' || currentPlan === 'pro') return Infinity;
        return Math.max(0, FREE_MONTHLY_LIMIT - generationCount);
    }

    function getDaysUntilReset() {
        if (!generationResetDate) return 0;
        const now = new Date();
        const diffTime = (FREE_LIMIT_DAYS * 24 * 60 * 60 * 1000) - (now - generationResetDate);
        return Math.max(0, Math.ceil(diffTime / (24 * 60 * 60 * 1000)));
    }

    // =========================================================================
    // Feature Access Control
    // =========================================================================
    function canAccessPresentationMode() {
        return currentPlan === 'student' || currentPlan === 'pro';
    }

    function canUseCustomOutlines() {
        return currentPlan === 'student' || currentPlan === 'pro';
    }

    function canUseFidelityFlexible() {
        return currentPlan === 'pro';
    }

    function getAvailableOutputSizes() {
        switch (currentPlan) {
            case 'free': return ['3500'];  // Minimal only
            case 'student': return ['3500', '5000'];  // Minimal & Moderate
            case 'pro': return ['3500', '5000', '8000'];  // All
            default: return ['3500'];
        }
    }

    function getDefaultOutputSize() {
        switch (currentPlan) {
            case 'free': return '3500';
            case 'student': return '5000';
            case 'pro': return '8000';
            default: return '3500';
        }
    }

    function updatePlanUI() {
        updateModeTabsUI();
        updateCustomOutlineAccess();
        updateUpgradeNotice();
        updateFidelityOptions();
        updateOutputSizeOptions();
        updateGenerationCounterUI();
        validateForm();
    }

    function updateModeTabsUI() {
        modeTabs.forEach(tab => {
            const mode = tab.dataset.mode;
            if (mode === 'presentation' && !canAccessPresentationMode()) {
                tab.classList.add('locked');
                tab.title = 'Student plan or above required for Presentation mode';
            } else {
                tab.classList.remove('locked');
                tab.title = '';
            }
        });
    }

    function updateCustomOutlineAccess() {
        // Handle custom outline options in Report and Documentation modes
        const reportCustomOption = document.querySelector('input[name="outlineReport"][value="custom"]');
        const docCustomOption = document.querySelector('input[name="outlineDocumentation"][value="custom"]');
        const presentationCustomOption = document.querySelector('input[name="outlinePresentation"][value="custom"]');

        [reportCustomOption, docCustomOption, presentationCustomOption].forEach(option => {
            if (!option) return;
            
            if (!canUseCustomOutlines()) {
                option.disabled = true;
                option.parentElement.style.opacity = '0.5';
                option.parentElement.style.cursor = 'not-allowed';
                option.parentElement.title = 'Student plan or above required for custom outlines';
                
                // Add student badge
                const badge = option.parentElement.querySelector('.plan-badge');
                if (!badge) {
                    const planBadge = document.createElement('span');
                    planBadge.className = 'plan-badge';
                    planBadge.textContent = 'STUDENT+';
                    planBadge.style.cssText = `
                        background: linear-gradient(135deg, #0ea5e9, #0284c7);
                        color: white;
                        padding: 2px 6px;
                        border-radius: 4px;
                        font-size: 0.6rem;
                        font-weight: 700;
                        margin-left: 6px;
                        vertical-align: middle;
                    `;
                    option.parentElement.appendChild(planBadge);
                }
                
                // If custom was selected, switch to default
                if (option.checked) {
                    const defaultOption = option.closest('.outline-selector').querySelector('input[type="radio"]:not([value="custom"])');
                    if (defaultOption) defaultOption.checked = true;
                    // Hide custom textarea
                    if (option.name === 'outlineReport' && customOutlineReport) {
                        customOutlineReport.style.display = 'none';
                        if (customOutlineHintReport) customOutlineHintReport.style.display = 'none';
                    } else if (option.name === 'outlineDocumentation' && customOutlineDocumentation) {
                        customOutlineDocumentation.style.display = 'none';
                        if (customOutlineHintDocumentation) customOutlineHintDocumentation.style.display = 'none';
                    } else if (option.name === 'outlinePresentation' && customOutlinePresentation) {
                        customOutlinePresentation.style.display = 'none';
                        if (customOutlineHintPresentation) customOutlineHintPresentation.style.display = 'none';
                    }
                }
            } else {
                option.disabled = false;
                option.parentElement.style.opacity = '1';
                option.parentElement.style.cursor = 'pointer';
                option.parentElement.title = '';
                
                // Remove badge
                const badge = option.parentElement.querySelector('.plan-badge');
                if (badge) badge.remove();
            }
        });
    }

    function updateGenerationCounterUI() {
        let counterEl = document.getElementById('generationCounter');
        
        if (currentPlan === 'student' || currentPlan === 'pro') {
            if (counterEl) counterEl.remove();
            return;
        }

        if (!counterEl) {
            counterEl = document.createElement('div');
            counterEl.id = 'generationCounter';
            generateBtn.parentNode.insertBefore(counterEl, generateBtn.nextSibling);
        }

        const remaining = getRemainingGenerations();
        const used = generationCount;
        const total = FREE_MONTHLY_LIMIT;
        const daysLeft = getDaysUntilReset();

        let statusColor = '#059669';
        let statusBg = '#f0fdf4';
        let statusBorder = '#86efac';
        
        if (remaining <= 1) {
            statusColor = '#dc2626';
            statusBg = '#fef2f2';
            statusBorder = '#fca5a5';
        } else if (remaining <= 3) {
            statusColor = '#d97706';
            statusBg = '#fffbeb';
            statusBorder = '#fcd34d';
        }

        counterEl.style.cssText = `
            background: ${statusBg};
            border: 1px solid ${statusBorder};
            border-radius: 1rem;
            padding: 0.8rem 1.2rem;
            margin: 1rem 0;
            color: ${statusColor};
            font-size: 0.85rem;
            text-align: center;
            animation: fadeSlideDown 0.4s ease;
        `;

        counterEl.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                <span style="font-size: 1.2rem;">📊</span>
                <strong>Free Plan Limit</strong>
            </div>
            <div style="margin-bottom: 0.3rem;">
                <strong>${used}/${total}</strong> generations used
            </div>
            <div style="font-size: 0.8rem; opacity: 0.8;">
                ${remaining > 0 
                    ? `<strong>${remaining}</strong> remaining · Resets in <strong>${daysLeft}</strong> days` 
                    : `<strong style="color: #dc2626;">Limit reached!</strong> Resets in <strong>${daysLeft}</strong> days`}
            </div>
            <div style="margin-top: 0.4rem; font-size: 0.75rem;">
                <a href="index.html#subscriptionPlans" style="color: #d97706; font-weight: 600; text-decoration: underline;">
                    Upgrade for unlimited generations →
                </a>
            </div>
        `;
    }

    function updateUpgradeNotice() {
        let notice = document.getElementById('upgradeNotice');
        
        if (currentPlan === 'pro') {
            if (notice) notice.remove();
            return;
        }

        if (!notice) {
            notice = document.createElement('div');
            notice.id = 'upgradeNotice';
            generateBtn.parentNode.insertBefore(notice, generateBtn.nextSibling);
        }

        if (currentPlan === 'free') {
            notice.style.cssText = `
                background: linear-gradient(135deg, #fef3c7, #fffbeb);
                border: 2px solid #fbbf24;
                border-radius: 1.2rem;
                padding: 1.2rem;
                margin: 1rem 0;
                color: #92400e;
                font-size: 0.85rem;
                text-align: center;
                box-shadow: 0 4px 12px rgba(251, 191, 36, 0.2);
                position: relative;
                overflow: hidden;
            `;
            notice.innerHTML = `
                <div style="position: absolute; top: -8px; right: -8px; background: #fbbf24; color: white; padding: 3px 10px; border-radius: 1rem; font-size: 0.7rem; font-weight: 600; transform: rotate(3deg);">
                    FREE PLAN
                </div>
                <div style="font-size: 1.8rem; margin-bottom: 0.3rem;">⭐</div>
                <strong style="font-size: 1rem; display: block; margin-bottom: 0.5rem;">
                    Unlock More Features
                </strong>
                <div style="color: #a16207; margin-bottom: 0.6rem; line-height: 1.6; font-size: 0.82rem;">
                    <div style="margin-bottom: 0.3rem;">
                        <span style="color: #dc2626;">✗</span> Presentation Mode &nbsp;
                        <span style="color: #dc2626;">✗</span> Custom Outlines &nbsp;
                        <span style="color: #dc2626;">✗</span> Moderate/Detailed Output
                    </div>
                    <div style="margin-bottom: 0.3rem;">
                        <span style="color: #d97706;">⚠</span> Limited to <strong>5 generations/month</strong>
                    </div>
                    <div>
                        <span style="color: #059669;">✓</span> Report Mode &nbsp;
                        <span style="color: #059669;">✓</span> Documentation Mode &nbsp;
                        <span style="color: #059669;">✓</span> File Upload & OCR
                    </div>
                </div>
                <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
                    <a href="index.html#subscriptionPlans" 
                       style="display: inline-block; padding: 0.5rem 1.2rem; 
                              background: linear-gradient(135deg, #0ea5e9, #0284c7); 
                              color: white; border-radius: 2rem; text-decoration: none; 
                              font-weight: 600; font-size: 0.85rem; transition: all 0.2s ease;"
                       onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 12px rgba(14,165,233,0.4)';"
                       onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='none';">
                        🎓 Get Student
                    </a>
                    <a href="index.html#subscriptionPlans" 
                       style="display: inline-block; padding: 0.5rem 1.2rem; 
                              background: linear-gradient(135deg, #f59e0b, #d97706); 
                              color: white; border-radius: 2rem; text-decoration: none; 
                              font-weight: 600; font-size: 0.85rem; transition: all 0.2s ease;"
                       onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 12px rgba(245,158,11,0.4)';"
                       onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='none';">
                        💎 Get Pro
                    </a>
                </div>
            `;
        } else if (currentPlan === 'student') {
            notice.style.cssText = `
                background: linear-gradient(135deg, #e0f2fe, #f0f9ff);
                border: 2px solid #38bdf8;
                border-radius: 1.2rem;
                padding: 1.2rem;
                margin: 1rem 0;
                color: #075985;
                font-size: 0.85rem;
                text-align: center;
                box-shadow: 0 4px 12px rgba(56, 189, 248, 0.2);
                position: relative;
                overflow: hidden;
            `;
            notice.innerHTML = `
                <div style="position: absolute; top: -8px; right: -8px; background: #38bdf8; color: white; padding: 3px 10px; border-radius: 1rem; font-size: 0.7rem; font-weight: 600; transform: rotate(3deg);">
                    STUDENT PLAN
                </div>
                <div style="font-size: 1.8rem; margin-bottom: 0.3rem;">🎓</div>
                <strong style="font-size: 1rem; display: block; margin-bottom: 0.5rem;">
                    Upgrade to Pro for Full Power
                </strong>
                <div style="color: #075985; margin-bottom: 0.6rem; line-height: 1.6; font-size: 0.82rem;">
                    <div style="margin-bottom: 0.3rem;">
                        <span style="color: #059669;">✓</span> Presentation Mode &nbsp;
                        <span style="color: #059669;">✓</span> Custom Outlines &nbsp;
                        <span style="color: #059669;">✓</span> Moderate Output &nbsp;
                        <span style="color: #059669;">✓</span> Unlimited Generations
                    </div>
                    <div>
                        <span style="color: #dc2626;">✗</span> Detailed Output (5000 tokens) &nbsp;
                        <span style="color: #dc2626;">✗</span> Flexible AI Mode
                    </div>
                </div>
                <a href="index.html#subscriptionPlans" 
                   style="display: inline-block; padding: 0.5rem 1.5rem; 
                          background: linear-gradient(135deg, #f59e0b, #d97706); 
                          color: white; border-radius: 2rem; text-decoration: none; 
                          font-weight: 600; font-size: 0.85rem; transition: all 0.2s ease;"
                   onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 12px rgba(245,158,11,0.4)';"
                   onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='none';">
                    💎 Upgrade to Pro
                </a>
            `;
        }
    }

    function updateFidelityOptions() {
        const flexibleOption = document.querySelector('input[name="contentFidelity"][value="flexible"]');
        const strictOption = document.querySelector('input[name="contentFidelity"][value="strict"]');
        
        if (!flexibleOption || !strictOption) return;
        
        if (!canUseFidelityFlexible()) {
            flexibleOption.disabled = true;
            flexibleOption.parentElement.style.opacity = '0.5';
            flexibleOption.parentElement.style.cursor = 'not-allowed';
            flexibleOption.parentElement.title = 'Pro plan required for Flexible mode';
            
            const badge = flexibleOption.parentElement.querySelector('.pro-badge');
            if (!badge) {
                const proBadge = document.createElement('span');
                proBadge.className = 'pro-badge';
                proBadge.textContent = 'PRO';
                proBadge.style.cssText = `
                    background: linear-gradient(135deg, #f59e0b, #d97706);
                    color: white;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 0.6rem;
                    font-weight: 700;
                    margin-left: 6px;
                    vertical-align: middle;
                `;
                flexibleOption.parentElement.appendChild(proBadge);
            }
            
            if (flexibleOption.checked) {
                strictOption.checked = true;
            }
        } else {
            flexibleOption.disabled = false;
            flexibleOption.parentElement.style.opacity = '1';
            flexibleOption.parentElement.style.cursor = 'pointer';
            flexibleOption.parentElement.title = '';
            
            const badge = flexibleOption.parentElement.querySelector('.pro-badge');
            if (badge) badge.remove();
        }
    }

    function updateOutputSizeOptions() {
        const available = getAvailableOutputSizes();
        
        outputSizeRadios.forEach(radio => {
            const value = radio.value;
            const label = radio.parentElement;
            
            if (!available.includes(value)) {
                radio.disabled = true;
                label.style.opacity = '0.5';
                label.style.cursor = 'not-allowed';
                
                let badgeText = '';
                if (value === '3500') badgeText = 'STUDENT+';
                if (value === '5000') badgeText = 'PRO';
                
                if (badgeText) {
                    let badge = label.querySelector('.plan-badge');
                    if (!badge) {
                        badge = document.createElement('span');
                        badge.className = 'plan-badge';
                        badge.style.cssText = `
                            background: linear-gradient(135deg, #f59e0b, #d97706);
                            color: white;
                            padding: 2px 6px;
                            border-radius: 4px;
                            font-size: 0.6rem;
                            font-weight: 700;
                            margin-left: 6px;
                            vertical-align: middle;
                        `;
                        label.appendChild(badge);
                    }
                    badge.textContent = badgeText;
                }
                
                if (radio.checked) {
                    // Select the highest available option
                    const defaultOption = document.querySelector(`input[name="outputSize"][value="${getDefaultOutputSize()}"]`);
                    if (defaultOption && !defaultOption.disabled) {
                        defaultOption.checked = true;
                    }
                }
            } else {
                radio.disabled = false;
                label.style.opacity = '1';
                label.style.cursor = 'pointer';
                
                const badge = label.querySelector('.plan-badge');
                if (badge) badge.remove();
            }
        });
        
        // Ensure a valid option is selected
        const selected = document.querySelector('input[name="outputSize"]:checked');
        if (!selected || selected.disabled) {
            const defaultOption = document.querySelector(`input[name="outputSize"][value="${getDefaultOutputSize()}"]`);
            if (defaultOption) defaultOption.checked = true;
        }
    }

    function validateForm() {
        const hasText = textInput.value.trim() !== '';
        const hasFiles = attachments.length > 0;
        const hasProfession = professionSelect.value !== '';
        const hasPatientName = patientName.value.trim() !== '';
        
        generateBtn.disabled = !((hasText || hasFiles) && hasProfession && hasPatientName);
    }

    // =========================================================================
    // Plan Management
    // =========================================================================
    document.addEventListener('planUpdated', (e) => {
        const newPlan = e.detail?.plan || 'free';
        if (newPlan !== currentPlan) {
            currentPlan = newPlan;
            console.log('[PLAN] Updated to:', currentPlan);
            loadGenerationData();  // Reload generation data
            updatePlanUI();
            
            // If on Presentation mode and can't access, switch to Report
            if (currentMode === 'presentation' && !canAccessPresentationMode()) {
                switchMode('report');
            }
        }
    });

    // Check initial plan
    if (window.rehabPlans) {
        currentPlan = window.rehabPlans.getCurrentPlan() || 'free';
        loadGenerationData();
        updatePlanUI();
    }

    // =========================================================================
    // Mode Switching
    // =========================================================================
    function switchMode(mode) {
        if (mode === 'presentation' && !canAccessPresentationMode()) {
            showToast('🎓 Presentation Mode requires Student plan or above. You can still use Report and Documentation modes.', 'info', 5000);
            
            const notice = document.getElementById('upgradeNotice');
            if (notice) {
                notice.style.animation = 'none';
                notice.offsetHeight;
                notice.style.animation = 'pulse 0.5s ease 2';
                notice.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
        }
        
        if (mode === currentMode) return;
        
        currentMode = mode;
        
        modeTabs.forEach(t => {
            t.classList.toggle('active', t.dataset.mode === mode);
        });
        
        configSections.forEach(section => {
            section.style.display = section.dataset.mode === mode ? 'block' : 'none';
        });
        
        const buttonLabels = {
            presentation: 'Generate Presentation',
            report: 'Generate Report',
            documentation: 'Generate Documentation'
        };
        if (generateBtnText) {
            generateBtnText.textContent = buttonLabels[mode] || 'Generate';
        }
        
        // Reset custom outline visibility
        if (mode === 'presentation') {
            const checked = document.querySelector('input[name="outlinePresentation"]:checked');
            const isCustom = checked?.value === 'custom' && canUseCustomOutlines();
            if (customOutlinePresentation) customOutlinePresentation.style.display = isCustom ? 'block' : 'none';
            if (customOutlineHintPresentation) customOutlineHintPresentation.style.display = isCustom ? 'flex' : 'none';
        } else if (mode === 'report') {
            const checked = document.querySelector('input[name="outlineReport"]:checked');
            const isCustom = checked?.value === 'custom' && canUseCustomOutlines();
            if (customOutlineReport) customOutlineReport.style.display = isCustom ? 'block' : 'none';
            if (customOutlineHintReport) customOutlineHintReport.style.display = isCustom ? 'flex' : 'none';
        } else if (mode === 'documentation') {
            const checked = document.querySelector('input[name="outlineDocumentation"]:checked');
            const isCustom = checked?.value === 'custom' && canUseCustomOutlines();
            if (customOutlineDocumentation) customOutlineDocumentation.style.display = isCustom ? 'block' : 'none';
            if (customOutlineHintDocumentation) customOutlineHintDocumentation.style.display = isCustom ? 'flex' : 'none';
        }
        
        validateForm();
        saveProgress();
    }

    modeTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            switchMode(tab.dataset.mode);
        });
    });

    // =========================================================================
    // Upload Modal Management
    // =========================================================================
    function openUploadModal() {
        uploadModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeUploadModalFn() {
        uploadModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    multiDropZone.addEventListener('click', (e) => {
        if (e.target.closest('.attachment-chip')) return;
        openUploadModal();
    });

    closeUploadModalBtn.addEventListener('click', closeUploadModalFn);
    uploadModalOverlay.addEventListener('click', closeUploadModalFn);

    uploadOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = option.dataset.action;
            closeUploadModalFn();
            switch (action) {
                case 'camera':
                    cameraInput.click();
                    break;
                case 'photo':
                    multiFileInput.accept = 'image/*';
                    multiFileInput.click();
                    break;
                case 'document':
                    multiFileInput.accept = '.pdf,.docx,.txt,.doc';
                    multiFileInput.click();
                    break;
            }
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && uploadModal.classList.contains('active')) {
            closeUploadModalFn();
        }
    });

    // =========================================================================
    // Suggestion chips
    // =========================================================================
    if (suggestionChips) {
        suggestionChips.addEventListener('click', (e) => {
            const chip = e.target.closest('.suggestion-chip');
            if (!chip) return;
            const text = chip.dataset.text;
            if (text && additionalInstructions) {
                const wasActive = chip.classList.contains('active');
                suggestionChips.querySelectorAll('.suggestion-chip').forEach(c => c.classList.remove('active'));
                
                if (!wasActive) {
                    chip.classList.add('active');
                    additionalInstructions.value = text;
                } else {
                    additionalInstructions.value = '';
                }
                
                saveProgress();
                validateForm();
                showToast(wasActive ? 'Instruction removed' : 'Instruction added', 'info');
            }
        });
    }

    // =========================================================================
    // Output size helper
    // =========================================================================
    function getSelectedOutputSize() {
        const selected = document.querySelector('input[name="outputSize"]:checked');
        const value = selected ? parseInt(selected.value, 10) : parseInt(getDefaultOutputSize(), 10);
        
        const available = getAvailableOutputSizes();
        if (!available.includes(String(value))) {
            return parseInt(getDefaultOutputSize(), 10);
        }
        
        return value;
    }

    // =========================================================================
    // Content Fidelity helper
    // =========================================================================
    function getContentFidelity() {
        const selected = document.querySelector('input[name="contentFidelity"]:checked');
        const value = selected ? selected.value : 'strict';
        
        if (!canUseFidelityFlexible()) {
            return 'strict';
        }
        
        return value;
    }

    // =========================================================================
    // Outline helpers
    // =========================================================================
    function setupOutlineToggle(radios, customTextarea, customHint) {
        radios.forEach(radio => {
            radio.addEventListener('change', () => {
                const isCustom = radio.value === 'custom' && canUseCustomOutlines();
                if (customTextarea) customTextarea.style.display = isCustom ? 'block' : 'none';
                if (customHint) customHint.style.display = isCustom ? 'flex' : 'none';
                saveProgress();
            });
        });
    }

    setupOutlineToggle(outlineRadiosPresentation, customOutlinePresentation, customOutlineHintPresentation);
    setupOutlineToggle(outlineRadiosReport, customOutlineReport, customOutlineHintReport);
    setupOutlineToggle(outlineRadiosDocumentation, customOutlineDocumentation, customOutlineHintDocumentation);

    function getSelectedOutline() {
        let selectedRadio;
        let customText = '';
        
        if (currentMode === 'presentation') {
            selectedRadio = document.querySelector('input[name="outlinePresentation"]:checked');
            customText = canUseCustomOutlines() ? ((customOutlinePresentation?.value || '').trim()) : '';
        } else if (currentMode === 'report') {
            selectedRadio = document.querySelector('input[name="outlineReport"]:checked');
            customText = canUseCustomOutlines() ? ((customOutlineReport?.value || '').trim()) : '';
        } else if (currentMode === 'documentation') {
            selectedRadio = document.querySelector('input[name="outlineDocumentation"]:checked');
            customText = canUseCustomOutlines() ? ((customOutlineDocumentation?.value || '').trim()) : '';
        }

        if (!selectedRadio) return 'SOAP format';

        const value = selectedRadio.value;
        if (value === 'custom' && canUseCustomOutlines()) return customText || 'Custom outline';
        if (value === 'custom') {
            // Fallback if custom not available but somehow selected
            return 'SOAP format';
        }

        const outlines = {
            presentation: {
                soap: 'SOAP format: Subjective (patient report), Objective (findings), Assessment, Plan',
                full: 'Full assessment: Relevant History, Examination findings, Functional status, Recommendations',
                quick: 'Quick update: Key changes since last review, Current status, Next steps'
            },
            report: {
                progress: 'Progress Note structure: Interval history, Current status, Plan for next period',
                discharge: 'Discharge Summary structure: Admission diagnosis, Course, Condition at discharge, Follow‑up plan',
                consult: 'Consultation Note structure: Reason for consult, History, Findings, Recommendations'
            },
            documentation: {
                soap: 'SOAP note: Subjective, Objective, Assessment, Plan',
                admission: 'Admission note: History of present illness, Review of systems, Physical exam, Impression, Plan',
                daily: 'Daily progress note: Events, Vitals, Physical exam, Lab results, Plan'
            }
        };

        return outlines[currentMode]?.[value] || 'Standard clinical note structure';
    }

    // =========================================================================
    // Attachments (same as before)
    // =========================================================================
    function renderAttachments() {
        if (attachments.length === 0) {
            attachmentsList.style.display = 'none';
            attachmentsList.innerHTML = '';
            return;
        }
        attachmentsList.style.display = 'flex';
        attachmentsList.innerHTML = '';

        attachments.forEach((att, index) => {
            const chip = document.createElement('div');
            chip.className = 'attachment-chip';

            if (att.type === 'image' && att.dataURL) {
                const img = document.createElement('img');
                img.src = att.dataURL;
                img.alt = att.name;
                chip.appendChild(img);
            } else {
                const iconDiv = document.createElement('div');
                iconDiv.className = 'file-icon';
                iconDiv.innerHTML = '<i class="fas fa-file-alt"></i>';
                chip.appendChild(iconDiv);
            }

            const nameSpan = document.createElement('span');
            nameSpan.textContent = att.name.length > 20 ? att.name.substring(0, 20) + '...' : att.name;
            nameSpan.title = att.name;
            chip.appendChild(nameSpan);

            if (att.processing) {
                const spinner = document.createElement('span');
                spinner.className = 'attachment-processing';
                spinner.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
                spinner.style.fontSize = '0.75rem';
                spinner.style.color = 'var(--text-secondary)';
                spinner.style.marginLeft = '0.25rem';
                chip.appendChild(spinner);
            }

            if (att.ocrProcessing) {
                const spinner = document.createElement('span');
                spinner.className = 'attachment-processing';
                spinner.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Extracting text...';
                spinner.style.fontSize = '0.75rem';
                spinner.style.color = 'var(--text-secondary)';
                spinner.style.marginLeft = '0.25rem';
                chip.appendChild(spinner);
            }

            if (att.type === 'image' && !att.ocrProcessing && att.ocrText !== undefined) {
                const checkIcon = document.createElement('span');
                checkIcon.className = 'attachment-ocr-done';
                checkIcon.innerHTML = att.ocrText ? '✓ Text found' : '⚠ No text';
                checkIcon.style.fontSize = '0.7rem';
                checkIcon.style.color = att.ocrText ? '#10b981' : '#f59e0b';
                checkIcon.style.marginLeft = '0.25rem';
                chip.appendChild(checkIcon);
            }

            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-attachment';
            removeBtn.innerHTML = '&times;';
            removeBtn.title = 'Remove attachment';
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                attachments.splice(index, 1);
                renderAttachments();
                validateForm();
                saveProgress();
            });
            chip.appendChild(removeBtn);

            attachmentsList.appendChild(chip);
        });
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

    async function loadTesseract() {
        if (window.Tesseract) return window.Tesseract;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/tesseract.js@v5.0.0/dist/tesseract.min.js';
            script.onload = () => resolve(window.Tesseract);
            script.onerror = () => reject(new Error('Failed to load image text extractor.'));
            document.head.appendChild(script);
        });
    }

    async function runOCR(dataURL) {
        try {
            const Tesseract = await loadTesseract();
            const result = await Tesseract.recognize(dataURL, 'eng', {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        console.log('OCR progress:', Math.round(m.progress * 100) + '%');
                    }
                }
            });
            return result.data.text.trim();
        } catch (err) {
            console.warn('OCR failed:', err);
            return '';
        }
    }

    async function extractTextFromFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();

        if (ext === 'txt') {
            const reader = new FileReader();
            return new Promise((resolve, reject) => {
                reader.onload = e => resolve(e.target.result);
                reader.onerror = () => reject(new Error('Could not read text file.'));
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
                const maxPages = Math.min(pdf.numPages, 30);
                for (let i = 1; i <= maxPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    fullText += content.items.map(item => item.str).join(' ') + '\n';
                }
                if (pdf.numPages > maxPages) {
                    fullText += `\n[Note: Only first ${maxPages} of ${pdf.numPages} pages processed.]`;
                }
                return fullText;
            } catch (err) {
                throw new Error('Could not read PDF. It may be encrypted or damaged.');
            }
        }

        if (ext === 'docx') {
            try {
                const mammoth = await loadMammoth();
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.extractRawText({ arrayBuffer });
                return result.value;
            } catch (err) {
                throw new Error('Could not read Word document.');
            }
        }

        if (ext === 'doc') {
            throw new Error('Old .doc files not supported. Please convert to .docx or PDF.');
        }

        throw new Error('File type not supported. Use PDF, DOCX, or TXT.');
    }

    async function compressImageIfNeeded(dataURL) {
        if (!dataURL || dataURL.length < 500 * 1024) return dataURL;
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                const maxDim = 1024;
                if (w > maxDim || h > maxDim) {
                    if (w > h) { h = (h / w) * maxDim; w = maxDim; }
                    else { w = (w / h) * maxDim; h = maxDim; }
                }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                let quality = 0.8;
                let result = canvas.toDataURL('image/jpeg', quality);
                while (result.length > 1 * 1024 * 1024 && quality > 0.3) {
                    quality -= 0.1;
                    result = canvas.toDataURL('image/jpeg', quality);
                }
                resolve(result);
            };
            img.src = dataURL;
        });
    }

    async function processFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();

        if (['pdf', 'docx', 'doc', 'txt'].includes(ext)) {
            const idx = attachments.push({
                type: 'document',
                name: file.name,
                textContent: null,
                processing: true
            }) - 1;
            renderAttachments();
            showToast('Processing document…', 'info', 2000);
            try {
                const text = await extractTextFromFile(file);
                attachments[idx].textContent = text.substring(0, 15000);
                attachments[idx].processing = false;
                renderAttachments();
                showToast('Document added', 'success');
            } catch (err) {
                attachments.splice(idx, 1);
                renderAttachments();
                showToast(err.message, 'error');
                return;
            }
        } else if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            const dataURL = await new Promise(resolve => {
                reader.onload = e => resolve(e.target.result);
                reader.readAsDataURL(file);
            });
            const compressed = await compressImageIfNeeded(dataURL);

            const attObj = {
                type: 'image',
                name: file.name,
                dataURL: compressed,
                ocrText: '',
                ocrProcessing: true
            };
            const idx = attachments.push(attObj) - 1;
            renderAttachments();
            showToast('Image added, extracting text…', 'info', 2000);

            runOCR(compressed)
                .then(ocrResult => {
                    attachments[idx].ocrText = ocrResult || '';
                    attachments[idx].ocrProcessing = false;
                    renderAttachments();
                    if (ocrResult) showToast('Text extracted from image', 'success', 2000);
                    else showToast('No text found in image', 'info', 2500);
                    saveProgress();
                })
                .catch(err => {
                    console.warn('OCR error', err);
                    attachments[idx].ocrText = '';
                    attachments[idx].ocrProcessing = false;
                    renderAttachments();
                    saveProgress();
                });
        } else {
            showToast(`File type not supported: ${file.name}`, 'error');
            return;
        }

        validateForm();
        saveProgress();
    }

    function handleFiles(files) {
        if (!files || files.length === 0) return;
        const maxFiles = 10 - attachments.length;
        if (files.length > maxFiles) {
            showToast(`Max ${maxFiles} more file${maxFiles !== 1 ? 's' : ''} (10 total)`, 'warning');
            return;
        }
        Array.from(files).forEach(f => processFile(f));
        multiFileInput.accept = '.pdf,.docx,.txt,.doc,image/*';
    }

    multiFileInput.addEventListener('change', () => {
        if (multiFileInput.files.length) {
            handleFiles(multiFileInput.files);
            multiFileInput.value = '';
        }
    });

    cameraInput.addEventListener('change', () => {
        if (cameraInput.files.length) {
            handleFiles(cameraInput.files);
            cameraInput.value = '';
        }
    });

    multiDropZone.addEventListener('dragover', e => {
        e.preventDefault();
        multiDropZone.style.borderColor = 'var(--presentation-accent)';
    });

    multiDropZone.addEventListener('dragleave', () => {
        multiDropZone.style.borderColor = 'var(--border-light)';
    });

    multiDropZone.addEventListener('drop', e => {
        e.preventDefault();
        multiDropZone.style.borderColor = 'var(--border-light)';
        handleFiles(e.dataTransfer.files);
    });

    clearTextBtn.addEventListener('click', () => {
        if (textInput.value.trim() && !confirm('Clear all text?')) return;
        textInput.value = '';
        updateWordCount();
        validateForm();
        saveProgress();
        showToast('Text cleared', 'info');
    });

    textInput.addEventListener('input', () => {
        updateWordCount();
        validateForm();
    });

    // =========================================================================
    // Auto‑save
    // =========================================================================
    async function saveProgress() {
        if (isRestoring) return;
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            const state = {
                version: 5,
                mode: currentMode,
                textContent: textInput.value,
                attachmentMeta: attachments.map(a => ({
                    type: a.type,
                    name: a.name,
                    ocrText: a.ocrText || ''
                })),
                patientName: patientName.value,
                patientAge: patientAge.value,
                patientGender: patientGender.value,
                patientMRN: patientMRN.value,
                patientDiagnosis: patientDiagnosis.value,
                profession: professionSelect.value,
                outlinePresentation: document.querySelector('input[name="outlinePresentation"]:checked')?.value || 'soap',
                outlineReport: document.querySelector('input[name="outlineReport"]:checked')?.value || 'progress',
                outlineDocumentation: document.querySelector('input[name="outlineDocumentation"]:checked')?.value || 'soap',
                customOutlinePresentation: canUseCustomOutlines() ? (customOutlinePresentation?.value || '') : '',
                customOutlineReport: canUseCustomOutlines() ? (customOutlineReport?.value || '') : '',
                customOutlineDocumentation: canUseCustomOutlines() ? (customOutlineDocumentation?.value || '') : '',
                additionalInstructions: additionalInstructions.value,
                outputSize: document.querySelector('input[name="outputSize"]:checked')?.value || getDefaultOutputSize(),
                contentFidelity: getContentFidelity(),
                timestamp: Date.now()
            };
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            } catch (e) {
                const { attachmentMeta, ...rest } = state;
                try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rest)); } catch (e2) {}
            }
        }, 300);
    }

    async function loadProgress() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return false;
        try {
            isRestoring = true;
            const state = JSON.parse(saved);
            
            if (state.mode && state.mode !== currentMode) {
                if (state.mode === 'presentation' && !canAccessPresentationMode()) {
                    // Skip presentation if no access
                } else {
                    switchMode(state.mode);
                }
            }
            
            if (state.textContent) {
                textInput.value = state.textContent;
                updateWordCount();
            }
            if (state.attachmentMeta?.length) {
                attachments = state.attachmentMeta.map(m => ({
                    type: m.type,
                    name: m.name,
                    ocrText: m.ocrText || '',
                    ocrProcessing: false,
                    textContent: m.type === 'document' ? null : undefined,
                    dataURL: null
                }));
                renderAttachments();
                showToast('Previously attached files shown. Some may need re‑upload.', 'warning', 4000);
            }
            if (state.patientName) patientName.value = state.patientName;
            if (state.patientAge) patientAge.value = state.patientAge;
            if (state.patientGender) patientGender.value = state.patientGender;
            if (state.patientMRN) patientMRN.value = state.patientMRN;
            if (state.patientDiagnosis) patientDiagnosis.value = state.patientDiagnosis;
            if (state.profession) professionSelect.value = state.profession;
            
            if (state.outlinePresentation) {
                const radio = document.querySelector(`input[name="outlinePresentation"][value="${state.outlinePresentation}"]`);
                if (radio && !radio.disabled) {
                    radio.checked = true;
                }
            }
            if (state.outlineReport) {
                const radio = document.querySelector(`input[name="outlineReport"][value="${state.outlineReport}"]`);
                if (radio && !radio.disabled) {
                    radio.checked = true;
                }
            }
            if (state.outlineDocumentation) {
                const radio = document.querySelector(`input[name="outlineDocumentation"][value="${state.outlineDocumentation}"]`);
                if (radio && !radio.disabled) {
                    radio.checked = true;
                }
            }
            
            if (canUseCustomOutlines()) {
                if (state.customOutlinePresentation) customOutlinePresentation.value = state.customOutlinePresentation;
                if (state.customOutlineReport) customOutlineReport.value = state.customOutlineReport;
                if (state.customOutlineDocumentation) customOutlineDocumentation.value = state.customOutlineDocumentation;
            }
            
            if (state.additionalInstructions) additionalInstructions.value = state.additionalInstructions;
            
            if (state.outputSize) {
                const available = getAvailableOutputSizes();
                if (available.includes(state.outputSize)) {
                    const sizeRadio = document.querySelector(`input[name="outputSize"][value="${state.outputSize}"]`);
                    if (sizeRadio) sizeRadio.checked = true;
                }
            }

            if (state.contentFidelity) {
                if (canUseFidelityFlexible() || state.contentFidelity === 'strict') {
                    const fidelityRadio = document.querySelector(`input[name="contentFidelity"][value="${state.contentFidelity}"]`);
                    if (fidelityRadio) fidelityRadio.checked = true;
                }
            }
            
            validateForm();
            isRestoring = false;
            return true;
        } catch (e) {
            console.error('Restore error:', e);
            isRestoring = false;
            return false;
        }
    }

    [textInput, patientName, patientAge, patientMRN, patientDiagnosis, additionalInstructions]
        .forEach(el => el?.addEventListener('input', saveProgress));
    
    patientGender?.addEventListener('change', saveProgress);
    professionSelect?.addEventListener('change', saveProgress);
    
    [outlineRadiosPresentation, outlineRadiosReport, outlineRadiosDocumentation].forEach(group => {
        group.forEach(r => r.addEventListener('change', saveProgress));
    });
    
    if (outputSizeRadios.length) {
        outputSizeRadios.forEach(r => r.addEventListener('change', saveProgress));
    }

    if (contentFidelityRadios.length) {
        contentFidelityRadios.forEach(r => r.addEventListener('change', saveProgress));
    }

    [patientName, patientAge, patientDiagnosis].forEach(el => el?.addEventListener('input', validateForm));
    patientGender?.addEventListener('change', validateForm);
    professionSelect?.addEventListener('change', validateForm);

    // =========================================================================
    // AI Generation
    // =========================================================================
    async function generatePresentation(overrideText) {
        if (!aiConfig.token) {
            const ok = await fetchTokens();
            if (!ok) throw new Error('The AI service is not set up. Please contact support.');
        }

        let combinedText = overrideText !== undefined ? overrideText : (textInput ? textInput.value.trim() : '');

        const docTexts = attachments
            .filter(a => a.type === 'document' && a.textContent)
            .map(a => a.textContent)
            .join('\n\n');
        if (docTexts) {
            combinedText += (combinedText ? '\n\n--- Document Content ---\n\n' : '') + docTexts;
        }

        const imageOcrTexts = attachments
            .filter(a => a.type === 'image' && a.ocrText)
            .map(a => a.ocrText)
            .join('\n\n');
        if (imageOcrTexts) {
            combinedText += (combinedText ? '\n\n--- Text from Images ---\n\n' : '') + imageOcrTexts;
        }

        if (!combinedText && attachments.length === 0) {
            throw new Error('No content to generate from.');
        }

        const patientInfo = {
            name: patientName?.value?.trim() || 'N/A',
            age: patientAge?.value || 'N/A',
            gender: patientGender?.value || 'N/A',
            mrn: patientMRN?.value?.trim() || 'N/A',
            diagnosis: patientDiagnosis?.value?.trim() || 'N/A'
        };
        const profession = professionSelect?.options?.[professionSelect.selectedIndex]?.text || 'Healthcare Professional';
        const outline = getSelectedOutline();
        const instructions = additionalInstructions?.value?.trim() || 'None';
        const maxTokens = getSelectedOutputSize();
        const fidelityMode = getContentFidelity();
        const isStrict = fidelityMode === 'strict';

        const modeLabels = {
            presentation: 'Case Presentation',
            report: 'Clinical Report',
            documentation: 'Clinical Documentation'
        };
        const modeText = modeLabels[currentMode] || 'Clinical Document';
        
        const modeContext = {
            presentation: 'a multidisciplinary ward round',
            report: 'a formal clinical report',
            documentation: 'clinical documentation'
        };
        const contextText = modeContext[currentMode] || 'clinical review';

        const fidelityRule = isStrict
            ? `0. **FIDELITY RULE (STRICT):** Do NOT invent or assume ANY clinical information not explicitly provided. If data is missing, state "not provided" or "not documented".`
            : `0. **FIDELITY RULE (FLEXIBLE):** You may add plausible clinical details where needed, but clearly indicate inferred findings as "likely" or "based on typical presentation".`;

        const systemPrompt = `You are an expert clinical assistant helping a ${profession} prepare a **${modeText}** for ${contextText}.

**CRITICAL INSTRUCTIONS:**

${fidelityRule}

1. **Follow this outline:** ${outline}

2. **Be comprehensive:**
   - Substantial content in each section
   - Specific clinical details and measurements
   - Clear clinical reasoning
   - Actionable recommendations

3. **Format:** Markdown headings (##), bullet points (-), **bold** for emphasis. Use a markdown table for structured tabular data where it aids clarity — vitals, ROM/strength measurements, medication lists — but don't force data into a table if plain prose reads better.

4. **Tone:** Professional, objective, patient-centered.`;

        let userContent = `**TASK:** Create a ${modeText.toLowerCase()} for:

**PATIENT:**
- Name: ${patientInfo.name}, Age: ${patientInfo.age}, Gender: ${patientInfo.gender}
- MRN: ${patientInfo.mrn}
- Diagnosis: ${patientInfo.diagnosis}

**CLINICIAN:** ${profession}
**INSTRUCTIONS:** ${instructions}
**FIDELITY:** ${isStrict ? 'STRICT' : 'FLEXIBLE'}

**CLINICAL NOTES:**
${combinedText || 'No notes provided.'}`;

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
        ];

        console.log('[AI] Generating... Mode:', currentMode, '| Fidelity:', fidelityMode);

        // ---------------------------------------------------------------
        // BUGFIX: the old code did `data.choices[0].message.content` and
        // returned it as-is. Occasionally the AI backend returns a 200 OK
        // with NO usable content — most commonly because:
        //   (a) the model's safety/content filter silently rejected the
        //       clinical notes (diagnoses, drug names, injury descriptions
        //       are common false-positive triggers), or
        //   (b) the response was truncated by max_tokens before any real
        //       content was written.
        // Either way, that empty string used to get saved straight to
        // Firebase as the result, which is exactly what produced the
        // "No content available" screen. We now validate the response,
        // retry once automatically (with headroom added to the token
        // budget, in case (b) was the cause), and only fail with a clear,
        // actionable message if it's still empty.
        const result = await callAIWithValidation(messages, maxTokens);
        return result.content;
    }

    // Reusable entry point for Lixa (this round's refactor) — the same
    // auth/quota checks the Generate button's click handler already
    // does, then calls the exact same generatePresentation()/
    // saveToHistory() above; no generation or export logic is
    // duplicated, only the routing checks.
    async function generateForLixa(text) {
        text = (text || '').trim();
        if (!text) return { status: 'error', message: 'No content to generate from.' };

        if (!currentUser) return { status: 'auth-required' };

        if (!canGenerateMore()) {
            const daysLeft = getDaysUntilReset();
            return { status: 'limit-reached', daysLeft };
        }

        // scopeUid settles asynchronously after onAuthStateChanged fires
        // (it may call out to RehablixCenter first) — give it a brief
        // moment rather than saving under a stale/null scope.
        for (let i = 0; i < 15 && scopeUid === null && currentUser; i++) {
            await new Promise(r => setTimeout(r, 100));
        }
        if (scopeUid === null && currentUser) scopeUid = currentUser.uid;

        try {
            const rawMarkdown = await generatePresentation(text);
            if (!rawMarkdown || rawMarkdown.trim().length < 20) {
                return { status: 'error', message: 'Generation produced no usable content. Please try again.' };
            }
            const htmlContent = marked.parse(rawMarkdown);
            const historyId = await saveToHistory(rawMarkdown, htmlContent);
            incrementGenerationCount();
            const modeLabels = { presentation: 'Case Presentation', report: 'Clinical Report', documentation: 'Documentation' };
            return {
                status: 'success',
                toolName: modeLabels[currentMode] || 'Clinical Document',
                content: htmlContent,
                historyId,
                viewUrl: historyId ? `result.html?type=case&id=${historyId}` : null
            };
        } catch (err) {
            console.error('[Lixa] presentation generation failed:', err);
            return { status: 'error', message: err && err.message ? err.message : 'Something went wrong generating this.' };
        }
    }

    async function callAIWithValidation(messages, maxTokens, attempt = 1) {
        const url = `${aiConfig.endpoint}/chat/completions`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${aiConfig.token}`
            },
            body: JSON.stringify({
                model: aiConfig.model,
                messages,
                max_tokens: maxTokens,
                temperature: 0.3,
                top_p: 0.9
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            if (window.reportApiError) {
                window.reportApiError({
                    status: response.status,
                    bodyText: JSON.stringify(errData),
                    tool: 'presentation',
                    context: `generate ${currentMode} (attempt ${attempt})`
                });
            }
            if (response.status === 401) throw new Error('Authentication failed.');
            if (response.status === 429) throw new Error('Too many requests. Wait a moment.');
            if (response.status === 503) throw new Error('Service temporarily busy.');
            throw new Error(errData?.error?.message || `Error ${response.status}`);
        }

        const data = await response.json();
        const choice = data.choices && data.choices[0];
        const finishReason = choice ? choice.finish_reason : null;
        const content = (choice && choice.message && typeof choice.message.content === 'string')
            ? choice.message.content.trim()
            : '';

        if (finishReason === 'content_filter') {
            if (window.reportApiError) {
                window.reportApiError({
                    status: 200,
                    bodyText: `content_filter triggered (attempt ${attempt})`,
                    tool: 'presentation',
                    context: `generate ${currentMode}`
                });
            }
            throw new Error('The AI declined to generate this content, most likely due to sensitive wording in the notes (certain diagnoses, medications, or injury descriptions can trigger this). Try rephrasing and generate again.');
        }

        // Empty/near-empty content: retry once with a bigger token budget
        // before giving up, in case it was truncated mid-reasoning.
        if (content.length < 20) {
            if (attempt < 2) {
                console.warn(`[AI] Empty/short response (finish_reason=${finishReason}). Retrying with more headroom…`);
                return callAIWithValidation(messages, Math.min(maxTokens + 1500, 8000), attempt + 1);
            }
            if (window.reportApiError) {
                window.reportApiError({
                    status: 200,
                    bodyText: `Empty response after ${attempt} attempts, finish_reason=${finishReason}`,
                    tool: 'presentation',
                    context: `generate ${currentMode}`
                });
            }
            throw new Error('The AI returned an empty response after two attempts. Please try again, or choose a larger output size and retry.');
        }

        // Truncated but non-empty: still usable, but warn the user so they
        // know to pick a larger output size next time rather than assume
        // the document is complete.
        if (finishReason === 'length') {
            showToast('⚠️ Output may be cut short — consider choosing a larger output size for a complete document.', 'info', 6000);
        }

        return { content, finishReason };
    }

    async function saveToHistory(rawMarkdown, htmlContent) {
        if (!currentUser) return null;
        
        const modeLabels = {
            presentation: 'Case Presentation',
            report: 'Clinical Report',
            documentation: 'Documentation'
        };
        const docType = modeLabels[currentMode] || 'Clinical Document';
        
        try {
            const ref = await database.ref(`history/${scopeUid}/caseHistory`).push({
                contentType: currentMode,
                fileName: `${docType} - ${patientName?.value || 'Patient'}`,
                documentType: docType,
                patientName: patientName?.value?.trim() || '',
                patientAge: patientAge?.value || '',
                patientGender: patientGender?.value || '',
                patientMRN: patientMRN?.value?.trim() || '',
                diagnosis: patientDiagnosis?.value?.trim() || '',
                profession: professionSelect?.value || '',
                results: rawMarkdown,
                resultsMarkdown: rawMarkdown,
                resultsHtml: htmlContent,
                outputSize: getSelectedOutputSize(),
                contentFidelity: getContentFidelity(),
                mode: currentMode,
                timestamp: firebase.database.ServerValue.TIMESTAMP,
                date: new Date().toLocaleDateString(),
                time: new Date().toLocaleTimeString()
            });
            if (window.RehablixCenter) {
                window.RehablixCenter.logActivity('presentation', `Generated ${docType}`, patientName?.value?.trim() || 'Patient').catch(() => {});
            }
            return ref.key;
        } catch (error) {
            showToast('Could not save to history.', 'error');
            return null;
        }
    }

    // =========================================================================
    // Preview Modal
    // =========================================================================
    function showPreviewModal(htmlContent, historyId) {
        const exist = document.querySelector('.preview-modal');
        if (exist) exist.remove();
        
        const patient = patientName.value.trim() || 'Patient';
        const dateStr = new Date().toLocaleString();
        const professionText = professionSelect.options[professionSelect.selectedIndex]?.text || '';
        
        const modeLabels = {
            presentation: 'Presentation',
            report: 'Report',
            documentation: 'Documentation'
        };
        const modeLabel = modeLabels[currentMode] || 'Document';

        const modalHtml = `
            <div class="preview-modal">
                <div class="preview-overlay"></div>
                <div class="preview-card">
                    <div class="preview-card-header">
                        <div class="preview-icon">📋</div>
                        <h3>${modeLabel} Ready</h3>
                        <button class="preview-close">&times;</button>
                    </div>
                    <div class="preview-card-body">
                        <div class="preview-info">
                            <span class="preview-badge">✅ Generated</span>
                            <span class="preview-date">${dateStr}</span>
                        </div>
                        <p class="preview-description">
                            ${modeLabel} for <strong>${escapeHtml(patient)}</strong> 
                            ${professionText ? `(${escapeHtml(professionText)})` : ''}
                        </p>
                        <div class="preview-actions">
                            <button class="preview-btn primary" id="viewFullPresentationBtn">
                                📖 View Full ${modeLabel}
                            </button>
                            <button class="preview-btn secondary" id="closePreviewBtn">
                                ✕ Close
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.querySelector('.preview-modal');
        
        const close = () => {
            modal.style.opacity = '0';
            modal.style.transition = 'opacity 0.2s ease';
            setTimeout(() => modal.remove(), 200);
        };
        
        modal.querySelector('.preview-close').addEventListener('click', close);
        modal.querySelector('#closePreviewBtn').addEventListener('click', close);
        modal.querySelector('.preview-overlay').addEventListener('click', close);
        
        modal.querySelector('#viewFullPresentationBtn').addEventListener('click', () => {
            if (historyId) {
                window.open(`result.html?type=case&id=${historyId}`, '_blank');
                close();
            }
        });
        
        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
        });
    }

    // =========================================================================
    // Generate button handler
    // =========================================================================
    generateBtn.addEventListener('click', async () => {
        if (!currentUser) {
            showToast('Please log in first', 'error');
            document.getElementById('loginBtn')?.click();
            return;
        }
        
        // Check generation limit for free plan
        if (!canGenerateMore()) {
            const daysLeft = getDaysUntilReset();
            showToast(`⚠️ You've reached your ${FREE_MONTHLY_LIMIT} generation limit. Upgrade to Student or Pro for unlimited access. Resets in ${daysLeft} days.`, 'error', 6000);
            
            const notice = document.getElementById('upgradeNotice');
            if (notice) notice.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
        
        if (!patientName.value.trim()) { 
            showToast('Please enter the patient\'s name', 'error'); 
            patientName.focus(); 
            return; 
        }
        
        if (!professionSelect.value) { 
            showToast('Please select your profession', 'error'); 
            professionSelect.focus(); 
            return; 
        }
        
        if (!textInput.value.trim() && attachments.length === 0) {
            showToast('Enter some notes or attach files', 'error');
            textInput.focus();
            return;
        }

        const ocrPending = attachments.some(a => a.type === 'image' && a.ocrProcessing);
        if (ocrPending) {
            showToast('Still extracting text from images. Wait a moment.', 'info', 3000);
            return;
        }

        const origHTML = generateBtn.innerHTML;
        generateBtn.disabled = true;
        
        const loadingLabels = {
            presentation: 'Generating Presentation…',
            report: 'Generating Report…',
            documentation: 'Generating Documentation…'
        };
        generateBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${loadingLabels[currentMode] || 'Generating…'}`;

        try {
            const start = Date.now();
            const rawMarkdown = await generatePresentation();

            // Defense in depth: even though callAIWithValidation() already
            // rejects empty/near-empty responses, never let a near-empty
            // result reach Firebase — this is the last line of defense
            // against "No content available" ever showing up again.
            if (!rawMarkdown || rawMarkdown.trim().length < 20) {
                throw new Error('Generation produced no usable content. Please try again.');
            }

            const htmlContent = marked.parse(rawMarkdown);
            const historyId = await saveToHistory(rawMarkdown, htmlContent);
            currentHistoryIdInput.value = historyId || '';
            localStorage.removeItem(STORAGE_KEY);
            
            // Increment generation count for free plan
            incrementGenerationCount();
            
            showPreviewModal(htmlContent, historyId);
            const secs = ((Date.now() - start) / 1000).toFixed(1);
            showToast(`Generated in ${secs}s`, 'success');
        } catch (err) {
            console.error('[GENERATE] Error:', err);
            showToast(`Error: ${err.message}`, 'error', 5000);
        } finally {
            generateBtn.disabled = false;
            generateBtn.innerHTML = origHTML;
            validateForm();
        }
    });

    // =========================================================================
    // History drawer
    // =========================================================================
    let allHistoryEntries = [];

    async function deleteHistoryItem(key, event) {
        event.stopPropagation();
        if (!currentUser) return showToast('Log in to manage history', 'error');
        if (!confirm('Delete this document?')) return;
        try {
            await database.ref(`history/${scopeUid}/caseHistory/${key}`).remove();
            showToast('Deleted', 'success');
            loadHistory();
        } catch (error) {
            showToast('Failed to delete.', 'error');
        }
    }

    function renderHistory(entries) {
        if (!historyList) return;
        historyList.innerHTML = '';
        if (!entries.length) {
            historyList.innerHTML = `
                <div class="empty-state">
                    <i class="bx bx-folder-open"></i>
                    <p>No document history</p>
                    <small>Generate your first document</small>
                </div>
            `;
            return;
        }
        entries.forEach(([key, item]) => {
            const div = document.createElement('div');
            div.className = 'history-item';
            
            const modeLabel = item.mode === 'report' ? 'Report' : 
                             item.mode === 'documentation' ? 'Documentation' : 'Presentation';
            
            div.innerHTML = `
                <div class="history-info" style="flex:1;">
                    <span class="history-name">${escapeHtml(item.patientName || 'Unknown')}</span>
                    <span style="font-size: 0.85rem; color: var(--text-secondary);">${escapeHtml(modeLabel)}</span>
                    <div class="history-meta">
                        <span><i class="far fa-calendar-alt"></i> ${escapeHtml(item.date || '')}</span>
                        <span><i class="far fa-clock"></i> ${escapeHtml(item.time || '')}</span>
                    </div>
                </div>
                <div class="history-actions">
                    <button class="delete-btn" data-key="${key}" title="Delete">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            `;
            
            div.querySelector('.delete-btn')?.addEventListener('click', (e) => deleteHistoryItem(key, e));
            
            div.addEventListener('click', (e) => {
                if (!e.target.closest('button')) window.open(`result.html?type=case&id=${key}`, '_blank');
            });
            
            historyList.appendChild(div);
        });
    }

    function filterHistory(term) {
        const s = term.toLowerCase().trim();
        if (!s) renderHistory(allHistoryEntries);
        else {
            const filtered = allHistoryEntries.filter(([_, item]) =>
                (item.patientName || '').toLowerCase().includes(s) ||
                (item.profession || '').toLowerCase().includes(s) ||
                (item.diagnosis || '').toLowerCase().includes(s)
            );
            renderHistory(filtered);
        }
    }

    function loadHistory() {
        if (!currentUser) return;
        database.ref(`history/${scopeUid}/caseHistory`)
            .orderByChild('timestamp')
            .on('value', snapshot => {
                const data = snapshot.val();
                if (!data) { allHistoryEntries = []; renderHistory([]); return; }
                allHistoryEntries = Object.entries(data)
                    .filter(([_, item]) => ['presentation', 'report', 'documentation'].includes(item.contentType))
                    .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
                filterHistory(historySearchInput?.value || '');
            }, error => {
                console.error('History error:', error);
                allHistoryEntries = [];
                renderHistory([]);
            });
    }

    if (historyNavBtn) {
        historyNavBtn.addEventListener('click', () => {
            if (!currentUser) { showToast('Log in first', 'error'); return; }
            historyDrawer.classList.add('active');
            loadHistory();
        });
    }
    
    if (closeDrawerBtn) {
        closeDrawerBtn.addEventListener('click', () => historyDrawer.classList.remove('active'));
    }
    
    // FIXED: Use contains() to check if click target is inside history button
    document.addEventListener('click', e => {
        if (historyDrawer?.classList.contains('active') && 
            !historyDrawer.contains(e.target) && 
            !historyNavBtn?.contains(e.target)) {
            historyDrawer.classList.remove('active');
        }
    });
    
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && historyDrawer?.classList.contains('active')) {
            historyDrawer.classList.remove('active');
        }
    });
    
    if (historySearchInput) {
        historySearchInput.addEventListener('input', e => filterHistory(e.target.value));
    }

    // =========================================================================
    // Auth & init
    // =========================================================================
    firebase.auth().onAuthStateChanged(async user => {
        currentUser = user;
        if (user) {
            console.log('[AUTH] Logged in:', user.email);
            if (window.RehablixCenter && typeof window.RehablixCenter.getEffectiveScopeUid === 'function') {
                try { scopeUid = await window.RehablixCenter.getEffectiveScopeUid('presentation'); }
                catch (err) { scopeUid = user.uid; }
            } else {
                scopeUid = user.uid;
            }
            if (scopeUid === null) {
                showToast('Your access to Presentations has been turned off by your center admin.', 'error', 6000);
            } else if (scopeUid !== user.uid) {
                showToast('Working on your center\'s shared documents', 'info', 3000);
            }
            if (historyNavBtn) historyNavBtn.style.display = 'block';
            loadHistory();
        } else {
            console.log('[AUTH] Logged out');
            if (historyNavBtn) historyNavBtn.style.display = 'none';
        }
        validateForm();
    });

    async function initialize() {
        console.log('[INIT] Starting...');
        
        await fetchTokens();
        loadGenerationData();
        updateWordCount();
        updatePlanUI();
        validateForm();
        
        setTimeout(async () => {
            await loadProgress();
            configSections.forEach(section => {
                section.style.display = section.dataset.mode === currentMode ? 'block' : 'none';
            });
        }, 100);
        
        console.log('[INIT] Ready - Plan:', currentPlan, '| Gen count:', generationCount);
    }

    initialize();
});
